export interface TopupParams {
  providerSku: string;
  gameUid: string;
  gameServer?: string;
  gameUsername?: string;
  orderId: string;
  quantity: number;
}

export interface TopupResult {
  success: boolean;
  providerOrderId?: string;
  providerReference?: string;
  failureReason?: string;
}

export interface IProviderAdapter {
  readonly slug: string;
  processTopup(params: TopupParams): Promise<TopupResult>;
  checkOrderStatus(providerOrderId: string): Promise<{ status: 'pending' | 'success' | 'failed'; reference?: string }>;
}
