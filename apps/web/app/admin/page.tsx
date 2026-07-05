'use client';
import { useEffect, useState } from 'react';
import { Users, Package, Clock, CircleDollarSign } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '../../lib/api-client';
import { StatsCard } from '../../components/admin/StatsCard';

interface Stats {
  totalUsers: number;
  totalOrders: number;
  pendingOrders: number;
  todayOrders: number;
  totalRevenue: number;
}

export default function AdminDashboard() {
  const t = useTranslations('admin.dashboard');
  const tc = useTranslations('common');
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Stats>('/admin/stats').then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="p-8 text-pink">{tc('error', { message: error })}</div>;
  if (!stats) return <div className="p-8 text-frost/40">{tc('loading')}</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl text-frost mb-6">{t('title')}</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard title={t('totalUsers')} value={stats.totalUsers.toLocaleString()} icon={Users} />
        <StatsCard title={t('totalOrders')} value={stats.totalOrders.toLocaleString()} icon={Package} />
        <StatsCard title={t('pendingOrders')} value={stats.pendingOrders} icon={Clock} />
        <StatsCard title={t('revenue')} value={`฿${Number(stats.totalRevenue).toLocaleString('th-TH')}`} icon={CircleDollarSign} />
      </div>
    </div>
  );
}
