# Phase 4: Coupons, Cashback & Affiliates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Build the coupon validation engine, cashback rules engine, and affiliate commission system. All three integrate into the order creation flow from Phase 3.

**Architecture:** `CouponsService` validates and locks a coupon atomically (increment `usedCount` in a DB transaction). `CashbackService` evaluates rules after a successful topup and credits the wallet. `AffiliatesService` tracks referrals and awards commissions on completed orders.

**Tech Stack:** NestJS, Prisma, `$transaction`

## Global Constraints

- Coupon validation is atomic: checked and reserved in a single `$transaction` with `usedCount` increment
- Cashback credited only after order status = COMPLETED (inside TopupProcessor)
- Affiliate commission: 2% default, pending until order is 24h+ old (configurable)
- Commission payout is admin-triggered (manual in MVP), not automated
- Discount calculations: PERCENTAGE capped by `maxDiscount`, FIXED never exceeds order total

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/api/src/coupons/coupons.service.ts` | Create | validate, apply, release (on failure) |
| `apps/api/src/coupons/coupons.controller.ts` | Create | POST /coupons/validate |
| `apps/api/src/coupons/coupons.module.ts` | Create | CouponsModule |
| `apps/api/src/coupons/dto/validate-coupon.dto.ts` | Create | ValidateCouponDto |
| `apps/api/src/cashback/cashback.service.ts` | Create | evaluateAndCredit(userId, orderId, amount, gameId) |
| `apps/api/src/cashback/cashback.module.ts` | Create | CashbackModule |
| `apps/api/src/affiliates/affiliates.service.ts` | Create | getOrCreate, awardCommission, getDashboard |
| `apps/api/src/affiliates/affiliates.controller.ts` | Create | GET /affiliates/dashboard, /commissions |
| `apps/api/src/affiliates/affiliates.module.ts` | Create | AffiliatesModule |
| `apps/api/src/orders/orders.service.ts` | Modify | integrate coupon + cashback into create() |
| `apps/api/src/orders/orders.processor.ts` | Modify | call cashback + affiliate after COMPLETED |
| `apps/api/test/coupons.e2e-spec.ts` | Create | Coupon validation tests |
| `apps/api/test/affiliates.e2e-spec.ts` | Create | Affiliate dashboard tests |

---

### Task 1: Coupons Module

**Interfaces:**
- Produces: `CouponsService.validate(userId, code, gameId, orderTotal)` → `{ discountAmount, couponId }`, `CouponsService.release(couponId, userId)` (on order failure)

- [ ] **Step 1: Write failing coupon test**

`apps/api/test/coupons.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Coupons (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = module.get(PrismaService);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `coupon+${Date.now()}@test.com`, password: 'Test1234!', displayName: 'Coupon' });
    token = res.body.data.accessToken;

    await prisma.coupon.create({
      data: {
        code: 'TEST10',
        discountType: 'PERCENTAGE',
        value: 10,
        minOrderAmount: 50,
        usageLimit: 100,
        userLimit: 1,
        isActive: true,
      },
    });
  });

  afterAll(() => app.close());

  it('POST /coupons/validate returns discount for valid coupon', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/coupons/validate')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'TEST10', orderTotal: 100 })
      .expect(200);
    expect(res.body.data.discountAmount).toBe(10);
  });

  it('POST /coupons/validate returns 400 for below minimum order', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/coupons/validate')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'TEST10', orderTotal: 30 })
      .expect(400);
  });

  it('POST /coupons/validate returns 404 for unknown coupon', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/coupons/validate')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'INVALID', orderTotal: 100 })
      .expect(404);
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npm run test:e2e -- --testPathPattern=coupons
```

Expected: FAIL — `Cannot POST /api/v1/coupons/validate`

- [ ] **Step 3: Write ValidateCouponDto**

`apps/api/src/coupons/dto/validate-coupon.dto.ts`:
```typescript
import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class ValidateCouponDto {
  @IsString()
  code: string;

  @IsNumber()
  @Min(0)
  orderTotal: number;

  @IsOptional()
  @IsUUID()
  gameId?: string;
}
```

- [ ] **Step 4: Write CouponsService**

`apps/api/src/coupons/coupons.service.ts`:
```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

export interface CouponValidationResult {
  couponId: string;
  discountAmount: number;
  code: string;
}

@Injectable()
export class CouponsService {
  constructor(private prisma: PrismaService) {}

  async validate(userId: string, dto: ValidateCouponDto): Promise<CouponValidationResult> {
    const coupon = await this.prisma.coupon.findUnique({ where: { code: dto.code } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    if (!coupon.isActive) throw new BadRequestException('Coupon is inactive');
    if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new BadRequestException('Coupon has expired');
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('Coupon usage limit reached');
    }
    if (new Decimal(dto.orderTotal).lessThan(coupon.minOrderAmount)) {
      throw new BadRequestException(`Minimum order amount is ${coupon.minOrderAmount} THB`);
    }
    if (coupon.gameId && dto.gameId && coupon.gameId !== dto.gameId) {
      throw new BadRequestException('Coupon is not valid for this game');
    }

    const existingUsage = await this.prisma.couponUsage.count({ where: { couponId: coupon.id, userId } });
    if (existingUsage >= coupon.userLimit) {
      throw new BadRequestException('You have already used this coupon');
    }

    const discountAmount = this.calculateDiscount(coupon.discountType, Number(coupon.value), dto.orderTotal, coupon.maxDiscount ? Number(coupon.maxDiscount) : undefined);

    return { couponId: coupon.id, discountAmount, code: dto.code };
  }

  private calculateDiscount(
    type: string,
    value: number,
    orderTotal: number,
    maxDiscount?: number,
  ): number {
    let discount = type === 'PERCENTAGE' ? (orderTotal * value) / 100 : value;
    if (maxDiscount !== undefined) discount = Math.min(discount, maxDiscount);
    return Math.min(discount, orderTotal);
  }

  async applyToOrder(couponId: string, userId: string, orderId: string, discountAmount: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.coupon.update({
        where: { id: couponId },
        data: { usedCount: { increment: 1 } },
      });
      return tx.couponUsage.create({
        data: { couponId, userId, orderId, discountAmount },
      });
    });
  }
}
```

- [ ] **Step 5: Write CouponsController and CouponsModule**

`apps/api/src/coupons/coupons.controller.ts`:
```typescript
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CouponsService } from './coupons.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

@UseGuards(JwtAuthGuard)
@Controller('coupons')
export class CouponsController {
  constructor(private coupons: CouponsService) {}

  @Post('validate')
  validate(@CurrentUser() user: { id: string }, @Body() dto: ValidateCouponDto) {
    return this.coupons.validate(user.id, dto);
  }
}
```

`apps/api/src/coupons/coupons.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { CouponsController } from './coupons.controller';

@Module({
  providers: [CouponsService],
  controllers: [CouponsController],
  exports: [CouponsService],
})
export class CouponsModule {}
```

- [ ] **Step 6: Run coupon tests — expect pass**

```bash
npm run test:e2e -- --testPathPattern=coupons
```

Expected: 3 tests PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/coupons/
git commit -m "feat: coupons module — validate, apply, percentage and fixed discount types"
```

---

### Task 2: Cashback Rules Engine

**Interfaces:**
- Produces: `CashbackService.evaluateAndCredit(userId, orderId, orderAmount, gameId)` → `cashbackAmount`

- [ ] **Step 1: Write CashbackService**

`apps/api/src/cashback/cashback.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class CashbackService {
  private readonly logger = new Logger(CashbackService.name);

  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
  ) {}

  async evaluateAndCredit(
    userId: string,
    orderId: string,
    orderAmount: number,
    gameId: string,
  ): Promise<number> {
    const now = new Date();
    const rules = await this.prisma.cashbackRule.findMany({
      where: {
        isActive: true,
        OR: [{ gameId: null }, { gameId }],
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
          { minOrderAmount: { lte: orderAmount } },
        ],
      },
      orderBy: { value: 'desc' }, // apply highest cashback rule
    });

    if (rules.length === 0) return 0;

    const rule = rules[0];
    const cashbackAmount = rule.cashbackType === 'PERCENTAGE'
      ? Math.round((orderAmount * Number(rule.value)) / 100 * 100) / 100
      : Math.min(Number(rule.value), orderAmount);

    if (cashbackAmount <= 0) return 0;

    await this.wallet.credit(userId, cashbackAmount, orderId, 'CASHBACK', {
      ruleId: rule.id,
      ruleName: rule.name,
      orderAmount,
    });

    await this.prisma.order.update({
      where: { id: orderId },
      data: { cashbackAmount },
    });

    this.logger.log(`Cashback ${cashbackAmount} THB credited to user ${userId} for order ${orderId}`);
    return cashbackAmount;
  }
}
```

`apps/api/src/cashback/cashback.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { CashbackService } from './cashback.service';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [WalletModule],
  providers: [CashbackService],
  exports: [CashbackService],
})
export class CashbackModule {}
```

- [ ] **Step 2: Integrate cashback into TopupProcessor**

In `apps/api/src/orders/orders.processor.ts`, after `status: 'COMPLETED'` update, add:

```typescript
// After the tx block that marks order COMPLETED:
const product = await this.prisma.gameProduct.findUnique({ where: { id: job.data.gameProductId } });
if (product) {
  await this.cashback.evaluateAndCredit(
    userId,
    orderId,
    Number(order.totalPrice),
    product.gameId,
  );
}
```

Add `CashbackService` to constructor injection and update `OrdersModule` to import `CashbackModule`.

- [ ] **Step 3: Write unit test for cashback calculation**

`apps/api/src/cashback/cashback.service.spec.ts`:
```typescript
describe('CashbackService.evaluateAndCredit', () => {
  it('returns 0 when no active rules', async () => {
    // mock prisma.cashbackRule.findMany returns []
    // expect result to be 0
  });

  it('applies percentage rule correctly', async () => {
    // mock rule: { cashbackType: 'PERCENTAGE', value: 5, minOrderAmount: 0 }
    // orderAmount: 200
    // expect cashbackAmount: 10
  });

  it('caps cashback at order amount for fixed rules', async () => {
    // mock rule: { cashbackType: 'FIXED', value: 500, minOrderAmount: 0 }
    // orderAmount: 100
    // expect cashbackAmount: 100 (not 500)
  });
});
```

Run: `cd apps/api && npm test -- cashback`
Expected: 3 PASS (implement mocks using `@nestjs/testing` with `{ provide: PrismaService, useValue: { cashbackRule: { findMany: jest.fn() }, order: { update: jest.fn() } } }`)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/cashback/ apps/api/src/orders/orders.processor.ts
git commit -m "feat: cashback engine — evaluates rules and credits wallet on order completion"
```

---

### Task 3: Affiliate System

**Interfaces:**
- Produces: `AffiliatesService.getDashboard(userId)`, `AffiliatesService.awardCommission(referrerId, orderId, orderAmount)`

- [ ] **Step 1: Write failing affiliate test**

`apps/api/test/affiliates.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Affiliates (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `aff+${Date.now()}@test.com`, password: 'Test1234!', displayName: 'Affiliate' });
    token = res.body.data.accessToken;
  });

  afterAll(() => app.close());

  it('GET /affiliates/dashboard returns stats', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/affiliates/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.totalReferrals).toBe(0);
    expect(res.body.data.totalEarnings).toBeDefined();
  });

  it('GET /affiliates/commissions returns paginated list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/affiliates/commissions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npm run test:e2e -- --testPathPattern=affiliates
```

Expected: FAIL

- [ ] **Step 3: Implement AffiliatesService**

`apps/api/src/affiliates/affiliates.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class AffiliatesService {
  private readonly logger = new Logger(AffiliatesService.name);

  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
  ) {}

  async getOrCreateAffiliate(userId: string) {
    const existing = await this.prisma.affiliate.findUnique({ where: { userId } });
    if (existing) return existing;

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.prisma.affiliate.create({
      data: {
        userId,
        referralCode: user.referralCode,
        commissionRate: 2.0,
        status: 'ACTIVE',
      },
    });
  }

  async getDashboard(userId: string) {
    const affiliate = await this.getOrCreateAffiliate(userId);
    return {
      referralCode: affiliate.referralCode,
      totalReferrals: affiliate.totalReferrals,
      totalEarnings: affiliate.totalEarnings,
      pendingEarnings: affiliate.pendingEarnings,
      status: affiliate.status,
    };
  }

  async getCommissions(userId: string, page = 1, limit = 20) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { userId } });
    if (!affiliate) return { items: [], total: 0, page, limit };

    const [items, total] = await Promise.all([
      this.prisma.affiliateCommission.findMany({
        where: { affiliateId: affiliate.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { order: { select: { orderNumber: true, totalPrice: true, createdAt: true } } },
      }),
      this.prisma.affiliateCommission.count({ where: { affiliateId: affiliate.id } }),
    ]);

    return { items, total, page, limit };
  }

  async awardCommission(referrerId: string, orderId: string, orderAmount: number) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { userId: referrerId } });
    if (!affiliate || affiliate.status !== 'ACTIVE') return;

    const commissionAmount = Math.round((orderAmount * Number(affiliate.commissionRate)) / 100 * 100) / 100;
    if (commissionAmount <= 0) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.affiliateCommission.create({
        data: {
          affiliateId: affiliate.id,
          referredUserId: (await tx.order.findUniqueOrThrow({ where: { id: orderId } })).userId,
          orderId,
          commissionAmount,
          status: 'PENDING',
        },
      });
      await tx.affiliate.update({
        where: { id: affiliate.id },
        data: {
          pendingEarnings: { increment: commissionAmount },
          totalEarnings: { increment: commissionAmount },
        },
      });
    });

    this.logger.log(`Commission ${commissionAmount} THB awarded to affiliate ${referrerId} for order ${orderId}`);
  }

  async processReferral(newUserId: string, referralCode: string) {
    const referrer = await this.prisma.user.findUnique({ where: { referralCode } });
    if (!referrer || referrer.id === newUserId) return;

    await this.prisma.affiliate.update({
      where: { userId: referrer.id },
      data: { totalReferrals: { increment: 1 } },
    });

    this.logger.log(`User ${newUserId} referred by ${referrer.id}`);
  }
}
```

- [ ] **Step 4: Write AffiliatesController**

`apps/api/src/affiliates/affiliates.controller.ts`:
```typescript
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AffiliatesService } from './affiliates.service';

@UseGuards(JwtAuthGuard)
@Controller('affiliates')
export class AffiliatesController {
  constructor(private affiliates: AffiliatesService) {}

  @Get('dashboard')
  getDashboard(@CurrentUser() user: { id: string }) {
    return this.affiliates.getDashboard(user.id);
  }

  @Get('commissions')
  getCommissions(
    @CurrentUser() user: { id: string },
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.affiliates.getCommissions(user.id, +page, +limit);
  }
}
```

`apps/api/src/affiliates/affiliates.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { AffiliatesService } from './affiliates.service';
import { AffiliatesController } from './affiliates.controller';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [WalletModule],
  providers: [AffiliatesService],
  controllers: [AffiliatesController],
  exports: [AffiliatesService],
})
export class AffiliatesModule {}
```

- [ ] **Step 5: Integrate affiliate commission into TopupProcessor**

In `orders.processor.ts`, after cashback, add:

```typescript
// Award affiliate commission if buyer was referred
const buyer = await this.prisma.user.findUnique({ where: { id: userId }, select: { referredBy: true } });
if (buyer?.referredBy) {
  await this.affiliates.awardCommission(buyer.referredBy, orderId, Number(order.totalPrice));
}
```

Add `AffiliatesService` to `TopupProcessor` constructor and `OrdersModule` imports.

- [ ] **Step 6: Wire referral tracking into AuthService.register()**

In `apps/api/src/auth/auth.service.ts`, after creating the user, add:

```typescript
// If a referral code was passed, link it
if (dto.referredBy) {
  const referrer = await this.prisma.user.findUnique({ where: { referralCode: dto.referredBy } });
  if (referrer && referrer.id !== user.id) {
    await this.prisma.user.update({ where: { id: user.id }, data: { referredBy: referrer.id } });
    await this.affiliates.processReferral(user.id, dto.referredBy);
  }
}
```

Add optional `referredBy?: string` to `RegisterDto`.

- [ ] **Step 7: Run affiliate tests — expect pass**

```bash
npm run test:e2e -- --testPathPattern=affiliates
```

Expected: 2 tests PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/affiliates/ apps/api/src/coupons/ apps/api/src/cashback/
git commit -m "feat: affiliate commission tracking, cashback rules engine, referral linking"
```

---

### Phase 4 Completion Checklist

- [ ] `POST /coupons/validate` validates code, min order, game scope, user limit
- [ ] Coupon `applyToOrder()` increments `usedCount` atomically in `$transaction`
- [ ] Cashback evaluates highest-value matching rule after order completion
- [ ] Affiliate dashboard shows referral count, total/pending earnings
- [ ] Commission awarded when referred user completes an order
- [ ] Referral linkage created at registration via `referredBy` param
- [ ] All three systems (coupon/cashback/affiliate) are integrated into TopupProcessor
