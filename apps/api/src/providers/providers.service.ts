import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderFactory } from './adapters/provider.factory';

@Injectable()
export class ProvidersService {
  constructor(
    private prisma: PrismaService,
    private factory: ProviderFactory,
  ) {}

  async getProductProviders(gameProductId: string) {
    return this.prisma.providerProduct.findMany({
      where: { gameProductId, isAvailable: true, provider: { isActive: true } },
      include: { provider: true },
      orderBy: { provider: { priority: 'asc' } },
    });
  }

  getAdapter(provider: { slug: string; apiUrl: string; apiKeyEnc: string; apiSecretEnc: string | null }) {
    return this.factory.create(provider);
  }
}
