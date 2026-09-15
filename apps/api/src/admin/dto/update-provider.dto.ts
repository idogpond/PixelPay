import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export class UpdateProviderDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  apiUrl?: string;

  // Only sent (and only overwritten) when the admin is actually rotating the credential —
  // the form leaves this blank to keep the existing encrypted value.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiSecret?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  rateLimitPerMin?: number;

  // See create-provider.dto.ts — ValidateIf handles the blank-is-fine case that
  // @IsOptional() alone wouldn't catch (it only skips validation for undefined/null).
  @ValidateIf((o) => !!o.healthCheckUrl)
  @IsUrl({ require_tld: false })
  healthCheckUrl?: string;
}
