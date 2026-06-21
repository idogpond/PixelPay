import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';
import { orderCompletedEmail, orderCompletedSms } from './templates/order-completed';
import { orderFailedEmail, orderFailedSms } from './templates/order-failed';
import { paymentReceivedEmail } from './templates/payment-received';

@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailChannel,
    private sms: SmsChannel,
  ) {
    super();
  }

  async process(job: Job<{ notificationId: string }>) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: job.data.notificationId },
      include: { user: { select: { email: true, phone: true, displayName: true } } },
    });

    if (!notification) return;

    await this.dispatch(notification);

    await this.prisma.notification.update({
      where: { id: notification.id },
      data: { sentAt: new Date() },
    });
  }

  private async dispatch(notification: any) {
    const { user, type, channel, title, body, metadata } = notification;

    if (channel === 'IN_APP') return; // Already stored in DB

    if (channel === 'EMAIL' && user.email) {
      const template = this.getEmailTemplate(type, user.displayName, metadata);
      await this.email.send(
        user.email,
        template?.subject ?? title,
        template?.html ?? `<p>${body}</p>`,
      );
    }

    if (channel === 'SMS' && user.phone) {
      const smsBody = this.getSmsTemplate(type, metadata) ?? body;
      await this.sms.send(user.phone, smsBody);
    }
  }

  private getEmailTemplate(type: string, displayName: string, meta: any) {
    switch (type) {
      case 'ORDER_COMPLETED':
        return orderCompletedEmail({
          displayName,
          orderNumber: meta.orderNumber,
          productName: meta.productName,
          gameUid: meta.gameUid,
        });
      case 'ORDER_FAILED':
        return orderFailedEmail({
          displayName,
          orderNumber: meta.orderNumber,
          productName: meta.productName,
        });
      case 'PAYMENT_RECEIVED':
        return paymentReceivedEmail({ displayName, amount: meta.amount });
      default:
        return null;
    }
  }

  private getSmsTemplate(type: string, meta: any) {
    switch (type) {
      case 'ORDER_COMPLETED':
        return orderCompletedSms({ orderNumber: meta.orderNumber, productName: meta.productName });
      case 'ORDER_FAILED':
        return orderFailedSms({ orderNumber: meta.orderNumber });
      default:
        return null;
    }
  }
}
