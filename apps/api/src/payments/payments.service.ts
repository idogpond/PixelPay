import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Decimal } from '@prisma/client/runtime/library';
import { PaymentMethod, PaymentStatus, WalletTransactionType } from '@prisma/client';
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
        paymentMethod: PaymentMethod.PROMPTPAY,
        amount: new Decimal(dto.amount.toString()),
        currency: 'THB',
        status: PaymentStatus.PENDING,
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
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
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

    const payload = JSON.parse(rawBody) as {
      referenceNo: string;
      status: string;
      paidAt?: string;
    };

    const payment = await this.prisma.payment.findFirst({
      where: { gatewayReference: payload.referenceNo },
    });

    // Idempotency: skip if not pending
    if (!payment || payment.status !== PaymentStatus.PENDING) return { received: true };

    if (payload.status === 'paid' || payload.status === 'pay') {
      await this.prisma.$transaction(async (tx) => {
        // 1. Update payment status with atomic idempotency guard
        const updated = await tx.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.PENDING },
          data: {
            status: PaymentStatus.COMPLETED,
            paidAt: payload.paidAt ? new Date(payload.paidAt) : new Date(),
          },
        });

        // If another concurrent request already processed it, bail out
        if (updated.count === 0) return;

        // 2. Look up wallet by userId inside tx
        const walletRecord = await tx.wallet.findUniqueOrThrow({
          where: { userId: payment.userId },
        });

        // 3. Credit wallet using actual signature (tx, walletId, amount, type, description, referenceId, referenceType)
        await this.wallet.credit(
          tx,
          walletRecord.id,
          payment.amount, // Decimal — don't call Number() on it
          WalletTransactionType.DEPOSIT,
          'PromptPay deposit',
          payment.id,
          'PAYMENT',
        );
      });

      this.logger.log(`Wallet credited ${payment.amount} for user ${payment.userId}`);
    }

    return { received: true };
  }
}
