# i18n Language Switching (English / Thai) — Design

**Date:** 2026-07-03
**Status:** Approved

## Goal

Let users switch the PixelPay web app between English and Thai. Default language is English. The choice persists across visits.

## Decisions

- **Locale mode:** cookie-based toggle. URLs do not change (no `/en/...` or `/th/...` prefixes).
- **Scope:** entire web app — user-facing pages (home, games, wallet, orders, profile, affiliate, login/register) and the admin panel.
- **Default:** English (`en`) for new visitors.
- **Library:** `next-intl` in "without i18n routing" mode.

## Architecture

### Plumbing

- Add `next-intl` to `apps/web`; register its plugin in `next.config.mjs`.
- `apps/web/i18n/request.ts`: `getRequestConfig` reads the `locale` cookie (fallback `en`) and loads the matching message file.
- `apps/web/app/layout.tsx`: wraps children in `NextIntlClientProvider`, sets `<html lang={locale}>`.
- Locale switching: a server action sets the `locale` cookie (1-year max-age) and triggers a refresh so both server and client components re-render in the new language.

### Message files

- `apps/web/messages/en.json` and `apps/web/messages/th.json`.
- Namespaces mirror app structure: `common`, `nav`, `home`, `auth`, `games`, `wallet`, `orders`, `profile`, `affiliate`, `admin`.
- English is the source of truth. Thai translations written in natural Thai for a game top-up audience (e.g. เติมเกม, กระเป๋าเงิน). Both files must have identical key sets.

### Component usage

- Client components: `useTranslations('namespace')`.
- Server components (root/dashboard/admin layouts, home page, game detail page): `getTranslations('namespace')`.

### Language switcher UI

- A two-position EN/TH toggle (not a dropdown — only two languages), styled to the arcade design system (stub clip, cabinet/marquee tokens).
- Placement: main navbar, auth pages, and admin header.
- One shared component: `apps/web/components/ui/LanguageSwitcher.tsx`.

## Translation coverage

**Translated:** all hardcoded UI strings across the ~30 TSX files — navigation, buttons, form labels and placeholders, zod/react-hook-form validation messages, empty states, status badges, table headers, modal copy, toasts.

**Not translated (out of scope):**
- Dynamic API content (game names, product names, descriptions from the database) — would require backend schema changes.
- Currency and date formatting (unchanged).

## Fonts

Already handled: the app uses Chakra Petch (display), Prompt (body) — both support Thai script. No font work needed.

## Error handling

- Missing/invalid `locale` cookie value → fall back to `en`.
- Missing message key → next-intl logs in dev and renders the key path; identical key sets across both files prevent this in practice.

## Testing / verification

1. `tsc --noEmit` and a production build pass.
2. Playwright-in-scratchpad screenshots (with `/api/v1/**` mocked) of key pages — home, login, wallet, order detail, admin dashboard — in both EN and TH, checking for layout breakage from longer Thai strings.
3. Manual check: toggle persists after reload; `<html lang>` updates.

## Constraints / gotchas

- Docker dev stack: web runs on port 4001; never `next build` on the host while the stack runs (`.next` is volume-mounted). Server-side fetches use `API_URL_INTERNAL`.
- Preserve the arcade design system: content cards use `stub bg-white border border-ink/10`; the CreditCounter motif stays the single signature element.
