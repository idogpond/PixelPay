# Game Search & Checkout Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let visitors filter the "Choose a game" list on the storefront homepage by typing a name, and confirm the just-shipped login-gated checkout flow (from `2026-07-11-public-storefront-gated-payments.md`) actually works end-to-end.

**Architecture:** The homepage (`apps/web/app/(dashboard)/page.tsx`) fetches all games server-side and hands them to `GameCategoryFilter.tsx`, a client component that currently only filters by category pill via `useMemo`. Add a text input to that same component and fold it into the existing `useMemo` filter — no new API call, no new component, since the full game catalog is already on the client. Task 2 is a verification-only pass (no code changes) that walks the anonymous-checkout-then-login flow shipped in the prior session, using the running dev stack.

**Tech Stack:** Next.js 14 App Router (`apps/web`), next-intl (EN/TH catalogs with a `check-messages` parity gate), Tailwind with PixelPay's pixel/void design tokens, lucide-react icons.

## Global Constraints

- No test runner (jest/vitest/playwright) is configured in `apps/web` — verify manually via the browser against the running dev stack (web on `http://localhost:4001`, API on `http://localhost:4000/api/v1`). Do not add a test framework.
- Do not run `next build` on the host while the docker dev stack is running — `apps/web/.next` is volume-mounted; the dev server picks up file changes automatically.
- Any new user-facing string must be added to BOTH `apps/web/messages/en.json` and `apps/web/messages/th.json`. Run `npm run check-messages` (in `apps/web`) — it fails the build gate if the key sets diverge.
- Style new UI with existing pixel/void tokens only (`bg-panel`, `border-frost/10`, `text-frost`, `pixel-cut`, `focus:ring-pixel`) — never hardcode hex colors. Verify token names against `apps/web/tailwind.config.ts` if anything looks unfamiliar.
- PromptPay wallet top-up itself is explicitly OUT of scope for this plan — `.env` has no `PAYMENT_GATEWAY_API_KEY`/`PAYMENT_GATEWAY_SECRET`/`PAYMENT_WEBHOOK_SECRET`, so a real top-up can't complete locally. Task 2 verifies checkout against an existing wallet balance, not the top-up itself.

---

### Task 1: Add a search input to the "Choose a game" list

**Files:**

- Modify: `apps/web/components/games/GameCategoryFilter.tsx` (72 lines currently)
- Modify: `apps/web/messages/en.json` (`home` namespace, around line 46-49)
- Modify: `apps/web/messages/th.json` (`home` namespace, around line 46-49)

**Interfaces:**

- Consumes: `games: Game[]` / `categories: Category[]` props already passed in from `apps/web/app/(dashboard)/page.tsx:76` — unchanged.
- Produces: none new — this is a leaf client component with local state only.

- [ ] **Step 1: Confirm current (pre-change) behavior in the browser**

With the dev stack running (`docker ps | grep pixelpay-web` to confirm), visit `http://localhost:4001/`. Scroll to the "Choose a game" section. Expected (current, missing feature): only category pills (All / FPS / MOBA / …) filter the grid — there is no text input anywhere in that section.

- [ ] **Step 2: Add the new i18n keys**

In `apps/web/messages/en.json`, inside the `"home"` object (currently ends at line 48 with `"noGames"`), add two keys after `"noGames"`:

```json
    "noGames": "No games are live right now — check back soon.",
    "searchPlaceholder": "Search games…",
    "noSearchResults": "No games match your search."
```

In `apps/web/messages/th.json`, inside the `"home"` object, add the matching keys after `"noGames"`:

```json
    "noGames": "ยังไม่มีเกมเปิดให้บริการตอนนี้ — กลับมาดูใหม่เร็ว ๆ นี้",
    "searchPlaceholder": "ค้นหาเกม…",
    "noSearchResults": "ไม่พบเกมที่ตรงกับการค้นหา"
```

- [ ] **Step 3: Run the message parity gate**

```bash
cd apps/web && npm run check-messages
```

Expected: exits 0 with no diverging-key errors.

- [ ] **Step 4: Rewrite `GameCategoryFilter.tsx` to add the search input**

Replace the full file contents of `apps/web/components/games/GameCategoryFilter.tsx`:

```tsx
'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { GameCard } from './GameCard';

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Game {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  category: Category | null;
}

interface Props {
  games: Game[];
  categories: Category[];
}

export function GameCategoryFilter({ games, categories }: Props) {
  const t = useTranslations('home');
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const byCategory = selected ? games.filter((g) => g.category?.slug === selected) : games;
    const q = query.trim().toLowerCase();
    return q ? byCategory.filter((g) => g.name.toLowerCase().includes(q)) : byCategory;
  }, [games, selected, query]);

  return (
    <>
      <div className="relative mb-5 max-w-xs">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-frost/40" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="w-full pixel-cut bg-panel border border-frost/10 pl-9 pr-3 py-2 text-sm text-frost placeholder:text-frost/30 focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel"
        />
      </div>
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className={`px-3 py-1.5 pixel-cut text-xs font-mono uppercase tracking-wider transition-colors ${
              selected === null ? 'bg-pixel text-white' : 'bg-panel text-frost/60 hover:text-frost border border-frost/10'
            }`}
          >
            {t('categoryAll')}
          </button>
          {categories.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => setSelected(c.slug)}
              className={`px-3 py-1.5 pixel-cut text-xs font-mono uppercase tracking-wider transition-colors ${
                selected === c.slug ? 'bg-pixel text-white' : 'bg-panel text-frost/60 hover:text-frost border border-frost/10'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filtered.map((g) => <GameCard key={g.id} {...g} />)}
      </div>
      {filtered.length === 0 && (
        <div className="text-center py-20 text-frost/40 font-body">
          {games.length === 0 ? t('noGames') : t('noSearchResults')}
        </div>
      )}
    </>
  );
}
```

Note: `games.length === 0` (empty catalog) still shows `noGames`; a non-empty catalog with zero matches (search and/or category) shows the new `noSearchResults` — these are two different empty states and must not be collapsed into one message.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (exit 0).

- [ ] **Step 6: Manual test in the browser**

1. Visit `http://localhost:4001/`, scroll to "Choose a game".
2. Confirm a search box with a magnifying-glass icon now appears above the category pills.
3. Type a partial game name (e.g. `val`) — confirm the grid narrows to matching games (e.g. "Valorant") live as you type, no page reload.
4. Clear the input — confirm the full list returns.
5. Select a category pill (e.g. "MOBA"), then type a query that matches nothing in that category (e.g. `xyz`) — confirm the empty state shows "No games match your search." (not "No games are live right now…").
6. Clear the query and deselect the category — confirm the empty state disappears and the full grid returns.
7. Switch language via the language switcher (EN ⇄ TH) and confirm the placeholder and empty-state text translate.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/games/GameCategoryFilter.tsx apps/web/messages/en.json apps/web/messages/th.json
git commit -m "feat(web): add search input to the choose-a-game list"
```

---

### Task 2: Verify the login-gated checkout flow end-to-end

**Files:** none (verification only — no code changes).

**Scope note:** This re-verifies the fixes already shipped in `docs/superpowers/plans/2026-07-11-public-storefront-gated-payments.md` (commits `f7015bd`, `8787eaf`, `a1385a3`, `8abeb8a`, `c46fd07`). It does NOT test the PromptPay wallet top-up itself (blocked by empty gateway credentials in `.env` — out of scope per Global Constraints). It confirms checkout works against a wallet that already has a positive balance.

- [ ] **Step 1: Confirm the dev stack is running**

```bash
docker ps | grep pixelpay
```

Expected: `pixelpay-web` and `pixelpay-api` (and db/redis) containers listed as `Up`.

- [ ] **Step 2: Ensure a test account exists with a positive wallet balance**

1. In a normal (non-private) browser window, go to `http://localhost:4001/register` and create a test account if you don't already have one, or log in with an existing one.
2. Visit `http://localhost:4001/wallet` and note the current balance shown in the `CreditCounter` widget.
3. If the balance is `0`, top it up through whatever mechanism you currently use to credit test wallets locally (e.g. a direct DB update via `psql`/Prisma Studio, since the real PromptPay gateway can't complete a top-up locally) — this plan does not automate that step, since it's infrastructure-dependent, not app behavior.

- [ ] **Step 3: Verify anonymous browsing works (no login required)**

In a private/logged-out browser window:

1. Visit `http://localhost:4001/` — storefront loads with games and category pills, no redirect to `/login`.
2. Click any game card — `http://localhost:4001/games/<slug>` loads with the product list, no redirect.

- [ ] **Step 4: Verify anonymous checkout redirects to login and back**

Still in the private/logged-out window:

1. On `http://localhost:4001/games/valorant`, pick any package, fill in the required fields (e.g. Riot ID), and submit.
2. Confirm the browser navigates to `http://localhost:4001/login?returnTo=%2Fgames%2Fvalorant` — NOT a raw error message in the form.
3. Log in with the test account from Step 2.
4. Confirm the browser lands back on `http://localhost:4001/games/valorant` (not `/`).
5. Pick the same package again and submit.
6. Confirm the order now succeeds and the browser navigates to `http://localhost:4001/orders/<id>`.
7. On the order page, confirm the order tracker shows a status (e.g. `PENDING`/`PROCESSING`) and the wallet balance from Step 2 has decreased by the order amount.

- [ ] **Step 5: Verify account/payment routes still redirect anonymous visitors, with `returnTo`**

```bash
for p in /wallet /orders /profile /affiliate; do
  curl -s -o /dev/null -w "$p -> %{http_code} %{redirect_url}\n" "http://localhost:4001$p"
done
```

Expected: every line shows `307` and a `Location` of `http://localhost:4001/login?returnTo=%2F<path>`.

- [ ] **Step 6: Verify a mid-session expiry also redirects with `returnTo`**

1. While logged in (same account as Step 2), open devtools console and run:
   ```js
   document.cookie = "pixelpay-token=garbage; path=/";
   ```
2. Visit `http://localhost:4001/wallet` (triggers an authenticated fetch on mount).
3. Confirm the page redirects to `http://localhost:4001/login?returnTo=%2Fwallet` and the `pixelpay-token` cookie is cleared (check devtools Application tab).
4. Log back in and confirm you land back on `/wallet`.

- [ ] **Step 7: Regression check on logged-in flows**

While logged in with a valid session:

1. Visit `/login` directly — confirm it bounces you to `/` (already-authenticated users shouldn't see the login form).
2. Visit `/admin` — if the account is not `ADMIN`, confirm it bounces you to `/`.

- [ ] **Step 8: Record the outcome**

No commit for this task. If every check in Steps 3–7 passes, the checkout/login-gating system is confirmed working. If any step deviates from its "Expected" outcome, stop and report the exact step and observed behavior instead of proceeding — that's a regression, not a new feature request, and should be triaged separately before touching Task 1's code.

---

## Self-Review Checklist

- [x] **Spec coverage:** "add a search input for games" → Task 1. "check the payment system works right" → Task 2 (scoped to checkout + login-gating per user's explicit choice; PromptPay top-up itself excluded and the reason stated).
- [x] **Placeholder scan:** no TBD/"similar to above"/vague steps — every code-bearing step has complete code, every verification step has concrete expected output.
- [x] **Type consistency:** `Game`/`Category` interfaces in `GameCategoryFilter.tsx` match the shape already produced by `apps/web/app/(dashboard)/page.tsx` and consumed by `GameCard.tsx` — unchanged from the current file, only local `query` state and the `filtered` memo logic are new.
