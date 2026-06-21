import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AffiliateStatus, CommissionStatus } from '@prisma/client';

@Injectable()
export class AffiliatesService {
  private readonly logger = new Logger(AffiliatesService.name);

  constructor(private prisma: PrismaService) {}

  async getOrCreateAffiliate(userId: string) {
    const existing = await this.prisma.affiliate.findUnique({ where: { userId } });
    if (existing) return existing;

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.prisma.affiliate.create({
      data: {
        userId,
        referralCode: user.referralCode,
        commissionRate: 2.0,
        status: AffiliateStatus.ACTIVE,
      },
    });
  }

  async getDashboard(userId: string) {
    const affiliate = await this.getOrCreateAffiliate(userId);
    return {
      referralCode: affiliate.referralCode,
      totalReferrals: affiliate.totalReferrals,
      totalEarnings: Number(affiliate.totalEarnings),
      pendingEarnings: Number(affiliate.pendingEarnings),
      status: affiliate.status,
    };
  }

  async getCommissions(userId: string, page = 1, limit = 20) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { userId } });
    if (!affiliate) return { items: [], total: 0, page, limit };

    const [items, total] = await Promise.all([
      this.prisma.affiliateCommission.findMany({
        where: { affiliateId: affiliate.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { order: { select: { orderNumber: true, totalPrice: true, createdAt: true } } },
      }),
      this.prisma.affiliateCommission.count({ where: { affiliateId: affiliate.id } }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        commissionAmount: Number(item.commissionAmount),
        order: {
          ...item.order,
          totalPrice: Number(item.order.totalPrice),
        },
      })),
      total,
      page,
      limit,
    };
  }

  async awardCommission(referrerId: string, orderId: string, orderAmount: number) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { userId: referrerId } });
    if (!affiliate || affiliate.status !== AffiliateStatus.ACTIVE) return;

    const commissionAmount = Math.round((orderAmount * Number(affiliate.commissionRate)) / 100 * 100) / 100;
    if (commissionAmount <= 0) return;

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });

      await tx.affiliateCommission.create({
        data: {
          affiliateId: affiliate.id,
          referredUserId: order.userId,
          orderId,
          commissionAmount,
          status: CommissionStatus.PENDING,
        },
      });

      await tx.affiliate.update({
        where: { id: affiliate.id },
        data: {
          pendingEarnings: { increment: commissionAmount },
          totalEarnings: { increment: commissionAmount },
        },
      });
    });

    this.logger.log(`Commission ${commissionAmount} THB awarded to affiliate ${referrerId} for order ${orderId}`);
  }

  async processReferral(newUserId: string, referralCode: string) {
    const referrer = await this.prisma.user.findUnique({ where: { referralCode } });
    if (!referrer || referrer.id === newUserId) return;

    // Increment totalReferrals for the referrer
    const affiliate = await this.prisma.affiliate.findUnique({ where: { userId: referrer.id } });
    if (affiliate) {
      await this.prisma.affiliate.update({
        where: { id: affiliate.id },
        data: { totalReferrals: { increment: 1 } },
      });
    }

    this.logger.log(`User ${newUserId} referred by ${referrer.id}`);
  }
}
