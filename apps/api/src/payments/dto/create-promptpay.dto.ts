import { IsNumber, Min, Max } from 'class-validator';

export class CreatePromptPayDto {
  @IsNumber()
  @Min(10)
  @Max(100000)
  amount!: number;
}
