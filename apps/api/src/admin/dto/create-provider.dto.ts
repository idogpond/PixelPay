import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, ValidateIf } from 'class-validator';

// Slugs are constrained to what ProviderFactory actually has an adapter for — any other
// slug would save fine but silently fail every topup that routes to it.
const SUPPORTED_SLUGS = ['smileone', 'unipin'] as const;

export class CreateProviderDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsIn([...SUPPORTED_SLUGS])
  slug!: (typeof SUPPORTED_SLUGS)[number];

  @IsUrl({ require_tld: false })
  apiUrl!: string;

  // Plaintext in transit (admin-authenticated HTTPS request) — encrypted server-side
  // before it ever reaches the database. Never returned back to any client.
  @IsString()
  @MaxLength(500)
  apiKey!: string;

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

  // Genuinely optional and commonly left blank — @IsOptional() only skips validation for
  // undefined/null, not '', so an empty string needs its own bypass here.
  @ValidateIf((o) => !!o.healthCheckUrl)
  @IsUrl({ require_tld: false })
  healthCheckUrl?: string;
}
