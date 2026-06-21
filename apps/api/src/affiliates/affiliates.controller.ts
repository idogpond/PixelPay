import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AffiliatesService } from './affiliates.service';

@UseGuards(JwtAuthGuard)
@Controller('affiliates')
export class AffiliatesController {
  constructor(private affiliates: AffiliatesService) {}

  @Get('dashboard')
  getDashboard(@CurrentUser() user: { id: string }) {
    return this.affiliates.getDashboard(user.id);
  }

  @Get('commissions')
  getCommissions(
    @CurrentUser() user: { id: string },
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.affiliates.getCommissions(user.id, +page, +limit);
  }
}
