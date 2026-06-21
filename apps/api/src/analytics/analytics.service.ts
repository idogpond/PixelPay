import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getRevenueTrend(period: 'day' | 'week' | 'month') {
    const truncUnit = period === 'day' ? 'hour' : 'day';
    const since = this.sinceDate(period);

    const rows = await this.prisma.$queryRaw<
      Array<{ date: Date; revenue: number; count: bigint }>
    >`
      SELECT
        DATE_TRUNC(${Prisma.raw(`'${truncUnit}'`)}, created_at) AS date,
        SUM(total_price)::float AS revenue,
        COUNT(*)::bigint AS count
      FROM orders
      WHERE status = 'COMPLETED'
        AND created_at >= ${since}
      GROUP BY DATE_TRUNC(${Prisma.raw(`'${truncUnit}'`)}, created_at)
      ORDER BY date ASC
    `;

    return rows.map((r) => ({
      date: r.date,
      revenue: r.revenue ?? 0,
      count: Number(r.count),
    }));
  }

  async getOrderStats(period: 'day' | 'week' | 'month') {
    const since = this.sinceDate(period);

    const rows = await this.prisma.$queryRaw<
      Array<{ status: string; count: bigint }>
    >`
      SELECT status, COUNT(*)::bigint AS count
      FROM orders
      WHERE created_at >= ${since}
      GROUP BY status
    `;

    const result: Record<string, number> = {};
    rows.forEach((r) => {
      result[r.status] = Number(r.count);
    });
    return result;
  }

  async getUserGrowth() {
    const rows = await this.prisma.$queryRaw<
      Array<{ date: Date; count: bigint }>
    >`
      SELECT DATE_TRUNC('day', created_at) AS date, COUNT(*)::bigint AS count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date ASC
    `;

    return rows.map((r) => ({ date: r.date, count: Number(r.count) }));
  }

  private sinceDate(period: 'day' | 'week' | 'month'): Date {
    const d = new Date();
    if (period === 'day') d.setDate(d.getDate() - 1);
    else if (period === 'week') d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    return d;
  }
}
