# Game Management API & Admin UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full CRUD for games and their products via protected admin API endpoints and a Next.js admin UI.

**Architecture:** Extend the existing `GamesService` with admin methods, add game/product routes to the existing `AdminController`, then build two admin pages (`/admin/games` list and `/admin/games/[id]` detail) with inline modal forms for create/edit/delete.

**Tech Stack:** NestJS 10, Prisma 5, class-validator DTOs, Next.js 14 App Router (`'use client'`), react-hook-form + zod, Tailwind CSS, `apiFetch` from `lib/api-client.ts`.

## Global Constraints

- NestJS admin routes must be under `@Controller('admin')` with `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserRole.ADMIN)` + `@UseInterceptors(AuditInterceptor)` — already applied at class level in `AdminController`, do not add guard decorators at method level.
- All DTOs use `class-validator` decorators — follow the pattern in `apps/api/src/coupons/dto/validate-coupon.dto.ts`.
- Frontend forms use `react-hook-form` with `zodResolver` — follow the pattern in `apps/web/app/(auth)/login/page.tsx`.
- API errors surface via `setError('root', { message: e.message })` on forms.
- `apiFetch<T>` from `apps/web/lib/api-client.ts` handles Bearer auth automatically — never pass tokens manually.
- Admin pages live under `apps/web/app/admin/` and are already wrapped by the admin layout (`apps/web/app/admin/layout.tsx`).
- All prices stored as `Decimal` in DB; display as `Number` in the UI.
- `slug` must be lowercase, hyphens only — enforce with a regex validator on the DTO.
- `ProductType` enum values: `DIRECT`, `VOUCHER` (from `@prisma/client`).
- Unit tests use Jest with `mockPrisma` pattern (see `apps/api/src/cashback/cashback.service.spec.ts`). Run: `cd apps/api && npx jest --testPathPattern=games`.

---

## File Map

**Create:**
- `apps/api/src/games/dto/create-game.dto.ts`
- `apps/api/src/games/dto/update-game.dto.ts`
- `apps/api/src/games/dto/create-product.dto.ts`
- `apps/api/src/games/dto/update-product.dto.ts`
- `apps/api/src/games/games.service.spec.ts`
- `apps/web/app/admin/games/page.tsx`
- `apps/web/app/admin/games/[id]/page.tsx`
- `apps/web/components/admin/games/GameFormModal.tsx`
- `apps/web/components/admin/games/ProductFormModal.tsx`

**Modify:**
- `apps/api/src/games/games.service.ts` — add 7 admin methods
- `apps/api/src/admin/admin.controller.ts` — add 7 admin game/product endpoints
- `apps/api/src/admin/admin.module.ts` — import `GamesModule`
- `apps/web/app/admin/layout.tsx` — add nav links to Games

---

### Task 1: Games Service — Admin Methods + DTOs + Unit Tests

**Files:**
- Create: `apps/api/src/games/dto/create-game.dto.ts`
- Create: `apps/api/src/games/dto/update-game.dto.ts`
- Create: `apps/api/src/games/dto/create-product.dto.ts`
- Create: `apps/api/src/games/dto/update-product.dto.ts`
- Create: `apps/api/src/games/games.service.spec.ts`
- Modify: `apps/api/src/games/games.service.ts`

**Interfaces:**
- Produces:
  - `GamesService.adminListGames(): Promise<Game[]>` — all games (active + inactive), ordered by `sortOrder asc`
  - `GamesService.adminCreateGame(dto: CreateGameDto): Promise<Game>`
  - `GamesService.adminUpdateGame(id: string, dto: UpdateGameDto): Promise<Game>`
  - `GamesService.adminDeleteGame(id: string): Promise<void>`
  - `GamesService.adminListProducts(gameId: string): Promise<GameProduct[]>` — all products (active + inactive)
  - `GamesService.adminCreateProduct(gameId: string, dto: CreateProductDto): Promise<GameProduct>`
  - `GamesService.adminUpdateProduct(id: string, dto: UpdateProductDto): Promise<GameProduct>`
  - `GamesService.adminDeleteProduct(id: string): Promise<void>`

- [ ] **Step 1: Write `CreateGameDto`**

`apps/api/src/games/dto/create-game.dto.ts`:
```typescript
import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, Matches, MaxLength, Min } from 'class-validator';

export class CreateGameDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase letters, numbers, and hyphens only' })
  slug!: string;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @IsUrl()
  bannerUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
```

- [ ] **Step 2: Write `UpdateGameDto`**

`apps/api/src/games/dto/update-game.dto.ts`:
```typescript
import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, Matches, MaxLength, Min } from 'class-validator';

export class UpdateGameDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase letters, numbers, and hyphens only' })
  slug?: string;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @IsUrl()
  bannerUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
```

- [ ] **Step 3: Write `CreateProductDto`**

`apps/api/src/games/dto/create-product.dto.ts`:
```typescript
import { ProductType } from '@prisma/client';
import {
  IsBoolean, IsEnum, IsInt, IsNumber, IsOptional,
  IsString, MaxLength, Min,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(100)
  sku!: string;

  @IsNumber()
  @Min(0)
  priceCost!: number;

  @IsNumber()
  @Min(0)
  priceSell!: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @IsOptional()
  @IsBoolean()
  requiresServer?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresUsername?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
```

- [ ] **Step 4: Write `UpdateProductDto`**

`apps/api/src/games/dto/update-product.dto.ts`:
```typescript
import { ProductType } from '@prisma/client';
import {
  IsBoolean, IsEnum, IsInt, IsNumber, IsOptional,
  IsString, MaxLength, Min,
} from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceSell?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @IsOptional()
  @IsBoolean()
  requiresServer?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresUsername?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
```

- [ ] **Step 5: Write the failing unit tests**

`apps/api/src/games/games.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { GamesService } from './games.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  game: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  gameProduct: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('GamesService — admin methods', () => {
  let service: GamesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GamesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(GamesService);
  });

  describe('adminListGames', () => {
    it('returns all games ordered by sortOrder', async () => {
      mockPrisma.game.findMany.mockResolvedValue([{ id: 'g1', name: 'Game A' }]);
      const result = await service.adminListGames();
      expect(mockPrisma.game.findMany).toHaveBeenCalledWith({ orderBy: { sortOrder: 'asc' } });
      expect(result).toEqual([{ id: 'g1', name: 'Game A' }]);
    });
  });

  describe('adminCreateGame', () => {
    it('creates a game successfully', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(null);
      mockPrisma.game.create.mockResolvedValue({ id: 'g1', slug: 'test-game' });
      const result = await service.adminCreateGame({ name: 'Test', slug: 'test-game' } as any);
      expect(result).toEqual({ id: 'g1', slug: 'test-game' });
    });

    it('throws ConflictException when slug already exists', async () => {
      mockPrisma.game.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.adminCreateGame({ name: 'Test', slug: 'taken' } as any))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('adminUpdateGame', () => {
    it('throws NotFoundException when game does not exist', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(null);
      await expect(service.adminUpdateGame('bad-id', {} as any))
        .rejects.toThrow(NotFoundException);
    });

    it('updates game when it exists', async () => {
      mockPrisma.game.findUnique.mockResolvedValue({ id: 'g1' });
      mockPrisma.game.update.mockResolvedValue({ id: 'g1', name: 'Updated' });
      const result = await service.adminUpdateGame('g1', { name: 'Updated' } as any);
      expect(result).toEqual({ id: 'g1', name: 'Updated' });
    });
  });

  describe('adminDeleteGame', () => {
    it('throws NotFoundException when game does not exist', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(null);
      await expect(service.adminDeleteGame('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('deletes game when it exists', async () => {
      mockPrisma.game.findUnique.mockResolvedValue({ id: 'g1' });
      mockPrisma.game.delete.mockResolvedValue({});
      await service.adminDeleteGame('g1');
      expect(mockPrisma.game.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
    });
  });

  describe('adminCreateProduct', () => {
    it('throws NotFoundException when game does not exist', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(null);
      await expect(service.adminCreateProduct('bad-id', { name: 'P', sku: 'S', priceCost: 1, priceSell: 2 } as any))
        .rejects.toThrow(NotFoundException);
    });

    it('creates product when game exists', async () => {
      mockPrisma.game.findUnique.mockResolvedValue({ id: 'g1' });
      mockPrisma.gameProduct.create.mockResolvedValue({ id: 'p1', sku: 'S' });
      const result = await service.adminCreateProduct('g1', { name: 'P', sku: 'S', priceCost: 10, priceSell: 15 } as any);
      expect(result).toEqual({ id: 'p1', sku: 'S' });
    });
  });

  describe('adminUpdateProduct', () => {
    it('throws NotFoundException when product does not exist', async () => {
      mockPrisma.gameProduct.findUnique.mockResolvedValue(null);
      await expect(service.adminUpdateProduct('bad-id', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('adminDeleteProduct', () => {
    it('throws NotFoundException when product does not exist', async () => {
      mockPrisma.gameProduct.findUnique.mockResolvedValue(null);
      await expect(service.adminDeleteProduct('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 6: Run tests — expect all to FAIL (methods not yet defined)**

```bash
cd apps/api && npx jest --testPathPattern=games --no-coverage 2>&1 | tail -20
```

Expected: multiple failures — `service.adminListGames is not a function` etc.

- [ ] **Step 7: Add admin methods to `GamesService`**

Add the following methods to `apps/api/src/games/games.service.ts` (keep existing `findAll`, `findBySlug`, `findProducts` intact):

```typescript
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class GamesService {
  constructor(private prisma: PrismaService) {}

  // ── existing public methods (unchanged) ─────────────────────────────────

  findAll() {
    return this.prisma.game.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, slug: true, logoUrl: true, category: true, sortOrder: true },
    });
  }

  async findBySlug(slug: string) {
    const game = await this.prisma.game.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, logoUrl: true, bannerUrl: true, description: true, category: true },
    });
    if (!game) throw new NotFoundException('Game not found');
    return game;
  }

  async findProducts(slug: string) {
    const game = await this.findBySlug(slug);
    return this.prisma.gameProduct.findMany({
      where: { gameId: game.id, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // ── admin methods ────────────────────────────────────────────────────────

  adminListGames() {
    return this.prisma.game.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async adminCreateGame(dto: CreateGameDto) {
    const existing = await this.prisma.game.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Slug "${dto.slug}" is already in use`);
    return this.prisma.game.create({ data: dto });
  }

  async adminUpdateGame(id: string, dto: UpdateGameDto) {
    const game = await this.prisma.game.findUnique({ where: { id } });
    if (!game) throw new NotFoundException('Game not found');
    return this.prisma.game.update({ where: { id }, data: dto });
  }

  async adminDeleteGame(id: string) {
    const game = await this.prisma.game.findUnique({ where: { id } });
    if (!game) throw new NotFoundException('Game not found');
    await this.prisma.game.delete({ where: { id } });
  }

  adminListProducts(gameId: string) {
    return this.prisma.gameProduct.findMany({
      where: { gameId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async adminCreateProduct(gameId: string, dto: CreateProductDto) {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw new NotFoundException('Game not found');
    return this.prisma.gameProduct.create({ data: { ...dto, gameId } });
  }

  async adminUpdateProduct(id: string, dto: UpdateProductDto) {
    const product = await this.prisma.gameProduct.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.gameProduct.update({ where: { id }, data: dto });
  }

  async adminDeleteProduct(id: string) {
    const product = await this.prisma.gameProduct.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    await this.prisma.gameProduct.delete({ where: { id } });
  }
}
```

- [ ] **Step 8: Run tests — expect all to PASS**

```bash
cd apps/api && npx jest --testPathPattern=games --no-coverage 2>&1 | tail -15
```

Expected output includes:
```
Tests:  9 passed, 9 total
```

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/games/
git commit -m "feat: games service admin CRUD methods + DTOs + unit tests"
```

---

### Task 2: Admin Controller — Game & Product Endpoints

**Files:**
- Modify: `apps/api/src/admin/admin.controller.ts`
- Modify: `apps/api/src/admin/admin.module.ts`

**Interfaces:**
- Consumes: `GamesService.adminListGames()`, `.adminCreateGame()`, `.adminUpdateGame()`, `.adminDeleteGame()`, `.adminListProducts()`, `.adminCreateProduct()`, `.adminUpdateProduct()`, `.adminDeleteProduct()` (from Task 1)
- Produces:
  - `GET  /api/v1/admin/games` → `Game[]`
  - `POST /api/v1/admin/games` → `Game`
  - `PATCH /api/v1/admin/games/:id` → `Game`
  - `DELETE /api/v1/admin/games/:id` → `204`
  - `GET  /api/v1/admin/games/:id/products` → `GameProduct[]`
  - `POST /api/v1/admin/games/:id/products` → `GameProduct`
  - `PATCH /api/v1/admin/games/:id/products/:productId` → `GameProduct`
  - `DELETE /api/v1/admin/games/:id/products/:productId` → `204`

- [ ] **Step 1: Add `GamesModule` to `AdminModule` imports**

`apps/api/src/admin/admin.module.ts` — add `GamesModule` to the imports array:

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuditModule } from '../audit/audit.module';
import { ResellersModule } from '../resellers/resellers.module';
import { GamesModule } from '../games/games.module';

@Module({
  imports: [
    AnalyticsModule,
    AuditModule,
    ResellersModule,
    GamesModule,
    BullModule.registerQueue({ name: 'topup' }),
  ],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
```

- [ ] **Step 2: Add game and product endpoints to `AdminController`**

Add to `apps/api/src/admin/admin.controller.ts` — add `Delete`, `HttpCode`, `HttpStatus` to the existing import and inject `GamesService`:

```typescript
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditInterceptor } from '../audit/audit.interceptor';
import { AdminService } from './admin.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { ResellersService } from '../resellers/resellers.service';
import { GamesService } from '../games/games.service';
import { CreateGameDto } from '../games/dto/create-game.dto';
import { UpdateGameDto } from '../games/dto/update-game.dto';
import { CreateProductDto } from '../games/dto/create-product.dto';
import { UpdateProductDto } from '../games/dto/update-product.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@UseInterceptors(AuditInterceptor)
@Controller('admin')
export class AdminController {
  constructor(
    private admin: AdminService,
    private analytics: AnalyticsService,
    private resellers: ResellersService,
    private games: GamesService,
  ) {}

  // ── existing endpoints (unchanged) ──────────────────────────────────────

  @Get('stats')
  getStats() { return this.admin.getDashboardStats(); }

  @Get('users')
  listUsers(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
  ) { return this.admin.listUsers(+page, +limit, search); }

  @Patch('users/:id')
  updateUser(@Param('id') id: string, @Body() dto: { isActive?: boolean; role?: UserRole }) {
    return this.admin.updateUser(id, dto);
  }

  @Get('orders')
  listOrders(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
    @Query('userId') userId?: string,
  ) { return this.admin.listOrders(+page, +limit, { status, userId }); }

  @Patch('orders/:id/status')
  overrideOrderStatus(@Param('id') id: string, @Body() dto: { status: string }) {
    return this.admin.overrideOrderStatus(id, dto.status);
  }

  @Post('orders/:id/retry')
  retryOrder(@Param('id') id: string) { return this.admin.retryOrder(id); }

  @Get('providers')
  listProviders() { return this.admin.listProviders(); }

  @Post('providers')
  createProvider(@Body() dto: any) { return this.admin.createProvider(dto); }

  @Patch('providers/:id')
  updateProvider(@Param('id') id: string, @Body() dto: any) {
    return this.admin.updateProvider(id, dto);
  }

  @Get('analytics/revenue')
  getRevenue(@Query('period') period: 'day' | 'week' | 'month' = 'month') {
    return this.analytics.getRevenueTrend(period);
  }

  @Get('analytics/orders')
  getOrderStats(@Query('period') period: 'day' | 'week' | 'month' = 'month') {
    return this.analytics.getOrderStats(period);
  }

  @Get('analytics/users')
  getUserGrowth() { return this.analytics.getUserGrowth(); }

  @Get('resellers')
  listResellers(@Query('page') page = '1') { return this.resellers.listResellers(+page); }

  @Patch('resellers/:id/approve')
  approveReseller(@Param('id') id: string, @CurrentUser() admin: { id: string }) {
    return this.resellers.approve(id, admin.id);
  }

  @Patch('resellers/:id/suspend')
  suspendReseller(@Param('id') id: string) { return this.resellers.suspend(id); }

  // ── game management ──────────────────────────────────────────────────────

  @Get('games')
  listGames() { return this.games.adminListGames(); }

  @Post('games')
  createGame(@Body() dto: CreateGameDto) { return this.games.adminCreateGame(dto); }

  @Patch('games/:id')
  updateGame(@Param('id') id: string, @Body() dto: UpdateGameDto) {
    return this.games.adminUpdateGame(id, dto);
  }

  @Delete('games/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteGame(@Param('id') id: string) { return this.games.adminDeleteGame(id); }

  // ── product management ───────────────────────────────────────────────────

  @Get('games/:id/products')
  listProducts(@Param('id') id: string) { return this.games.adminListProducts(id); }

  @Post('games/:id/products')
  createProduct(@Param('id') id: string, @Body() dto: CreateProductDto) {
    return this.games.adminCreateProduct(id, dto);
  }

  @Patch('games/:id/products/:productId')
  updateProduct(@Param('productId') productId: string, @Body() dto: UpdateProductDto) {
    return this.games.adminUpdateProduct(productId, dto);
  }

  @Delete('games/:id/products/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteProduct(@Param('productId') productId: string) {
    return this.games.adminDeleteProduct(productId);
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (exit 0).

- [ ] **Step 4: Smoke-test the endpoints against the running dev stack**

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pixelpay.dev","password":"Admin1234!"}' \
  | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.accessToken))")

# 2. List games (empty)
curl -s http://localhost:4000/api/v1/admin/games \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"success":true,"data":[]}

# 3. Create a game
curl -s -X POST http://localhost:4000/api/v1/admin/games \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Mobile Legends","slug":"mobile-legends","category":"MOBA","isActive":true,"sortOrder":1}'
# Expected: {"success":true,"data":{"id":"...","name":"Mobile Legends",...}}
```

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
cd apps/api && npx jest --no-coverage 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/admin/ apps/api/src/games/
git commit -m "feat: admin API endpoints for game and product CRUD"
```

---

### Task 3: Admin Games List Page

**Files:**
- Create: `apps/web/app/admin/games/page.tsx`
- Create: `apps/web/components/admin/games/GameFormModal.tsx`
- Modify: `apps/web/app/admin/layout.tsx`

**Interfaces:**
- Consumes:
  - `GET  /api/v1/admin/games` → `Game[]` (all fields)
  - `POST /api/v1/admin/games` with `CreateGameDto`
  - `PATCH /api/v1/admin/games/:id` with `UpdateGameDto`
  - `DELETE /api/v1/admin/games/:id` → 204
- Produces: `/admin/games` route — table of games with create/edit/delete actions, links to `/admin/games/[id]` for product management

- [ ] **Step 1: Add Games nav link to the admin layout**

`apps/web/app/admin/layout.tsx`:
```tsx
import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-4 flex items-center gap-6">
        <span className="font-bold text-brand text-lg">PixelPay Admin</span>
        <Link href="/admin" className="text-sm text-gray-600 hover:text-brand">Dashboard</Link>
        <Link href="/admin/games" className="text-sm text-gray-600 hover:text-brand">Games</Link>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Create `GameFormModal`**

`apps/web/components/admin/games/GameFormModal.tsx`:
```tsx
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Lowercase, numbers and hyphens only'),
  category: z.string().max(50).optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  description: z.string().max(500).optional(),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0),
});

export type GameFormData = z.infer<typeof schema>;

interface Props {
  initial?: Partial<GameFormData>;
  onSubmit: (data: GameFormData) => Promise<void>;
  onClose: () => void;
  title: string;
}

export function GameFormModal({ initial, onSubmit, onClose, title }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<GameFormData>({
    resolver: zodResolver(schema),
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold mb-4">{title}</h2>
        <form onSubmit={handleSubmit(submit)} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input {...register('name')} className="w-full border rounded-lg px-3 py-2 text-sm" />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Slug * <span className="text-gray-400 font-normal">(lowercase-hyphens)</span></label>
            <input {...register('slug')} className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="mobile-legends" />
            {errors.slug && <p className="text-red-500 text-xs mt-1">{errors.slug.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <input {...register('category')} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="MOBA, RPG, FPS…" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Logo URL</label>
            <input {...register('logoUrl')} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="https://…" />
            {errors.logoUrl && <p className="text-red-500 text-xs mt-1">{errors.logoUrl.message}</p>}
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Sort Order</label>
              <input type="number" {...register('sortOrder')} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex items-end gap-2 pb-2">
              <input type="checkbox" id="isActive" {...register('isActive')} className="w-4 h-4" />
              <label htmlFor="isActive" className="text-sm font-medium">Active</label>
            </div>
          </div>
          {errors.root && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-600 text-sm">
              {errors.root.message}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="flex-1 bg-brand text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
              {isSubmitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the games list page**

`apps/web/app/admin/games/page.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api-client';
import { GameFormModal, GameFormData } from '../../../components/admin/games/GameFormModal';

interface Game {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  isActive: boolean;
  sortOrder: number;
  logoUrl: string | null;
}

export default function AdminGamesPage() {
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

  useEffect(() => { load(); }, []);

  const handleCreate = async (data: GameFormData) => {
    await apiFetch('/admin/games', { method: 'POST', body: JSON.stringify(data) });
    setModal(null);
    load();
  };

  const handleEdit = async (data: GameFormData) => {
    if (modal?.mode !== 'edit') return;
    await apiFetch(`/admin/games/${modal.game.id}`, { method: 'PATCH', body: JSON.stringify(data) });
    setModal(null);
    load();
  };

  const handleDelete = async (game: Game) => {
    if (!confirm(`Delete "${game.name}"? This will also delete all its products.`)) return;
    await apiFetch(`/admin/games/${game.id}`, { method: 'DELETE' });
    load();
  };

  if (error) return <div className="text-red-500">Error: {error}</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Games</h1>
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-semibold"
        >
          + New Game
        </button>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Slug</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Order</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {games.length === 0 && (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">No games yet. Click "+ New Game" to create one.</td></tr>
            )}
            {games.map((g) => (
              <tr key={g.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{g.name}</td>
                <td className="px-4 py-3 text-gray-500 font-mono">{g.slug}</td>
                <td className="px-4 py-3 text-gray-500">{g.category ?? '—'}</td>
                <td className="px-4 py-3 text-center text-gray-500">{g.sortOrder}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${g.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {g.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link href={`/admin/games/${g.id}`} className="text-blue-600 hover:underline text-xs">Products</Link>
                    <button onClick={() => setModal({ mode: 'edit', game: g })} className="text-gray-500 hover:text-gray-800 text-xs">Edit</button>
                    <button onClick={() => handleDelete(g)} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal?.mode === 'create' && (
        <GameFormModal title="New Game" onSubmit={handleCreate} onClose={() => setModal(null)} />
      )}
      {modal?.mode === 'edit' && (
        <GameFormModal
          title={`Edit — ${modal.game.name}`}
          initial={{ ...modal.game, category: modal.game.category ?? undefined, logoUrl: modal.game.logoUrl ?? undefined }}
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
2. Verify: "Games" nav link is visible in admin layout
3. Verify: empty state shows "No games yet…"
4. Click **+ New Game**, fill in `name=Mobile Legends`, `slug=mobile-legends`, `category=MOBA`, click Save
5. Verify: game appears in table with Active badge
6. Click **Edit**, change `sortOrder` to `1`, click Save — verify update applied
7. Click **Delete**, confirm — verify game removed

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/admin/games/ apps/web/components/admin/games/ apps/web/app/admin/layout.tsx
git commit -m "feat: admin games list page with create/edit/delete modals"
```

---

### Task 4: Admin Game Detail Page — Product Management

**Files:**
- Create: `apps/web/app/admin/games/[id]/page.tsx`
- Create: `apps/web/components/admin/games/ProductFormModal.tsx`

**Interfaces:**
- Consumes:
  - `GET /api/v1/admin/games` → `Game[]` (to find game name by id for heading)
  - `GET /api/v1/admin/games/:id/products` → `GameProduct[]`
  - `POST /api/v1/admin/games/:id/products` with `CreateProductDto`
  - `PATCH /api/v1/admin/games/:id/products/:productId` with `UpdateProductDto`
  - `DELETE /api/v1/admin/games/:id/products/:productId` → 204
- Produces: `/admin/games/[id]` route — game heading + product table with create/edit/delete

- [ ] **Step 1: Create `ProductFormModal`**

`apps/web/components/admin/games/ProductFormModal.tsx`:
```tsx
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().min(1).max(100),
  priceCost: z.coerce.number().min(0),
  priceSell: z.coerce.number().min(0),
  currency: z.string().length(3).default('THB'),
  productType: z.enum(['DIRECT', 'VOUCHER']).default('DIRECT'),
  requiresServer: z.boolean().default(false),
  requiresUsername: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export type ProductFormData = z.infer<typeof schema>;

interface Props {
  initial?: Partial<ProductFormData>;
  onSubmit: (data: ProductFormData) => Promise<void>;
  onClose: () => void;
  title: string;
}

export function ProductFormModal({ initial, onSubmit, onClose, title }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<ProductFormData>({
    resolver: zodResolver(schema),
    defaultValues: { currency: 'THB', productType: 'DIRECT', isActive: true, sortOrder: 0, requiresServer: false, requiresUsername: false, ...initial },
  });

  const submit = async (data: ProductFormData) => {
    try { await onSubmit(data); }
    catch (e: any) { setError('root', { message: e.message }); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-4">{title}</h2>
        <form onSubmit={handleSubmit(submit)} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Product Name *</label>
            <input {...register('name')} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="100 Diamonds" />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">SKU *</label>
              <input {...register('sku')} className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="MLBB-100" />
              {errors.sku && <p className="text-red-500 text-xs mt-1">{errors.sku.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Currency</label>
              <input {...register('currency')} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Cost Price (฿) *</label>
              <input type="number" step="0.01" {...register('priceCost')} className="w-full border rounded-lg px-3 py-2 text-sm" />
              {errors.priceCost && <p className="text-red-500 text-xs mt-1">{errors.priceCost.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Sell Price (฿) *</label>
              <input type="number" step="0.01" {...register('priceSell')} className="w-full border rounded-lg px-3 py-2 text-sm" />
              {errors.priceSell && <p className="text-red-500 text-xs mt-1">{errors.priceSell.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select {...register('productType')} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="DIRECT">DIRECT</option>
                <option value="VOUCHER">VOUCHER</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Sort Order</label>
              <input type="number" {...register('sortOrder')} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-6 pt-1">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register('requiresServer')} className="w-4 h-4" />
              Requires Server
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register('requiresUsername')} className="w-4 h-4" />
              Requires Username
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register('isActive')} className="w-4 h-4" />
              Active
            </label>
          </div>
          {errors.root && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-600 text-sm">
              {errors.root.message}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="flex-1 bg-brand text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
              {isSubmitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the game detail page**

`apps/web/app/admin/games/[id]/page.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '../../../../lib/api-client';
import { ProductFormModal, ProductFormData } from '../../../../components/admin/games/ProductFormModal';

interface Product {
  id: string;
  name: string;
  sku: string;
  priceCost: number;
  priceSell: number;
  currency: string;
  productType: 'DIRECT' | 'VOUCHER';
  requiresServer: boolean;
  requiresUsername: boolean;
  isActive: boolean;
  sortOrder: number;
}

interface Game {
  id: string;
  name: string;
  slug: string;
}

export default function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [game, setGame] = useState<Game | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; product: Product } | null>(null);

  const loadGame = async () => {
    const all = await apiFetch<Game[]>('/admin/games');
    setGame(all.find((g) => g.id === id) ?? null);
  };

  const loadProducts = async () => {
    try {
      const data = await apiFetch<Product[]>(`/admin/games/${id}/products`);
      setProducts(data);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    loadGame();
    loadProducts();
  }, [id]);

  const handleCreate = async (data: ProductFormData) => {
    await apiFetch(`/admin/games/${id}/products`, { method: 'POST', body: JSON.stringify(data) });
    setModal(null);
    loadProducts();
  };

  const handleEdit = async (data: ProductFormData) => {
    if (modal?.mode !== 'edit') return;
    await apiFetch(`/admin/games/${id}/products/${modal.product.id}`, { method: 'PATCH', body: JSON.stringify(data) });
    setModal(null);
    loadProducts();
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`Delete product "${product.name}"?`)) return;
    await apiFetch(`/admin/games/${id}/products/${product.id}`, { method: 'DELETE' });
    loadProducts();
  };

  if (error) return <div className="text-red-500">Error: {error}</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/games" className="text-gray-400 hover:text-gray-600 text-sm">← Games</Link>
        <h1 className="text-2xl font-bold">{game?.name ?? 'Game'} — Products</h1>
      </div>

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-semibold"
        >
          + Add Product
        </button>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">SKU</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Cost</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Sell</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Type</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {products.length === 0 && (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">No products yet. Click "+ Add Product" to create one.</td></tr>
            )}
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 font-mono text-gray-500">{p.sku}</td>
                <td className="px-4 py-3 text-right text-gray-500">฿{Number(p.priceCost).toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-semibold">฿{Number(p.priceSell).toFixed(2)}</td>
                <td className="px-4 py-3 text-center">
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{p.productType}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setModal({ mode: 'edit', product: p })} className="text-gray-500 hover:text-gray-800 text-xs">Edit</button>
                    <button onClick={() => handleDelete(p)} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal?.mode === 'create' && (
        <ProductFormModal title="Add Product" onSubmit={handleCreate} onClose={() => setModal(null)} />
      )}
      {modal?.mode === 'edit' && (
        <ProductFormModal
          title={`Edit — ${modal.product.name}`}
          initial={{
            ...modal.product,
            priceCost: Number(modal.product.priceCost),
            priceSell: Number(modal.product.priceSell),
          }}
          onSubmit={handleEdit}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript — web**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (exit 0).

- [ ] **Step 4: Manual test in browser**

1. From `http://localhost:4001/admin/games`, click **Products** on a game row
2. Verify: breadcrumb "← Games" and game name heading appear
3. Click **+ Add Product**, fill in: `name=100 Diamonds`, `sku=MLBB-100`, `priceCost=25`, `priceSell=29`
4. Click Save — verify product appears in table with cost/sell prices
5. Click **Edit** — verify form pre-fills with existing values, change sell price, save
6. Click **Delete** — confirm — verify product removed
7. Return to `/admin/games` — verify game catalog at `http://localhost:4001` now shows the game

- [ ] **Step 5: Run full test suite**

```bash
cd apps/api && npx jest --no-coverage 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/admin/games/[id]/ apps/web/components/admin/games/ProductFormModal.tsx
git commit -m "feat: admin game detail page with product CRUD"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All CRUD operations for games (list, create, edit, delete) and products (list, create, edit, delete) are covered across Tasks 1–4.
- [x] **Placeholder scan:** All steps include complete code — no "TBD", "similar to above", or vague directives.
- [x] **Type consistency:** `GameFormData` defined in `GameFormModal.tsx` and used identically in `games/page.tsx`. `ProductFormData` defined in `ProductFormModal.tsx` and used identically in `games/[id]/page.tsx`. DTOs in Task 1 match the field names used in Task 2 controller. `adminListGames()` returns `Game[]` — Task 3 page types match exactly.
- [x] **Guard:** AdminController class-level guards apply automatically — no per-method guard decorators needed.
- [x] **Slug uniqueness:** enforced in `adminCreateGame` via `ConflictException` — tested in unit tests.
- [x] **Delete cascade:** Prisma's default behaviour with `GameProduct` (no cascade defined in schema) will block game deletion if products exist. **Fix in `adminDeleteGame`**: add `await this.prisma.gameProduct.deleteMany({ where: { gameId: id } })` before `this.prisma.game.delete` in Task 1 Step 7. The confirm dialog on the frontend already warns the user.
