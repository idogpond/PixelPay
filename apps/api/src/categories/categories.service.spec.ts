import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  category: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('CategoriesService', () => {
  let service: CategoriesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(CategoriesService);
  });

  describe('findAllActive', () => {
    it('returns only active categories ordered by sortOrder', async () => {
      mockPrisma.category.findMany.mockResolvedValue([{ id: 'c1', name: 'FPS' }]);
      const result = await service.findAllActive();
      expect(mockPrisma.category.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, slug: true },
      });
      expect(result).toEqual([{ id: 'c1', name: 'FPS' }]);
    });
  });

  describe('adminList', () => {
    it('returns all categories ordered by sortOrder', async () => {
      mockPrisma.category.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
      const result = await service.adminList();
      expect(mockPrisma.category.findMany).toHaveBeenCalledWith({ orderBy: { sortOrder: 'asc' } });
      expect(result).toEqual([{ id: 'c1' }, { id: 'c2' }]);
    });
  });

  describe('adminCreate', () => {
    it('creates a category successfully', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);
      mockPrisma.category.create.mockResolvedValue({ id: 'c1', slug: 'fps' });
      const result = await service.adminCreate({ name: 'FPS', slug: 'fps' } as any);
      expect(result).toEqual({ id: 'c1', slug: 'fps' });
    });

    it('throws ConflictException when slug already exists', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.adminCreate({ name: 'FPS', slug: 'taken' } as any))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('adminUpdate', () => {
    it('throws NotFoundException when category does not exist', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);
      await expect(service.adminUpdate('bad-id', {} as any))
        .rejects.toThrow(NotFoundException);
    });

    it('updates category when it exists', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'c1' });
      mockPrisma.category.update.mockResolvedValue({ id: 'c1', name: 'Updated' });
      const result = await service.adminUpdate('c1', { name: 'Updated' } as any);
      expect(result).toEqual({ id: 'c1', name: 'Updated' });
    });

    it('throws ConflictException when slug is taken by another category', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'c1' });
      mockPrisma.category.findFirst.mockResolvedValue({ id: 'c2' });
      await expect(service.adminUpdate('c1', { slug: 'taken' } as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('adminDelete', () => {
    it('throws NotFoundException when category does not exist', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);
      await expect(service.adminDelete('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('deletes category when it exists', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({ id: 'c1' });
      mockPrisma.category.delete.mockResolvedValue({});
      await service.adminDelete('c1');
      expect(mockPrisma.category.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });
  });
});
