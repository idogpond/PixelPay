# Phase 6: Admin Dashboard & Analytics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Build admin REST endpoints (users, orders, providers, games, coupons, resellers), an analytics aggregation service, and reseller management.

**Architecture:** All admin routes guarded by `JwtAuthGuard` + `RolesGuard('ADMIN')`. Analytics queries run against PostgreSQL using `$queryRaw` with date-grouped aggregations. Heavy analytics are cached in Redis with 1-hour TTL.

**Tech Stack:** NestJS, Prisma `$queryRaw`, Redis, `@nestjs/cache-manager`

## Global Constraints

- Every admin endpoint applies `@Roles('ADMIN')` + `AuditInterceptor`
- Reseller-level routes apply `@Roles('RESELLER')` 
- Analytics cache TTL: 3600 seconds (1 hour)
- `$queryRaw` used only for aggregate/group-by queries — all CRUD stays in Prisma ORM
- Never return `passwordHash` in any user response — use `select` exclusion

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/api/src/admin/admin.module.ts` | Create | AdminModule |
| `apps/api/src/admin/admin.controller.ts` | Create | All `/admin/*` routes |
| `apps/api/src/admin/admin.service.ts` | Create | getDashboardStats, manageUsers, manageOrders |
| `apps/api/src/analytics/analytics.service.ts` | Create | Revenue, order, user growth analytics |
| `apps/api/src/analytics/analytics.module.ts` | Create | AnalyticsModule |
| `apps/api/src/resellers/resellers.service.ts` | Create | apply, approve, suspend, getProducts |
| `apps/api/src/resellers/resellers.controller.ts` | Create | /reseller/* (RESELLER role) and /admin/resellers/* (ADMIN) |
| `apps/api/src/resellers/resellers.module.ts` | Create | ResellersModule |
| `apps/api/src/providers/providers.controller.ts` | Create | Admin CRUD for providers |
| `apps/api/test/admin.e2e-spec.ts` | Create | Admin stats + order management tests |

---

### Task 1: Admin Service & Controller

**Interfaces:**
- Produces: `AdminService.getDashboardStats()`, `AdminService.listUsers(filter, page)`, `AdminService.updateUser(id, dto)`, `AdminService.listOrders(filter, page)`, `AdminService.overrideOrderStatus(id, status)`, `AdminService.retryOrder(id)`

- [ ] **Step 1: Write failing admin e2e test**

`apps/api/test/admin.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

describe('Admin (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const prisma = module.get(PrismaService);

    // Create admin user directly in DB
    const passwordHash = await bcrypt.hash('Admin1234!', 12);
    const { customAlphabet } = await import('nanoid');
    const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 8);
    await prisma.user.upsert({
      where: { email: 'admin@pixelpay.test' },
      update: {},
      create: {
        email: 'admin@pixelpay.test',
        passwordHash,
        displayName: 'Admin',
        role: 'ADMIN',
        referralCode: nanoid(),
        wallet: { create: {} },
      },
    });

    const adminRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@pixelpay.test', password: 'Admin1234!' });
    adminToken = adminRes.body.data.accessToken;

    const userRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `regular+${Date.now()}@test.com`, password: 'Test1234!', displayName: 'Regular' });
    userToken = userRes.body.data.accessToken;
  });

  afterAll(() => app.close());

  it('GET /admin/stats returns dashboard data (admin)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.totalUsers).toBeDefined();
    expect(res.body.data.totalOrders).toBeDefined();
  });

  it('GET /admin/stats returns 403 for regular user', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('GET /admin/users returns paginated users', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(res.body.data.items[0].passwordHash).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npm run test:e2e -- --testPathPattern=admin
```

Expected: FAIL

- [ ] **Step 3: Write AdminService**

`apps/api/src/admin/admin.service.ts`:
```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

const USER_SELECT = {
  id: true, email: true, phone: true, displayName: true, avatarUrl: true,
  role: true, isVerified: true, isActive: true, referralCode: true, createdAt: true,
};

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('topup') private topupQueue: Queue,
  ) {}

  async getDashboardStats() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalUsers, totalOrders, pendingOrders, todayOrders, monthOrders, totalRevenue] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: 'PENDING' } }),
      this.prisma.order.count({ where: { createdAt: { gte: startOfDay } } }),
      this.prisma.order.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.prisma.order.aggregate({
        _sum: { totalPrice: true },
        where: { status: 'COMPLETED' },
      }),
    ]);

    return {
      totalUsers,
      totalOrders,
      pendingOrders,
      todayOrders,
      monthOrders,
      totalRevenue: totalRevenue._sum.totalPrice ?? 0,
    };
  }

  listUsers(page = 1, limit = 20, search?: string) {
    const where = search ? {
      OR: [
        { email: { contains: search, mode: 'insensitive' as const } },
        { displayName: { contains: search, mode: 'insensitive' as const } },
      ],
    } : {};

    return this.prisma.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }).then(async (items) => ({
      items,
      total: await this.prisma.user.count({ where }),
      page,
      limit,
    }));
  }

  async updateUser(id: string, dto: { isActive?: boolean; role?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({ where: { id }, data: dto, select: USER_SELECT });
  }

  listOrders(page = 1, limit = 20, filters?: { status?: string; userId?: string }) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.userId) where.userId = filters.userId;

    return this.prisma.order.findMany({
      where,
      include: {
        user: { select: { email: true, displayName: true } },
        gameProduct: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }).then(async (items) => ({
      items,
      total: await this.prisma.order.count({ where }),
      page,
      limit,
    }));
  }

  async overrideOrderStatus(id: string, status: string) {
    const validStatuses = ['COMPLETED', 'FAILED', 'REFUNDED'];
    if (!validStatuses.includes(status)) throw new BadRequestException('Invalid status');
    return this.prisma.order.update({ where: { id }, data: { status: status as any } });
  }

  async retryOrder(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'FAILED') throw new BadRequestException('Only failed orders can be retried');

    await this.prisma.order.update({ where: { id }, data: { status: 'PENDING', retryCount: 0 } });
    await this.topupQueue.add(
      'process-topup',
      { orderId: id, userId: order.userId, gameProductId: order.gameProductId },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
    return { message: 'Order queued for retry' };
  }

  listProviders() {
    return this.prisma.provider.findMany({ orderBy: { priority: 'asc' } });
  }

  createProvider(dto: { name: string; slug: string; apiUrl: string; apiKeyEnc: string; priority: number }) {
    return this.prisma.provider.create({ data: dto });
  }

  updateProvider(id: string, dto: Partial<{ isActive: boolean; priority: number; rateLimitPerMin: number }>) {
    return this.prisma.provider.update({ where: { id }, data: dto });
  }
}
```

- [ ] **Step 4: Write AdminController**

`apps/api/src/admin/admin.controller.ts`:
```typescript
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditInterceptor } from '../audit/audit.interceptor';
import { AdminService } from './admin.service';
import { AnalyticsService } from '../analytics/analytics.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@UseInterceptors(AuditInterceptor)
@Controller('admin')
export class AdminController {
  constructor(
    private admin: AdminService,
    private analytics: AnalyticsService,
  ) {}

  @Get('stats')
  getStats() {
    return this.admin.getDashboardStats();
  }

  @Get('users')
  listUsers(@Query('page') page = '1', @Query('limit') limit = '20', @Query('search') search?: string) {
    return this.admin.listUsers(+page, +limit, search);
  }

  @Patch('users/:id')
  updateUser(@Param('id') id: string, @Body() dto: { isActive?: boolean; role?: string }) {
    return this.admin.updateUser(id, dto);
  }

  @Get('orders')
  listOrders(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
    @Query('userId') userId?: string,
  ) {
    return this.admin.listOrders(+page, +limit, { status, userId });
  }

  @Patch('orders/:id/status')
  overrideOrderStatus(@Param('id') id: string, @Body() dto: { status: string }) {
    return this.admin.overrideOrderStatus(id, dto.status);
  }

  @Post('orders/:id/retry')
  retryOrder(@Param('id') id: string) {
    return this.admin.retryOrder(id);
  }

  @Get('providers')
  listProviders() {
    return this.admin.listProviders();
  }

  @Post('providers')
  createProvider(@Body() dto: any) {
    return this.admin.createProvider(dto);
  }

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
  getUserGrowth() {
    return this.analytics.getUserGrowth();
  }
}
```

- [ ] **Step 5: Write AdminModule**

`apps/api/src/admin/admin.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    AnalyticsModule,
    AuditModule,
    BullModule.registerQueue({ name: 'topup' }),
  ],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
```

- [ ] **Step 6: Run admin tests — expect pass**

```bash
npm run test:e2e -- --testPathPattern=admin
```

Expected: 3 tests PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/admin/
git commit -m "feat: admin dashboard — stats, user management, order management, provider CRUD"
```

---

### Task 2: Analytics Service

**Interfaces:**
- Produces: `AnalyticsService.getRevenueTrend(period)`, `AnalyticsService.getOrderStats(period)`, `AnalyticsService.getUserGrowth()`

- [ ] **Step 1: Write AnalyticsService**

`apps/api/src/analytics/analytics.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getRevenueTrend(period: 'day' | 'week' | 'month') {
    const truncUnit = period === 'day' ? 'hour' : period === 'week' ? 'day' : 'day';
    const since = this.sinceDate(period);

    const rows = await this.prisma.$queryRaw<Array<{ date: Date; revenue: number; count: bigint }>>`
      SELECT
        DATE_TRUNC(${truncUnit}, created_at) AS date,
        SUM(total_price)::float AS revenue,
        COUNT(*)::bigint AS count
      FROM orders
      WHERE status = 'COMPLETED'
        AND created_at >= ${since}
      GROUP BY DATE_TRUNC(${truncUnit}, created_at)
      ORDER BY date ASC
    `;

    return rows.map((r) => ({
      date: r.date,
      revenue: r.revenue ?? 0,
      count: Number(r.count),
    }));
  }

  async getOrderStats(period: 'day' | 'week' | 'month') {
    const since = this.sinceDate(period);

    const rows = await this.prisma.$queryRaw<Array<{ status: string; count: bigint }>>`
      SELECT status, COUNT(*)::bigint AS count
      FROM orders
      WHERE created_at >= ${since}
      GROUP BY status
    `;

    const result: Record<string, number> = {};
    rows.forEach((r) => { result[r.status] = Number(r.count); });
    return result;
  }

  async getUserGrowth() {
    const rows = await this.prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
      SELECT DATE_TRUNC('day', created_at) AS date, COUNT(*)::bigint AS count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date ASC
    `;

    return rows.map((r) => ({ date: r.date, count: Number(r.count) }));
  }

  private sinceDate(period: 'day' | 'week' | 'month'): Date {
    const d = new Date();
    if (period === 'day') d.setDate(d.getDate() - 1);
    else if (period === 'week') d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    return d;
  }
}
```

`apps/api/src/analytics/analytics.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Module({
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/analytics/
git commit -m "feat: analytics service — revenue trend, order stats, user growth via raw SQL"
```

---

### Task 3: Reseller Management

**Interfaces:**
- Produces: `ResellersService.apply(userId, dto)`, `ResellersService.approve(id, adminId)`, `ResellersService.getProducts(userId)`, `ResellersService.placeOrder(userId, dto)`

- [ ] **Step 1: Write ResellersService**

`apps/api/src/resellers/resellers.service.ts`:
```typescript
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class ResellersService {
  constructor(
    private prisma: PrismaService,
    private orders: OrdersService,
  ) {}

  async apply(userId: string, dto: { companyName: string }) {
    const existing = await this.prisma.reseller.findUnique({ where: { userId } });
    if (existing) throw new BadRequestException('Reseller application already exists');

    return this.prisma.reseller.create({
      data: { userId, companyName: dto.companyName, status: 'PENDING' },
    });
  }

  async approve(id: string, adminId: string) {
    const reseller = await this.prisma.reseller.findUnique({ where: { id } });
    if (!reseller) throw new NotFoundException('Reseller not found');
    if (reseller.status !== 'PENDING') throw new BadRequestException('Only pending resellers can be approved');

    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: reseller.userId }, data: { role: 'RESELLER' } });
      return tx.reseller.update({
        where: { id },
        data: { status: 'ACTIVE', approvedBy: adminId, approvedAt: new Date() },
      });
    });
  }

  suspend(id: string) {
    return this.prisma.reseller.update({ where: { id }, data: { status: 'SUSPENDED' } });
  }

  async getProducts(userId: string) {
    const reseller = await this.prisma.reseller.findUnique({ where: { userId, status: 'ACTIVE' } });
    if (!reseller) throw new ForbiddenException('Active reseller account required');

    const products = await this.prisma.gameProduct.findMany({
      where: { isActive: true },
      include: { game: { select: { name: true, slug: true } } },
    });

    // Apply reseller discount
    return products.map((p) => ({
      ...p,
      resellerPrice: (Number(p.priceSell) * (1 - Number(reseller.discountRate) / 100)).toFixed(2),
    }));
  }

  listResellers(page = 1, limit = 20) {
    return this.prisma.reseller.findMany({
      include: { user: { select: { email: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }
}
```

`apps/api/src/resellers/resellers.controller.ts`:
```typescript
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ResellersService } from './resellers.service';

@UseGuards(JwtAuthGuard)
@Controller('reseller')
export class ResellersController {
  constructor(private resellers: ResellersService) {}

  @Post('apply')
  apply(@CurrentUser() user: { id: string }, @Body() dto: { companyName: string }) {
    return this.resellers.apply(user.id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('RESELLER')
  @Get('products')
  getProducts(@CurrentUser() user: { id: string }) {
    return this.resellers.getProducts(user.id);
  }
}
```

`apps/api/src/resellers/resellers.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ResellersService } from './resellers.service';
import { ResellersController } from './resellers.controller';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [OrdersModule],
  providers: [ResellersService],
  controllers: [ResellersController],
  exports: [ResellersService],
})
export class ResellersModule {}
```

Add reseller admin endpoints to `AdminController`:
```typescript
@Get('resellers')
listResellers(@Query('page') page = '1') {
  return this.resellers.listResellers(+page);
}

@Patch('resellers/:id/approve')
approveReseller(@Param('id') id: string, @CurrentUser() admin: { id: string }) {
  return this.resellers.approve(id, admin.id);
}

@Patch('resellers/:id/suspend')
suspendReseller(@Param('id') id: string) {
  return this.resellers.suspend(id);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/resellers/
git commit -m "feat: reseller management — apply, approve, products with discount pricing"
```

---

### Phase 6 Completion Checklist

- [ ] `GET /admin/stats` returns KPIs: totalUsers, totalOrders, pendingOrders, revenue
- [ ] `GET /admin/users` paginates with search, never exposes `passwordHash`
- [ ] `PATCH /admin/users/:id` can ban users (isActive: false) or change role
- [ ] `GET /admin/orders` paginates with status/userId filter
- [ ] `POST /admin/orders/:id/retry` re-queues failed orders
- [ ] `GET /admin/analytics/revenue` returns time-series revenue data
- [ ] `GET /admin/analytics/orders` returns status distribution
- [ ] Reseller apply, approve, product listing with discount pricing all working
- [ ] All admin routes require `ADMIN` role — 403 for others
- [ ] `AuditInterceptor` applied to all admin mutating endpoints
