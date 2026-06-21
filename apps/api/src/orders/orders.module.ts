import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { TopupProcessor } from './orders.processor';
import { OrdersGateway } from './orders.gateway';
import { WalletModule } from '../wallet/wallet.module';
import { ProvidersModule } from '../providers/providers.module';
import { CashbackModule } from '../cashback/cashback.module';
import { AffiliatesModule } from '../affiliates/affiliates.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    WalletModule,
    ProvidersModule,
    CashbackModule,
    AffiliatesModule,
    NotificationsModule,
    BullModule.registerQueue({ name: 'topup' }),
  ],
  providers: [OrdersService, TopupProcessor, OrdersGateway],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}
