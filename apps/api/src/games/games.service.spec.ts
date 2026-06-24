import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { GamesService } from './games.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  game: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  gameProduct: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
};

describe('GamesService — admin methods', () => {
  let service: GamesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GamesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(GamesService);
  });

  describe('adminListGames', () => {
    it('returns all games ordered by sortOrder', async () => {
      mockPrisma.game.findMany.mockResolvedValue([{ id: 'g1', name: 'Game A' }]);
      const result = await service.adminListGames();
      expect(mockPrisma.game.findMany).toHaveBeenCalledWith({ orderBy: { sortOrder: 'asc' } });
      expect(result).toEqual([{ id: 'g1', name: 'Game A' }]);
    });
  });

  describe('adminCreateGame', () => {
    it('creates a game successfully', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(null);
      mockPrisma.game.create.mockResolvedValue({ id: 'g1', slug: 'test-game' });
      const result = await service.adminCreateGame({ name: 'Test', slug: 'test-game' } as any);
      expect(result).toEqual({ id: 'g1', slug: 'test-game' });
    });

    it('throws ConflictException when slug already exists', async () => {
      mockPrisma.game.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.adminCreateGame({ name: 'Test', slug: 'taken' } as any))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('adminUpdateGame', () => {
    it('throws NotFoundException when game does not exist', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(null);
      await expect(service.adminUpdateGame('bad-id', {} as any))
        .rejects.toThrow(NotFoundException);
    });

    it('updates game when it exists', async () => {
      mockPrisma.game.findUnique.mockResolvedValue({ id: 'g1' });
      mockPrisma.game.update.mockResolvedValue({ id: 'g1', name: 'Updated' });
      const result = await service.adminUpdateGame('g1', { name: 'Updated' } as any);
      expect(result).toEqual({ id: 'g1', name: 'Updated' });
    });
  });

  describe('adminDeleteGame', () => {
    it('throws NotFoundException when game does not exist', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(null);
      await expect(service.adminDeleteGame('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('deletes products then game when game exists', async () => {
      mockPrisma.game.findUnique.mockResolvedValue({ id: 'g1' });
      mockPrisma.gameProduct.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.game.delete.mockResolvedValue({});

      const deleteManyOrder: string[] = [];
      mockPrisma.gameProduct.deleteMany.mockImplementation(() => {
        deleteManyOrder.push('deleteMany');
        return Promise.resolve({ count: 2 });
      });
      mockPrisma.game.delete.mockImplementation(() => {
        deleteManyOrder.push('delete');
        return Promise.resolve({});
      });

      await service.adminDeleteGame('g1');

      expect(mockPrisma.gameProduct.deleteMany).toHaveBeenCalledWith({ where: { gameId: 'g1' } });
      expect(mockPrisma.game.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
      expect(deleteManyOrder).toEqual(['deleteMany', 'delete']);
    });
  });

  describe('adminCreateProduct', () => {
    it('throws NotFoundException when game does not exist', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(null);
      await expect(service.adminCreateProduct('bad-id', { name: 'P', sku: 'S', priceCost: 1, priceSell: 2 } as any))
        .rejects.toThrow(NotFoundException);
    });

    it('creates product when game exists', async () => {
      mockPrisma.game.findUnique.mockResolvedValue({ id: 'g1' });
      mockPrisma.gameProduct.create.mockResolvedValue({ id: 'p1', sku: 'S' });
      const result = await service.adminCreateProduct('g1', { name: 'P', sku: 'S', priceCost: 10, priceSell: 15 } as any);
      expect(result).toEqual({ id: 'p1', sku: 'S' });
    });
  });

  describe('adminUpdateProduct', () => {
    it('throws NotFoundException when product does not exist', async () => {
      mockPrisma.gameProduct.findUnique.mockResolvedValue(null);
      await expect(service.adminUpdateProduct('bad-id', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('adminDeleteProduct', () => {
    it('throws NotFoundException when product does not exist', async () => {
      mockPrisma.gameProduct.findUnique.mockResolvedValue(null);
      await expect(service.adminDeleteProduct('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
