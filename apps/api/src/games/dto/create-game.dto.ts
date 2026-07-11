import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, IsUUID, Matches, MaxLength, Min } from 'class-validator';

export class CreateGameDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase letters, numbers, and hyphens only' })
  slug!: string;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @IsUrl()
  bannerUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descriptionTh?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
