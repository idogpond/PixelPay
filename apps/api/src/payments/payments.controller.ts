import { Body, Controller, Get, Headers, Param, Post, RawBody, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import { CreatePromptPayDto } from './dto/create-promptpay.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('promptpay')
  createPromptPay(
    @CurrentUser() user: { id: string },
    @Body() dto: CreatePromptPayDto,
  ) {
    return this.payments.createPromptPay(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getPayment(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.payments.getPayment(id, user.id);
  }

  // Webhook — no JWT auth, verified by HMAC
  @Post('webhook')
  handleWebhook(
    @RawBody() rawBody: Buffer,
    @Headers('x-gbpay-signature') signature: string,
  ) {
    return this.payments.handleWebhook(rawBody.toString('utf8'), signature);
  }
}
