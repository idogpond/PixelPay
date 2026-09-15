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
