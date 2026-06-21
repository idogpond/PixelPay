import { ConfigService } from '@nestjs/config';
import { ProviderFactory } from './provider.factory';
import { UnipinAdapter } from './unipin.adapter';
import { SmileOneAdapter } from './smileone.adapter';
import { encryptAes256 } from '../../common/utils/crypto';

describe('ProviderFactory', () => {
  let factory: ProviderFactory;
  let configService: ConfigService;
  const testEncKey = '0'.repeat(64); // 32 bytes in hex

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'app.encryptionKey') {
          return testEncKey;
        }
        return undefined;
      }),
    } as unknown as ConfigService;

    factory = new ProviderFactory(configService);
  });

  it('should create UnipinAdapter for unipin provider', () => {
    const encApiKey = encryptAes256(testEncKey, 'test-api-key');
    const encApiSecret = encryptAes256(testEncKey, 'test-api-secret');

    const provider = {
      slug: 'unipin',
      apiUrl: 'https://api.unipin.com',
      apiKeyEnc: encApiKey,
      apiSecretEnc: encApiSecret,
    };

    const adapter = factory.create(provider);

    expect(adapter).toBeInstanceOf(UnipinAdapter);
    expect(adapter.slug).toBe('unipin');
  });

  it('should create SmileOneAdapter for smileone provider', () => {
    const encApiKey = encryptAes256(testEncKey, 'test-api-key');
    const encApiSecret = encryptAes256(testEncKey, 'test-api-secret');

    const provider = {
      slug: 'smileone',
      apiUrl: 'https://api.smileone.com',
      apiKeyEnc: encApiKey,
      apiSecretEnc: encApiSecret,
    };

    const adapter = factory.create(provider);

    expect(adapter).toBeInstanceOf(SmileOneAdapter);
    expect(adapter.slug).toBe('smileone');
  });

  it('should throw error for unknown provider', () => {
    const encApiKey = encryptAes256(testEncKey, 'test-api-key');

    const provider = {
      slug: 'unknown',
      apiUrl: 'https://api.unknown.com',
      apiKeyEnc: encApiKey,
      apiSecretEnc: null,
    };

    expect(() => factory.create(provider)).toThrow('No adapter for provider slug: unknown');
  });
});
