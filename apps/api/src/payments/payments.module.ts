import { Module } from '@nestjs/common';
import { PaymentGatewayService } from './gateway/payment-gateway.service';

@Module({
  providers: [PaymentGatewayService],
  exports: [PaymentGatewayService],
})
export class PaymentsModule {}
