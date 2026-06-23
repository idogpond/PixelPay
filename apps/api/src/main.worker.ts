import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import appConfig from './config/app.config';
import redisConfig from './config/redis.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig, redisConfig] }),
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('redis.url') },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    OrdersModule,
    PaymentsModule,
    NotificationsModule,
  ],
})
class WorkerModule {}

async function bootstrap() {
  await NestFactory.createApplicationContext(WorkerModule, { logger: ['error', 'warn', 'log'] });
  console.log('Worker started');
}
bootstrap();
