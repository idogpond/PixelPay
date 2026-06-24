import { ProductType } from '@prisma/client';
import {
  IsBoolean, IsEnum, IsInt, IsNumber, IsOptional,
  IsString, MaxLength, Min,
} from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceSell?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @IsOptional()
  @IsBoolean()
  requiresServer?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresUsername?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
