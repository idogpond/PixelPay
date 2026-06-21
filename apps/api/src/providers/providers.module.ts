import { Module } from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { ProviderFactory } from './adapters/provider.factory';

@Module({
  providers: [ProvidersService, ProviderFactory],
  exports: [ProvidersService],
})
export class ProvidersModule {}
