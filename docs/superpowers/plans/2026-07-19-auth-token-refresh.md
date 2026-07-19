# Auth Token Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sessions survive past the 15-minute access-token expiry without the user noticing, as long as their 7-day refresh token is still valid.

**Architecture:** Wire the already-working `AuthService.refreshTokens()` to a new `POST /auth/refresh` route (it exists today but nothing calls it). On the frontend, `apiFetch`'s 401 handler gains a refresh-then-retry step before it falls back to clearing cookies and redirecting to login: attempt one `POST /auth/refresh` (deduplicated across concurrent 401s via a shared in-flight promise), and if it succeeds, silently retry the original request with the new token.

**Tech Stack:** NestJS 10 (Fastify adapter), class-validator DTOs, Jest + Supertest for e2e tests, Next.js 14 App Router (`apps/web`, no test runner configured).

## Global Constraints

- No change to token storage/transport — tokens stay in JS-readable cookies (`pixelpay-token`, `pixelpay-refresh`), read via `readCookie()`, attached as `Authorization: Bearer` headers. Do not switch to httpOnly server-set cookies — that's an explicitly separate, larger project.
- No proactive/timer-based refresh. Refresh is reactive only, triggered by an actual 401.
- No server-side revocation. Logout stays stateless (`AuthService.logout()` unchanged). A stolen refresh token remains valid until natural 7-day expiry even after logout — accepted, documented limitation, not in scope here.
- `apps/api` response envelope is `{ success: boolean, data: T }`, applied globally by `ResponseInterceptor` (`apps/api/src/common/interceptors/response.interceptor.ts`) — controller methods return the raw payload, never wrap it themselves.
- `apps/web` has no test runner configured — verify frontend changes via `tsc --noEmit` and manual curl/live-stack checks, not automated tests. Do not add a test framework as part of this plan.
- e2e tests for `apps/api` build the real `AppModule` (real Postgres/Redis connections, real `ConfigModule`), which needs `DATABASE_URL`/`REDIS_URL`/`JWT_SECRET`/etc. actually set in the process environment. There is no `apps/api/.env` and the host shell does not export these — running `npx jest --config ./test/jest-e2e.json` directly on the host silently hangs (Prisma retries a connection it can never complete). Always run e2e tests **inside the running `api` container**, where `docker-compose.yml`'s `env_file`/`environment` already provide everything: `docker compose exec api npx jest --config ./test/jest-e2e.json`. Confirmed working baseline: `docker compose exec -T api npx jest --config ./test/jest-e2e.json --testPathPattern=auth` → 5/5 passing (register ×3, login ×2) before this plan's changes.

---

## File Map

**Create:**
- `apps/api/src/auth/dto/refresh-token.dto.ts`

**Modify:**
- `apps/api/src/auth/auth.controller.ts` — add `POST /auth/refresh` route
- `apps/api/test/auth.e2e-spec.ts` — add refresh test cases
- `apps/web/lib/api-client.ts` — add refresh-and-retry to the 401 handler

---

### Task 1: `POST /auth/refresh` endpoint

**Files:**
- Create: `apps/api/src/auth/dto/refresh-token.dto.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: `AuthService.refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }>` — already exists at `apps/api/src/auth/auth.service.ts:92-102`, unchanged by this task.
- Produces: `POST /api/v1/auth/refresh` — request body `{ refreshToken: string }`, response `{ success: true, data: { accessToken: string, refreshToken: string } }` on 200, `{ success: false, error: {...} }` on 401 (invalid/expired token) or 400 (missing/non-string body field). This is what Task 2's frontend code calls.

- [ ] **Step 1: Write the failing e2e tests**

Append to `apps/api/test/auth.e2e-spec.ts`, immediately after the existing `describe('POST /api/v1/auth/login', ...)` block (before the final closing `});` of the outer `describe('Auth (e2e)', ...)`):

```typescript
  describe('POST /api/v1/auth/refresh', () => {
    it('returns a new token pair for a valid refresh token', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);

      const { refreshToken } = loginRes.body.data;

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.refreshToken).not.toBe(refreshToken);
    });

    it('rejects an invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'not-a-real-token' })
        .expect(401);
    });

    it('rejects a request with no refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({})
        .expect(400);
    });
  });
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
docker compose exec -T api npx jest --config ./test/jest-e2e.json --testPathPattern=auth -t "auth/refresh" 2>&1 | tail -30
```

Expected: 3 failures, each with `404` (route doesn't exist yet) or a Jest "Cannot GET/POST" style error, since `POST /auth/refresh` has no handler.

- [ ] **Step 3: Write `RefreshTokenDto`**

`apps/api/src/auth/dto/refresh-token.dto.ts`:

```typescript
import { IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;
}
```

- [ ] **Step 4: Add the route to `AuthController`**

In `apps/api/src/auth/auth.controller.ts`, add the import:

```typescript
import { RefreshTokenDto } from './dto/refresh-token.dto';
```

Add this method to the `AuthController` class, immediately after the existing `login` method (before `me`):

```typescript
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refreshTokens(dto.refreshToken);
  }
```

The full file after this change:

```typescript
import { Body, Controller, Get, HttpCode, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @UseGuards(AuthGuard('local'))
  @HttpCode(200)
  @Post('login')
  login(@Request() req: any) {
    return this.auth.login(req.user);
  }

  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refreshTokens(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: any) {
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout() {
    return this.auth.logout();
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
docker compose exec -T api npx jest --config ./test/jest-e2e.json --testPathPattern=auth 2>&1 | tail -30
```

Expected: all 8 tests in `Auth (e2e)` pass (the 5 pre-existing register/login tests plus the 3 new refresh tests — no regressions).

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (exit 0).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/auth/dto/refresh-token.dto.ts apps/api/src/auth/auth.controller.ts apps/api/test/auth.e2e-spec.ts
git commit -m "feat(api): add POST /auth/refresh endpoint"
```

---

### Task 2: Frontend refresh-and-retry on 401

**Files:**
- Modify: `apps/web/lib/api-client.ts`

**Interfaces:**
- Consumes: `POST /auth/refresh` (Task 1) — `{ refreshToken: string }` → `{ accessToken: string; refreshToken: string }`.
- Produces: no new exports. Every existing `apiFetch<T>(path, options)` call site is unaffected — the new retry parameter is internal-only with a default value, never passed by external callers.

- [ ] **Step 1: Replace the full contents of `apps/web/lib/api-client.ts`**

```typescript
// Server-side (RSC) fetches may need a different host than the browser —
// e.g. in docker-compose the API is `api:3000` internally but `localhost:4000`
// from the host. API_URL_INTERNAL is only read server-side.
const BASE =
  (typeof window === 'undefined' ? process.env.API_URL_INTERNAL : undefined) ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3000/api/v1';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Shared across concurrent 401s so a burst of requests triggers one
// /auth/refresh call, not one per request — later callers await the same
// in-flight promise instead of racing their own refresh attempts.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function doRefresh(): Promise<string | null> {
  const refreshToken = readCookie('pixelpay-refresh');
  if (!refreshToken) return null;

  try {
    const tokens = await apiFetch<{ accessToken: string; refreshToken: string }>(
      '/auth/refresh',
      { method: 'POST', body: JSON.stringify({ refreshToken }) },
    );
    setAccessToken(tokens.accessToken);
    document.cookie = `pixelpay-token=${encodeURIComponent(tokens.accessToken)}; path=/; samesite=strict`;
    document.cookie = `pixelpay-refresh=${encodeURIComponent(tokens.refreshToken)}; path=/; samesite=strict`;
    return tokens.accessToken;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { params?: Record<string, string> } = {},
  _isRetry = false,
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const token = accessToken ?? readCookie('pixelpay-token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(url.toString(), { ...options, headers });
  const json = (res.status === 204 || res.status === 205) ? null : await res.json();

  if (res.status === 401 && typeof window !== 'undefined' && path !== '/auth/login' && path !== '/auth/refresh') {
    if (!_isRetry) {
      const newToken = await refreshAccessToken();
      if (newToken) return apiFetch<T>(path, options, true);
    }
    document.cookie = 'pixelpay-token=; path=/; max-age=0';
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?returnTo=${returnTo}`;
    throw new Error('Session expired');
  }

  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed: ${res.status}`);
  return (json?.data ?? null) as T;
}
```

Trace through the two cases this adds:
- **Refresh succeeds:** `doRefresh()` returns the new access token, `apiFetch` recurses once with `_isRetry: true`, which re-reads `accessToken` (just updated by `setAccessToken` inside `doRefresh`) and retries the original request. If that retry *also* 401s, `_isRetry` is now `true` so the refresh branch is skipped and it falls straight to the clear-cookies-and-redirect fallback — no infinite loop.
- **Refresh fails** (no refresh cookie, invalid/expired refresh token, or the `/auth/refresh` call itself throws): `doRefresh()` returns `null`, `refreshAccessToken()` resolves `null`, and the code falls through to today's unchanged behavior.
- **`/auth/refresh` excluded from the 401-retry branch by path check:** if the refresh call's own request 401s (invalid refresh token), the inner `apiFetch('/auth/refresh', ...)` call's `path === '/auth/refresh'` short-circuits the whole `if` condition to `false`, so it falls straight to `if (!res.ok) throw ...` — caught by `doRefresh`'s `try/catch`, returns `null`. No recursive refresh-of-a-refresh.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (exit 0).

- [ ] **Step 3: Verify the underlying endpoint round-trip live (proves the wiring end-to-end without needing browser JS)**

Confirm the dev stack is up (`docker ps | grep pixelpay-web`), then:

```bash
# 1. Register a throwaway user and capture both tokens
REG=$(curl -s -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"refresh-test@pixelpay.test","password":"Test1234!","displayName":"Refresh Test"}')
echo "$REG" | python3 -m json.tool

REFRESH_TOKEN=$(echo "$REG" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['refreshToken'])")

# 2. Call the new endpoint directly
curl -s -X POST http://localhost:4000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" | python3 -m json.tool
```

Expected: step 2's response is `{"success": true, "data": {"accessToken": "...", "refreshToken": "..."}}`, with a `refreshToken` value different from the one sent in.

```bash
# 3. Confirm an invalid refresh token is rejected
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:4000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"garbage"}'
```

Expected: `401`.

This proves the backend contract Task 2's frontend code depends on is real and correctly shaped. The reactive retry-on-401 behavior itself (concurrent-request queuing, actual browser `fetch` retry) requires real browser JS execution to observe directly, which isn't available in this environment — accepted gap per the design spec, not something to fabricate a false verification for.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/api-client.ts
git commit -m "fix(web): silently refresh an expired session instead of logging the user out"
```
