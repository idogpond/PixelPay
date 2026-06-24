import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditInterceptor } from '../audit/audit.interceptor';
import { AdminService } from './admin.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { ResellersService } from '../resellers/resellers.service';
import { GamesService } from '../games/games.service';
import { CreateGameDto } from '../games/dto/create-game.dto';
import { UpdateGameDto } from '../games/dto/update-game.dto';
import { CreateProductDto } from '../games/dto/create-product.dto';
import { UpdateProductDto } from '../games/dto/update-product.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@UseInterceptors(AuditInterceptor)
@Controller('admin')
export class AdminController {
  constructor(
    private admin: AdminService,
    private analytics: AnalyticsService,
    private resellers: ResellersService,
    private games: GamesService,
  ) {}

  @Get('stats')
  getStats() {
    return this.admin.getDashboardStats();
  }

  @Get('users')
  listUsers(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
  ) {
    return this.admin.listUsers(+page, +limit, search);
  }

  @Patch('users/:id')
  updateUser(@Param('id') id: string, @Body() dto: { isActive?: boolean; role?: UserRole }) {
    return this.admin.updateUser(id, dto);
  }

  @Get('orders')
  listOrders(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
    @Query('userId') userId?: string,
  ) {
    return this.admin.listOrders(+page, +limit, { status, userId });
  }

  @Patch('orders/:id/status')
  overrideOrderStatus(@Param('id') id: string, @Body() dto: { status: string }) {
    return this.admin.overrideOrderStatus(id, dto.status);
  }

  @Post('orders/:id/retry')
  retryOrder(@Param('id') id: string) {
    return this.admin.retryOrder(id);
  }

  @Get('providers')
  listProviders() {
    return this.admin.listProviders();
  }

  @Post('providers')
  createProvider(@Body() dto: any) {
    return this.admin.createProvider(dto);
  }

  @Patch('providers/:id')
  updateProvider(@Param('id') id: string, @Body() dto: any) {
    return this.admin.updateProvider(id, dto);
  }

  @Get('analytics/revenue')
  getRevenue(@Query('period') period: 'day' | 'week' | 'month' = 'month') {
    return this.analytics.getRevenueTrend(period);
  }

  @Get('analytics/orders')
  getOrderStats(@Query('period') period: 'day' | 'week' | 'month' = 'month') {
    return this.analytics.getOrderStats(period);
  }

  @Get('analytics/users')
  getUserGrowth() {
    return this.analytics.getUserGrowth();
  }

  @Get('resellers')
  listResellers(@Query('page') page = '1') {
    return this.resellers.listResellers(+page);
  }

  @Patch('resellers/:id/approve')
  approveReseller(@Param('id') id: string, @CurrentUser() admin: { id: string }) {
    return this.resellers.approve(id, admin.id);
  }

  @Patch('resellers/:id/suspend')
  suspendReseller(@Param('id') id: string) {
    return this.resellers.suspend(id);
  }

  // ── game management ──────────────────────────────────────────────────────

  @Get('games')
  listGames() { return this.games.adminListGames(); }

  @Post('games')
  createGame(@Body() dto: CreateGameDto) { return this.games.adminCreateGame(dto); }

  @Patch('games/:id')
  updateGame(@Param('id') id: string, @Body() dto: UpdateGameDto) {
    return this.games.adminUpdateGame(id, dto);
  }

  @Delete('games/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteGame(@Param('id') id: string) { return this.games.adminDeleteGame(id); }

  // ── product management ───────────────────────────────────────────────────

  @Get('games/:id/products')
  listProducts(@Param('id') id: string) { return this.games.adminListProducts(id); }

  @Post('games/:id/products')
  createProduct(@Param('id') id: string, @Body() dto: CreateProductDto) {
    return this.games.adminCreateProduct(id, dto);
  }

  @Patch('games/:id/products/:productId')
  updateProduct(@Param('productId') productId: string, @Body() dto: UpdateProductDto) {
    return this.games.adminUpdateProduct(productId, dto);
  }

  @Delete('games/:id/products/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteProduct(@Param('productId') productId: string) {
    return this.games.adminDeleteProduct(productId);
  }
}
