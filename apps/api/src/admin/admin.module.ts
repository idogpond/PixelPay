import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    AnalyticsModule,
    AuditModule,
    BullModule.registerQueue({ name: 'topup' }),
  ],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
