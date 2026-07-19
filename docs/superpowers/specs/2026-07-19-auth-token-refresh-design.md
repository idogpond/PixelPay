# Auth token refresh design

## Problem

Access tokens expire after 15 minutes (`JWT_EXPIRES_IN`). `AuthService.refreshTokens()` already implements the logic to mint a new token pair from a valid refresh token, but no route calls it, and the frontend never attempts to use it. The result: any session idle for more than 15 minutes hits a 401 on its next request, and `apiFetch`'s 401 handler immediately clears cookies and redirects to `/login` — so users get logged out mid-session with no recovery, even though they hold a valid 7-day refresh token the whole time.

## Goals

- A session survives past 15 minutes without the user noticing, as long as the 7-day refresh token is still valid.
- No change to how tokens are stored or transported (client-managed cookies, `Authorization: Bearer` header) — that's a separate, larger hardening project, not this one.
- No proactive/timer-based refresh — refresh happens reactively, triggered by an actual 401.
- No server-side revocation — logout stays stateless. A stolen refresh token remains valid until natural expiry even after logout; this is an accepted, documented limitation, not something this plan closes.

## Architecture

**Backend:** `AuthController` gains `POST /auth/refresh`, taking `{ refreshToken: string }` in the body (new `RefreshTokenDto`, `@IsString()`), delegating straight to the existing `AuthService.refreshTokens(refreshToken)`. That method already verifies the token against `jwt.refreshSecret`, throws `UnauthorizedException` on failure, and mints a fresh `{ accessToken, refreshToken }` pair on success — no service-layer changes needed, only the route.

**Frontend:** `apiFetch`'s 401 branch (`apps/web/lib/api-client.ts:44-48`) currently does: clear the `pixelpay-token` cookie, redirect to `/login?returnTo=...`, throw. This becomes a refresh-then-retry step inserted before that fallback:

1. Skip refresh entirely if the failing request's `path` is `/auth/login` or `/auth/refresh` (avoids infinite loops), or if this is already a retried request (a `_isRetry` internal flag passed through the recursive call).
2. Read `pixelpay-refresh` via the existing `readCookie()` helper. Missing → go straight to the existing clear-and-redirect fallback.
3. Call a new module-level `refreshAccessToken()` helper. It holds a single in-flight `Promise<string | null>` at module scope: if a refresh is already running when a second, concurrent request also hits a 401, the second caller awaits the *same* promise instead of firing a second `POST /auth/refresh`. The promise resolves to the new access token on success, or `null` on any failure (network error, non-2xx response, missing refresh cookie), and always clears itself from module state in a `finally` block so the next 401 can trigger a fresh attempt.
4. On success: `refreshAccessToken()` has already written the new `pixelpay-token`/`pixelpay-refresh` cookies and called `setAccessToken()` (same cookie-writing shape already used by the login page). `apiFetch` then re-invokes itself once with the original `path`/`options` plus the retry flag, and returns *that* call's result to the original caller — transparent to every existing call site.
5. On failure (returns `null`): fall through to the existing clear-cookies + redirect-to-login-with-`returnTo` behavior, unchanged.

No other file needs to change. `AuthProvider`'s bootstrap `GET /users/profile` call goes through `apiFetch`, so it transparently gains refresh-on-401 for free. `OrderTracker`'s WebSocket reads `getAccessToken()` fresh at connect time, so it always has whatever the latest token is without any changes there.

## Data flow (happy path: access token expired, refresh token valid)

```
apiFetch('/wallet') → 401
  → path is not /auth/login or /auth/refresh, not already a retry
  → readCookie('pixelpay-refresh') → present
  → refreshAccessToken()
      → POST /auth/refresh { refreshToken } → 200 { accessToken, refreshToken }
      → setAccessToken(newAccessToken); write both cookies
      → resolve(newAccessToken)
  → apiFetch('/wallet', { ..., _isRetry: true }) → 200
  → original caller receives the /wallet response, never sees the 401
```

## Error handling

- Refresh token missing, expired, or invalid → `refreshAccessToken()` resolves `null` → existing clear-cookies-and-redirect-to-login path, same as today. This is not a regression; it's today's behavior preserved for the case refresh genuinely can't help.
- `POST /auth/refresh` itself failing with a 401 must not recurse into another refresh attempt — covered by the path exclusion in step 1.
- Two or more requests 401 at once → single shared refresh call (module-level promise), not one per request.

## Testing

`apps/web` has no test runner configured (unchanged, out of scope to add one here). Verification is:
- `POST /auth/refresh` is directly curl-testable: log in (or mint a valid refresh-secret-signed JWT) to get a refresh token, POST it, confirm a new `{ accessToken, refreshToken }` pair comes back and the new access token works against an authenticated endpoint.
- `tsc --noEmit` clean.
- The full reactive client-side retry path (concurrent-401 queuing, actual browser fetch retry) cannot be exercised without real browser JS execution, which isn't available in this environment — same accepted gap as the gated-payments plan. Code correctness will rest on review + the isolated backend-endpoint proof above.

## Out of scope (explicit, not deferred-and-forgotten)

- Switching token storage to httpOnly server-set cookies.
- Proactive/timer-based refresh scheduling.
- Server-side refresh-token revocation / logout invalidation.
- Email verification and forgot/reset password flows (separate specs).
- `GET /users/referrals` and `GET /health/redis` (trivial, separate from this plan).
