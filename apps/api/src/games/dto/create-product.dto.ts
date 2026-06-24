import { ProductType } from '@prisma/client';
import {
  IsBoolean, IsEnum, IsInt, IsNumber, IsOptional,
  IsString, MaxLength, Min,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(100)
  sku!: string;

  @IsNumber()
  @Min(0)
  priceCost!: number;

  @IsNumber()
  @Min(0)
  priceSell!: number;

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
