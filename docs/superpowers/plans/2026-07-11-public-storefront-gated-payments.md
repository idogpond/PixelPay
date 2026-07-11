# Public Storefront, Gated Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anonymous visitors browse the storefront homepage and game detail pages without logging in, while still requiring login to reach a wallet/order/profile page or to submit a payment (checkout).

**Architecture:** The API already draws this line correctly — `GET /games`, `GET /games/:slug`, `GET /games/:slug/products`, `GET /categories` have no guard; `POST /orders`, `POST /payments/promptpay`, and all `/wallet` endpoints require `JwtAuthGuard`. The only thing forcing a login redirect on the storefront today is `apps/web/middleware.ts`, which uses a small `PUBLIC_PATHS` allowlist and treats every other route as protected. This plan inverts that to a `PROTECTED_PATHS` allowlist (only `/wallet`, `/orders`, `/profile`, `/affiliate`, `/admin` require a token), so `/` and `/games/[slug]` become public by default. Because the checkout submit button on `/games/[slug]` calls `POST /orders` — an endpoint that still requires auth — that submit handler needs its own pre-flight auth check so an anonymous visitor is redirected to `/login` (and back) instead of getting a raw failed-request error.

**Tech Stack:** Next.js 14 App Router (`apps/web`), NestJS API (`apps/api`), custom JWT stored in a `pixelpay-token` cookie (not NextAuth), Zustand (`stores/auth.store.ts`), react-hook-form + zod.

## Global Constraints

- No test runner (jest/vitest/playwright) is configured in `apps/web` — verify each task manually via `curl` against the running dev stack (web on `http://localhost:4001`, API on `http://localhost:4000/api/v1`) rather than writing automated tests. Do not add a test framework as part of this refactor (out of scope, not requested).
- Do not run `next build` on the host while the docker dev stack is running — `apps/web/.next` is volume-mounted; the dev server picks up file changes automatically.
- Pages that must stay gated (redirect anonymous visitors to `/login`): `/wallet`, `/orders`, `/orders/[id]`, `/profile`, `/affiliate`, `/admin/*`.
- Pages that must become public (viewable without a token): `/` (storefront homepage), `/games/[slug]` (game detail / product picker).
- When an anonymous visitor submits checkout on `/games/[slug]`, redirect to `/login?returnTo=<original path>`; after successful login, redirect back to that path (not always to `/`).

---

### Task 1: Invert middleware to a protected-path allowlist with `returnTo`

**Files:**

- Modify: `apps/web/middleware.ts` (full file, currently 42 lines)

**Interfaces:**

- Produces: the redirect-to-login URL now carries a `returnTo` query param (`/login?returnTo=%2Fwallet`) that Task 2 reads.

- [ ] **Step 1: Confirm current (pre-fix) behavior with curl**

Run (dev stack must already be running — confirm with `docker ps | grep pixelpay-web`):

```bash
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' http://localhost:4001/
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' http://localhost:4001/games/valorant
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' http://localhost:4001/wallet
```

Expected (current, broken behavior): all three print `307 -> http://localhost:4001/login` because every non-`PUBLIC_PATHS` route currently redirects.

- [ ] **Step 2: Rewrite `apps/web/middleware.ts`**

Replace the full file contents:

```ts
import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PATHS = ["/wallet", "/orders", "/profile", "/affiliate"];
const AUTH_PATHS = ["/login", "/register", "/forgot-password"];
const ADMIN_PATHS = ["/admin"];

// UX-level check only — the API's RolesGuard is the real enforcement.
function jwtRole(token: string): string | null {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).role ?? null;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const token = req.cookies.get("pixelpay-token")?.value;
  const { pathname } = req.nextUrl;

  const isAuthPage = AUTH_PATHS.some((p) => pathname.startsWith(p));
  const isAdmin = ADMIN_PATHS.some((p) => pathname.startsWith(p));
  const isProtected =
    isAdmin || PROTECTED_PATHS.some((p) => pathname.startsWith(p));

  if (!token && isProtected) {
    const url = new URL("/login", req.url);
    url.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(url);
  }

  if (token && isAuthPage) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (token && isAdmin && jwtRole(token) !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // `.*\\..*` skips public assets (logo.png etc.) — anything with a file extension
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
```

- [ ] **Step 3: Verify public pages are now reachable without a token**

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4001/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4001/games/valorant
```

Expected: both print `200`.

- [ ] **Step 4: Verify protected pages still redirect, now carrying `returnTo`**

```bash
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' http://localhost:4001/wallet
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' http://localhost:4001/orders
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' http://localhost:4001/profile
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' http://localhost:4001/affiliate
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' http://localhost:4001/admin
```

Expected: all five print `307 -> http://localhost:4001/login?returnTo=%2F<path>` (e.g. `.../login?returnTo=%2Fwallet`).

- [ ] **Step 5: Verify auth pages still redirect logged-in users, and admin role gate still works**

These two require a real token cookie, so exercise them from the browser instead of curl:

1. Open `http://localhost:4001/login`, log in with any existing account.
2. Manually navigate to `http://localhost:4001/login` again — expect an immediate redirect to `/`.
3. If the logged-in account is not an admin, navigate to `http://localhost:4001/admin` — expect a redirect to `/`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/middleware.ts
git commit -m "fix(web): make storefront and game detail pages public, gate only account/payment routes"
```

---

### Task 2: Login page redirects back to `returnTo` after login

**Files:**

- Modify: `apps/web/app/(auth)/login/page.tsx` (39 lines currently)

**Interfaces:**

- Consumes: `returnTo` query param produced by Task 1's middleware redirect.
- Produces: after a successful login, the browser navigates to the original `returnTo` path instead of always `/`.

- [ ] **Step 1: Wrap the page in Suspense and read `returnTo` via `useSearchParams`**

`useSearchParams()` requires a Suspense boundary around any component that calls it, or Next.js will de-opt the whole route to fully client-rendered at build time. Restructure the file so the form logic lives in an inner component, wrapped by the default export.

Replace the full file contents of `apps/web/app/(auth)/login/page.tsx`:

```tsx
"use client";
import { Suspense, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { apiFetch } from "../../../lib/api-client";
import { useAuthStore } from "../../../stores/auth.store";
import { LanguageSwitcher } from "../../../components/ui/LanguageSwitcher";
import { ThemeToggle } from "../../../components/theme/ThemeToggle";

type FormData = { email: string; password: string };

function LoginForm() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const setUser = useAuthStore((s) => s.setUser);
  const schema = useMemo(
    () =>
      z.object({
        email: z.string().email(t("errors.emailInvalid")),
        password: z.string().min(1, t("errors.passwordRequired")),
      }),
    [t],
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      const res = await apiFetch<{
        user: any;
        accessToken: string;
        refreshToken: string;
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      });
      setUser(res.user, res.accessToken);
      document.cookie = `pixelpay-token=${encodeURIComponent(res.accessToken)}; path=/; samesite=strict`;
      document.cookie = `pixelpay-refresh=${encodeURIComponent(res.refreshToken)}; path=/; samesite=strict`;
      const returnTo = searchParams.get("returnTo");
      router.push(returnTo && returnTo.startsWith("/") ? returnTo : "/");
    } catch (e: any) {
      setError("root", { message: e.message });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-void-deep px-4">
      <div className="w-full max-w-md">
        <Link href="/" className="block mx-auto w-56 mb-2">
          <Image
            src="/logo.png"
            alt={`PixelPay — ${tc("tagline")}`}
            width={448}
            height={340}
            priority
            className="mix-blend-screen"
          />
        </Link>
        <div className="flex justify-center items-center gap-3 mb-4">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
        <div className="pixel-cut bg-panel border border-frost/10 p-8">
          <h1 className="font-display text-2xl text-center mb-1 text-frost">
            {t("loginTitle")}
          </h1>
          <p className="text-center text-sm text-frost/50 mb-6">
            {t("loginSubtitle")}
          </p>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1"
              >
                {t("email")}
              </label>
              <input
                id="email"
                {...register("email")}
                type="email"
                className="w-full border border-frost/15 bg-void px-3 py-2.5 text-frost focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel"
                placeholder="you@example.com"
              />
              {errors.email && (
                <p className="text-pink text-xs mt-1">{errors.email.message}</p>
              )}
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1"
              >
                {t("password")}
              </label>
              <input
                id="password"
                {...register("password")}
                type="password"
                className="w-full border border-frost/15 bg-void px-3 py-2.5 text-frost focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel"
              />
              {errors.password && (
                <p className="text-pink text-xs mt-1">
                  {errors.password.message}
                </p>
              )}
            </div>
            {errors.root && (
              <div className="bg-pink/10 border border-pink/30 px-3 py-2 text-pink text-sm">
                {errors.root.message}
              </div>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full grad-brand text-white py-2.5 font-body font-bold pixel-cut hover:brightness-110 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? t("loggingIn") : t("login")}
            </button>
          </form>
          <p className="text-center text-sm text-frost/50 mt-5">
            {t("newHere")}{" "}
            <Link
              href="/register"
              className="text-neon font-semibold hover:text-neon"
            >
              {t("createAccountLink")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
```

Note the `returnTo.startsWith('/')` check: it prevents an open-redirect if someone crafts a `returnTo` value pointing at an external host.

- [ ] **Step 2: Verify in the browser**

1. With no cookie set (log out or open a private window), visit `http://localhost:4001/wallet`. Confirm the address bar shows `http://locan view everything without logging in; however, logging in is required to make a payment.calhost:4001/login?returnTo=%2Fwallet`.
2. Log in with valid credentials.
3. Confirm the browser navigates to `http://localhost:4001/wallet` (not `/`).
4. Repeat visiting `http://localhost:4001/login` directly (no `returnTo`) and confirm a successful login still lands on `/`.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(auth)/login/page.tsx"
git commit -m "feat(web): return to the original page after login"
```

---

### Task 3: Global 401 handler preserves `returnTo` too

**Files:**

- Modify: `apps/web/lib/api-client.ts:44-48`

**Interfaces:**

- Consumes: none new.
- Produces: same `returnTo`-carrying `/login` URL as Task 1, for the case where a session expires mid-visit on any page (not just the ones Task 1 gates at the middleware level).

- [ ] **Step 1: Update the 401 handler**

In `apps/web/lib/api-client.ts`, replace:

```ts
if (
  res.status === 401 &&
  typeof window !== "undefined" &&
  path !== "/auth/login"
) {
  document.cookie = "pixelpay-token=; path=/; max-age=0";
  window.location.href = "/login";
  throw new Error("Session expired");
}
```

with:

```ts
if (
  res.status === 401 &&
  typeof window !== "undefined" &&
  path !== "/auth/login"
) {
  document.cookie = "pixelpay-token=; path=/; max-age=0";
  const returnTo = encodeURIComponent(
    window.location.pathname + window.location.search,
  );
  window.location.href = `/login?returnTo=${returnTo}`;
  throw new Error("Session expired");
}
```

- [ ] **Step 2: Verify with an expired/invalid token**

1. In the browser devtools console (on any page under `apps/web`), run:
   ```js
   document.cookie = "pixelpay-token=garbage; path=/";
   ```
2. Trigger any authenticated API call (e.g. visit `/wallet`, which fetches wallet data on mount).
3. Confirm the page redirects to `/login?returnTo=%2Fwallet` and the `pixelpay-token` cookie is cleared (check devtools Application tab).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/api-client.ts
git commit -m "fix(web): preserve return path when a session expires mid-request"
```

---

### Task 4: Checkout submit on the now-public game page requires login

**Files:**

- Modify: `apps/web/components/games/ProductSelector.tsx`

**Interfaces:**

- Consumes: `getAccessToken` and `readCookie` (already exported from `apps/web/lib/api-client.ts:11-23`).
- Produces: none new — this is a leaf component.

- [ ] **Step 1: Confirm the current broken/unreachable state manually**

Before this task, in a private/logged-out browser window, visit `http://localhost:4001/games/valorant`, pick a package, fill the form, and submit. Expected (current bug): the request goes to `POST /orders`, the API returns 401, and `apiFetch` throws — the form shows a raw error message (`e.message`, likely "Unauthorized" or similar) instead of guiding the visitor to log in.

- [ ] **Step 2: Add a pre-submit auth check with redirect**

In `apps/web/components/games/ProductSelector.tsx`, update the imports (line 6 and line 9):

```tsx
import { useRouter, usePathname } from "next/navigation";
```

```tsx
import { apiFetch, getAccessToken, readCookie } from "../../lib/api-client";
```

Add `const pathname = usePathname();` next to the existing `const router = useRouter();` (line 27):

```tsx
const router = useRouter();
const pathname = usePathname();
```

Update `onSubmit` (lines 63-85) to check for a token before doing anything else:

```tsx
const onSubmit = async (data: FormData) => {
  const token = getAccessToken() ?? readCookie("pixelpay-token");
  if (!token) {
    router.push(`/login?returnTo=${encodeURIComponent(pathname)}`);
    return;
  }
  const product = selectedRef.current;
  if (!product) {
    setError("root", { message: t("errors.pickFirst") });
    return;
  }
  try {
    const order = await apiFetch<{ id: string }>("/orders", {
      method: "POST",
      body: JSON.stringify({
        gameProductId: product.id,
        paymentMethod: "WALLET",
        gameUid: data.gameUid,
        gameServer: data.gameServer?.trim() || undefined,
        gameUsername: data.gameUsername?.trim() || undefined,
        couponCode: data.couponCode?.trim() || undefined,
      }),
    });
    router.push(`/orders/${order.id}`);
  } catch (e: any) {
    setError("root", { message: e.message });
  }
};
```

- [ ] **Step 3: Verify the redirect in the browser**

1. In a private/logged-out window, visit `http://localhost:4001/games/valorant`.
2. Pick a package, fill in the required fields, and submit.
3. Confirm the browser navigates to `http://localhost:4001/login?returnTo=%2Fgames%2Fvalorant` instead of showing an error in the form.
4. Log in. Confirm you land back on `http://localhost:4001/games/valorant`.
5. Pick the package again and submit — confirm checkout now succeeds and navigates to `/orders/<id>` as before.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/games/ProductSelector.tsx
git commit -m "fix(web): send logged-out visitors to login before submitting checkout"
```

---

### Task 5: Full end-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Anonymous browsing works**

In a private/logged-out window:

1. Visit `http://localhost:4001/` — storefront loads with games and category pills, no redirect.
2. Click a game — `/games/<slug>` loads with product list, no redirect.

- [ ] **Step 2: Anonymous account/payment routes still redirect with `returnTo`**

```bash
for p in /wallet /orders /profile /affiliate; do
  curl -s -o /dev/null -w "$p -> %{http_code} %{redirect_url}\n" "http://localhost:4001$p"
done
```

Expected: every line shows `307` and a `Location` of `http://localhost:4001/login?returnTo=%2F<path>`.

- [ ] **Step 3: End-to-end checkout-while-logged-out flow**

1. Logged out, go to `/games/valorant`, pick a package, submit.
2. Confirm redirect to `/login?returnTo=%2Fgames%2Fvalorant`.
3. Log in.
4. Confirm landing back on `/games/valorant`.
5. Submit checkout again; confirm it succeeds and redirects to `/orders/<id>`.

- [ ] **Step 4: Regression check on existing logged-in flows**

While logged in:

1. Visit `/wallet`, confirm the page still loads (no unintended redirect for an authenticated user).
2. Visit `/login` directly, confirm it bounces you to `/`.
3. If your account is not `ADMIN`, visit `/admin`, confirm it bounces you to `/`.

No commit for this task — it's verification only, confirming Tasks 1-4 together satisfy the goal.
