import { Test } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  const mockCreate = jest.fn().mockResolvedValue({ id: 'audit-1' });

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: { auditLog: { create: mockCreate, findMany: jest.fn().mockResolvedValue([]) } } },
      ],
    }).compile();
    service = module.get(AuditService);
  });

  it('logs with all params', async () => {
    await service.log({ userId: 'u1', action: 'POST:AdminController:banUser', newValues: { banned: true } });
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', action: expect.stringContaining('banUser') }),
    });
  });

  it('findAll returns array', async () => {
    const result = await service.findAll();
    expect(Array.isArray(result)).toBe(true);
  });
});
