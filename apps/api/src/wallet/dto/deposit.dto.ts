import { IsString, IsNumber, IsOptional, IsPositive, IsNotEmpty } from 'class-validator';

export class DepositDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  @IsOptional()
  description?: string;
}
