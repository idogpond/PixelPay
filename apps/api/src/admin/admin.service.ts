import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OrderStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const USER_SELECT = {
  id: true,
  email: true,
  phone: true,
  displayName: true,
  avatarUrl: true,
  role: true,
  isVerified: true,
  isActive: true,
  referralCode: true,
  createdAt: true,
};

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('topup') private topupQueue: Queue,
  ) {}

  async getDashboardStats() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalUsers, totalOrders, pendingOrders, todayOrders, monthOrders, totalRevenue] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.order.count(),
        this.prisma.order.count({ where: { status: OrderStatus.PENDING } }),
        this.prisma.order.count({ where: { createdAt: { gte: startOfDay } } }),
        this.prisma.order.count({ where: { createdAt: { gte: startOfMonth } } }),
        this.prisma.order.aggregate({
          _sum: { totalPrice: true },
          where: { status: OrderStatus.COMPLETED },
        }),
      ]);

    return {
      totalUsers,
      totalOrders,
      pendingOrders,
      todayOrders,
      monthOrders,
      totalRevenue: totalRevenue._sum.totalPrice ?? 0,
    };
  }

  async listUsers(page = 1, limit = 20, search?: string) {
    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { displayName: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async updateUser(id: string, dto: { isActive?: boolean; role?: UserRole }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({ where: { id }, data: dto, select: USER_SELECT });
  }

  async listOrders(page = 1, limit = 20, filters?: { status?: string; userId?: string }) {
    const where: { status?: OrderStatus; userId?: string } = {};
    if (filters?.status) where.status = filters.status as OrderStatus;
    if (filters?.userId) where.userId = filters.userId;

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          user: { select: { email: true, displayName: true } },
          gameProduct: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async overrideOrderStatus(id: string, status: string) {
    const validStatuses: OrderStatus[] = [
      OrderStatus.COMPLETED,
      OrderStatus.FAILED,
      OrderStatus.REFUNDED,
    ];
    if (!validStatuses.includes(status as OrderStatus))
      throw new BadRequestException('Invalid status');
    return this.prisma.order.update({ where: { id }, data: { status: status as OrderStatus } });
  }

  async retryOrder(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.FAILED)
      throw new BadRequestException('Only failed orders can be retried');

    await this.prisma.order.update({
      where: { id },
      data: { status: OrderStatus.PENDING, retryCount: 0 },
    });
    await this.topupQueue.add(
      'process-topup',
      { orderId: id, userId: order.userId, gameProductId: order.gameProductId },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
    return { message: 'Order queued for retry' };
  }

  listProviders() {
    return this.prisma.provider.findMany({ orderBy: { priority: 'asc' } });
  }

  createProvider(dto: {
    name: string;
    slug: string;
    apiUrl: string;
    apiKeyEnc: string;
    priority: number;
  }) {
    return this.prisma.provider.create({ data: dto });
  }

  updateProvider(
    id: string,
    dto: Partial<{ isActive: boolean; priority: number; rateLimitPerMin: number }>,
  ) {
    return this.prisma.provider.update({ where: { id }, data: dto });
  }
}
