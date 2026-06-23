import { Module } from '@nestjs/common';
import { ResellersService } from './resellers.service';
import { ResellersController } from './resellers.controller';

@Module({
  providers: [ResellersService],
  controllers: [ResellersController],
  exports: [ResellersService],
})
export class ResellersModule {}
