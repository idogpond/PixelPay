import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ResellerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ResellersService {
  constructor(
    private prisma: PrismaService,
  ) {}

  async apply(userId: string, dto: { companyName: string }) {
    const existing = await this.prisma.reseller.findUnique({ where: { userId } });
    if (existing) throw new BadRequestException('Reseller application already exists');

    return this.prisma.reseller.create({
      data: { userId, companyName: dto.companyName, status: ResellerStatus.PENDING },
    });
  }

  async approve(id: string, adminId: string) {
    const reseller = await this.prisma.reseller.findUnique({ where: { id } });
    if (!reseller) throw new NotFoundException('Reseller not found');
    if (reseller.status !== ResellerStatus.PENDING)
      throw new BadRequestException('Only pending resellers can be approved');

    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: reseller.userId }, data: { role: 'RESELLER' } });
      return tx.reseller.update({
        where: { id },
        data: { status: ResellerStatus.ACTIVE, approvedById: adminId, approvedAt: new Date() },
      });
    });
  }

  async suspend(id: string) {
    const reseller = await this.prisma.reseller.findUnique({ where: { id } });
    if (!reseller) throw new NotFoundException('Reseller not found');
    return this.prisma.reseller.update({ where: { id }, data: { status: ResellerStatus.SUSPENDED } });
  }

  async getProducts(userId: string) {
    const reseller = await this.prisma.reseller.findFirst({
      where: { userId, status: ResellerStatus.ACTIVE },
    });
    if (!reseller) throw new ForbiddenException('Active reseller account required');

    const products = await this.prisma.gameProduct.findMany({
      where: { isActive: true },
      include: { game: { select: { name: true, slug: true } } },
    });

    // Apply reseller discount
    return products.map((p) => ({
      ...p,
      resellerPrice: (Number(p.priceSell) * (1 - Number(reseller.discountRate) / 100)).toFixed(2),
    }));
  }

  listResellers(page = 1, limit = 20) {
    return this.prisma.reseller.findMany({
      include: { user: { select: { email: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }
}
