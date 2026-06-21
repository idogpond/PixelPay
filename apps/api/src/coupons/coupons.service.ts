import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

export interface CouponValidationResult {
  couponId: string;
  discountAmount: number;
  code: string;
}

@Injectable()
export class CouponsService {
  constructor(private prisma: PrismaService) {}

  async validate(userId: string, dto: ValidateCouponDto): Promise<CouponValidationResult> {
    const coupon = await this.prisma.coupon.findUnique({ where: { code: dto.code } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    if (!coupon.isActive) throw new BadRequestException('Coupon is inactive');
    if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new BadRequestException('Coupon has expired');
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('Coupon usage limit reached');
    }
    if (new Decimal(dto.orderTotal).lessThan(coupon.minOrderAmount)) {
      throw new BadRequestException(`Minimum order amount is ${coupon.minOrderAmount} THB`);
    }
    if (coupon.gameId && dto.gameId && coupon.gameId !== dto.gameId) {
      throw new BadRequestException('Coupon is not valid for this game');
    }

    const existingUsage = await this.prisma.couponUsage.count({ where: { couponId: coupon.id, userId } });
    if (existingUsage >= coupon.userLimit) {
      throw new BadRequestException('You have already used this coupon');
    }

    const discountAmount = this.calculateDiscount(coupon.discountType, Number(coupon.value), dto.orderTotal, coupon.maxDiscount ? Number(coupon.maxDiscount) : undefined);

    return { couponId: coupon.id, discountAmount, code: dto.code };
  }

  private calculateDiscount(
    type: string,
    value: number,
    orderTotal: number,
    maxDiscount?: number,
  ): number {
    let discount = type === 'PERCENTAGE' ? (orderTotal * value) / 100 : value;
    if (maxDiscount !== undefined) discount = Math.min(discount, maxDiscount);
    return Math.min(discount, orderTotal);
  }

  async applyToOrder(couponId: string, userId: string, orderId: string, discountAmount: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.coupon.update({
        where: { id: couponId },
        data: { usedCount: { increment: 1 } },
      });
      return tx.couponUsage.create({
        data: { couponId, userId, orderId, discountAmount },
      });
    });
  }
}
