# Categories design

## Problem

`Game.category` is currently a free-text `VarChar(50)` column. It's admin-typo-prone (no canonical list) and today it's purely a display label — nothing filters or groups by it. We want a real `Category` model (one Category → many Games) that admins manage centrally, and that powers a category filter on the storefront homepage.

## Goals

- Admin-managed list of categories (create/edit/deactivate/reorder) instead of free text.
- Games optionally belong to one category (`categoryId` nullable — matches today's optional `category`).
- Storefront homepage gets category filter pills above the game grid.
- No hierarchy, no many-to-many — strictly one-to-many, per the request.

## Data model

```prisma
model Category {
  id        String   @id @default(uuid()) @db.Uuid
  name      String   @db.VarChar(50)
  slug      String   @unique @db.VarChar(50)
  sortOrder Int      @default(0) @map("sort_order")
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  games Game[]

  @@map("categories")
}
```

On `Game`: remove `category String? @db.VarChar(50)`; add:

```prisma
categoryId String?   @map("category_id") @db.Uuid
category   Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
```

`onDelete: SetNull` — deleting a category un-categorizes its games rather than deleting them.

### Migration

Single Prisma migration:
1. Create `categories` table.
2. Add nullable `category_id` to `games`.
3. Data migration (raw SQL in the same migration file): insert one `Category` row per distinct existing `games.category` string value (today: `FPS`, `MOBA`, `Battle Royale`, `RPG`), generating a slug via lowercase+dashes; then `UPDATE games SET category_id = categories.id WHERE games.category = categories.name`.
4. Drop the old `category` column.

`prisma/seed.ts` is updated to seed `Category` rows first, then reference `categoryId` when creating games (replacing the current inline `category: 'FPS'` etc. strings).

## API layer

New `apps/api/src/categories` module, following the existing pattern where each admin resource (`resellers`, `analytics`) has its own service injected into the single `AdminController`:

- `CategoriesService`:
  - `findAllActive()` — public, `isActive: true`, ordered by `sortOrder`.
  - `adminList()` — all categories, ordered by `sortOrder`.
  - `adminCreate(dto)`, `adminUpdate(id, dto)`, `adminDelete(id)`.
- `CategoriesController` (`@Controller('categories')`): `GET /categories` → `findAllActive()`. Public, no guard — mirrors `GamesController`.
- `AdminController` gains:
  - `GET /admin/categories` → `adminList()`
  - `POST /admin/categories` → `adminCreate(dto)`
  - `PATCH /admin/categories/:id` → `adminUpdate(id, dto)`
  - `DELETE /admin/categories/:id` → `adminDelete(id)` (204, same style as `deleteGame`)
- `CreateCategoryDto` / `UpdateCategoryDto`: `name` (string, max 50), `slug` (string, max 50), `sortOrder` (number, optional), `isActive` (boolean, optional).

`GamesService` changes:
- `findAll`, `findBySlug`, `adminListGames`: select `category: { select: { id: true, name: true, slug: true } }` instead of the raw `category` string.
- `CreateGameDto` / `UpdateGameDto`: replace `category?: string` with `categoryId?: string` (`@IsUUID()`, optional).

## Admin UI

- New `apps/web/app/admin/categories/page.tsx`, structurally identical to `admin/games/page.tsx`: table (name, slug, order, status, actions), "New Category" button, edit/delete, backed by a `CategoryFormModal` (`apps/web/components/admin/categories/CategoryFormModal.tsx`) mirroring `GameFormModal` — fields: name, slug, sortOrder, isActive toggle.
- `admin/layout.tsx`: add a `Categories` nav link next to Games/Orders/Users.
- `GameFormModal.tsx`: replace the free-text `category` `<input>` with a `<select>` bound to `categoryId`, options loaded from `GET /admin/categories` (admin list, so a game's currently-assigned-but-now-inactive category still shows up as a valid option).
- `admin/games/page.tsx`: table cell renders `g.category?.name ?? '—'` instead of the raw string; `Game` interface's `category: string | null` becomes `category: { id: string; name: string; slug: string } | null`.

## Storefront UI

- `app/(dashboard)/page.tsx`: fetch `GET /categories` alongside the existing games fetch. Render a row of filter pills ("All" + each category's `name`) above the game grid. Clicking a pill filters the already-fetched `games` array client-side by `game.category?.slug === selected` (no new query params or server round-trip — game list is small, ~10 rows).
- `GameCard.tsx` and `app/(dashboard)/games/[slug]/page.tsx`: read `game.category?.name` instead of the raw `category` string for the existing label/badge display; no visual changes.

## i18n

New message keys needed in both `en.json` and `th.json`:
- `admin.nav.categories`
- `admin.categories.*` (title, newCategory, newCategoryTitle, editTitle, name, slug, order, status, deleteConfirm, noCategories — mirroring the `admin.games` key set)
- Homepage: existing `home` namespace (`en.json`/`th.json`) is flat (`chooseGame`, `noGames`, etc.) — add `home.categoryAll` (label for the "All" pill) to match that flat style.

## Out of scope

- Category hierarchy / nesting.
- Many-to-many (a game in multiple categories).
- Server-side filtering/pagination by category (game list is small; client-side filter is sufficient today).
- Category icons/images/descriptions (not requested).
