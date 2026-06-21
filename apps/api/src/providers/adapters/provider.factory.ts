import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decryptAes256 } from '../../common/utils/crypto';
import { IProviderAdapter } from './provider.interface';
import { UnipinAdapter } from './unipin.adapter';
import { SmileOneAdapter } from './smileone.adapter';

interface ProviderRecord {
  slug: string;
  apiUrl: string;
  apiKeyEnc: string;
  apiSecretEnc: string | null;
}

@Injectable()
export class ProviderFactory {
  private readonly encKey: string;

  constructor(config: ConfigService) {
    this.encKey = config.get<string>('app.encryptionKey') ?? '';
  }

  create(provider: ProviderRecord): IProviderAdapter {
    const apiKey = decryptAes256(this.encKey, provider.apiKeyEnc);
    const apiSecret = provider.apiSecretEnc ? decryptAes256(this.encKey, provider.apiSecretEnc) : '';

    switch (provider.slug) {
      case 'unipin':
        return new UnipinAdapter(provider.apiUrl, apiKey, apiSecret);
      case 'smileone':
        return new SmileOneAdapter(provider.apiUrl, apiKey, apiSecret);
      default:
        throw new Error(`No adapter for provider slug: ${provider.slug}`);
    }
  }
}
