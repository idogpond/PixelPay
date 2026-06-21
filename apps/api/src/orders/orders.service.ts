import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OrderStatus, PaymentMethod, WalletTransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { generateOrderNumber } from '../common/utils/order-number';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    @InjectQueue('topup') private topupQueue: Queue,
  ) {}

  async create(userId: string, dto: CreateOrderDto) {
    const product = await this.prisma.gameProduct.findUnique({
      where: { id: dto.gameProductId, isActive: true },
    });
    if (!product) throw new BadRequestException('Product not found or unavailable');

    // Lock wallet balance inside a transaction before creating the order
    await this.prisma.$transaction(async (tx) => {
      const userWallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      await this.wallet.lock(
        tx,
        userWallet.id,
        product.priceSell,
        'Wallet lock for order',
        undefined,
        'ORDER',
      );
    });

    const order = await this.prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userId,
        gameProductId: dto.gameProductId,
        quantity: 1,
        unitPrice: product.priceSell,
        totalPrice: product.priceSell,
        discountAmount: 0,
        cashbackAmount: 0,
        paymentMethod: dto.paymentMethod as PaymentMethod,
        gameUid: dto.gameUid,
        gameServer: dto.gameServer,
        gameUsername: dto.gameUsername,
        status: OrderStatus.PENDING,
      },
    });

    await this.topupQueue.add(
      'process-topup',
      { orderId: order.id, userId, gameProductId: dto.gameProductId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    return order;
  }

  async findByUser(userId: string, page = 1, limit = 20) {
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where: { userId } }),
    ]);
    return { items, total, page, limit };
  }

  async findById(id: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { gameProduct: { include: { game: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new UnauthorizedException();
    return order;
  }

  async cancel(id: string, userId: string) {
    const order = await this.findById(id, userId);
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Only pending orders can be cancelled');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id }, data: { status: OrderStatus.CANCELLED } });
      const userWallet = await tx.wallet.findUniqueOrThrow({ where: { userId: order.userId } });
      await this.wallet.unlock(
        tx,
        userWallet.id,
        order.totalPrice,
        WalletTransactionType.TOPUP_REFUND,
        'Order cancelled — wallet unlocked',
        order.id,
        'ORDER',
      );
    });
    return { message: 'Order cancelled' };
  }
}
