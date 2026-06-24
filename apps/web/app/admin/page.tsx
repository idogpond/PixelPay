'use client';
import { useEffect, useState } from 'react';
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

  if (error) return <div className="p-8 text-red-500">Error: {error}</div>;
  if (!stats) return <div className="p-8 text-gray-400">Loading...</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard title="Total Users" value={stats.totalUsers.toLocaleString()} icon="👥" />
        <StatsCard title="Total Orders" value={stats.totalOrders.toLocaleString()} icon="📦" />
        <StatsCard title="Pending Orders" value={stats.pendingOrders} icon="⏳" />
        <StatsCard title="Revenue" value={`฿${Number(stats.totalRevenue).toLocaleString('th-TH')}`} icon="💰" />
      </div>
    </div>
  );
}
