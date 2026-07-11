import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuditModule } from '../audit/audit.module';
import { ResellersModule } from '../resellers/resellers.module';
import { GamesModule } from '../games/games.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [
    AnalyticsModule,
    AuditModule,
    ResellersModule,
    GamesModule,
    CategoriesModule,
    BullModule.registerQueue({ name: 'topup' }),
  ],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
