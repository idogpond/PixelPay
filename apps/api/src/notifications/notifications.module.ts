import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsController } from './notifications.controller';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';

@Module({
  imports: [BullModule.registerQueue({ name: 'notifications' })],
  providers: [NotificationsService, NotificationsProcessor, EmailChannel, SmsChannel],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
