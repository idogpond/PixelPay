import { Body, Controller, Get, Param, Post, RawBody, UseGuards } from '@nestjs/common';
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

  // Webhook — GB Prime Pay's QR Cash callback carries no signature; the service re-checks
  // status with GB Prime Pay directly rather than trusting this body (see payments.service.ts).
  @Post('webhook')
  handleWebhook(@RawBody() rawBody: Buffer) {
    return this.payments.handleWebhook(rawBody.toString('utf8'));
  }
}
