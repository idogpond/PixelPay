import { Injectable } from '@nestjs/common';

@Injectable()
export class AnalyticsService {
  getRevenueTrend(_period: 'day' | 'week' | 'month') {
    return { items: [], period: _period };
  }

  getOrderStats(_period: 'day' | 'week' | 'month') {
    return { items: [], period: _period };
  }

  getUserGrowth() {
    return { items: [] };
  }
}
