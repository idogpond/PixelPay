import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ResellersService } from './resellers.service';

@UseGuards(JwtAuthGuard)
@Controller('reseller')
export class ResellersController {
  constructor(private resellers: ResellersService) {}

  @Post('apply')
  apply(@CurrentUser() user: { id: string }, @Body() dto: { companyName: string }) {
    return this.resellers.apply(user.id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('RESELLER')
  @Get('products')
  getProducts(@CurrentUser() user: { id: string }) {
    return this.resellers.getProducts(user.id);
  }
}
