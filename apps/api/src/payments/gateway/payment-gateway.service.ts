import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { hmacSha256, verifyHmacSha256 } from '../../common/utils/crypto';

export interface CreateQrChargeResult {
  chargeId: string;
  qrCodeUrl: string;
  expiresAt: Date;
  amount: number;
}

export interface ChargeStatus {
  chargeId: string;
  status: 'pending' | 'paid' | 'failed' | 'expired';
  paidAt?: Date;
}

@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);
  private readonly http: AxiosInstance;
  private readonly apiKey: string;
  private readonly secret: string;

  constructor(private config: ConfigService) {
    this.apiKey = config.get<string>('PAYMENT_GATEWAY_API_KEY') ?? '';
    this.secret = config.get<string>('PAYMENT_GATEWAY_SECRET') ?? '';
    this.http = axios.create({
      baseURL: config.get<string>('PAYMENT_GATEWAY_URL'),
      timeout: 30000,
    });
  }

  async createPromptPayQr(amount: number, referenceId: string): Promise<CreateQrChargeResult> {
    const timestamp = Date.now().toString();
    const signatureData = `${this.apiKey}${amount}${referenceId}${timestamp}`;
    const signature = hmacSha256(this.secret, signatureData);

    // Adapt to actual gateway API — this shows GB Pay structure as example
    const response = await this.http.post('/v3/qrcode', {
      remitSlipId: referenceId,
      amount: amount.toFixed(2),
      currency: 'THB',
      responseUrl: '', // webhook is set at gateway account level
      backgroundUrl: `${this.config.get('app.url')}/api/v1/payments/webhook`,
      detail: 'PixelPay wallet top-up',
      apiKey: this.apiKey,
      timeStamp: timestamp,
      checksum: signature,
    });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    return {
      chargeId: response.data.referenceNo ?? referenceId,
      qrCodeUrl: response.data.qrImage ?? response.data.qrCodeUrl,
      expiresAt,
      amount,
    };
  }

  async getChargeStatus(chargeId: string): Promise<ChargeStatus> {
    const response = await this.http.get(`/v3/charge/${chargeId}`, {
      params: { apiKey: this.apiKey },
    });

    const statusMap: Record<string, ChargeStatus['status']> = {
      pending: 'pending',
      pay: 'paid',
      paid: 'paid',
      failed: 'failed',
      expired: 'expired',
      cancel: 'expired',
    };

    return {
      chargeId,
      status: statusMap[response.data.status] ?? 'pending',
      paidAt: response.data.paidAt ? new Date(response.data.paidAt) : undefined,
    };
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const webhookSecret = this.config.get<string>('PAYMENT_WEBHOOK_SECRET') ?? '';
    return verifyHmacSha256(webhookSecret, payload, signature);
  }
}
