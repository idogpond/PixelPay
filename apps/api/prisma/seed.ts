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
