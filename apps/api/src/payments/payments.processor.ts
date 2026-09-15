import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PaymentStatus, WalletTransactionType } from '@prisma/client';
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
    if (!payment || payment.status !== PaymentStatus.PENDING) return;

    if (payment.expiresAt && payment.expiresAt < new Date()) {
      await this.prisma.payment.updateMany({
        where: { id: paymentId, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.EXPIRED },
      });
      return; // stop polling — do not rethrow
    }

    const chargeStatus = await this.gateway.getChargeStatus(chargeId);

    if (chargeStatus.status === 'paid') {
      await this.prisma.$transaction(async (tx) => {
        // 1. Update payment status with atomic idempotency guard
        const updated = await tx.payment.updateMany({
          where: { id: paymentId, status: PaymentStatus.PENDING },
          data: {
            status: PaymentStatus.COMPLETED,
            paidAt: new Date(),
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
          'PromptPay deposit via poller',
          payment.id,
          'PAYMENT',
        );
      });

      this.logger.log(`Payment ${paymentId} completed via polling`);
    } else {
      // Still pending — rethrow to trigger next attempt. If attempts run out before the
      // payment's own expiresAt, the next scheduled attempt (or the webhook) catches it;
      // the expiresAt check above is what ultimately marks a truly abandoned QR as EXPIRED.
      throw new Error(`Payment ${paymentId} still pending`);
    }
  }

  // GB Prime Pay never reports a QR as "expired" or "failed" — once the last poll attempt
  // is exhausted with the payment still pending, this is the only remaining place that
  // closes it out so it doesn't stay PENDING forever.
  @OnWorkerEvent('failed')
  async onFailed(job: Job<{ paymentId: string; chargeId: string }>) {
    if ((job.attemptsMade ?? 0) < (job.opts.attempts ?? 0)) return; // more retries left

    await this.prisma.payment.updateMany({
      where: { id: job.data.paymentId, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.EXPIRED },
    });
  }
}
