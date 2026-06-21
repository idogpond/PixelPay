import { Test, TestingModule } from '@nestjs/testing';
import { CashbackService } from './cashback.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { CashbackType, WalletTransactionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const mockPrisma: any = {
  cashbackRule: { findMany: jest.fn() },
  order: { update: jest.fn() },
  wallet: { findUniqueOrThrow: jest.fn() },
  $transaction: jest.fn(async (fn: (tx: any) => Promise<void>) => fn(mockPrisma)),
};

const mockWallet: any = { credit: jest.fn() };

describe('CashbackService', () => {
  let service: CashbackService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashbackService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WalletService, useValue: mockWallet },
      ],
    }).compile();
    service = module.get(CashbackService);
  });

  describe('evaluateAndCredit', () => {
    it('returns 0 when no active rules', async () => {
      mockPrisma.cashbackRule.findMany.mockResolvedValue([]);
      const result = await service.evaluateAndCredit('u1', 'o1', 200, 'g1');
      expect(result).toBe(0);
    });

    it('applies percentage rule correctly', async () => {
      mockPrisma.cashbackRule.findMany.mockResolvedValue([
        {
          id: 'r1',
          cashbackType: CashbackType.PERCENTAGE,
          value: new Decimal('5'),
          minOrderAmount: new Decimal('0'),
        },
      ]);
      mockPrisma.wallet.findUniqueOrThrow.mockResolvedValue({ id: 'w1' });
      mockPrisma.order.update.mockResolvedValue({});
      const result = await service.evaluateAndCredit('u1', 'o1', 200, 'g1');
      expect(result).toBe(10);
    });

    it('caps cashback at order amount for fixed rules', async () => {
      mockPrisma.cashbackRule.findMany.mockResolvedValue([
        {
          id: 'r1',
          cashbackType: CashbackType.FIXED,
          value: new Decimal('500'),
          minOrderAmount: new Decimal('0'),
        },
      ]);
      mockPrisma.wallet.findUniqueOrThrow.mockResolvedValue({ id: 'w1' });
      mockPrisma.order.update.mockResolvedValue({});
      const result = await service.evaluateAndCredit('u1', 'o1', 100, 'g1');
      expect(result).toBe(100);
    });
  });
});
