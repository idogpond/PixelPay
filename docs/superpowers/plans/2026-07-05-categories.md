# Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text `Game.category` string with a proper `Category` model (one Category → many Games), add admin CRUD for categories, and add a category filter to the storefront homepage.

**Architecture:** Add a `Category` Prisma model and an optional `Game.categoryId` FK (migrating existing string values into rows). Add a `CategoriesService`/`CategoriesModule` following the existing `resellers` module pattern — public `GET /categories` plus admin CRUD wired into the existing `AdminController`. Update `GamesService`/DTOs to read/write `categoryId` instead of the free-text string. Add an `/admin/categories` management page mirroring `/admin/games`, a category `<select>` in `GameFormModal`, and a client-side category filter component on the storefront homepage.

**Tech Stack:** NestJS 10, Prisma 5, class-validator DTOs, Next.js 14 App Router (`'use client'` for interactive components, RSC for data fetching), react-hook-form + zod, next-intl, Tailwind CSS with the project's "Insert Coin" arcade design tokens.

## Global Constraints

- `Category.games` is a one-to-many relation only — no hierarchy, no many-to-many. (spec)
- `Game.categoryId` is nullable — a game may have no category; deleting a category sets `categoryId` to `NULL` on its games rather than deleting them. (spec)
- Storefront category filtering is client-side against the already-fetched games list — no new query params or server-side pagination. (spec)
- NestJS admin routes live under the single `@Controller('admin')` `AdminController`, which already applies `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserRole.ADMIN)` + `@UseInterceptors(AuditInterceptor)` at the class level — never add guard decorators at the method level.
- DTOs use `class-validator` decorators, following `apps/api/src/games/dto/create-game.dto.ts`.
- Every new admin resource gets its own `<name>.module.ts` + `<name>.service.ts` + `<name>.controller.ts` under `apps/api/src/<name>/`, exporting the service and importing the module into `AdminModule`, following `apps/api/src/resellers/`.
- Jest unit tests use the `mockPrisma` pattern from `apps/api/src/games/games.service.spec.ts`. Run with `cd apps/api && npx jest --testPathPattern=<name>`.
- Web UI must use the project's arcade design tokens — `font-display`, `pixel-cut`, `bg-panel`/`bg-panel-light`/`bg-void`/`bg-void-deep`, `text-frost` (with opacity modifiers), `border-frost/10`, `grad-brand`, `text-pixel`/`text-pixel-bright`, `text-pink` for errors, `text-mint` for active-status badges. Never use raw Tailwind gray/white/black/red classes. Follow `apps/web/app/admin/games/page.tsx` and `apps/web/components/admin/games/GameFormModal.tsx` exactly.
- All web/admin strings go through `next-intl` (`useTranslations` in client components, `getTranslations` in server components) — never hardcode UI copy. Every new key must be added to **both** `apps/web/messages/en.json` and `apps/web/messages/th.json`. Verify with `cd apps/web && node scripts/check-messages.mjs` (must print `OK — <N> keys in both catalogs`).
- `apiFetch<T>` from `apps/web/lib/api-client.ts` handles Bearer auth automatically — never pass tokens manually from web code.
- Admin pages live under `apps/web/app/admin/` and are already wrapped by `apps/web/app/admin/layout.tsx`.
- TypeScript verify commands: `cd apps/api && npx tsc --noEmit` and `cd apps/web && npx tsc --noEmit` (run from the host — the repo is an npm workspace with hoisted `node_modules`, no docker exec needed for these).
- The dev stack (docker compose) exposes the API at `http://localhost:4000/api/v1` and the web app at `http://localhost:4001`. Admin login for smoke tests: `admin@pixelpay.dev` / `Admin1234!`.
- Prisma migrations are applied inside the API container: `docker compose exec api npx prisma migrate deploy && docker compose exec api npx prisma generate` (never `migrate dev` for this plan — it can trigger interactive drift prompts against the shared dev DB; `migrate deploy` is non-interactive and only applies pending migration folders in order).

---

## File Map

**Create:**
- `apps/api/prisma/migrations/20260705120000_add_categories/migration.sql`
- `apps/api/src/categories/categories.service.ts`
- `apps/api/src/categories/categories.controller.ts`
- `apps/api/src/categories/categories.module.ts`
- `apps/api/src/categories/dto/create-category.dto.ts`
- `apps/api/src/categories/dto/update-category.dto.ts`
- `apps/api/src/categories/categories.service.spec.ts`
- `apps/web/app/admin/categories/page.tsx`
- `apps/web/components/admin/categories/CategoryFormModal.tsx`
- `apps/web/components/games/GameCategoryFilter.tsx`

**Modify:**
- `apps/api/prisma/schema.prisma` — add `Category` model, replace `Game.category` with `Game.categoryId`/`Game.category` relation
- `apps/api/prisma/seed.ts` — seed `Category` rows, reference `categoryId` on games
- `apps/api/src/admin/admin.controller.ts` — inject `CategoriesService`, add category CRUD routes
- `apps/api/src/admin/admin.module.ts` — import `CategoriesModule`
- `apps/api/src/games/games.service.ts` — select `category` relation instead of the raw string
- `apps/api/src/games/dto/create-game.dto.ts` — `categoryId?: string` instead of `category?: string`
- `apps/api/src/games/dto/update-game.dto.ts` — same
- `apps/web/app/admin/layout.tsx` — add Categories nav link
- `apps/web/components/admin/games/GameFormModal.tsx` — category `<select>` instead of free-text input
- `apps/web/app/admin/games/page.tsx` — display `category.name`, pass `categoryId` to the form
- `apps/web/components/games/GameCard.tsx` — `category` prop is now `{id,name,slug} | null`
- `apps/web/app/(dashboard)/page.tsx` — fetch categories, render `GameCategoryFilter`
- `apps/web/app/(dashboard)/games/[slug]/page.tsx` — `category` is now an object
- `apps/web/messages/en.json` / `apps/web/messages/th.json` — new keys (see per-task diffs)

---

### Task 1: Prisma schema, migration, and seed data

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260705120000_add_categories/migration.sql`
- Modify: `apps/api/prisma/seed.ts`

**Interfaces:**
- Produces: Prisma model `Category { id, name, slug, sortOrder, isActive, createdAt, updatedAt, games: Game[] }`; `Game.categoryId: string | null` and `Game.category: Category | null` (relation), available from `@prisma/client` after `prisma generate`.

- [ ] **Step 1: Add the `Category` model to `schema.prisma`**

Insert a new model directly above `model Game {` (`apps/api/prisma/schema.prisma:157`):

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

model Game {
```

- [ ] **Step 2: Replace `Game.category` with `Game.categoryId` + relation**

In the `Game` model (`apps/api/prisma/schema.prisma`), replace this line:

```prisma
  category    String?  @db.VarChar(50)
```

with:

```prisma
  categoryId  String?  @map("category_id") @db.Uuid
```

Then, in the same `Game` model's relations block, add the `category` relation next to the existing `products`/`coupons`/`cashbackRules` relations:

```prisma
  category      Category?     @relation(fields: [categoryId], references: [id])
  products      GameProduct[]
  coupons       Coupon[]
  cashbackRules CashbackRule[]
```

Finally, add an index on the new FK column, next to `@@map("games")`:

```prisma
  @@index([categoryId], name: "idx_games_category_id")
  @@map("games")
```

- [ ] **Step 3: Create the migration**

Create the directory and file `apps/api/prisma/migrations/20260705120000_add_categories/migration.sql` with this exact content:

```sql
-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- AlterTable
ALTER TABLE "games" ADD COLUMN "category_id" UUID;

-- Data migration: one Category row per distinct existing games.category string value.
-- sort_order/is_active are left at their column defaults (0 / true) here — Task 1
-- Step 6's seed run overwrites sort_order with the canonical value per category.
INSERT INTO "categories" ("id", "name", "slug", "created_at", "updated_at")
SELECT gen_random_uuid(), src.category, lower(regexp_replace(src.category, '[^a-zA-Z0-9]+', '-', 'g')), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT category FROM "games" WHERE category IS NOT NULL) AS src;

-- Backfill games.category_id from the newly created category rows
UPDATE "games" g
SET "category_id" = c."id"
FROM "categories" c
WHERE g."category" = c."name";

-- Drop the old free-text column
ALTER TABLE "games" DROP COLUMN "category";

-- CreateIndex
CREATE INDEX "idx_games_category_id" ON "games"("category_id");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Apply the migration and regenerate the Prisma client**

```bash
docker compose exec api npx prisma migrate deploy
docker compose exec api npx prisma generate
```

Expected: `migrate deploy` output ends with `The following migration(s) have been applied: ... 20260705120000_add_categories`. `generate` ends with `Generated Prisma Client`.

- [ ] **Step 5: Rewrite `seed.ts` to seed categories and reference `categoryId`**

Replace `apps/api/prisma/seed.ts` in full with:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Catalog sourced from getmoneythailand.com (Thai top-up storefront), 2026-07-03.
// priceSell is their retail THB price; priceCost assumes a ~7% margin.
const CDN = 'https://www.getmoneythailand.com/images/pictures';
const COST_RATIO = 0.93;

interface SeedProduct {
  name: string;
  sku: string;
  priceSell: number;
}

interface SeedCategory {
  name: string;
  slug: string;
  sortOrder: number;
}

const CATEGORIES: SeedCategory[] = [
  { name: 'FPS', slug: 'fps', sortOrder: 1 },
  { name: 'MOBA', slug: 'moba', sortOrder: 2 },
  { name: 'Battle Royale', slug: 'battle-royale', sortOrder: 3 },
  { name: 'RPG', slug: 'rpg', sortOrder: 4 },
];

interface SeedGame {
  name: string;
  slug: string;
  categorySlug: string;
  description: string;
  logoUrl: string;
  sortOrder: number;
  requiresServer?: boolean;
  products: SeedProduct[];
}

const GAMES: SeedGame[] = [
  {
    name: 'Valorant',
    slug: 'valorant',
    categorySlug: 'fps',
    description: 'Valorant Points delivered to your Riot ID in 3–5 minutes.',
    logoUrl: `${CDN}/valorant.jpg`,
    sortOrder: 1,
    products: [
      { name: '475 Points', sku: 'VAL-VP-475', priceSell: 127 },
      { name: '1,000 Points', sku: 'VAL-VP-1000', priceSell: 253 },
      { name: '2,050 Points', sku: 'VAL-VP-2050', priceSell: 510 },
      { name: '3,650 Points', sku: 'VAL-VP-3650', priceSell: 899 },
      { name: '4,525 Points', sku: 'VAL-VP-4525', priceSell: 1143 },
      { name: '6,700 Points', sku: 'VAL-VP-6700', priceSell: 1662 },
      { name: '11,000 Points', sku: 'VAL-VP-11000', priceSell: 2565 },
      { name: '22,000 Points', sku: 'VAL-VP-22000', priceSell: 5130 },
    ],
  },
  {
    name: 'Arena of Valor',
    slug: 'rov',
    categorySlug: 'moba',
    description: 'RoV coupons credited to your account instantly.',
    logoUrl: `${CDN}/rov.jpg`,
    sortOrder: 2,
    products: [
      { name: '11 Coupons (10 + 1 bonus)', sku: 'ROV-CP-11', priceSell: 10 },
      { name: '24 Coupons (20 + 4 bonus)', sku: 'ROV-CP-24', priceSell: 20 },
      { name: '60 Coupons (50 + 10 bonus)', sku: 'ROV-CP-60', priceSell: 49 },
      { name: '110 Coupons (83 + 27 bonus)', sku: 'ROV-CP-110', priceSell: 88 },
      { name: '185 Coupons (125 + 60 bonus)', sku: 'ROV-CP-185', priceSell: 146 },
      { name: '370 Coupons (333 + 37 bonus)', sku: 'ROV-CP-370', priceSell: 291 },
      { name: '620 Coupons (590 + 30 bonus)', sku: 'ROV-CP-620', priceSell: 485 },
      { name: '1,240 Coupons (1,178 + 62 bonus)', sku: 'ROV-CP-1240', priceSell: 970 },
      { name: '2,480 Coupons (2,356 + 124 bonus)', sku: 'ROV-CP-2480', priceSell: 1940 },
    ],
  },
  {
    name: 'Free Fire',
    slug: 'freefire',
    categorySlug: 'battle-royale',
    description: 'Diamonds and memberships for Free Fire, delivered instantly.',
    logoUrl: `${CDN}/freefire.jpg`,
    sortOrder: 3,
    products: [
      { name: '33 Diamonds (30 + 3 bonus)', sku: 'FF-DM-33', priceSell: 10 },
      { name: '68 Diamonds (43 + 25 bonus)', sku: 'FF-DM-68', priceSell: 20 },
      { name: '172 Diamonds (137 + 35 bonus)', sku: 'FF-DM-172', priceSell: 49 },
      { name: '310 Diamonds (231 + 79 bonus)', sku: 'FF-DM-310', priceSell: 88 },
      { name: '517 Diamonds (470 + 47 bonus)', sku: 'FF-DM-517', priceSell: 146 },
      { name: '690 Diamonds (627 + 63 bonus)', sku: 'FF-DM-690', priceSell: 194 },
      { name: '1,052 Diamonds (956 + 96 bonus)', sku: 'FF-DM-1052', priceSell: 291 },
      { name: '1,801 Diamonds (1,637 + 164 bonus)', sku: 'FF-DM-1801', priceSell: 485 },
      { name: '3,698 Diamonds (3,361 + 337 bonus)', sku: 'FF-DM-3698', priceSell: 970 },
      { name: 'Weekly Mini Diamond Membership', sku: 'FF-MEM-WEEK-MINI', priceSell: 33 },
      { name: 'Weekly Diamond Membership', sku: 'FF-MEM-WEEK', priceSell: 65 },
      { name: 'Monthly Diamond Membership', sku: 'FF-MEM-MONTH', priceSell: 292 },
      { name: 'Booyah Pass (BP Card)', sku: 'FF-BP-CARD', priceSell: 88 },
    ],
  },
  {
    name: 'Mobile Legends: Bang Bang',
    slug: 'mobile-legends',
    categorySlug: 'moba',
    description: 'MLBB diamonds credited to your account instantly.',
    logoUrl: `${CDN}/Mobilelegends.jpg`,
    sortOrder: 4,
    products: [
      { name: '100 Diamonds — first top-up (50 + 50)', sku: 'MLBB-FT-100', priceSell: 30 },
      { name: '300 Diamonds — first top-up (150 + 150)', sku: 'MLBB-FT-300', priceSell: 83 },
      { name: '500 Diamonds — first top-up (250 + 250)', sku: 'MLBB-FT-500', priceSell: 131 },
      { name: '1,000 Diamonds — first top-up (500 + 500)', sku: 'MLBB-FT-1000', priceSell: 262 },
      { name: 'Weekly Diamond Pass', sku: 'MLBB-PASS-WEEK', priceSell: 53 },
      { name: '56 Diamonds (51 + 5 bonus)', sku: 'MLBB-DM-56', priceSell: 29 },
      { name: '112 Diamonds (102 + 10 bonus)', sku: 'MLBB-DM-112', priceSell: 56 },
      { name: '223 Diamonds (203 + 20 bonus)', sku: 'MLBB-DM-223', priceSell: 107 },
      { name: '336 Diamonds (303 + 33 bonus)', sku: 'MLBB-DM-336', priceSell: 160 },
      { name: '570 Diamonds (504 + 66 bonus)', sku: 'MLBB-DM-570', priceSell: 265 },
      { name: '1,163 Diamonds (1,007 + 156 bonus)', sku: 'MLBB-DM-1163', priceSell: 515 },
      { name: '2,398 Diamonds (2,015 + 383 bonus)', sku: 'MLBB-DM-2398', priceSell: 1020 },
      { name: '6,042 Diamonds (5,035 + 1,007 bonus)', sku: 'MLBB-DM-6042', priceSell: 2525 },
    ],
  },
  {
    name: 'PUBG Mobile',
    slug: 'pubg-mobile',
    categorySlug: 'battle-royale',
    description: 'Unknown Cash (UC) for PUBG Mobile Global.',
    logoUrl: `${CDN}/pubg_m_global.jpg`,
    sortOrder: 5,
    products: [
      { name: '60 UC', sku: 'PUBG-UC-60', priceSell: 31 },
      { name: '325 UC (300 + 25 bonus)', sku: 'PUBG-UC-325', priceSell: 151 },
      { name: '660 UC (600 + 60 bonus)', sku: 'PUBG-UC-660', priceSell: 301 },
      { name: '1,800 UC (1,500 + 300 bonus)', sku: 'PUBG-UC-1800', priceSell: 751 },
      { name: '3,850 UC (3,000 + 850 bonus)', sku: 'PUBG-UC-3850', priceSell: 1501 },
      { name: '8,100 UC (6,000 + 2,100 bonus)', sku: 'PUBG-UC-8100', priceSell: 3000 },
    ],
  },
  {
    name: 'Genshin Impact',
    slug: 'genshin-impact',
    categorySlug: 'rpg',
    description: 'Genesis Crystals and Welkin Moon for Genshin Impact.',
    logoUrl: `${CDN}/genshin.jpg`,
    sortOrder: 6,
    requiresServer: true,
    products: [
      { name: 'Blessing of the Welkin Moon', sku: 'GI-WELKIN', priceSell: 144 },
      { name: '60 Genesis Crystals', sku: 'GI-GC-60', priceSell: 28 },
      { name: '330 Genesis Crystals (300 + 30 bonus)', sku: 'GI-GC-330', priceSell: 144 },
      { name: '1,090 Genesis Crystals (980 + 110 bonus)', sku: 'GI-GC-1090', priceSell: 440 },
      { name: '2,240 Genesis Crystals (1,980 + 260 bonus)', sku: 'GI-GC-2240', priceSell: 880 },
      { name: '3,880 Genesis Crystals (3,280 + 600 bonus)', sku: 'GI-GC-3880', priceSell: 1440 },
      { name: '8,080 Genesis Crystals (6,480 + 1,600 bonus)', sku: 'GI-GC-8080', priceSell: 2960 },
    ],
  },
  {
    name: 'Honkai: Star Rail',
    slug: 'honkai-star-rail',
    categorySlug: 'rpg',
    description: 'Oneiric Shards and Express Supply Pass for Honkai: Star Rail.',
    logoUrl: `${CDN}/honkaistarrail.jpg`,
    sortOrder: 7,
    requiresServer: true,
    products: [
      { name: 'Express Supply Pass', sku: 'HSR-PASS', priceSell: 155 },
      { name: '60 Oneiric Shards', sku: 'HSR-OS-60', priceSell: 31 },
      { name: '330 Oneiric Shards (300 + 30 bonus)', sku: 'HSR-OS-330', priceSell: 155 },
      { name: '1,090 Oneiric Shards (980 + 110 bonus)', sku: 'HSR-OS-1090', priceSell: 475 },
      { name: '2,240 Oneiric Shards (1,980 + 260 bonus)', sku: 'HSR-OS-2240', priceSell: 945 },
      { name: '3,880 Oneiric Shards (3,280 + 600 bonus)', sku: 'HSR-OS-3880', priceSell: 1530 },
      { name: '8,080 Oneiric Shards (6,480 + 1,600 bonus)', sku: 'HSR-OS-8080', priceSell: 3150 },
    ],
  },
  {
    name: 'Wuthering Waves',
    slug: 'wuthering-waves',
    categorySlug: 'rpg',
    description: 'Lunite and Lunite Subscription for Wuthering Waves.',
    logoUrl: `${CDN}/wuthering-wave.jpg`,
    sortOrder: 8,
    requiresServer: true,
    products: [
      { name: 'Lunite Subscription', sku: 'WUWA-SUB', priceSell: 144 },
      { name: '60 Lunite', sku: 'WUWA-LUN-60', priceSell: 28 },
      { name: '330 Lunite (300 + 30 bonus)', sku: 'WUWA-LUN-330', priceSell: 144 },
      { name: '1,090 Lunite (980 + 110 bonus)', sku: 'WUWA-LUN-1090', priceSell: 440 },
      { name: '2,240 Lunite (1,980 + 260 bonus)', sku: 'WUWA-LUN-2240', priceSell: 880 },
      { name: '3,880 Lunite (3,280 + 600 bonus)', sku: 'WUWA-LUN-3880', priceSell: 1440 },
      { name: '8,080 Lunite (6,480 + 1,600 bonus)', sku: 'WUWA-LUN-8080', priceSell: 2960 },
    ],
  },
  {
    name: 'Honor of Kings',
    slug: 'honor-of-kings',
    categorySlug: 'moba',
    description: 'Tokens for Honor of Kings (Global), credited instantly.',
    logoUrl: `${CDN}/honorofkings.jpg`,
    sortOrder: 9,
    products: [
      { name: '80 Tokens', sku: 'HOK-TK-80', priceSell: 31 },
      { name: '400 Tokens', sku: 'HOK-TK-400', priceSell: 150 },
      { name: '560 Tokens', sku: 'HOK-TK-560', priceSell: 215 },
      { name: '830 Tokens (800 + 30 bonus)', sku: 'HOK-TK-830', priceSell: 302 },
      { name: '2,508 Tokens (2,400 + 108 bonus)', sku: 'HOK-TK-2508', priceSell: 870 },
      { name: '4,180 Tokens (4,000 + 180 bonus)', sku: 'HOK-TK-4180', priceSell: 1467 },
    ],
  },
  {
    name: 'Zenless Zone Zero',
    slug: 'zenless-zone-zero',
    categorySlug: 'rpg',
    description: 'Monochrome and Inter-Knot Membership for Zenless Zone Zero.',
    logoUrl: `${CDN}/zzz.jpg`,
    sortOrder: 10,
    requiresServer: true,
    products: [
      { name: 'Inter-Knot Membership', sku: 'ZZZ-PASS', priceSell: 155 },
      { name: '60 Monochrome', sku: 'ZZZ-MONO-60', priceSell: 31 },
      { name: '330 Monochrome (300 + 30 bonus)', sku: 'ZZZ-MONO-330', priceSell: 155 },
      { name: '1,090 Monochrome (980 + 110 bonus)', sku: 'ZZZ-MONO-1090', priceSell: 475 },
      { name: '2,240 Monochrome (1,980 + 260 bonus)', sku: 'ZZZ-MONO-2240', priceSell: 945 },
      { name: '3,880 Monochrome (3,280 + 600 bonus)', sku: 'ZZZ-MONO-3880', priceSell: 1530 },
      { name: '8,080 Monochrome (6,480 + 1,600 bonus)', sku: 'ZZZ-MONO-8080', priceSell: 3150 },
    ],
  },
];

async function main() {
  const categoryIdBySlug = new Map<string, string>();
  for (const cat of CATEGORIES) {
    const dbCategory = await prisma.category.upsert({
      where: { slug: cat.slug },
      create: cat,
      update: cat,
    });
    categoryIdBySlug.set(cat.slug, dbCategory.id);
    console.log(`✓ category ${dbCategory.name}`);
  }

  for (const game of GAMES) {
    const { products, requiresServer, categorySlug, ...gameData } = game;
    const categoryId = categoryIdBySlug.get(categorySlug);

    const dbGame = await prisma.game.upsert({
      where: { slug: game.slug },
      create: { ...gameData, categoryId, isActive: true },
      update: { ...gameData, categoryId },
    });

    for (const [index, product] of products.entries()) {
      const priceCost = Math.round(product.priceSell * COST_RATIO * 100) / 100;
      const data = {
        gameId: dbGame.id,
        name: product.name,
        sku: product.sku,
        priceCost,
        priceSell: product.priceSell,
        requiresServer: requiresServer ?? false,
        sortOrder: index + 1,
        isActive: true,
      };
      await prisma.gameProduct.upsert({
        where: { sku: product.sku },
        create: data,
        update: data,
      });
    }

    console.log(`✓ ${game.name} — ${products.length} products`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 6: Run the seed and verify data**

```bash
docker compose exec api npx prisma db seed
```

Expected: 4 `✓ category ...` lines (FPS, MOBA, Battle Royale, RPG) followed by 10 `✓ <Game> — N products` lines, no errors.

```bash
docker compose exec postgres psql -U pixelpay -d pixelpay -c \
  "select g.name, c.name as category from games g left join categories c on c.id = g.category_id order by g.sort_order;"
```

Expected: all 10 games listed, each with a non-null `category` matching its original free-text value (Valorant → FPS, Arena of Valor → MOBA, Free Fire → Battle Royale, etc.).

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/prisma/seed.ts
git commit -m "feat(db): add Category model with one-to-many Game relation"
```

---

### Task 2: `CategoriesService` — DTOs, service, public controller, unit tests

**Files:**
- Create: `apps/api/src/categories/dto/create-category.dto.ts`
- Create: `apps/api/src/categories/dto/update-category.dto.ts`
- Create: `apps/api/src/categories/categories.service.spec.ts`
- Create: `apps/api/src/categories/categories.service.ts`
- Create: `apps/api/src/categories/categories.controller.ts`
- Create: `apps/api/src/categories/categories.module.ts`

**Interfaces:**
- Consumes: `PrismaService` (`apps/api/src/prisma/prisma.service.ts`), `prisma.category` model (Task 1).
- Produces:
  - `CategoriesService.findAllActive(): Promise<Category[]>` — active categories, ordered by `sortOrder asc`
  - `CategoriesService.adminList(): Promise<Category[]>` — all categories, ordered by `sortOrder asc`
  - `CategoriesService.adminCreate(dto: CreateCategoryDto): Promise<Category>`
  - `CategoriesService.adminUpdate(id: string, dto: UpdateCategoryDto): Promise<Category>`
  - `CategoriesService.adminDelete(id: string): Promise<void>`
  - `CategoriesModule` exporting `CategoriesService`
  - `GET /categories` (public, no guard) → `findAllActive()`

- [ ] **Step 1: Write `CreateCategoryDto`**

`apps/api/src/categories/dto/create-category.dto.ts`:

```typescript
import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MaxLength(50)
  name!: string;

  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase letters, numbers, and hyphens only' })
  slug!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
```

- [ ] **Step 2: Write `UpdateCategoryDto`**

`apps/api/src/categories/dto/update-category.dto.ts`:

```typescript
import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase letters, numbers, and hyphens only' })
  slug?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
```

- [ ] **Step 3: Write the failing unit tests**

`apps/api/src/categories/categories.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  category: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('CategoriesService', () => {
  let service: CategoriesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(CategoriesService);
  });

  describe('findAllActive', () => {
    it('returns only active categories ordered by sortOrder', async () => {
      mockPrisma.category.findMany.mockResolvedValue([{ id: 'c1', name: 'FPS' }]);
      const result = await service.findAllActive();
      expect(mockPrisma.category.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
      expect(result).toEqual([{ id: 'c1', name: 'FPS' }]);
    });
  });

  describe('adminList', () => {
    it('returns all categories ordered by sortOrder', async () => {
      mockPrisma.category.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
      const result = await service.adminList();
      expect(mockPrisma.category.findMany).toHaveBeenCalledWith({ orderBy: { sortOrder: 'asc' } });
      expect(result).toEqual([{ id: 'c1' }, { id: 'c2' }]);
    });
  });

  describe('adminCreate', () => {
    it('creates a category successfully', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);
      mockPrisma.category.create.mockResolvedValue({ id: 'c1', slug: 'fps' });
      const result = await service.adminCreate({ name: 'FPS', slug: 'fps' } as any);
      expect(result).toEqual({ id: 'c1', slug: 'fps' });
    });

    it('throws ConflictException when slug already exists', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.adminCreate({ name: 'FPS', slug: 'taken' } as any))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('adminUpdate', () => {
    it('throws NotFoundException when category does not exist', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);
      await expect(service.adminUpdate('bad-id', {} as any))
        .rejects.toThrow(NotFoundException);
    });

    it('updates category when it exists', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'c1' });
      mockPrisma.category.update.mockResolvedValue({ id: 'c1', name: 'Updated' });
      const result = await service.adminUpdate('c1', { name: 'Updated' } as any);
      expect(result).toEqual({ id: 'c1', name: 'Updated' });
    });

    it('throws ConflictException when slug is taken by another category', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'c1' });
      mockPrisma.category.findFirst.mockResolvedValue({ id: 'c2' });
      await expect(service.adminUpdate('c1', { slug: 'taken' } as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('adminDelete', () => {
    it('throws NotFoundException when category does not exist', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);
      await expect(service.adminDelete('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('deletes category when it exists', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'c1' });
      mockPrisma.category.delete.mockResolvedValue({});
      await service.adminDelete('c1');
      expect(mockPrisma.category.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });
  });
});
```

- [ ] **Step 4: Run tests — expect all to FAIL (`CategoriesService` not yet defined)**

```bash
cd apps/api && npx jest --testPathPattern=categories 2>&1 | tail -20
```

Expected: `Cannot find module './categories.service'` (or similar module-resolution failure).

- [ ] **Step 5: Write `CategoriesService`**

`apps/api/src/categories/categories.service.ts`:

```typescript
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  findAllActive() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  adminList() {
    return this.prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async adminCreate(dto: CreateCategoryDto) {
    const existing = await this.prisma.category.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Slug "${dto.slug}" is already in use`);
    return this.prisma.category.create({ data: dto });
  }

  async adminUpdate(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');

    if (dto.slug) {
      const slugConflict = await this.prisma.category.findFirst({
        where: { slug: dto.slug, NOT: { id } },
      });
      if (slugConflict) throw new ConflictException(`Slug "${dto.slug}" is already in use`);
    }

    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async adminDelete(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    await this.prisma.category.delete({ where: { id } });
  }
}
```

- [ ] **Step 6: Write `CategoriesController` and `CategoriesModule`**

`apps/api/src/categories/categories.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private categories: CategoriesService) {}

  @Get()
  findAll() {
    return this.categories.findAllActive();
  }
}
```

`apps/api/src/categories/categories.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';

@Module({
  providers: [CategoriesService],
  controllers: [CategoriesController],
  exports: [CategoriesService],
})
export class CategoriesModule {}
```

- [ ] **Step 7: Run tests — expect all to PASS**

```bash
cd apps/api && npx jest --testPathPattern=categories 2>&1 | tail -20
```

Expected: `Tests: 9 passed, 9 total`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/categories
git commit -m "feat(api): add CategoriesService with public GET /categories"
```

---

### Task 3: Wire admin category CRUD into `AdminController`

**Files:**
- Modify: `apps/api/src/admin/admin.module.ts`
- Modify: `apps/api/src/admin/admin.controller.ts`

**Interfaces:**
- Consumes: `CategoriesModule`, `CategoriesService` (Task 2).
- Produces: `GET/POST/PATCH/DELETE /admin/categories[/:id]` on the running API.

- [ ] **Step 1: Import `CategoriesModule` into `AdminModule`**

`apps/api/src/admin/admin.module.ts` — full replacement:

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuditModule } from '../audit/audit.module';
import { ResellersModule } from '../resellers/resellers.module';
import { GamesModule } from '../games/games.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [
    AnalyticsModule,
    AuditModule,
    ResellersModule,
    GamesModule,
    CategoriesModule,
    BullModule.registerQueue({ name: 'topup' }),
  ],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
```

- [ ] **Step 2: Inject `CategoriesService` and add category routes to `AdminController`**

In `apps/api/src/admin/admin.controller.ts`:

Add these imports next to the existing `GamesService`/DTO imports:

```typescript
import { CategoriesService } from '../categories/categories.service';
import { CreateCategoryDto } from '../categories/dto/create-category.dto';
import { UpdateCategoryDto } from '../categories/dto/update-category.dto';
```

Add `categories: CategoriesService` to the constructor:

```typescript
  constructor(
    private admin: AdminService,
    private analytics: AnalyticsService,
    private resellers: ResellersService,
    private games: GamesService,
    private categories: CategoriesService,
  ) {}
```

Add a new route group after the `// ── product management ──...` block (after `deleteProduct`, before the closing `}` of the class):

```typescript
  // ── category management ──────────────────────────────────────────────────

  @Get('categories')
  listCategories() { return this.categories.adminList(); }

  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) { return this.categories.adminCreate(dto); }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.adminUpdate(id, dto);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCategory(@Param('id') id: string) { return this.categories.adminDelete(id); }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (exit 0).

- [ ] **Step 4: Smoke-test the endpoints against the running dev stack**

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pixelpay.dev","password":"Admin1234!"}' \
  | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.accessToken))")

curl -s http://localhost:4000/api/v1/admin/categories -H "Authorization: Bearer $TOKEN"
# Expected: {"success":true,"data":[{"id":"...","name":"FPS",...}, ... 4 categories from Task 1's seed]}

curl -s -X POST http://localhost:4000/api/v1/admin/categories \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Sports","slug":"sports","sortOrder":5}'
# Expected: {"success":true,"data":{"id":"...","name":"Sports","slug":"sports",...}}
```

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
cd apps/api && npx jest --no-coverage 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/admin
git commit -m "feat(api): wire admin category CRUD into AdminController"
```

---

### Task 4: Point `GamesService` and game DTOs at `categoryId`

**Files:**
- Modify: `apps/api/src/games/games.service.ts`
- Modify: `apps/api/src/games/dto/create-game.dto.ts`
- Modify: `apps/api/src/games/dto/update-game.dto.ts`

**Interfaces:**
- Consumes: `Category` model, `Game.categoryId` (Task 1).
- Produces: `GamesService.findAll()` / `findBySlug()` / `adminListGames()` now return `category: { id, name, slug } | null` instead of a raw string; `CreateGameDto.categoryId?: string | null`, `UpdateGameDto.categoryId?: string | null`.

- [ ] **Step 1: Update `CreateGameDto`**

In `apps/api/src/games/dto/create-game.dto.ts`, replace:

```typescript
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;
```

with:

```typescript
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;
```

and add `IsUUID` to the `class-validator` import at the top of the file:

```typescript
import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, IsUUID, Matches, MaxLength, Min } from 'class-validator';
```

`categoryId` is typed `string | null` (not just `string`) because the admin UI needs to explicitly send `null` to clear a game's category on edit — `class-validator`'s `@IsOptional()` skips all validators (including `@IsUUID()`) for both `undefined` and `null`, so this accepts "field omitted", `null`, or a valid UUID.

- [ ] **Step 2: Update `UpdateGameDto`**

Apply the identical change to `apps/api/src/games/dto/update-game.dto.ts` (same import line, same field replacement — `category?: string` → `categoryId?: string | null` with `@IsOptional() @IsUUID()`).

- [ ] **Step 3: Update `GamesService` selects**

In `apps/api/src/games/games.service.ts`, replace the `findAll` and `findBySlug` methods:

```typescript
  findAll() {
    return this.prisma.game.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true, name: true, slug: true, logoUrl: true, sortOrder: true,
        category: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  async findBySlug(slug: string) {
    const game = await this.prisma.game.findUnique({
      where: { slug },
      select: {
        id: true, name: true, slug: true, logoUrl: true, bannerUrl: true, description: true,
        category: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!game) throw new NotFoundException('Game not found');
    return game;
  }
```

And replace the `adminListGames` method:

```typescript
  adminListGames() {
    return this.prisma.game.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { category: { select: { id: true, name: true, slug: true } } },
    });
  }
```

`adminCreateGame`/`adminUpdateGame` pass `dto` straight through to `prisma.game.create`/`update` and need no change — `CreateGameDto`/`UpdateGameDto` now carry `categoryId` instead of `category`, and Prisma's scalar `categoryId` field accepts it directly.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (exit 0).

- [ ] **Step 5: Run the existing games test suite**

```bash
cd apps/api && npx jest --testPathPattern=games 2>&1 | tail -10
```

Expected: all existing tests still pass unchanged (none of them assert on the `category`/`categoryId` field, so no test edits are needed).

- [ ] **Step 6: Smoke-test against the running dev stack**

```bash
curl -s http://localhost:4000/api/v1/games/valorant
# Expected: {"success":true,"data":{"id":"...","name":"Valorant",...,"category":{"id":"...","name":"FPS","slug":"fps"}}}
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/games
git commit -m "feat(api): read/write games via categoryId instead of a free-text category string"
```

---

### Task 5: Admin UI — Categories management page

**Files:**
- Create: `apps/web/components/admin/categories/CategoryFormModal.tsx`
- Create: `apps/web/app/admin/categories/page.tsx`
- Modify: `apps/web/app/admin/layout.tsx`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/th.json`

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE /admin/categories[/:id]` (Task 3).
- Produces: `/admin/categories` page; `CategoryFormModal` component exporting `CategoryFormData = { name: string; slug: string; isActive: boolean; sortOrder: number }`.

- [ ] **Step 1: Add i18n keys**

In `apps/web/messages/en.json`, add `"categories": "Categories",` to the `admin.nav` block (after line 204, `"games": "Games",`):

```json
    "nav": {
      "badge": "Admin",
      "dashboard": "Dashboard",
      "games": "Games",
      "categories": "Categories",
      "orders": "Orders",
      "users": "Users",
      "backToStore": "← Store"
    },
```

Then insert a new `"categories"` block as a sibling of `"games"` (after line 239, the `"games": { ... }` block's closing `},`, before `"products": {`):

```json
    "categories": {
      "title": "Categories",
      "newCategory": "+ New category",
      "name": "Name",
      "slug": "Slug",
      "order": "Order",
      "status": "Status",
      "noCategories": "No categories yet. Click \"+ New category\" to create one.",
      "deleteConfirm": "Delete \"{name}\"? Games in this category will become uncategorized.",
      "newCategoryTitle": "New Category",
      "editTitle": "Edit — {name}",
      "form": {
        "name": "Name *",
        "slugLabel": "Slug *",
        "slugHint": "(lowercase-hyphens)",
        "slugPattern": "Lowercase, numbers and hyphens only",
        "sortOrder": "Sort order",
        "active": "Active"
      }
    },
    "products": {
```

Apply the equivalent additions to `apps/web/messages/th.json`. In `admin.nav` (after line 204, `"games": "เกม",`):

```json
    "nav": {
      "badge": "แอดมิน",
      "dashboard": "แดชบอร์ด",
      "games": "เกม",
      "categories": "หมวดหมู่",
      "orders": "คำสั่งซื้อ",
      "users": "ผู้ใช้",
      "backToStore": "← หน้าร้าน"
    },
```

And a new `"categories"` block as a sibling of `"games"` (after line 239, before `"products": {`):

```json
    "categories": {
      "title": "หมวดหมู่",
      "newCategory": "+ เพิ่มหมวดหมู่",
      "name": "ชื่อ",
      "slug": "Slug",
      "order": "ลำดับ",
      "status": "สถานะ",
      "noCategories": "ยังไม่มีหมวดหมู่ กด \"+ เพิ่มหมวดหมู่\" เพื่อสร้าง",
      "deleteConfirm": "ลบ \"{name}\"? เกมในหมวดหมู่นี้จะไม่มีหมวดหมู่",
      "newCategoryTitle": "เพิ่มหมวดหมู่",
      "editTitle": "แก้ไข — {name}",
      "form": {
        "name": "ชื่อ *",
        "slugLabel": "Slug *",
        "slugHint": "(ตัวพิมพ์เล็ก-ขีดกลาง)",
        "slugPattern": "ตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น",
        "sortOrder": "ลำดับ",
        "active": "ใช้งาน"
      }
    },
    "products": {
```

Verify both catalogs still match:

```bash
cd apps/web && node scripts/check-messages.mjs
```

Expected: `OK — <N> keys in both catalogs` (N increased by 15 — 1 nav key + 14 keys under the new `categories` block, counting nested `form.*`).

- [ ] **Step 2: Create `CategoryFormModal`**

`apps/web/components/admin/categories/CategoryFormModal.tsx`:

```tsx
'use client';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';

export interface CategoryFormData {
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder: number;
}

interface Props {
  initial?: Partial<CategoryFormData>;
  onSubmit: (data: CategoryFormData) => Promise<void>;
  onClose: () => void;
  title: string;
}

export function CategoryFormModal({ initial, onSubmit, onClose, title }: Props) {
  const t = useTranslations('admin.categories.form');
  const tc = useTranslations('common');
  const resolver = useMemo(
    () =>
      zodResolver(
        z.object({
          name: z.string().min(1).max(50),
          slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, t('slugPattern')),
          isActive: z.boolean(),
          sortOrder: z.coerce.number().int().min(0),
        }),
      ),
    [t],
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<CategoryFormData>({
    resolver,
    defaultValues: {
      isActive: true,
      sortOrder: 0,
      ...initial,
    },
  });

  const submit = async (data: CategoryFormData) => {
    try {
      await onSubmit(data);
    } catch (e: any) {
      setError('root', { message: e.message });
    }
  };

  return (
    <div className="fixed inset-0 bg-void-deep/80 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="pixel-cut bg-panel border border-frost/10 w-full max-w-md p-6">
        <h2 className="font-display text-lg text-frost mb-4">{title}</h2>
        <form onSubmit={handleSubmit(submit)} className="space-y-3">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('name')}</label>
            <input {...register('name')} className="w-full border border-frost/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" />
            {errors.name && <p className="text-pink text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('slugLabel')} <span className="text-frost/30 normal-case font-body">{t('slugHint')}</span></label>
            <input {...register('slug')} className="w-full border border-frost/15 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" placeholder="battle-royale" />
            {errors.slug && <p className="text-pink text-xs mt-1">{errors.slug.message}</p>}
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('sortOrder')}</label>
              <input type="number" {...register('sortOrder')} className="w-full border border-frost/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" />
            </div>
            <div className="flex items-end gap-2 pb-2">
              <input type="checkbox" id="isActive" {...register('isActive')} className="w-4 h-4 accent-pixel" />
              <label htmlFor="isActive" className="text-sm font-medium text-frost">{t('active')}</label>
            </div>
          </div>
          {errors.root && (
            <div className="bg-pink/10 border border-pink/30 px-3 py-2 text-pink text-sm">
              {errors.root.message}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-frost/15 py-2 text-sm text-frost/60 hover:bg-panel-light">
              {tc('cancel')}
            </button>
            <button type="submit" disabled={isSubmitting} className="flex-1 grad-brand text-white py-2 text-sm font-bold hover:brightness-110 disabled:opacity-50 transition-colors">
              {isSubmitting ? tc('saving') : tc('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the categories list page**

`apps/web/app/admin/categories/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '../../../lib/api-client';
import { CategoryFormModal, CategoryFormData } from '../../../components/admin/categories/CategoryFormModal';

interface Category {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder: number;
}

export default function AdminCategoriesPage() {
  const t = useTranslations('admin.categories');
  const tc = useTranslations('common');
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; category: Category } | null>(null);

  const load = async () => {
    try {
      const data = await apiFetch<Category[]>('/admin/categories');
      setCategories(data);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async (data: CategoryFormData) => {
    await apiFetch('/admin/categories', { method: 'POST', body: JSON.stringify(data) });
    setModal(null);
    load();
  };

  const handleEdit = async (data: CategoryFormData) => {
    if (modal?.mode !== 'edit') return;
    await apiFetch(`/admin/categories/${modal.category.id}`, { method: 'PATCH', body: JSON.stringify(data) });
    setModal(null);
    load();
  };

  const handleDelete = async (category: Category) => {
    if (!confirm(t('deleteConfirm', { name: category.name }))) return;
    try {
      await apiFetch(`/admin/categories/${category.id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (error) return <div className="text-pink">{tc('error', { message: error })}</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl text-frost">{t('title')}</h1>
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="grad-brand text-white px-4 py-2 pixel-cut text-sm font-bold hover:brightness-110 transition-colors"
        >
          {t('newCategory')}
        </button>
      </div>

      <div className="pixel-cut bg-panel border border-frost/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-void-deep">
            <tr>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('name')}</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('slug')}</th>
              <th className="text-center px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('order')}</th>
              <th className="text-center px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('status')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-frost/5">
            {categories.length === 0 && (
              <tr><td colSpan={5} className="text-center py-12 text-frost/40">{t('noCategories')}</td></tr>
            )}
            {categories.map((c) => (
              <tr key={c.id} className="hover:bg-panel-light/60">
                <td className="px-4 py-3 font-medium text-frost">{c.name}</td>
                <td className="px-4 py-3 text-frost/50 font-mono">{c.slug}</td>
                <td className="px-4 py-3 text-center text-frost/50 font-mono tabular-nums">{c.sortOrder}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.isActive ? 'bg-mint/15 text-mint' : 'bg-frost/10 text-frost/50'}`}>
                    {c.isActive ? tc('active') : tc('inactive')}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button onClick={() => setModal({ mode: 'edit', category: c })} className="text-frost/50 hover:text-frost text-xs">{tc('edit')}</button>
                    <button onClick={() => handleDelete(c)} className="text-pink hover:text-pink-dim text-xs">{tc('delete')}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal?.mode === 'create' && (
        <CategoryFormModal title={t('newCategoryTitle')} onSubmit={handleCreate} onClose={() => setModal(null)} />
      )}
      {modal?.mode === 'edit' && (
        <CategoryFormModal
          title={t('editTitle', { name: modal.category.name })}
          initial={modal.category}
          onSubmit={handleEdit}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add the Categories nav link**

In `apps/web/app/admin/layout.tsx`, add a new `Link` immediately after the Games link (`apps/web/app/admin/layout.tsx:20`):

```tsx
        <Link href="/admin/games" className="text-sm font-body text-frost/70 hover:text-pixel-bright transition-colors">{t('games')}</Link>
        <Link href="/admin/categories" className="text-sm font-body text-frost/70 hover:text-pixel-bright transition-colors">{t('categories')}</Link>
        <Link href="/admin/orders" className="text-sm font-body text-frost/70 hover:text-pixel-bright transition-colors">{t('orders')}</Link>
```

- [ ] **Step 5: Verify TypeScript — web**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (exit 0).

- [ ] **Step 6: Manual test in browser**

1. Navigate to `http://localhost:4001/admin/categories`
2. Verify: "Categories" nav link is visible in the admin nav
3. Verify: table lists the 4 seeded categories (FPS, MOBA, Battle Royale, RPG) with correct sort order
4. Click **+ New category**, fill in `name=Sports`, `slug=sports`, click Save — verify it appears in the table
5. Click **Edit** on it, change `sortOrder` to `5`, click Save — verify update applied
6. Click **Delete**, confirm — verify it's removed from the table

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/admin/categories apps/web/components/admin/categories apps/web/app/admin/layout.tsx apps/web/messages
git commit -m "feat(web): add admin Categories management page"
```

---

### Task 6: Admin UI — `GameFormModal` category picker

**Files:**
- Modify: `apps/web/components/admin/games/GameFormModal.tsx`
- Modify: `apps/web/app/admin/games/page.tsx`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/th.json`

**Interfaces:**
- Consumes: `GET /admin/categories` (Task 3), `Game.category: {id,name,slug} | null` (Task 4), `CreateGameDto`/`UpdateGameDto`'s `categoryId?: string | null` (Task 4).
- Produces: `GameFormData` now has `categoryId?: string` instead of `category?: string` — always a plain string (native `<select>` values are strings; `""` means "no category"). `GameFormModal` passes `data` straight through to `onSubmit` unmodified; `admin/games/page.tsx`'s `handleCreate`/`handleEdit` are what translate `""` → `null` before the API call, since they own the request body and `null` (not an omitted key) is required to actually clear `categoryId` on an existing game — Prisma's `update` leaves a field untouched if its key is absent/`undefined`, so silently dropping it via `|| undefined` would make "clear category" a no-op on edit.

- [ ] **Step 1: Add the `noCategory` i18n key**

In `apps/web/messages/en.json`, add `"noCategory"` inside `admin.games.form` (after line 234, `"category": "Category",`):

```json
        "category": "Category",
        "noCategory": "— No category —",
        "logoUrl": "Logo URL",
```

In `apps/web/messages/th.json`, the equivalent (after line 234):

```json
        "category": "หมวดหมู่",
        "noCategory": "— ไม่มีหมวดหมู่ —",
        "logoUrl": "URL โลโก้",
```

Verify:

```bash
cd apps/web && node scripts/check-messages.mjs
```

Expected: `OK — <N> keys in both catalogs`.

- [ ] **Step 2: Replace the free-text category input with a `<select>` in `GameFormModal`**

Full replacement of `apps/web/components/admin/games/GameFormModal.tsx`:

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { apiFetch } from '../../../lib/api-client';

export interface GameFormData {
  name: string;
  slug: string;
  categoryId?: string;
  logoUrl?: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
}

interface Category {
  id: string;
  name: string;
}

interface Props {
  initial?: Partial<GameFormData>;
  onSubmit: (data: GameFormData) => Promise<void>;
  onClose: () => void;
  title: string;
}

export function GameFormModal({ initial, onSubmit, onClose, title }: Props) {
  const t = useTranslations('admin.games.form');
  const tc = useTranslations('common');
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    apiFetch<Category[]>('/admin/categories').then(setCategories).catch(() => {});
  }, []);

  const resolver = useMemo(
    () =>
      zodResolver(
        z.object({
          name: z.string().min(1).max(100),
          slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, t('slugPattern')),
          categoryId: z.string().uuid().optional().or(z.literal('')),
          logoUrl: z.string().url().optional().or(z.literal('')),
          description: z.string().max(500).optional(),
          isActive: z.boolean(),
          sortOrder: z.coerce.number().int().min(0),
        }),
      ),
    [t],
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<GameFormData>({
    resolver,
    defaultValues: {
      isActive: true,
      sortOrder: 0,
      ...initial,
    },
  });

  const submit = async (data: GameFormData) => {
    try {
      await onSubmit(data);
    } catch (e: any) {
      setError('root', { message: e.message });
    }
  };

  return (
    <div className="fixed inset-0 bg-void-deep/80 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="pixel-cut bg-panel border border-frost/10 w-full max-w-md p-6">
        <h2 className="font-display text-lg text-frost mb-4">{title}</h2>
        <form onSubmit={handleSubmit(submit)} className="space-y-3">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('name')}</label>
            <input {...register('name')} className="w-full border border-frost/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" />
            {errors.name && <p className="text-pink text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('slugLabel')} <span className="text-frost/30 normal-case font-body">{t('slugHint')}</span></label>
            <input {...register('slug')} className="w-full border border-frost/15 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" placeholder="mobile-legends" />
            {errors.slug && <p className="text-pink text-xs mt-1">{errors.slug.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('category')}</label>
            <select {...register('categoryId')} className="w-full border border-frost/15 bg-void px-3 py-2 text-sm text-frost focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel">
              <option value="">{t('noCategory')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('logoUrl')}</label>
            <input {...register('logoUrl')} className="w-full border border-frost/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" placeholder="https://…" />
            {errors.logoUrl && <p className="text-pink text-xs mt-1">{errors.logoUrl.message}</p>}
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('sortOrder')}</label>
              <input type="number" {...register('sortOrder')} className="w-full border border-frost/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" />
            </div>
            <div className="flex items-end gap-2 pb-2">
              <input type="checkbox" id="isActive" {...register('isActive')} className="w-4 h-4 accent-pixel" />
              <label htmlFor="isActive" className="text-sm font-medium text-frost">{t('active')}</label>
            </div>
          </div>
          {errors.root && (
            <div className="bg-pink/10 border border-pink/30 px-3 py-2 text-pink text-sm">
              {errors.root.message}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-frost/15 py-2 text-sm text-frost/60 hover:bg-panel-light">
              {tc('cancel')}
            </button>
            <button type="submit" disabled={isSubmitting} className="flex-1 grad-brand text-white py-2 text-sm font-bold hover:brightness-110 disabled:opacity-50 transition-colors">
              {isSubmitting ? tc('saving') : tc('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update `admin/games/page.tsx` to the new `category` shape**

Full replacement of `apps/web/app/admin/games/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { apiFetch } from '../../../lib/api-client';
import { GameFormModal, GameFormData } from '../../../components/admin/games/GameFormModal';

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Game {
  id: string;
  name: string;
  slug: string;
  category: Category | null;
  isActive: boolean;
  sortOrder: number;
  logoUrl: string | null;
}

export default function AdminGamesPage() {
  const t = useTranslations('admin.games');
  const tc = useTranslations('common');
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; game: Game } | null>(null);

  const load = async () => {
    try {
      const data = await apiFetch<Game[]>('/admin/games');
      setGames(data);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async (data: GameFormData) => {
    await apiFetch('/admin/games', { method: 'POST', body: JSON.stringify({ ...data, categoryId: data.categoryId || null }) });
    setModal(null);
    load();
  };

  const handleEdit = async (data: GameFormData) => {
    if (modal?.mode !== 'edit') return;
    await apiFetch(`/admin/games/${modal.game.id}`, { method: 'PATCH', body: JSON.stringify({ ...data, categoryId: data.categoryId || null }) });
    setModal(null);
    load();
  };

  const handleDelete = async (game: Game) => {
    if (!confirm(t('deleteConfirm', { name: game.name }))) return;
    try {
      await apiFetch(`/admin/games/${game.id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (error) return <div className="text-pink">{tc('error', { message: error })}</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl text-frost">{t('title')}</h1>
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="grad-brand text-white px-4 py-2 pixel-cut text-sm font-bold hover:brightness-110 transition-colors"
        >
          {t('newGame')}
        </button>
      </div>

      <div className="pixel-cut bg-panel border border-frost/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-void-deep">
            <tr>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('name')}</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('slug')}</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('category')}</th>
              <th className="text-center px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('order')}</th>
              <th className="text-center px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('status')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-frost/5">
            {games.length === 0 && (
              <tr><td colSpan={6} className="text-center py-12 text-frost/40">{t('noGames')}</td></tr>
            )}
            {games.map((g) => (
              <tr key={g.id} className="hover:bg-panel-light/60">
                <td className="px-4 py-3 font-medium text-frost">{g.name}</td>
                <td className="px-4 py-3 text-frost/50 font-mono">{g.slug}</td>
                <td className="px-4 py-3 text-frost/50">{g.category?.name ?? '—'}</td>
                <td className="px-4 py-3 text-center text-frost/50 font-mono tabular-nums">{g.sortOrder}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${g.isActive ? 'bg-mint/15 text-mint' : 'bg-frost/10 text-frost/50'}`}>
                    {g.isActive ? tc('active') : tc('inactive')}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/admin/games/${g.id}`} className="text-neon hover:underline text-xs font-semibold">{t('products')}</Link>
                    <button onClick={() => setModal({ mode: 'edit', game: g })} className="text-frost/50 hover:text-frost text-xs">{tc('edit')}</button>
                    <button onClick={() => handleDelete(g)} className="text-pink hover:text-pink-dim text-xs">{tc('delete')}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal?.mode === 'create' && (
        <GameFormModal title={t('newGameTitle')} onSubmit={handleCreate} onClose={() => setModal(null)} />
      )}
      {modal?.mode === 'edit' && (
        <GameFormModal
          title={t('editTitle', { name: modal.game.name })}
          initial={{ ...modal.game, categoryId: modal.game.category?.id, logoUrl: modal.game.logoUrl ?? undefined }}
          onSubmit={handleEdit}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript — web**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (exit 0).

- [ ] **Step 5: Manual test in browser**

1. Navigate to `http://localhost:4001/admin/games`
2. Verify: the Category column shows the real category name (e.g. "FPS") for each seeded game instead of a raw string mismatch
3. Click **Edit** on "Valorant" — verify the category `<select>` is pre-selected to "FPS"
4. Change the category to "MOBA", click Save — verify the table now shows "MOBA" for Valorant
5. Click **Edit** on Valorant again, change the category back to "— No category —", click Save — verify the table now shows "—" for Valorant (confirms clearing an existing category actually persists, not just leaving it unset on create)
6. Click **+ New game**, leave category as "— No category —", fill in the rest, click Save — verify it saves with `category: null` (table shows "—")

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/admin/games/GameFormModal.tsx apps/web/app/admin/games/page.tsx apps/web/messages
git commit -m "feat(web): pick a game's category from a managed list instead of free text"
```

---

### Task 7: Storefront — category filter pills

**Files:**
- Create: `apps/web/components/games/GameCategoryFilter.tsx`
- Modify: `apps/web/components/games/GameCard.tsx`
- Modify: `apps/web/app/(dashboard)/page.tsx`
- Modify: `apps/web/app/(dashboard)/games/[slug]/page.tsx`
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/th.json`

**Interfaces:**
- Consumes: `GET /categories` (Task 2, public), `Game.category: {id,name,slug} | null` (Task 4).
- Produces: homepage renders category filter pills above the game grid.

- [ ] **Step 1: Add the `categoryAll` i18n key**

In `apps/web/messages/en.json`, add `"categoryAll"` to the `home` block (after line 37, `"chooseGame": "Choose a game",`):

```json
    "chooseGame": "Choose a game",
    "categoryAll": "All",
    "noGames": "No games are live right now — check back soon."
```

In `apps/web/messages/th.json`, the equivalent:

```json
    "chooseGame": "เลือกเกม",
    "categoryAll": "ทั้งหมด",
    "noGames": "ยังไม่มีเกมเปิดให้บริการตอนนี้ — กลับมาดูใหม่เร็ว ๆ นี้"
```

Verify:

```bash
cd apps/web && node scripts/check-messages.mjs
```

Expected: `OK — <N> keys in both catalogs`.

- [ ] **Step 2: Update `GameCard` to accept the category object**

Full replacement of `apps/web/components/games/GameCard.tsx`:

```tsx
import Image from 'next/image';
import Link from 'next/link';
import { Gamepad2 } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  name: string;
  slug: string;
  logoUrl: string | null;
  category: Category | null;
}

export function GameCard({ name, slug, logoUrl, category }: Props) {
  return (
    <Link
      href={`/games/${slug}`}
      className="pixel-cut group block bg-panel p-3 border border-frost/10 transition-all hover:-translate-y-0.5 hover:border-pixel hover:shadow-glow"
    >
      <div className="relative w-full h-32 mb-3 overflow-hidden bg-panel-light">
        {logoUrl ? (
          <Image src={logoUrl} alt={name} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="flex items-center justify-center h-full text-frost/30">
            <Gamepad2 size={36} strokeWidth={1.5} />
          </div>
        )}
      </div>
      <h3 className="font-body font-bold text-frost truncate">{name}</h3>
      {category && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-frost/40 mt-1">{category.name}</p>
      )}
    </Link>
  );
}
```

- [ ] **Step 3: Create `GameCategoryFilter`**

`apps/web/components/games/GameCategoryFilter.tsx`:

```tsx
'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
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

  const filtered = useMemo(
    () => (selected ? games.filter((g) => g.category?.slug === selected) : games),
    [games, selected],
  );

  return (
    <>
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
          {t('noGames')}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Wire the filter into the homepage**

Full replacement of `apps/web/app/(dashboard)/page.tsx`:

```tsx
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { apiFetch } from '../../lib/api-client';
import { GameCategoryFilter } from '../../components/games/GameCategoryFilter';
import { Zap, ShieldCheck, BadgePercent } from 'lucide-react';

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

// The logo's own tagline — เติมเกมไว ปลอดภัย คุ้มค่า — is the value prop,
// so the feature trio simply spells it out.
const PROMISES = [
  { th: 'เติมเกมไว', key: 'promiseSpeed', Icon: Zap },
  { th: 'ปลอดภัย', key: 'promiseSafety', Icon: ShieldCheck },
  { th: 'คุ้มค่า', key: 'promiseValue', Icon: BadgePercent },
] as const;

export default async function HomePage() {
  const t = await getTranslations('home');
  const [games, categories] = await Promise.all([
    apiFetch<Game[]>('/games').catch(() => []),
    apiFetch<Category[]>('/categories').catch(() => []),
  ]);

  return (
    <div>
      <section className="bg-void-deep text-frost overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 pt-12 pb-14 grid md:grid-cols-[1fr_auto] items-center gap-8">
          <div>
            <p className="font-display text-sm tracking-[0.2em] text-neon mb-4">
              เติมเกมไว · ปลอดภัย · คุ้มค่า
            </p>
            <h1 className="font-display italic font-bold text-5xl sm:text-6xl leading-[1.02] max-w-2xl">
              <span className="text-frost">{t('heroLine1')}</span>
              <br />
              <span className="grad-text">{t('heroLine2')}</span>
            </h1>
            <p className="text-frost/60 mt-5 max-w-md font-light">
              {t('heroSub')}
            </p>

            <dl className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl">
              {PROMISES.map(({ th, key, Icon }) => (
                <div key={th} className="flex items-start gap-3">
                  <Icon size={20} className="text-pixel-bright shrink-0 mt-1" />
                  <div>
                    <dt className="font-display font-semibold text-sm">{th}</dt>
                    <dd className="text-frost/50 text-sm font-light">{t(key)}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>

          <div className="hidden md:block relative w-64 lg:w-80 aspect-square select-none" aria-hidden>
            <div className="absolute inset-0 rounded-full bg-pixel/20 blur-3xl" />
            <Image src="/logo-mark.png" alt="" fill className="object-contain relative mix-blend-screen" priority />
          </div>
        </div>
        <div className="glow-strip" />
      </section>

      <section className="max-w-6xl mx-auto px-4 py-10">
        <h2 className="font-display text-2xl text-frost mb-6">{t('chooseGame')}</h2>
        <GameCategoryFilter games={games} categories={categories} />
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Update the game detail page**

Full replacement of `apps/web/app/(dashboard)/games/[slug]/page.tsx`:

```tsx
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { apiFetch } from '../../../../lib/api-client';
import { ProductSelector, Product } from '../../../../components/games/ProductSelector';

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
  bannerUrl: string | null;
  description: string | null;
  category: Category | null;
}

export default async function GameDetailPage({ params }: { params: { slug: string } }) {
  const [game, products] = await Promise.all([
    apiFetch<Game>(`/games/${params.slug}`).catch(() => null),
    apiFetch<Product[]>(`/games/${params.slug}/products`).catch(() => [] as Product[]),
  ]);

  if (!game) notFound();

  return (
    <div>
      <section className="bg-void-deep text-frost">
        <div className="max-w-6xl mx-auto px-4 py-10 flex items-center gap-6">
          <div className="relative w-20 h-20 shrink-0 overflow-hidden bg-panel-light pixel-cut">
            {game.logoUrl && (
              <Image src={game.logoUrl} alt={game.name} fill className="object-cover" />
            )}
          </div>
          <div>
            {game.category && (
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-neon mb-1">
                {game.category.name}
              </p>
            )}
            <h1 className="font-display text-4xl text-pixel-bright">{game.name}</h1>
            {game.description && (
              <p className="text-frost/60 mt-2 max-w-xl text-sm">{game.description}</p>
            )}
          </div>
        </div>
        <div className="glow-strip" />
      </section>

      <section className="max-w-6xl mx-auto px-4 py-10">
        <ProductSelector products={products} />
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Verify TypeScript — web**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (exit 0).

- [ ] **Step 7: Manual test in browser**

1. Navigate to `http://localhost:4001/`
2. Verify: a row of pills appears above the game grid — "All", "FPS", "MOBA", "Battle Royale", "RPG"
3. Verify: "All" is selected by default and all 10 games show
4. Click "MOBA" — verify the grid filters to only Arena of Valor, Mobile Legends, Honor of Kings
5. Click "All" — verify the full grid returns
6. Click into a game (e.g. Valorant) — verify the category badge above its title reads "FPS"

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/games apps/web/app/\(dashboard\) apps/web/messages
git commit -m "feat(web): add category filter pills to the storefront homepage"
```
