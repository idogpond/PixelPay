'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api-client';
import { DataTable } from '../../../components/admin/DataTable';
import { OrderStatusBadge, OrderStatus } from '../../../components/orders/OrderStatusBadge';

interface AdminOrder {
  id: string;
  orderNumber: string;
  totalPrice: string;
  status: OrderStatus;
  gameUid: string;
  createdAt: string;
  user: { email: string; displayName: string };
  gameProduct: { name: string };
}

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

const STATUSES: OrderStatus[] = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED'];
const OVERRIDE_STATUSES: OrderStatus[] = ['COMPLETED', 'FAILED', 'REFUNDED'];
const LIMIT = 20;

export default function AdminOrdersPage() {
  const [data, setData] = useState<Paginated<AdminOrder> | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<Paginated<AdminOrder>>('/admin/orders', {
      params: {
        page: String(page),
        limit: String(LIMIT),
        ...(statusFilter ? { status: statusFilter } : {}),
      },
    }).then(setData).catch((e) => setError(e.message));
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const retry = async (order: AdminOrder) => {
    setBusyId(order.id);
    try {
      await apiFetch(`/admin/orders/${order.id}/retry`, { method: 'POST' });
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const overrideStatus = async (order: AdminOrder, status: string) => {
    if (!status) return;
    if (!confirm(`Set ${order.orderNumber} to ${status}?`)) return;
    setBusyId(order.id);
    try {
      await apiFetch(`/admin/orders/${order.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl text-frost">Orders</h1>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border border-frost/15 bg-void px-3 py-2 text-sm text-frost focus:outline-none focus:ring-2 focus:ring-pixel"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {error && <div className="text-pink mb-4">Error: {error}</div>}
      {!data && !error && <div className="text-frost/40 py-8">Loading…</div>}

      {data && (
        <>
          <DataTable<AdminOrder>
            emptyMessage="No orders match this filter."
            data={data.items}
            columns={[
              {
                key: 'orderNumber',
                header: 'Order',
                render: (_, row) => <span className="font-mono text-frost">{row.orderNumber}</span>,
              },
              {
                key: 'user',
                header: 'Customer',
                render: (_, row) => (
                  <div>
                    <p className="text-frost">{row.user.displayName}</p>
                    <p className="text-xs text-frost/40">{row.user.email}</p>
                  </div>
                ),
              },
              {
                key: 'gameProduct',
                header: 'Product',
                render: (_, row) => (
                  <div>
                    <p>{row.gameProduct.name}</p>
                    <p className="text-xs text-frost/40 font-mono">UID {row.gameUid}</p>
                  </div>
                ),
              },
              {
                key: 'totalPrice',
                header: 'Total',
                render: (_, row) => (
                  <span className="font-mono tabular-nums">฿{Number(row.totalPrice).toLocaleString('th-TH')}</span>
                ),
              },
              {
                key: 'createdAt',
                header: 'Placed',
                render: (_, row) => (
                  <span className="text-frost/50 whitespace-nowrap">{new Date(row.createdAt).toLocaleString('th-TH')}</span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (_, row) => <OrderStatusBadge status={row.status} />,
              },
              {
                key: 'id',
                header: 'Actions',
                render: (_, row) => (
                  <div className="flex items-center gap-2">
                    {row.status === 'FAILED' && (
                      <button
                        onClick={() => retry(row)}
                        disabled={busyId === row.id}
                        className="text-neon hover:underline text-xs font-semibold disabled:opacity-50"
                      >
                        Retry
                      </button>
                    )}
                    <select
                      value=""
                      onChange={(e) => overrideStatus(row, e.target.value)}
                      disabled={busyId === row.id}
                      className="border border-frost/15 bg-void px-2 py-1 text-xs text-frost/60 focus:outline-none disabled:opacity-50"
                    >
                      <option value="">Override…</option>
                      {OVERRIDE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                ),
              },
            ]}
          />

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-frost/60">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 border border-frost/15 hover:border-pixel disabled:opacity-40 transition-colors"
              >
                ← Previous
              </button>
              <span className="font-mono text-xs">Page {page} of {totalPages} · {data.total} orders</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 border border-frost/15 hover:border-pixel disabled:opacity-40 transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
