import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OrderStatus, PaymentMethod, WalletTransactionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { CouponsService } from '../coupons/coupons.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { generateOrderNumber } from '../common/utils/order-number';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private coupons: CouponsService,
    @InjectQueue('topup') private topupQueue: Queue,
  ) {}

  async create(userId: string, dto: CreateOrderDto) {
    const product = await this.prisma.gameProduct.findUnique({
      where: { id: dto.gameProductId, isActive: true },
    });
    if (!product) throw new BadRequestException('Product not found or unavailable');

    // Validate coupon before entering the transaction
    let discountAmount = 0;
    let couponId: string | undefined;
    if (dto.couponCode) {
      // CouponsService.validate() does not atomically reserve the coupon, so no state to release on failure
      const couponResult = await this.coupons.validate(userId, {
        code: dto.couponCode,
        orderTotal: Number(product.priceSell),
        gameId: product.gameId,
      });
      discountAmount = couponResult.discountAmount;
      couponId = couponResult.couponId;
    }

    const totalPrice = new Decimal(product.priceSell).sub(new Decimal(discountAmount));

    const order = await this.prisma.$transaction(async (tx) => {
      // 1. Look up wallet inside transaction
      const userWallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

      // 2. Pre-generate order number
      const orderNumber = generateOrderNumber();

      // 3. Create order inside tx (get the id)
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          userId,
          gameProductId: dto.gameProductId,
          quantity: 1,
          unitPrice: product.priceSell,
          totalPrice,
          discountAmount: new Decimal(discountAmount),
          cashbackAmount: 0,
          paymentMethod: dto.paymentMethod,
          gameUid: dto.gameUid,
          gameServer: dto.gameServer,
          gameUsername: dto.gameUsername,
          status: OrderStatus.PENDING,
        },
      });

      // 4. Lock wallet with order.id as referenceId — same atomic unit
      await this.wallet.lock(
        tx,
        userWallet.id,
        totalPrice,
        'Wallet lock for order',
        newOrder.id,
        'ORDER',
      );

      return newOrder;
    });

    // Apply coupon AFTER transaction commits — order exists
    if (couponId) {
      try {
        await this.coupons.applyToOrder(couponId, userId, order.id, discountAmount);
      } catch (couponErr: any) {
        // Coupon record failed to save — order is still valid but log the issue
        // In a future phase, consider rolling back the order here
        this.logger.warn('Failed to apply coupon to order', couponErr?.message);
      }
    }

    // Enqueue AFTER transaction commits — order exists and lock is applied
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
