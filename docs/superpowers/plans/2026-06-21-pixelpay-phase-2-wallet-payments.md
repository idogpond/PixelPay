# Phase 2: Wallet & PromptPay Payments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Build the wallet module (balance, locking, transaction ledger) and PromptPay payment integration (QR generation, webhook, background poller, wallet credit).

**Architecture:** Wallet operations use PostgreSQL transactions with `SELECT ... FOR UPDATE` to prevent race conditions. PromptPay integration calls a payment gateway (GB Pay / 2C2P) to generate a QR code; a BullMQ poller job checks payment status every 10s as a fallback to webhooks.

**Tech Stack:** NestJS, Prisma, BullMQ, ioredis, @nestjs/bullmq, payment gateway SDK (HTTP via axios)

## Global Constraints

- Wallet balance is always DECIMAL(15,2) — never float arithmetic
- All wallet mutations (debit/credit/lock) run inside a Prisma `$transaction`
- Payment webhook endpoint must verify HMAC-SHA256 signature before processing
- Idempotency: webhook handler must be idempotent (check payment status before updating)
- BullMQ queue names: `payments` (poller), `topup` (phase 3)
- All amounts in THB (Thai Baht)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/api/src/wallet/wallet.service.ts` | Create | balance queries, credit, debit, lock, unlock |
| `apps/api/src/wallet/wallet.controller.ts` | Create | GET /wallet, GET /wallet/transactions |
| `apps/api/src/wallet/wallet.module.ts` | Create | WalletModule |
| `apps/api/src/wallet/dto/` | Create | response DTOs |
| `apps/api/src/payments/payments.service.ts` | Create | createPromptPay, handleWebhook, pollStatus |
| `apps/api/src/payments/payments.controller.ts` | Create | POST /payments/promptpay, GET /payments/:id, POST /payments/webhook |
| `apps/api/src/payments/payments.processor.ts` | Create | BullMQ payment poller job |
| `apps/api/src/payments/payments.module.ts` | Create | PaymentsModule with BullMQ queue |
| `apps/api/src/payments/gateway/payment-gateway.service.ts` | Create | HTTP adapter for GB Pay / 2C2P |
| `apps/api/src/payments/dto/` | Create | CreatePromptPayDto |
| `apps/api/src/common/utils/crypto.ts` | Create | HMAC-SHA256 verify utility |
| `apps/api/test/wallet.e2e-spec.ts` | Create | Wallet e2e tests |
| `apps/api/test/payments.e2e-spec.ts` | Create | Payments e2e tests |

---

### Task 1: Wallet Module

**Interfaces:**
- Produces: `WalletService.getWallet(userId)`, `WalletService.credit(userId, amount, refId, refType, meta)`, `WalletService.debit(userId, amount, refId, refType, meta)`, `WalletService.lock(userId, amount)`, `WalletService.unlock(userId, amount)`, `WalletService.getTransactions(userId, page, limit)`

- [ ] **Step 1: Write failing e2e test**

`apps/api/test/wallet.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Wallet (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `wallet+${Date.now()}@test.com`, password: 'Test1234!', displayName: 'Wallet' });
    token = res.body.data.accessToken;
  });

  afterAll(() => app.close());

  it('GET /wallet returns balance 0 for new user', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/wallet')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.balance).toBe('0.00');
    expect(res.body.data.lockedBalance).toBe('0.00');
  });

  it('GET /wallet/transactions returns empty array for new user', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/wallet/transactions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
cd apps/api
npm run test:e2e -- --testPathPattern=wallet
```

Expected: FAIL — `Cannot GET /api/v1/wallet`

- [ ] **Step 3: Implement WalletService**

`apps/api/src/wallet/wallet.service.ts`:
```typescript
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  async getWallet(userId: string) {
    return this.prisma.wallet.findUniqueOrThrow({ where: { userId } });
  }

  async getTransactions(userId: string, page = 1, limit = 20) {
    const wallet = await this.prisma.wallet.findUniqueOrThrow({ where: { userId } });
    const [items, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
    ]);
    return { items, total, page, limit };
  }

  async credit(
    userId: string,
    amount: number,
    referenceId: string,
    referenceType: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { userId },
        select: { id: true, balance: true },
      });

      const balanceBefore = new Decimal(wallet.balance);
      const amountDecimal = new Decimal(amount);
      const balanceAfter = balanceBefore.add(amountDecimal);

      const [updatedWallet, txRecord] = await Promise.all([
        tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: balanceAfter },
        }),
        tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'DEPOSIT',
            amount: amountDecimal,
            balanceBefore,
            balanceAfter,
            referenceId,
            referenceType,
            metadata,
          },
        }),
      ]);

      return { wallet: updatedWallet, transaction: txRecord };
    });
  }

  async debit(
    userId: string,
    amount: number,
    referenceId: string,
    referenceType: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { userId },
        select: { id: true, balance: true, lockedBalance: true },
      });

      const balance = new Decimal(wallet.balance);
      const amountDecimal = new Decimal(amount);

      if (balance.lessThan(amountDecimal)) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      const balanceAfter = balance.sub(amountDecimal);

      const [updatedWallet, txRecord] = await Promise.all([
        tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: balanceAfter },
        }),
        tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'TOPUP_DEBIT',
            amount: amountDecimal.negated(),
            balanceBefore: balance,
            balanceAfter,
            referenceId,
            referenceType,
            metadata,
          },
        }),
      ]);

      return { wallet: updatedWallet, transaction: txRecord };
    });
  }

  async lock(userId: string, amount: number) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      const balance = new Decimal(wallet.balance);
      const amountDecimal = new Decimal(amount);

      if (balance.lessThan(amountDecimal)) {
        throw new BadRequestException('Insufficient balance to lock');
      }

      return tx.wallet.update({
        where: { userId },
        data: {
          balance: balance.sub(amountDecimal),
          lockedBalance: new Decimal(wallet.lockedBalance).add(amountDecimal),
        },
      });
    });
  }

  async unlock(userId: string, amount: number) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      const amountDecimal = new Decimal(amount);
      return tx.wallet.update({
        where: { userId },
        data: {
          balance: new Decimal(wallet.balance).add(amountDecimal),
          lockedBalance: new Decimal(wallet.lockedBalance).sub(amountDecimal),
        },
      });
    });
  }
}
```

- [ ] **Step 4: Write WalletController and WalletModule**

`apps/api/src/wallet/wallet.controller.ts`:
```typescript
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WalletService } from './wallet.service';

@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private wallet: WalletService) {}

  @Get()
  getWallet(@CurrentUser() user: { id: string }) {
    return this.wallet.getWallet(user.id);
  }

  @Get('transactions')
  getTransactions(
    @CurrentUser() user: { id: string },
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.wallet.getTransactions(user.id, +page, +limit);
  }
}
```

`apps/api/src/wallet/wallet.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';

@Module({
  providers: [WalletService],
  controllers: [WalletController],
  exports: [WalletService],
})
export class WalletModule {}
```

- [ ] **Step 5: Run wallet tests — expect pass**

```bash
npm run test:e2e -- --testPathPattern=wallet
```

Expected: 2 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/wallet/
git commit -m "feat: implement wallet module — balance, credit, debit, lock/unlock"
```

---

### Task 2: Payment Gateway Adapter

**Files:**
- Create: `apps/api/src/payments/gateway/payment-gateway.service.ts`
- Create: `apps/api/src/common/utils/crypto.ts`

- [ ] **Step 1: Write HMAC utility**

`apps/api/src/common/utils/crypto.ts`:
```typescript
import * as crypto from 'crypto';

export function hmacSha256(secret: string, data: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

export function verifyHmacSha256(secret: string, data: string, signature: string): boolean {
  const expected = hmacSha256(secret, data);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function encryptAes256(key: string, plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptAes256(key: string, ciphertext: string): string {
  const [ivHex, tagHex, dataHex] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  decipher.setAuthTag(tag);
  return decipher.update(data).toString('utf8') + decipher.final('utf8');
}
```

- [ ] **Step 2: Write PaymentGatewayService**

`apps/api/src/payments/gateway/payment-gateway.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { hmacSha256 } from '../../common/utils/crypto';

export interface CreateQrChargeResult {
  chargeId: string;
  qrCodeUrl: string;
  expiresAt: Date;
  amount: number;
}

export interface ChargeStatus {
  chargeId: string;
  status: 'pending' | 'paid' | 'failed' | 'expired';
  paidAt?: Date;
}

@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);
  private readonly http: AxiosInstance;
  private readonly apiKey: string;
  private readonly secret: string;

  constructor(private config: ConfigService) {
    this.apiKey = config.get<string>('PAYMENT_GATEWAY_API_KEY') ?? '';
    this.secret = config.get<string>('PAYMENT_GATEWAY_SECRET') ?? '';
    this.http = axios.create({
      baseURL: config.get<string>('PAYMENT_GATEWAY_URL'),
      timeout: 30000,
    });
  }

  async createPromptPayQr(amount: number, referenceId: string): Promise<CreateQrChargeResult> {
    const timestamp = Date.now().toString();
    const signatureData = `${this.apiKey}${amount}${referenceId}${timestamp}`;
    const signature = hmacSha256(this.secret, signatureData);

    // Adapt to actual gateway API — this shows GB Pay structure as example
    const response = await this.http.post('/v3/qrcode', {
      remitSlipId: referenceId,
      amount: amount.toFixed(2),
      currency: 'THB',
      responseUrl: '', // webhook is set at gateway account level
      backgroundUrl: `${this.config.get('app.url')}/api/v1/payments/webhook`,
      detail: 'PixelPay wallet top-up',
      apiKey: this.apiKey,
      timeStamp: timestamp,
      checksum: signature,
    });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    return {
      chargeId: response.data.referenceNo ?? referenceId,
      qrCodeUrl: response.data.qrImage ?? response.data.qrCodeUrl,
      expiresAt,
      amount,
    };
  }

  async getChargeStatus(chargeId: string): Promise<ChargeStatus> {
    const response = await this.http.get(`/v3/charge/${chargeId}`, {
      params: { apiKey: this.apiKey },
    });

    const statusMap: Record<string, ChargeStatus['status']> = {
      pending: 'pending',
      pay: 'paid',
      paid: 'paid',
      failed: 'failed',
      expired: 'expired',
      cancel: 'expired',
    };

    return {
      chargeId,
      status: statusMap[response.data.status] ?? 'pending',
      paidAt: response.data.paidAt ? new Date(response.data.paidAt) : undefined,
    };
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const webhookSecret = this.config.get<string>('PAYMENT_WEBHOOK_SECRET') ?? '';
    const expected = hmacSha256(webhookSecret, payload);
    return expected === signature;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/payments/gateway/ apps/api/src/common/utils/
git commit -m "feat: add payment gateway adapter and crypto utilities"
```

---

### Task 3: Payments Module — PromptPay + Webhook + Poller

**Interfaces:**
- Consumes: `WalletService.credit()`, `PaymentGatewayService`
- Produces: `PaymentsService.createPromptPay(userId, amount)`, `PaymentsService.handleWebhook(payload, signature)`, `PaymentsService.getPayment(id, userId)`

- [ ] **Step 1: Write failing payments e2e test**

`apps/api/test/payments.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Payments (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `pay+${Date.now()}@test.com`, password: 'Test1234!', displayName: 'Payer' });
    token = res.body.data.accessToken;
  });

  afterAll(() => app.close());

  it('POST /payments/promptpay validates minimum amount', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/promptpay')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 5 }) // below minimum 10
      .expect(400);
    expect(res.body.success).toBe(false);
  });

  it('GET /payments/:id returns 404 for unknown payment', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/payments/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
```

- [ ] **Step 2: Run — expect fail**

```bash
npm run test:e2e -- --testPathPattern=payments
```

Expected: FAIL — `Cannot POST /api/v1/payments/promptpay`

- [ ] **Step 3: Write CreatePromptPayDto**

`apps/api/src/payments/dto/create-promptpay.dto.ts`:
```typescript
import { IsNumber, Min, Max } from 'class-validator';

export class CreatePromptPayDto {
  @IsNumber()
  @Min(10)
  @Max(100000)
  amount: number;
}
```

- [ ] **Step 4: Write PaymentsService**

`apps/api/src/payments/payments.service.ts`:
```typescript
import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { PaymentGatewayService } from './gateway/payment-gateway.service';
import { CreatePromptPayDto } from './dto/create-promptpay.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private gateway: PaymentGatewayService,
    @InjectQueue('payments') private paymentsQueue: Queue,
  ) {}

  async createPromptPay(userId: string, dto: CreatePromptPayDto) {
    const payment = await this.prisma.payment.create({
      data: {
        userId,
        paymentMethod: 'PROMPTPAY',
        amount: dto.amount,
        currency: 'THB',
        status: 'PENDING',
      },
    });

    try {
      const qrResult = await this.gateway.createPromptPayQr(dto.amount, payment.id);

      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          gatewayReference: qrResult.chargeId,
          qrCodeUrl: qrResult.qrCodeUrl,
          expiresAt: qrResult.expiresAt,
        },
      });

      // Enqueue poller job — polls every 10s for up to 15 minutes
      await this.paymentsQueue.add(
        'poll-payment',
        { paymentId: payment.id, chargeId: qrResult.chargeId },
        {
          delay: 10000,
          attempts: 90, // 15 min / 10s
          backoff: { type: 'fixed', delay: 10000 },
          removeOnComplete: true,
        },
      );

      return updated;
    } catch (error) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      this.logger.error('Failed to create PromptPay QR', error);
      throw new BadRequestException('Failed to create payment. Please try again.');
    }
  }

  async getPayment(id: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.userId !== userId) throw new UnauthorizedException();
    return payment;
  }

  async handleWebhook(rawBody: string, signature: string) {
    const valid = this.gateway.verifyWebhookSignature(rawBody, signature);
    if (!valid) throw new BadRequestException('Invalid webhook signature');

    const payload = JSON.parse(rawBody) as { referenceNo: string; status: string; paidAt?: string };

    const payment = await this.prisma.payment.findFirst({
      where: { gatewayReference: payload.referenceNo },
    });

    if (!payment || payment.status !== 'PENDING') return { received: true };

    if (payload.status === 'paid' || payload.status === 'pay') {
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'COMPLETED', paidAt: payload.paidAt ? new Date(payload.paidAt) : new Date() },
        });
        await this.wallet.credit(
          payment.userId,
          Number(payment.amount),
          payment.id,
          'PAYMENT',
          { paymentMethod: 'PROMPTPAY' },
        );
      });

      this.logger.log(`Wallet credited ${payment.amount} for user ${payment.userId}`);
    }

    return { received: true };
  }
}
```

- [ ] **Step 5: Write PaymentsProcessor (BullMQ poller)**

`apps/api/src/payments/payments.processor.ts`:
```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { PaymentGatewayService } from './gateway/payment-gateway.service';

@Processor('payments')
export class PaymentsProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentsProcessor.name);

  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private gateway: PaymentGatewayService,
  ) {
    super();
  }

  async process(job: Job<{ paymentId: string; chargeId: string }>) {
    const { paymentId, chargeId } = job.data;

    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.status !== 'PENDING') return;

    const chargeStatus = await this.gateway.getChargeStatus(chargeId);

    if (chargeStatus.status === 'paid') {
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: paymentId },
          data: { status: 'COMPLETED', paidAt: chargeStatus.paidAt ?? new Date() },
        });
        await this.wallet.credit(payment.userId, Number(payment.amount), paymentId, 'PAYMENT');
      });
      this.logger.log(`Payment ${paymentId} completed via polling`);
    } else if (chargeStatus.status === 'expired' || chargeStatus.status === 'failed') {
      await this.prisma.payment.update({ where: { id: paymentId }, data: { status: 'EXPIRED' } });
      // Stop polling by not rethrowing — BullMQ completes the job
    } else {
      // Still pending — rethrow to trigger next attempt
      throw new Error(`Payment ${paymentId} still pending`);
    }
  }
}
```

- [ ] **Step 6: Write PaymentsController**

`apps/api/src/payments/payments.controller.ts`:
```typescript
import { Body, Controller, Get, Headers, Param, Post, RawBody, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import { CreatePromptPayDto } from './dto/create-promptpay.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('promptpay')
  createPromptPay(@CurrentUser() user: { id: string }, @Body() dto: CreatePromptPayDto) {
    return this.payments.createPromptPay(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getPayment(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.payments.getPayment(id, user.id);
  }

  // Webhook — no JWT auth, verified by HMAC
  @Post('webhook')
  handleWebhook(
    @RawBody() rawBody: Buffer,
    @Headers('x-gbpay-signature') signature: string,
  ) {
    return this.payments.handleWebhook(rawBody.toString('utf8'), signature);
  }
}
```

- [ ] **Step 7: Write PaymentsModule**

`apps/api/src/payments/payments.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsProcessor } from './payments.processor';
import { PaymentGatewayService } from './gateway/payment-gateway.service';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    WalletModule,
    BullModule.registerQueue({ name: 'payments' }),
  ],
  providers: [PaymentsService, PaymentsProcessor, PaymentGatewayService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
```

Add BullMQ Redis connection to AppModule:

`apps/api/src/app.module.ts` — add to imports:
```typescript
import { BullModule } from '@nestjs/bullmq';

// Inside @Module imports array:
BullModule.forRootAsync({
  useFactory: (config: ConfigService) => ({
    connection: { url: config.get<string>('redis.url') },
  }),
  inject: [ConfigService],
}),
```

- [ ] **Step 8: Run payments tests — expect pass**

```bash
npm run test:e2e -- --testPathPattern=payments
```

Expected: 2 tests PASS

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/payments/
git commit -m "feat: implement PromptPay payments — QR generation, webhook, BullMQ poller"
```

---

### Phase 2 Completion Checklist

- [ ] `WalletService.credit/debit/lock/unlock` all atomic via Prisma `$transaction`
- [ ] `GET /wallet` returns balance for authenticated user
- [ ] `GET /wallet/transactions` returns paginated ledger
- [ ] `POST /payments/promptpay` creates QR charge and enqueues poller
- [ ] `POST /payments/webhook` verifies HMAC and credits wallet idempotently
- [ ] Payment poller worker retries until paid/expired
- [ ] All amounts handled as `Decimal` (never JS float)
