import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { OrderStatus, WalletTransactionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { ProvidersService } from '../providers/providers.service';
import { CashbackService } from '../cashback/cashback.service';
import { AffiliatesService } from '../affiliates/affiliates.service';
import { NotificationsService } from '../notifications/notifications.service';
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
    private cashback: CashbackService,
    private affiliates: AffiliatesService,
    private notificationsService: NotificationsService,
    private gateway: OrdersGateway,
  ) {
    super();
  }

  async process(job: Job<TopupJobData>) {
    const { orderId, userId, gameProductId } = job.data;

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== OrderStatus.PENDING) return;

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PROCESSING },
    });
    this.gateway.emitOrderStatus(userId, orderId, 'PROCESSING');

    const providerProducts = await this.providers.getProductProviders(gameProductId);

    if (providerProducts.length === 0) {
      await this.handleFailure(orderId, userId, order.totalPrice, 'No providers available');
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
                status: OrderStatus.COMPLETED,
                providerId: pp.providerId,
                providerOrderId: result.providerOrderId,
                providerReference: result.providerReference,
                completedAt: new Date(),
              },
            });

            const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
            await this.wallet.debitLocked(
              tx,
              wallet.id,
              order.totalPrice,
              'Topup completed',
              orderId,
              'ORDER',
            );
          });

          // Evaluate and credit cashback after successful completion
          const product = await this.prisma.gameProduct.findUnique({ where: { id: gameProductId } });
          if (product) {
            await this.cashback.evaluateAndCredit(
              userId,
              orderId,
              Number(order.totalPrice),
              product.gameId,
            );
          }

          // Award affiliate commission if buyer was referred
          const buyer = await this.prisma.user.findUnique({ where: { id: userId }, select: { referredById: true } });
          if (buyer?.referredById) {
            await this.affiliates.awardCommission(buyer.referredById, orderId, Number(order.totalPrice));
          }

          // Send order-completed notification (after transaction commits)
          try {
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
          } catch (notifErr: any) {
            this.logger.warn(`Notification send failed for order ${orderId}: ${notifErr.message}`);
          }

          this.gateway.emitOrderStatus(userId, orderId, 'COMPLETED');
          this.logger.log(`Order ${orderId} completed via ${pp.provider.slug}`);
          return;
        }

        lastError = result.failureReason ?? 'Provider returned failure';
        this.logger.warn(`Provider ${pp.provider.slug} failed for order ${orderId}: ${lastError}`);

        await this.prisma.order.update({
          where: { id: orderId },
          data: { retryCount: { increment: 1 } },
        });
      } catch (error: any) {
        lastError = error.message;
        this.logger.error(`Exception from ${pp.provider.slug}: ${error.message}`);
        await this.prisma.order.update({ where: { id: orderId }, data: { retryCount: { increment: 1 } } });
      }
    }

    // All providers exhausted
    await this.handleFailure(orderId, userId, order.totalPrice, lastError);
  }

  private async handleFailure(
    orderId: string,
    userId: string,
    totalPrice: Decimal,
    reason: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.FAILED, metadata: { failureReason: reason } },
      });
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      await this.wallet.unlock(
        tx,
        wallet.id,
        totalPrice,
        WalletTransactionType.TOPUP_REFUND,
        'Order failed — wallet unlocked',
        orderId,
        'ORDER',
      );
    });
    // Send order-failed notification (outside transaction)
    try {
      const order = await this.prisma.order.findUnique({ where: { id: orderId } });
      const failedProduct = order
        ? await this.prisma.gameProduct.findUnique({ where: { id: order.gameProductId }, select: { name: true } })
        : null;
      await this.notificationsService.send({
        userId,
        type: 'ORDER_FAILED',
        channel: 'EMAIL',
        title: 'Order Failed',
        body: `Your order could not be completed. Balance refunded.`,
        metadata: {
          orderNumber: order?.orderNumber,
          productName: failedProduct?.name,
        },
      });
    } catch (notifErr: any) {
      this.logger.warn(`Notification send failed for failed order ${orderId}: ${notifErr.message}`);
    }

    this.gateway.emitOrderStatus(userId, orderId, 'FAILED');
    this.logger.error(`Order ${orderId} failed: ${reason}`);
  }
}
