import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsProcessor } from './payments.processor';
import { PaymentGatewayService } from './gateway/payment-gateway.service';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    WalletModule,
    BullModule.registerQueue({ name: 'payments' }),
  ],
  providers: [PaymentsService, PaymentsProcessor, PaymentGatewayService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
