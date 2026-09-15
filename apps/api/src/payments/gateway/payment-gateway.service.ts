import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface CreateQrChargeResult {
  chargeId: string;
  qrCodeUrl: string;
  expiresAt: Date;
  amount: number;
}

export interface ChargeStatus {
  chargeId: string;
  status: 'pending' | 'paid';
}

/**
 * GB Prime Pay QR Cash — verified against the official docs at doc.gbprimepay.com
 * (JS-rendered, not indexable, fetched directly 2026-09-15). Two separate credentials:
 *  - PAYMENT_GATEWAY_API_KEY = the "token" (gbprimepay.com > Profile > Gen Token)
 *  - PAYMENT_GATEWAY_SECRET  = the merchant secret key, used only for the authenticated
 *    status-query API (Basic auth), never sent with the QR-creation request.
 * QR Cash must be enabled on the account first (email info@gbprimepay.com).
 */
@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);
  private readonly http: AxiosInstance;
  private readonly token: string;
  private readonly secretKey: string;

  constructor(private config: ConfigService) {
    this.token = config.get<string>('PAYMENT_GATEWAY_API_KEY') ?? '';
    this.secretKey = config.get<string>('PAYMENT_GATEWAY_SECRET') ?? '';
    this.http = axios.create({
      baseURL: config.get<string>('PAYMENT_GATEWAY_URL'),
      timeout: 30000,
    });
  }

  async createPromptPayQr(amount: number): Promise<CreateQrChargeResult> {
    // referenceNo is capped at 15 chars by GB Prime Pay and must be unique per charge —
    // our Payment.id (a cuid) is too long, so a short one is minted here and stored back
    // onto the Payment row by the caller as gatewayReference.
    const referenceNo = this.generateReferenceNo();

    const body = new URLSearchParams({
      token: this.token,
      amount: amount.toFixed(2),
      referenceNo,
      detail: 'PixelPay wallet top-up',
    });

    const response = await this.http.post('/v3/qrcode', body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      responseType: 'arraybuffer',
    });

    const qrCodeUrl = `data:image/png;base64,${Buffer.from(response.data).toString('base64')}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    return { chargeId: referenceNo, qrCodeUrl, expiresAt, amount };
  }

  async getChargeStatus(chargeId: string): Promise<ChargeStatus> {
    const auth = Buffer.from(`${this.secretKey}:`).toString('base64');
    const response = await this.http.post<{ txn?: { status: string } }>(
      '/v1/check_status_txn',
      { referenceNo: chargeId },
      { headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' } },
    );

    // Confirmed from GB Prime Pay's example response: status "S" = paid/settled. Other
    // letter codes aren't documented publicly, so anything else is treated as still
    // pending rather than guessed as a failure — the caller enforces its own expiry.
    const status: ChargeStatus['status'] = response.data.txn?.status === 'S' ? 'paid' : 'pending';
    return { chargeId, status };
  }

  private generateReferenceNo(): string {
    const msTimestamp = Date.now().toString(); // 13 digits through year ~2286
    const suffix = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    return `${msTimestamp}${suffix}`; // 15 chars — GB Prime Pay's max for referenceNo
  }
}
