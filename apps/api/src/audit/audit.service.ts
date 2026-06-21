import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogParams {
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  log(params: AuditLogParams) {
    return this.prisma.auditLog.create({ data: params as never });
  }

  findAll(page = 1, limit = 50, filters?: { userId?: string; entityType?: string; action?: string }) {
    const where = {
      ...(filters?.userId && { userId: filters.userId }),
      ...(filters?.entityType && { entityType: filters.entityType }),
      ...(filters?.action && { action: { contains: filters.action } }),
    };
    return this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }
}
