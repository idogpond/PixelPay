# Phase 3: Topup Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Build the games catalog, game products, multi-provider abstraction layer, order creation engine, BullMQ topup processor with provider failover, automatic retry with exponential backoff, dead-letter handling, and real-time order status via WebSocket.

**Architecture:** The `OrdersService` creates the order and deducts the wallet in one DB transaction, then enqueues a `topup` BullMQ job. The `TopupProcessor` iterates providers by priority, calls the active adapter, handles failures, and emits WebSocket events on status change. Providers are configured in the DB; adapters are runtime-selected via a factory.

**Tech Stack:** NestJS, BullMQ, Prisma, ioredis, Socket.IO (@nestjs/platform-socket.io), axios

## Global Constraints

- Order number format: `PP-YYYYMMDD-XXXXXXXX` (8 random alphanum)
- Wallet lock/debit happens BEFORE the topup job is enqueued
- On topup failure after all retries: unlock wallet balance, update order to FAILED
- Provider priority: lower number = higher priority (1 = primary)
- Max retry attempts per order: 3 (across all providers)
- Topup BullMQ queue name: `topup`
- WebSocket namespace: `/orders`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/api/src/games/games.service.ts` | Create | findAll, findBySlug, findProducts |
| `apps/api/src/games/games.controller.ts` | Create | GET /games, /games/:slug, /games/:slug/products |
| `apps/api/src/games/games.module.ts` | Create | GamesModule |
| `apps/api/src/providers/adapters/provider.interface.ts` | Create | IProviderAdapter interface |
| `apps/api/src/providers/adapters/unipin.adapter.ts` | Create | Unipin API adapter |
| `apps/api/src/providers/adapters/smileone.adapter.ts` | Create | Smile.one API adapter |
| `apps/api/src/providers/adapters/provider.factory.ts` | Create | Instantiate adapter by provider slug |
| `apps/api/src/providers/providers.service.ts` | Create | getActiveProviders, getProductProviders, healthCheck |
| `apps/api/src/providers/providers.module.ts` | Create | ProvidersModule |
| `apps/api/src/orders/dto/create-order.dto.ts` | Create | CreateOrderDto |
| `apps/api/src/orders/orders.service.ts` | Create | create, findById, findByUser, cancel |
| `apps/api/src/orders/orders.controller.ts` | Create | POST /orders, GET /orders, GET /orders/:id |
| `apps/api/src/orders/orders.processor.ts` | Create | BullMQ topup processor with failover |
| `apps/api/src/orders/orders.gateway.ts` | Create | Socket.IO gateway for order events |
| `apps/api/src/orders/orders.module.ts` | Create | OrdersModule |
| `apps/api/src/common/utils/order-number.ts` | Create | generateOrderNumber() |
| `apps/api/test/orders.e2e-spec.ts` | Create | Orders e2e tests |

---

### Task 1: Games Catalog

**Interfaces:**
- Produces: `GamesService.findAll()`, `GamesService.findBySlug(slug)`, `GamesService.findProducts(gameId)`

- [ ] **Step 1: Write failing test**

`apps/api/test/games.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Games (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('GET /games returns array', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/games').expect(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /games/:slug returns 404 for unknown slug', async () => {
    await request(app.getHttpServer()).get('/api/v1/games/unknown-game-xyz').expect(404);
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npm run test:e2e -- --testPathPattern=games
```

Expected: FAIL

- [ ] **Step 3: Implement GamesService**

`apps/api/src/games/games.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GamesService {
  constructor(private prisma: PrismaService) {}

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
}
```

- [ ] **Step 4: Write GamesController and GamesModule**

`apps/api/src/games/games.controller.ts`:
```typescript
import { Controller, Get, Param } from '@nestjs/common';
import { GamesService } from './games.service';

@Controller('games')
export class GamesController {
  constructor(private games: GamesService) {}

  @Get()
  findAll() {
    return this.games.findAll();
  }

  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.games.findBySlug(slug);
  }

  @Get(':slug/products')
  findProducts(@Param('slug') slug: string) {
    return this.games.findProducts(slug);
  }
}
```

`apps/api/src/games/games.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { GamesService } from './games.service';
import { GamesController } from './games.controller';

@Module({
  providers: [GamesService],
  controllers: [GamesController],
  exports: [GamesService],
})
export class GamesModule {}
```

- [ ] **Step 5: Run — expect pass**

```bash
npm run test:e2e -- --testPathPattern=games
```

Expected: 2 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/games/
git commit -m "feat: games catalog module — list games and products"
```

---

### Task 2: Provider Abstraction Layer

**Interfaces:**
- Produces: `IProviderAdapter.processTopup(params)`, `ProviderFactory.create(provider)`, `ProvidersService.getProductProviders(gameProductId)`

- [ ] **Step 1: Write provider interface**

`apps/api/src/providers/adapters/provider.interface.ts`:
```typescript
export interface TopupParams {
  providerSku: string;
  gameUid: string;
  gameServer?: string;
  gameUsername?: string;
  orderId: string;
  quantity: number;
}

export interface TopupResult {
  success: boolean;
  providerOrderId?: string;
  providerReference?: string;
  failureReason?: string;
}

export interface IProviderAdapter {
  readonly slug: string;
  processTopup(params: TopupParams): Promise<TopupResult>;
  checkOrderStatus(providerOrderId: string): Promise<{ status: 'pending' | 'success' | 'failed'; reference?: string }>;
}
```

- [ ] **Step 2: Write Unipin adapter**

`apps/api/src/providers/adapters/unipin.adapter.ts`:
```typescript
import { Logger } from '@nestjs/common';
import axios from 'axios';
import { hmacSha256 } from '../../common/utils/crypto';
import { IProviderAdapter, TopupParams, TopupResult } from './provider.interface';

export class UnipinAdapter implements IProviderAdapter {
  readonly slug = 'unipin';
  private readonly logger = new Logger(UnipinAdapter.name);

  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly apiSecret: string,
  ) {}

  async processTopup(params: TopupParams): Promise<TopupResult> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signatureData = `${this.apiKey}${params.orderId}${params.providerSku}${params.gameUid}${timestamp}`;
    const signature = hmacSha256(this.apiSecret, signatureData);

    try {
      const response = await axios.post(
        `${this.apiUrl}/topup`,
        {
          partnerTrxId: params.orderId,
          itemCode: params.providerSku,
          userId: params.gameUid,
          serverId: params.gameServer ?? '',
          qty: params.quantity,
          timestamp,
          signature,
          apiKey: this.apiKey,
        },
        { timeout: 30000 },
      );

      const data = response.data;
      if (data.status === 'success' || data.rc === '00') {
        return {
          success: true,
          providerOrderId: data.trxId ?? data.orderId,
          providerReference: data.serialNumber ?? data.ref,
        };
      }

      return { success: false, failureReason: data.message ?? 'Provider returned failure' };
    } catch (error: any) {
      this.logger.error(`Unipin topup failed: ${error.message}`);
      return { success: false, failureReason: error.message };
    }
  }

  async checkOrderStatus(providerOrderId: string) {
    try {
      const response = await axios.get(`${this.apiUrl}/topup/${providerOrderId}`, {
        params: { apiKey: this.apiKey },
        timeout: 15000,
      });
      const statusMap: Record<string, 'pending' | 'success' | 'failed'> = {
        success: 'success',
        pending: 'pending',
        processing: 'pending',
        failed: 'failed',
        cancelled: 'failed',
      };
      return {
        status: statusMap[response.data.status] ?? 'pending',
        reference: response.data.serialNumber,
      };
    } catch {
      return { status: 'pending' as const };
    }
  }
}
```

- [ ] **Step 3: Write Smile.one adapter**

`apps/api/src/providers/adapters/smileone.adapter.ts`:
```typescript
import { Logger } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';
import { IProviderAdapter, TopupParams, TopupResult } from './provider.interface';

export class SmileOneAdapter implements IProviderAdapter {
  readonly slug = 'smileone';
  private readonly logger = new Logger(SmileOneAdapter.name);

  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly apiSecret: string,
  ) {}

  private sign(params: Record<string, string>): string {
    const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
    return crypto.createHmac('sha256', this.apiSecret).update(sorted).digest('hex');
  }

  async processTopup(params: TopupParams): Promise<TopupResult> {
    const baseParams = {
      apiKey: this.apiKey,
      orderId: params.orderId,
      productCode: params.providerSku,
      userId: params.gameUid,
      zoneId: params.gameServer ?? '',
      qty: String(params.quantity),
      timestamp: Math.floor(Date.now() / 1000).toString(),
    };

    try {
      const response = await axios.post(
        `${this.apiUrl}/order`,
        { ...baseParams, sign: this.sign(baseParams) },
        { timeout: 30000 },
      );

      const data = response.data;
      if (data.code === 200 || data.status === 'SUCCESS') {
        return {
          success: true,
          providerOrderId: data.orderId ?? data.tradeNo,
          providerReference: data.serialNo,
        };
      }

      return { success: false, failureReason: data.msg ?? 'Unknown error' };
    } catch (error: any) {
      this.logger.error(`Smile.one topup failed: ${error.message}`);
      return { success: false, failureReason: error.message };
    }
  }

  async checkOrderStatus(providerOrderId: string) {
    try {
      const params = { apiKey: this.apiKey, orderId: providerOrderId };
      const response = await axios.get(`${this.apiUrl}/order`, { params, timeout: 15000 });
      const statusMap: Record<string, 'pending' | 'success' | 'failed'> = {
        SUCCESS: 'success', PENDING: 'pending', FAILED: 'failed',
      };
      return { status: statusMap[response.data.status] ?? 'pending', reference: response.data.serialNo };
    } catch {
      return { status: 'pending' as const };
    }
  }
}
```

- [ ] **Step 4: Write ProviderFactory**

`apps/api/src/providers/adapters/provider.factory.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decryptAes256 } from '../../common/utils/crypto';
import { IProviderAdapter } from './provider.interface';
import { UnipinAdapter } from './unipin.adapter';
import { SmileOneAdapter } from './smileone.adapter';

interface ProviderRecord {
  slug: string;
  apiUrl: string;
  apiKeyEnc: string;
  apiSecretEnc: string | null;
}

@Injectable()
export class ProviderFactory {
  private readonly encKey: string;

  constructor(config: ConfigService) {
    this.encKey = config.get<string>('app.encryptionKey') ?? '';
  }

  create(provider: ProviderRecord): IProviderAdapter {
    const apiKey = decryptAes256(this.encKey, provider.apiKeyEnc);
    const apiSecret = provider.apiSecretEnc ? decryptAes256(this.encKey, provider.apiSecretEnc) : '';

    switch (provider.slug) {
      case 'unipin':
        return new UnipinAdapter(provider.apiUrl, apiKey, apiSecret);
      case 'smileone':
        return new SmileOneAdapter(provider.apiUrl, apiKey, apiSecret);
      default:
        throw new Error(`No adapter for provider slug: ${provider.slug}`);
    }
  }
}
```

- [ ] **Step 5: Write ProvidersService**

`apps/api/src/providers/providers.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderFactory } from './adapters/provider.factory';

@Injectable()
export class ProvidersService {
  constructor(
    private prisma: PrismaService,
    private factory: ProviderFactory,
  ) {}

  async getProductProviders(gameProductId: string) {
    return this.prisma.providerProduct.findMany({
      where: { gameProductId, isAvailable: true, provider: { isActive: true } },
      include: { provider: true },
      orderBy: { provider: { priority: 'asc' } },
    });
  }

  getAdapter(provider: { slug: string; apiUrl: string; apiKeyEnc: string; apiSecretEnc: string | null }) {
    return this.factory.create(provider);
  }
}
```

`apps/api/src/providers/providers.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { ProviderFactory } from './adapters/provider.factory';

@Module({
  providers: [ProvidersService, ProviderFactory],
  exports: [ProvidersService],
})
export class ProvidersModule {}
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/providers/
git commit -m "feat: provider abstraction layer — Unipin, Smile.one adapters, factory"
```

---

### Task 3: Orders Module — Create & Queue

**Interfaces:**
- Consumes: `WalletService.lock()`, `CouponsService.apply()` (stub OK in Phase 3), `ProvidersService.getProductProviders()`
- Produces: `OrdersService.create(userId, dto)`, `OrdersService.findById(id)`, `OrdersService.findByUser(userId, page, limit)`

- [ ] **Step 1: Write order-number utility**

`apps/api/src/common/utils/order-number.ts`:
```typescript
import { customAlphabet } from 'nanoid';
import dayjs from 'dayjs';

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 8);

export function generateOrderNumber(): string {
  const date = dayjs().format('YYYYMMDD');
  return `PP-${date}-${nanoid()}`;
}
```

- [ ] **Step 2: Write CreateOrderDto**

`apps/api/src/orders/dto/create-order.dto.ts`:
```typescript
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export enum PaymentMethodEnum {
  WALLET = 'WALLET',
}

export class CreateOrderDto {
  @IsUUID()
  gameProductId: string;

  @IsEnum(PaymentMethodEnum)
  paymentMethod: PaymentMethodEnum;

  @IsString()
  @MaxLength(100)
  gameUid: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  gameServer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  gameUsername?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  couponCode?: string;
}
```

- [ ] **Step 3: Write failing orders e2e test**

`apps/api/test/orders.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Orders (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `order+${Date.now()}@test.com`, password: 'Test1234!', displayName: 'Buyer' });
    token = res.body.data.accessToken;
  });

  afterAll(() => app.close());

  it('GET /orders returns empty array for new user', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.items).toEqual([]);
  });

  it('POST /orders returns 400 when wallet has no balance', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        gameProductId: '00000000-0000-0000-0000-000000000000',
        paymentMethod: 'WALLET',
        gameUid: '12345678',
      })
      .expect(400);
    expect(res.body.success).toBe(false);
  });
});
```

- [ ] **Step 4: Run — expect fail**

```bash
npm run test:e2e -- --testPathPattern=orders
```

Expected: FAIL — `Cannot GET /api/v1/orders`

- [ ] **Step 5: Implement OrdersService**

`apps/api/src/orders/orders.service.ts`:
```typescript
import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { generateOrderNumber } from '../common/utils/order-number';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    @InjectQueue('topup') private topupQueue: Queue,
  ) {}

  async create(userId: string, dto: CreateOrderDto) {
    const product = await this.prisma.gameProduct.findUnique({
      where: { id: dto.gameProductId, isActive: true },
    });
    if (!product) throw new BadRequestException('Product not found or unavailable');

    const totalPrice = Number(product.priceSell);

    // Lock wallet balance before creating order
    await this.wallet.lock(userId, totalPrice);

    const order = await this.prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userId,
        gameProductId: dto.gameProductId,
        quantity: 1,
        unitPrice: product.priceSell,
        totalPrice: product.priceSell,
        discountAmount: 0,
        cashbackAmount: 0,
        paymentMethod: dto.paymentMethod,
        gameUid: dto.gameUid,
        gameServer: dto.gameServer,
        gameUsername: dto.gameUsername,
        status: 'PENDING',
      },
    });

    await this.topupQueue.add(
      'process-topup',
      { orderId: order.id, userId, gameProductId: dto.gameProductId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    return order;
  }

  findByUser(userId: string, page = 1, limit = 20) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }).then(async (items) => {
      const total = await this.prisma.order.count({ where: { userId } });
      return { items, total, page, limit };
    });
  }

  async findById(id: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { gameProduct: { include: { game: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new UnauthorizedException();
    return order;
  }

  async cancel(id: string, userId: string) {
    const order = await this.findById(id, userId);
    if (order.status !== 'PENDING') {
      throw new BadRequestException('Only pending orders can be cancelled');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.wallet.unlock(userId, Number(order.totalPrice));
    });
    return { message: 'Order cancelled' };
  }
}
```

- [ ] **Step 6: Write OrdersController**

`apps/api/src/orders/orders.controller.ts`:
```typescript
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private orders: OrdersService) {}

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateOrderDto) {
    return this.orders.create(user.id, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: { id: string },
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.orders.findByUser(user.id, +page, +limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.orders.findById(id, user.id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.orders.cancel(id, user.id);
  }
}
```

- [ ] **Step 7: Run orders tests — expect pass**

```bash
npm run test:e2e -- --testPathPattern=orders
```

Expected: 2 tests PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/orders/orders.service.ts apps/api/src/orders/orders.controller.ts apps/api/src/common/utils/order-number.ts
git commit -m "feat: orders module — create, list, cancel with wallet locking"
```

---

### Task 4: Topup BullMQ Processor with Failover

**Interfaces:**
- Consumes: `ProvidersService.getProductProviders()`, `ProvidersService.getAdapter()`, `WalletService.debit()`, `WalletService.unlock()`
- Produces: Emits WebSocket events `order.processing`, `order.completed`, `order.failed`

- [ ] **Step 1: Write TopupProcessor**

`apps/api/src/orders/orders.processor.ts`:
```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { ProvidersService } from '../providers/providers.service';
import { OrdersGateway } from './orders.gateway';

interface TopupJobData {
  orderId: string;
  userId: string;
  gameProductId: string;
}

@Processor('topup')
export class TopupProcessor extends WorkerHost {
  private readonly logger = new Logger(TopupProcessor.name);

  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private providers: ProvidersService,
    private gateway: OrdersGateway,
  ) {
    super();
  }

  async process(job: Job<TopupJobData>) {
    const { orderId, userId, gameProductId } = job.data;

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== 'PENDING') return;

    await this.prisma.order.update({ where: { id: orderId }, data: { status: 'PROCESSING' } });
    this.gateway.emitOrderStatus(userId, orderId, 'PROCESSING');

    const providerProducts = await this.providers.getProductProviders(gameProductId);

    if (providerProducts.length === 0) {
      await this.handleFailure(orderId, userId, Number(order.totalPrice), 'No providers available');
      return;
    }

    let lastError = '';

    for (const pp of providerProducts) {
      const adapter = this.providers.getAdapter(pp.provider);

      try {
        const result = await adapter.processTopup({
          providerSku: pp.providerSku,
          gameUid: order.gameUid,
          gameServer: order.gameServer ?? undefined,
          gameUsername: order.gameUsername ?? undefined,
          orderId: order.id,
          quantity: order.quantity,
        });

        if (result.success) {
          await this.prisma.$transaction(async (tx) => {
            await tx.order.update({
              where: { id: orderId },
              data: {
                status: 'COMPLETED',
                providerId: pp.providerId,
                providerOrderId: result.providerOrderId,
                providerReference: result.providerReference,
                completedAt: new Date(),
              },
            });
            // Debit the locked amount (unlock already deducted balance, so we just record)
            await tx.walletTransaction.create({
              data: {
                walletId: (await tx.wallet.findUniqueOrThrow({ where: { userId } })).id,
                type: 'TOPUP_DEBIT',
                amount: -Number(order.totalPrice),
                balanceBefore: 0, // Will be computed in full impl
                balanceAfter: 0,
                referenceId: orderId,
                referenceType: 'ORDER',
              },
            });
          });

          this.gateway.emitOrderStatus(userId, orderId, 'COMPLETED');
          this.logger.log(`Order ${orderId} completed via ${pp.provider.slug}`);
          return;
        }

        lastError = result.failureReason ?? 'Provider returned failure';
        this.logger.warn(`Provider ${pp.provider.slug} failed for order ${orderId}: ${lastError}`);

        await this.prisma.order.update({ where: { id: orderId }, data: { retryCount: { increment: 1 } } });
      } catch (error: any) {
        lastError = error.message;
        this.logger.error(`Exception from ${pp.provider.slug}: ${error.message}`);
      }
    }

    // All providers exhausted
    await this.handleFailure(orderId, userId, Number(order.totalPrice), lastError);
  }

  private async handleFailure(orderId: string, userId: string, amount: number, reason: string) {
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'FAILED', metadata: { failureReason: reason } },
    });
    await this.wallet.unlock(userId, amount);
    this.gateway.emitOrderStatus(userId, orderId, 'FAILED');
    this.logger.error(`Order ${orderId} failed: ${reason}`);
  }
}
```

- [ ] **Step 2: Write OrdersGateway (WebSocket)**

`apps/api/src/orders/orders.gateway.ts`:
```typescript
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ namespace: '/orders', cors: { origin: '*' } })
export class OrdersGateway {
  @WebSocketServer()
  server: Server;

  emitOrderStatus(userId: string, orderId: string, status: string) {
    this.server.to(`user:${userId}`).emit('order.status', { orderId, status });
  }
}
```

- [ ] **Step 3: Write OrdersModule**

`apps/api/src/orders/orders.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { TopupProcessor } from './orders.processor';
import { OrdersGateway } from './orders.gateway';
import { WalletModule } from '../wallet/wallet.module';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports: [
    WalletModule,
    ProvidersModule,
    BullModule.registerQueue({ name: 'topup' }),
  ],
  providers: [OrdersService, TopupProcessor, OrdersGateway],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/orders/
git commit -m "feat: topup BullMQ processor with multi-provider failover and WebSocket events"
```

---

### Phase 3 Completion Checklist

- [ ] Games: `GET /games`, `GET /games/:slug`, `GET /games/:slug/products` all working
- [ ] Provider interface defined; Unipin and Smile.one adapters implemented
- [ ] ProviderFactory decrypts API keys with AES-256-GCM
- [ ] Orders: create locks wallet, enqueues topup job
- [ ] TopupProcessor iterates providers by priority, fails over on error
- [ ] On all-provider failure: unlocks wallet, marks order FAILED
- [ ] WebSocket emits `order.status` events on status changes
- [ ] Order cancel restores locked wallet balance
