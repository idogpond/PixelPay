import { IsEmail, IsString, MinLength, MaxLength, Matches, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'password must contain uppercase, lowercase and number',
  })
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  displayName!: string;

  @IsOptional()
  @IsString()
  referredBy?: string;
}
