import { Injectable, Logger } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { WalletTransactionType, CashbackType } from '@prisma/client';
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
    const cashbackAmount =
      rule.cashbackType === CashbackType.PERCENTAGE
        ? Math.round((orderAmount * Number(rule.value)) / 100 * 100) / 100
        : Math.min(Number(rule.value), orderAmount);

    if (cashbackAmount <= 0) return 0;

    await this.prisma.$transaction(async (tx) => {
      // Update order cashbackAmount inside tx
      await tx.order.update({
        where: { id: orderId },
        data: { cashbackAmount: new Decimal(cashbackAmount) },
      });

      // Look up wallet and credit
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      await this.wallet.credit(
        tx,
        wallet.id,
        new Decimal(cashbackAmount.toString()),
        WalletTransactionType.CASHBACK_CREDIT,
        `Cashback for order`,
        orderId,
        'CASHBACK',
      );
    });

    this.logger.log(`Cashback ${cashbackAmount} THB credited to user ${userId} for order ${orderId}`);
    return cashbackAmount;
  }
}
