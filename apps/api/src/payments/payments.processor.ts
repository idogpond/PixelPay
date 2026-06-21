import { Processor, WorkerHost } from '@nestjs/bullmq';
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

    const chargeStatus = await this.gateway.getChargeStatus(chargeId);

    if (chargeStatus.status === 'paid') {
      await this.prisma.$transaction(async (tx) => {
        // 1. Update payment status with atomic idempotency guard
        const updated = await tx.payment.updateMany({
          where: { id: paymentId, status: PaymentStatus.PENDING },
          data: {
            status: PaymentStatus.COMPLETED,
            paidAt: chargeStatus.paidAt ?? new Date(),
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
    } else if (chargeStatus.status === 'expired' || chargeStatus.status === 'failed') {
      await this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.EXPIRED },
      });
      // Stop polling by not rethrowing — BullMQ completes the job
    } else {
      // Still pending — rethrow to trigger next attempt
      throw new Error(`Payment ${paymentId} still pending`);
    }
  }
}
