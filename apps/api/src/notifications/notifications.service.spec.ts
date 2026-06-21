import { Test } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';

describe('NotificationsService', () => {
  let service: NotificationsService;
  const mockPrisma = {
    notification: { create: jest.fn().mockResolvedValue({ id: 'n1' }) },
  };
  const mockQueue = { add: jest.fn().mockResolvedValue({}) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('notifications'), useValue: mockQueue },
      ],
    }).compile();
    service = module.get(NotificationsService);
  });

  it('creates notification and enqueues dispatch job', async () => {
    await service.send({
      userId: 'u1',
      type: 'ORDER_COMPLETED',
      channel: 'EMAIL',
      title: 'Test',
      body: 'Body',
    });
    expect(mockPrisma.notification.create).toHaveBeenCalled();
    expect(mockQueue.add).toHaveBeenCalledWith(
      'dispatch',
      { notificationId: 'n1' },
      expect.any(Object),
    );
  });
});
