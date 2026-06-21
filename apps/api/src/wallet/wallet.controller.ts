import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { WalletService } from './wallet.service';
import { DepositDto } from './dto/deposit.dto';

@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  getWallet(@CurrentUser() user: { id: string }) {
    return this.wallet.getWallet(user.id);
  }

  @Get('transactions')
  getTransactions(
    @CurrentUser() user: { id: string },
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.wallet.getTransactions(user.id, parseInt(page, 10), parseInt(limit, 10));
  }

  @Post('deposit')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  adminDeposit(@Body() dto: DepositDto) {
    return this.wallet.adminDeposit(dto.userId, dto.amount, dto.description);
  }
}
