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
   * Credit is safe without a guard since it only increases balance.
   */
  async credit(
    tx: PrismaTx,
    walletId: string,
    amount: Decimal | number | string,
    type: WalletTransactionType,
    description: string,
    referenceId?: string,
    referenceType?: string,
  ) {
    const amountDecimal = new Decimal(amount.toString());

    // Read balance before for the transaction record (for audit purposes only — not used in update)
    const walletBefore = await tx.wallet.findUniqueOrThrow({
      where: { id: walletId },
      select: { id: true, balance: true },
    });
    const balanceBefore = new Decimal(walletBefore.balance.toString());
    const balanceAfter = balanceBefore.add(amountDecimal);

    const [updatedWallet, txRecord] = await Promise.all([
      tx.wallet.update({
        where: { id: walletId },
        data: { balance: { increment: amountDecimal } },
      }),
      tx.walletTransaction.create({
        data: {
          walletId,
          type,
          amount: amountDecimal,
          balanceBefore,
          balanceAfter,
          referenceId,
          referenceType: referenceType ?? null,
          metadata: { description },
        },
      }),
    ]);

    return { wallet: updatedWallet, transaction: txRecord };
  }

  /**
   * Subtracts amount from wallet balance (throws if insufficient).
   * Internal — accepts Prisma transaction client as first arg.
   * Uses atomic conditional updateMany to prevent lost-update / double-spend.
   */
  async debit(
    tx: PrismaTx,
    walletId: string,
    amount: Decimal | number | string,
    type: WalletTransactionType,
    description: string,
    referenceId?: string,
    referenceType?: string,
  ) {
    const amountDecimal = new Decimal(amount.toString());

    // Read snapshot for the audit record
    const walletBefore = await tx.wallet.findUniqueOrThrow({
      where: { id: walletId },
      select: { id: true, balance: true },
    });
    const balanceBefore = new Decimal(walletBefore.balance.toString());
    const balanceAfter = balanceBefore.sub(amountDecimal);

    // Atomic guard: only decrement if balance is still sufficient
    const updated = await tx.wallet.updateMany({
      where: { id: walletId, balance: { gte: amountDecimal } },
      data: { balance: { decrement: amountDecimal } },
    });

    if (updated.count === 0) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const txRecord = await tx.walletTransaction.create({
      data: {
        walletId,
        type,
        amount: amountDecimal,
        balanceBefore,
        balanceAfter,
        referenceId,
        referenceType: referenceType ?? null,
        metadata: { description },
      },
    });

    const updatedWallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });
    return { wallet: updatedWallet, transaction: txRecord };
  }

  /**
   * Moves amount from balance to lockedBalance. Creates LOCK transaction.
   * Internal — accepts Prisma transaction client as first arg.
   * Uses atomic conditional updateMany to prevent lost-update / double-spend.
   */
  async lock(
    tx: PrismaTx,
    walletId: string,
    amount: Decimal | number | string,
    description: string,
    referenceId?: string,
    referenceType?: string,
  ) {
    const amountDecimal = new Decimal(amount.toString());

    // Read snapshot for the audit record
    const walletBefore = await tx.wallet.findUniqueOrThrow({
      where: { id: walletId },
      select: { id: true, balance: true, lockedBalance: true },
    });
    const balanceBefore = new Decimal(walletBefore.balance.toString());
    const balanceAfter = balanceBefore.sub(amountDecimal);

    // Atomic guard: only move to locked if balance is still sufficient
    const updated = await tx.wallet.updateMany({
      where: { id: walletId, balance: { gte: amountDecimal } },
      data: {
        balance: { decrement: amountDecimal },
        lockedBalance: { increment: amountDecimal },
      },
    });

    if (updated.count === 0) {
      throw new BadRequestException('Insufficient balance to lock');
    }

    const txRecord = await tx.walletTransaction.create({
      data: {
        walletId,
        type: WalletTransactionType.LOCK,
        amount: amountDecimal,
        balanceBefore,
        balanceAfter,
        referenceId,
        referenceType: referenceType ?? null,
        metadata: { description },
      },
    });

    const updatedWallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });
    return { wallet: updatedWallet, transaction: txRecord };
  }

  /**
   * Moves amount back from lockedBalance to balance (for refunds). type = UNLOCK.
   * Internal — accepts Prisma transaction client as first arg.
   * Uses atomic conditional updateMany to prevent lost-update.
   */
  async unlock(
    tx: PrismaTx,
    walletId: string,
    amount: Decimal | number | string,
    type: WalletTransactionType,
    description: string,
    referenceId?: string,
    referenceType?: string,
  ) {
    const amountDecimal = new Decimal(amount.toString());

    // Read snapshot for the audit record
    const walletBefore = await tx.wallet.findUniqueOrThrow({
      where: { id: walletId },
      select: { id: true, balance: true, lockedBalance: true },
    });
    const balanceBefore = new Decimal(walletBefore.balance.toString());
    const balanceAfter = balanceBefore.add(amountDecimal);

    // Atomic guard: only move from locked if lockedBalance is sufficient
    const updated = await tx.wallet.updateMany({
      where: { id: walletId, lockedBalance: { gte: amountDecimal } },
      data: {
        balance: { increment: amountDecimal },
        lockedBalance: { decrement: amountDecimal },
      },
    });

    if (updated.count === 0) {
      throw new BadRequestException('Insufficient locked balance to unlock');
    }

    const txRecord = await tx.walletTransaction.create({
      data: {
        walletId,
        type,
        amount: amountDecimal,
        balanceBefore,
        balanceAfter,
        referenceId,
        referenceType: referenceType ?? null,
        metadata: { description },
      },
    });

    const updatedWallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });
    return { wallet: updatedWallet, transaction: txRecord };
  }

  /**
   * Reduces lockedBalance (for completing a topup — balance unchanged). type = TOPUP_DEBIT.
   * Internal — accepts Prisma transaction client as first arg.
   * Uses atomic conditional updateMany to prevent lost-update.
   */
  async debitLocked(
    tx: PrismaTx,
    walletId: string,
    amount: Decimal | number | string,
    description: string,
    referenceId?: string,
    referenceType?: string,
  ) {
    const amountDecimal = new Decimal(amount.toString());

    // Read snapshot for the audit record
    const walletBefore = await tx.wallet.findUniqueOrThrow({
      where: { id: walletId },
      select: { id: true, balance: true, lockedBalance: true },
    });
    const balanceBefore = new Decimal(walletBefore.balance.toString());

    // Atomic guard: only decrement lockedBalance if sufficient
    const updated = await tx.wallet.updateMany({
      where: { id: walletId, lockedBalance: { gte: amountDecimal } },
      data: { lockedBalance: { decrement: amountDecimal } },
    });

    if (updated.count === 0) {
      throw new BadRequestException('Insufficient locked balance');
    }

    const txRecord = await tx.walletTransaction.create({
      data: {
        walletId,
        type: WalletTransactionType.TOPUP_DEBIT,
        amount: amountDecimal,
        balanceBefore,
        balanceAfter: balanceBefore, // balance unchanged
        referenceId,
        referenceType: referenceType ?? null,
        metadata: { description },
      },
    });

    const updatedWallet = await tx.wallet.findUniqueOrThrow({ where: { id: walletId } });
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
