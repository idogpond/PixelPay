import { Module } from '@nestjs/common';
import { CashbackService } from './cashback.service';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [WalletModule],
  providers: [CashbackService],
  exports: [CashbackService],
})
export class CashbackModule {}
