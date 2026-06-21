import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CouponsService } from './coupons.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

@UseGuards(JwtAuthGuard)
@Controller('coupons')
export class CouponsController {
  constructor(private coupons: CouponsService) {}

  @Post('validate')
  @HttpCode(200)
  validate(@CurrentUser() user: { id: string }, @Body() dto: ValidateCouponDto) {
    return this.coupons.validate(user.id, dto);
  }
}
