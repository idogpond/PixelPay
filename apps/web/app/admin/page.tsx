'use client';
import { useEffect, useState } from 'react';
import { Users, Package, Clock, CircleDollarSign } from 'lucide-react';
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
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Stats>('/admin/stats').then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="p-8 text-pink">Error: {error}</div>;
  if (!stats) return <div className="p-8 text-frost/40">Loading…</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl text-frost mb-6">Admin dashboard</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard title="Total users" value={stats.totalUsers.toLocaleString()} icon={Users} />
        <StatsCard title="Total orders" value={stats.totalOrders.toLocaleString()} icon={Package} />
        <StatsCard title="Pending orders" value={stats.pendingOrders} icon={Clock} />
        <StatsCard title="Revenue" value={`฿${Number(stats.totalRevenue).toLocaleString('th-TH')}`} icon={CircleDollarSign} />
      </div>
    </div>
  );
}
