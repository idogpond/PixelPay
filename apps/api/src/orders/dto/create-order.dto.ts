import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateOrderDto {
  @IsUUID()
  gameProductId!: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  gameUid!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  gameServer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  gameUsername?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  couponCode?: string;
}
