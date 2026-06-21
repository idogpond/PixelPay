# Phase 5: Notifications & Audit Logging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Build a multi-channel notification system (email, SMS, in-app) using a BullMQ queue, and a structured audit logging interceptor that records all admin actions and financial mutations.

**Architecture:** `NotificationsService` enqueues notification jobs. `NotificationsProcessor` dequeues and dispatches via Nodemailer (email) or Twilio (SMS). In-app notifications are stored in DB and returned via REST. The `AuditInterceptor` wraps admin and financial endpoints, captures before/after state, and writes to `audit_logs`.

**Tech Stack:** BullMQ, Nodemailer, Twilio SDK, NestJS interceptors

## Global Constraints

- Notification BullMQ queue name: `notifications`
- Email templates are plain-string for MVP (no templating engine dependency)
- SMS sent only when user has a verified phone number
- Audit log entries are append-only — never updated or deleted
- Audit interceptor attached per-route via `@UseInterceptors(AuditInterceptor)` on admin controllers

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/api/src/notifications/notifications.service.ts` | Create | enqueue notification job |
| `apps/api/src/notifications/notifications.processor.ts` | Create | BullMQ worker: email, SMS, in-app |
| `apps/api/src/notifications/notifications.controller.ts` | Create | GET /notifications, PATCH read |
| `apps/api/src/notifications/notifications.module.ts` | Create | NotificationsModule |
| `apps/api/src/notifications/channels/email.channel.ts` | Create | Nodemailer email dispatch |
| `apps/api/src/notifications/channels/sms.channel.ts` | Create | Twilio SMS dispatch |
| `apps/api/src/notifications/templates/order-completed.ts` | Create | Email + SMS templates |
| `apps/api/src/notifications/templates/order-failed.ts` | Create | Email + SMS templates |
| `apps/api/src/notifications/templates/payment-received.ts` | Create | Email template |
| `apps/api/src/audit/audit.service.ts` | Create | log(userId, action, entity, old, new, ip) |
| `apps/api/src/audit/audit.interceptor.ts` | Create | NestJS interceptor for audit |
| `apps/api/src/audit/audit.module.ts` | Create | AuditModule |
| `apps/api/src/orders/orders.processor.ts` | Modify | enqueue notifications on COMPLETED/FAILED |

---

### Task 1: Notification Service & BullMQ Worker

**Interfaces:**
- Produces: `NotificationsService.send(userId, type, channel, title, body, metadata?)`, `NotificationsService.findByUser(userId, page, limit)`

- [ ] **Step 1: Write email channel**

`apps/api/src/notifications/channels/email.channel.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailChannel {
  private readonly logger = new Logger(EmailChannel.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get<string>('SMTP_HOST'),
      port: config.get<number>('SMTP_PORT'),
      auth: {
        user: config.get<string>('SMTP_USER'),
        pass: config.get<string>('SMTP_PASS'),
      },
    });
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.config.get<string>('SMTP_FROM'),
        to,
        subject,
        html,
      });
    } catch (error: any) {
      this.logger.error(`Email send failed to ${to}: ${error.message}`);
      throw error;
    }
  }
}
```

- [ ] **Step 2: Write SMS channel**

`apps/api/src/notifications/channels/sms.channel.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

@Injectable()
export class SmsChannel {
  private readonly logger = new Logger(SmsChannel.name);
  private client: ReturnType<typeof twilio>;
  private from: string;

  constructor(private config: ConfigService) {
    this.client = twilio(
      config.get<string>('TWILIO_ACCOUNT_SID'),
      config.get<string>('TWILIO_AUTH_TOKEN'),
    );
    this.from = config.get<string>('TWILIO_FROM') ?? '';
  }

  async send(to: string, body: string): Promise<void> {
    try {
      await this.client.messages.create({ from: this.from, to, body });
    } catch (error: any) {
      this.logger.error(`SMS send failed to ${to}: ${error.message}`);
      // Don't rethrow — SMS failure shouldn't break the order flow
    }
  }
}
```

- [ ] **Step 3: Write notification templates**

`apps/api/src/notifications/templates/order-completed.ts`:
```typescript
export const orderCompletedEmail = (params: { displayName: string; orderNumber: string; productName: string; gameUid: string }) => ({
  subject: `[PixelPay] Order ${params.orderNumber} Completed ✓`,
  html: `
    <h2>Hi ${params.displayName},</h2>
    <p>Your order <strong>${params.orderNumber}</strong> has been completed successfully!</p>
    <p><strong>Product:</strong> ${params.productName}<br>
    <strong>Game UID:</strong> ${params.gameUid}</p>
    <p>Thank you for using PixelPay!</p>
  `,
});

export const orderCompletedSms = (params: { orderNumber: string; productName: string }) =>
  `[PixelPay] Order ${params.orderNumber} completed: ${params.productName}. Thank you!`;
```

`apps/api/src/notifications/templates/order-failed.ts`:
```typescript
export const orderFailedEmail = (params: { displayName: string; orderNumber: string; productName: string }) => ({
  subject: `[PixelPay] Order ${params.orderNumber} Failed`,
  html: `
    <h2>Hi ${params.displayName},</h2>
    <p>Unfortunately, your order <strong>${params.orderNumber}</strong> for <strong>${params.productName}</strong> could not be completed.</p>
    <p>Your wallet balance has been refunded. Please try again or contact support.</p>
  `,
});

export const orderFailedSms = (params: { orderNumber: string }) =>
  `[PixelPay] Order ${params.orderNumber} failed. Your balance has been refunded.`;
```

`apps/api/src/notifications/templates/payment-received.ts`:
```typescript
export const paymentReceivedEmail = (params: { displayName: string; amount: number }) => ({
  subject: `[PixelPay] Wallet Top-Up Successful`,
  html: `
    <h2>Hi ${params.displayName},</h2>
    <p>Your wallet has been topped up with <strong>${params.amount} THB</strong>.</p>
    <p>Your balance is now ready to use on PixelPay.</p>
  `,
});
```

- [ ] **Step 4: Write NotificationsService**

`apps/api/src/notifications/notifications.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

export type NotificationChannel = 'EMAIL' | 'SMS' | 'IN_APP';

export interface SendNotificationDto {
  userId: string;
  type: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('notifications') private queue: Queue,
  ) {}

  async send(dto: SendNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        channel: dto.channel,
        title: dto.title,
        body: dto.body,
        metadata: dto.metadata ?? {},
      },
    });

    await this.queue.add('dispatch', { notificationId: notification.id }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: true,
    });

    return notification;
  }

  findByUser(userId: string, page = 1, limit = 20) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }).then(async (items) => {
      const total = await this.prisma.notification.count({ where: { userId } });
      const unread = await this.prisma.notification.count({ where: { userId, isRead: false } });
      return { items, total, unread, page, limit };
    });
  }

  markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}
```

- [ ] **Step 5: Write NotificationsProcessor**

`apps/api/src/notifications/notifications.processor.ts`:
```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';
import { orderCompletedEmail, orderCompletedSms } from './templates/order-completed';
import { orderFailedEmail, orderFailedSms } from './templates/order-failed';
import { paymentReceivedEmail } from './templates/payment-received';

@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailChannel,
    private sms: SmsChannel,
  ) {
    super();
  }

  async process(job: Job<{ notificationId: string }>) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: job.data.notificationId },
      include: { user: { select: { email: true, phone: true, displayName: true } } },
    });

    if (!notification) return;

    await this.dispatch(notification);

    await this.prisma.notification.update({
      where: { id: notification.id },
      data: { sentAt: new Date() },
    });
  }

  private async dispatch(notification: any) {
    const { user, type, channel, title, body, metadata } = notification;

    if (channel === 'IN_APP') return; // Already stored in DB

    if (channel === 'EMAIL' && user.email) {
      const template = this.getEmailTemplate(type, user.displayName, metadata);
      await this.email.send(user.email, template?.subject ?? title, template?.html ?? `<p>${body}</p>`);
    }

    if (channel === 'SMS' && user.phone) {
      const smsBody = this.getSmsTemplate(type, metadata) ?? body;
      await this.sms.send(user.phone, smsBody);
    }
  }

  private getEmailTemplate(type: string, displayName: string, meta: any) {
    switch (type) {
      case 'ORDER_COMPLETED':
        return orderCompletedEmail({ displayName, orderNumber: meta.orderNumber, productName: meta.productName, gameUid: meta.gameUid });
      case 'ORDER_FAILED':
        return orderFailedEmail({ displayName, orderNumber: meta.orderNumber, productName: meta.productName });
      case 'PAYMENT_RECEIVED':
        return paymentReceivedEmail({ displayName, amount: meta.amount });
      default:
        return null;
    }
  }

  private getSmsTemplate(type: string, meta: any) {
    switch (type) {
      case 'ORDER_COMPLETED':
        return orderCompletedSms({ orderNumber: meta.orderNumber, productName: meta.productName });
      case 'ORDER_FAILED':
        return orderFailedSms({ orderNumber: meta.orderNumber });
      default:
        return null;
    }
  }
}
```

- [ ] **Step 6: Write NotificationsController and Module**

`apps/api/src/notifications/notifications.controller.ts`:
```typescript
import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  findAll(
    @CurrentUser() user: { id: string },
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.notifications.findByUser(user.id, +page, +limit);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.notifications.markRead(id, user.id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: { id: string }) {
    return this.notifications.markAllRead(user.id);
  }
}
```

`apps/api/src/notifications/notifications.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsController } from './notifications.controller';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';

@Module({
  imports: [BullModule.registerQueue({ name: 'notifications' })],
  providers: [NotificationsService, NotificationsProcessor, EmailChannel, SmsChannel],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

- [ ] **Step 7: Integrate into TopupProcessor**

After `COMPLETED` in `orders.processor.ts`:
```typescript
const product = await this.prisma.gameProduct.findUnique({ where: { id: job.data.gameProductId }, select: { name: true } });
const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });

await this.notificationsService.send({
  userId,
  type: 'ORDER_COMPLETED',
  channel: 'EMAIL',
  title: 'Order Completed',
  body: `Your order ${order.orderNumber} has been completed.`,
  metadata: {
    orderNumber: order.orderNumber,
    productName: product?.name,
    gameUid: order.gameUid,
  },
});
```

After `FAILED`:
```typescript
await this.notificationsService.send({
  userId,
  type: 'ORDER_FAILED',
  channel: 'EMAIL',
  title: 'Order Failed',
  body: `Your order could not be completed. Balance refunded.`,
  metadata: { orderNumber: order.orderNumber, productName: product?.name },
});
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/notifications/
git commit -m "feat: notification system — email, SMS, in-app via BullMQ"
```

---

### Task 2: Audit Logging

**Interfaces:**
- Produces: `AuditService.log(params)`, `AuditInterceptor` (NestJS interceptor)

- [ ] **Step 1: Write AuditService**

`apps/api/src/audit/audit.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogParams {
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  log(params: AuditLogParams) {
    return this.prisma.auditLog.create({ data: params });
  }

  findAll(page = 1, limit = 50, filters?: { userId?: string; entityType?: string; action?: string }) {
    const where = {
      ...(filters?.userId && { userId: filters.userId }),
      ...(filters?.entityType && { entityType: filters.entityType }),
      ...(filters?.action && { action: { contains: filters.action } }),
    };
    return this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }
}
```

- [ ] **Step 2: Write AuditInterceptor**

`apps/api/src/audit/audit.interceptor.ts`:
```typescript
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    const action = `${req.method}:${ctx.getClass().name}:${ctx.getHandler().name}`;

    return next.handle().pipe(
      tap((responseData) => {
        this.audit.log({
          userId: user?.id,
          action,
          newValues: typeof responseData === 'object' ? responseData as Record<string, unknown> : { value: responseData },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        }).catch(() => {}); // Never let audit failure break the response
      }),
    );
  }
}
```

- [ ] **Step 3: Write AuditModule**

`apps/api/src/audit/audit.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';

@Module({
  providers: [AuditService, AuditInterceptor],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}
```

- [ ] **Step 4: Write unit test for audit log**

`apps/api/src/audit/audit.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  const mockCreate = jest.fn().mockResolvedValue({ id: 'audit-1' });

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: { auditLog: { create: mockCreate, findMany: jest.fn().mockResolvedValue([]) } } },
      ],
    }).compile();
    service = module.get(AuditService);
  });

  it('logs with all params', async () => {
    await service.log({ userId: 'u1', action: 'POST:AdminController:banUser', newValues: { banned: true } });
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', action: expect.stringContaining('banUser') }),
    });
  });

  it('findAll returns array', async () => {
    const result = await service.findAll();
    expect(Array.isArray(result)).toBe(true);
  });
});
```

Run: `cd apps/api && npm test -- audit`
Expected: 2 PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/audit/
git commit -m "feat: audit logging service and interceptor"
```

---

### Phase 5 Completion Checklist

- [ ] `NotificationsService.send()` enqueues to `notifications` BullMQ queue
- [ ] `NotificationsProcessor` dispatches email via Nodemailer
- [ ] `NotificationsProcessor` dispatches SMS via Twilio (gracefully skips on error)
- [ ] `GET /notifications` returns paginated list with `unread` count
- [ ] `PATCH /notifications/:id/read` and `PATCH /notifications/read-all` work
- [ ] Order completion triggers email + in-app notifications
- [ ] Order failure triggers email notification and wallet refund
- [ ] `AuditService.log()` writes immutable records to `audit_logs`
- [ ] `AuditInterceptor` can be applied per-route with `@UseInterceptors(AuditInterceptor)`
