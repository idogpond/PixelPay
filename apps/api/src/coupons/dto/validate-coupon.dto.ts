import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class ValidateCouponDto {
  @IsString()
  code!: string;

  @IsNumber()
  @Min(0)
  orderTotal!: number;

  @IsOptional()
  @IsUUID()
  gameId?: string;
}
