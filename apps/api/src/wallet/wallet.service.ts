import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { WalletTransactionType } from '@prisma/client';

// Type for Prisma transaction client
type PrismaTx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  /**
   * Returns wallet with recent 20 transactions.
   * Called without a transaction context (external).
   */
  async getWallet(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  /**
   * Returns paginated transactions for a user's wallet.
   * Called without a transaction context (external).
   */
  async getTransactions(userId: string, page = 1, limit = 20) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

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

  /**
   * Adds amount to wallet balance, creates WalletTransaction record.
   * Internal — accepts Prisma transaction client as first arg.
   */
  async credit(
    tx: PrismaTx,
    walletId: string,
    amount: Decimal | number | string,
    type: WalletTransactionType,
    description: string,
    referenceId?: string,
  ) {
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { id: walletId },
      select: { id: true, balance: true },
    });

    const balanceBefore = new Decimal(wallet.balance.toString());
    const amountDecimal = new Decimal(amount.toString());
    const balanceAfter = balanceBefore.add(amountDecimal);

    const [updatedWallet, txRecord] = await Promise.all([
      tx.wallet.update({
        where: { id: walletId },
        data: { balance: balanceAfter },
      }),
      tx.walletTransaction.create({
        data: {
          walletId,
          type,
          amount: amountDecimal,
          balanceBefore,
          balanceAfter,
          referenceId,
          metadata: { description },
        },
      }),
    ]);

    return { wallet: updatedWallet, transaction: txRecord };
  }

  /**
   * Subtracts amount from wallet balance (throws if insufficient).
   * Internal — accepts Prisma transaction client as first arg.
   */
  async debit(
    tx: PrismaTx,
    walletId: string,
    amount: Decimal | number | string,
    type: WalletTransactionType,
    description: string,
    referenceId?: string,
  ) {
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { id: walletId },
      select: { id: true, balance: true },
    });

    const balanceBefore = new Decimal(wallet.balance.toString());
    const amountDecimal = new Decimal(amount.toString());

    if (balanceBefore.lessThan(amountDecimal)) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const balanceAfter = balanceBefore.sub(amountDecimal);

    const [updatedWallet, txRecord] = await Promise.all([
      tx.wallet.update({
        where: { id: walletId },
        data: { balance: balanceAfter },
      }),
      tx.walletTransaction.create({
        data: {
          walletId,
          type,
          amount: amountDecimal,
          balanceBefore,
          balanceAfter,
          referenceId,
          metadata: { description },
        },
      }),
    ]);

    return { wallet: updatedWallet, transaction: txRecord };
  }

  /**
   * Moves amount from balance to lockedBalance. Creates LOCK transaction.
   * Internal — accepts Prisma transaction client as first arg.
   */
  async lock(
    tx: PrismaTx,
    walletId: string,
    amount: Decimal | number | string,
    description: string,
    referenceId?: string,
  ) {
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { id: walletId },
      select: { id: true, balance: true, lockedBalance: true },
    });

    const balanceBefore = new Decimal(wallet.balance.toString());
    const amountDecimal = new Decimal(amount.toString());

    if (balanceBefore.lessThan(amountDecimal)) {
      throw new BadRequestException('Insufficient balance to lock');
    }

    const balanceAfter = balanceBefore.sub(amountDecimal);
    const newLockedBalance = new Decimal(wallet.lockedBalance.toString()).add(amountDecimal);

    const [updatedWallet, txRecord] = await Promise.all([
      tx.wallet.update({
        where: { id: walletId },
        data: { balance: balanceAfter, lockedBalance: newLockedBalance },
      }),
      tx.walletTransaction.create({
        data: {
          walletId,
          type: WalletTransactionType.LOCK,
          amount: amountDecimal,
          balanceBefore,
          balanceAfter,
          referenceId,
          metadata: { description },
        },
      }),
    ]);

    return { wallet: updatedWallet, transaction: txRecord };
  }

  /**
   * Moves amount back from lockedBalance to balance (for refunds). type = UNLOCK.
   * Internal — accepts Prisma transaction client as first arg.
   */
  async unlock(
    tx: PrismaTx,
    walletId: string,
    amount: Decimal | number | string,
    type: WalletTransactionType,
    description: string,
    referenceId?: string,
  ) {
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { id: walletId },
      select: { id: true, balance: true, lockedBalance: true },
    });

    const balanceBefore = new Decimal(wallet.balance.toString());
    const lockedBefore = new Decimal(wallet.lockedBalance.toString());
    const amountDecimal = new Decimal(amount.toString());

    if (lockedBefore.lessThan(amountDecimal)) {
      throw new BadRequestException('Insufficient locked balance to unlock');
    }

    const balanceAfter = balanceBefore.add(amountDecimal);
    const newLockedBalance = lockedBefore.sub(amountDecimal);

    const [updatedWallet, txRecord] = await Promise.all([
      tx.wallet.update({
        where: { id: walletId },
        data: { balance: balanceAfter, lockedBalance: newLockedBalance },
      }),
      tx.walletTransaction.create({
        data: {
          walletId,
          type,
          amount: amountDecimal,
          balanceBefore,
          balanceAfter,
          referenceId,
          metadata: { description },
        },
      }),
    ]);

    return { wallet: updatedWallet, transaction: txRecord };
  }

  /**
   * Reduces lockedBalance (for completing a topup — balance unchanged). type = TOPUP_DEBIT.
   * Internal — accepts Prisma transaction client as first arg.
   */
  async debitLocked(
    tx: PrismaTx,
    walletId: string,
    amount: Decimal | number | string,
    description: string,
    referenceId?: string,
  ) {
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { id: walletId },
      select: { id: true, balance: true, lockedBalance: true },
    });

    const balanceBefore = new Decimal(wallet.balance.toString());
    const lockedBefore = new Decimal(wallet.lockedBalance.toString());
    const amountDecimal = new Decimal(amount.toString());

    if (lockedBefore.lessThan(amountDecimal)) {
      throw new BadRequestException('Insufficient locked balance');
    }

    const newLockedBalance = lockedBefore.sub(amountDecimal);

    const [updatedWallet, txRecord] = await Promise.all([
      tx.wallet.update({
        where: { id: walletId },
        data: { lockedBalance: newLockedBalance },
      }),
      tx.walletTransaction.create({
        data: {
          walletId,
          type: WalletTransactionType.TOPUP_DEBIT,
          amount: amountDecimal,
          balanceBefore,
          balanceAfter: balanceBefore, // balance unchanged
          referenceId,
          metadata: { description },
        },
      }),
    ]);

    return { wallet: updatedWallet, transaction: txRecord };
  }

  /**
   * Admin: deposit amount to any user's wallet (manual adjustment).
   * Wraps credit() in a $transaction.
   */
  async adminDeposit(userId: string, amount: number, description?: string) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new NotFoundException('Wallet not found for user');

      return this.credit(
        tx,
        wallet.id,
        amount,
        WalletTransactionType.DEPOSIT,
        description ?? 'Admin manual deposit',
      );
    });
  }
}
