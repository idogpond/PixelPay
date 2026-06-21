import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type NotificationChannel = 'EMAIL' | 'SMS' | 'IN_APP';

export interface SendNotificationDto {
  userId: string;
  type: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('notifications') private queue: Queue,
  ) {}

  async send(dto: SendNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        channel: dto.channel as any,
        title: dto.title,
        body: dto.body,
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    await this.queue.add(
      'dispatch',
      { notificationId: notification.id },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: true,
      },
    );

    return notification;
  }

  async findByUser(userId: string, page = 1, limit = 20) {
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    return { items, total, unread, page, limit };
  }

  markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}
