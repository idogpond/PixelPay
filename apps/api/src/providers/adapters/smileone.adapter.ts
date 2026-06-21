import { Logger } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';
import { IProviderAdapter, TopupParams, TopupResult } from './provider.interface';

export class SmileOneAdapter implements IProviderAdapter {
  readonly slug = 'smileone';
  private readonly logger = new Logger(SmileOneAdapter.name);

  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly apiSecret: string,
  ) {}

  private sign(params: Record<string, string>): string {
    const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
    return crypto.createHmac('sha256', this.apiSecret).update(sorted).digest('hex');
  }

  async processTopup(params: TopupParams): Promise<TopupResult> {
    const baseParams = {
      apiKey: this.apiKey,
      orderId: params.orderId,
      productCode: params.providerSku,
      userId: params.gameUid,
      zoneId: params.gameServer ?? '',
      qty: String(params.quantity),
      timestamp: Math.floor(Date.now() / 1000).toString(),
    };

    try {
      const response = await axios.post(
        `${this.apiUrl}/order`,
        { ...baseParams, sign: this.sign(baseParams) },
        { timeout: 30000 },
      );

      const data = response.data;
      if (data.code === 200 || data.status === 'SUCCESS') {
        return {
          success: true,
          providerOrderId: data.orderId ?? data.tradeNo,
          providerReference: data.serialNo,
        };
      }

      return { success: false, failureReason: data.msg ?? 'Unknown error' };
    } catch (error: any) {
      this.logger.error(`Smile.one topup failed: ${error.message}`);
      return { success: false, failureReason: error.message };
    }
  }

  async checkOrderStatus(providerOrderId: string) {
    try {
      const params = { apiKey: this.apiKey, orderId: providerOrderId };
      const response = await axios.get(`${this.apiUrl}/order`, { params, timeout: 15000 });
      const statusMap: Record<string, 'pending' | 'success' | 'failed'> = {
        SUCCESS: 'success', PENDING: 'pending', FAILED: 'failed',
      };
      return { status: statusMap[response.data.status] ?? 'pending', reference: response.data.serialNo };
    } catch {
      return { status: 'pending' as const };
    }
  }
}
