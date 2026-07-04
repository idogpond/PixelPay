'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api-client';
import { OrderStatusBadge, OrderStatus } from '../../../components/orders/OrderStatusBadge';

interface Order {
  id: string;
  orderNumber: string;
  totalPrice: string;
  status: OrderStatus;
  createdAt: string;
}

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

const LIMIT = 20;

export default function OrdersPage() {
  const [data, setData] = useState<Paginated<Order> | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Paginated<Order>>('/orders', { params: { page: String(page), limit: String(LIMIT) } })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="font-display text-3xl text-frost mb-6">Your orders</h1>

      {error && <div className="text-pink mb-4">Error: {error}</div>}
      {!data && !error && <div className="text-frost/40 py-12">Loading…</div>}

      {data && (
        <>
          <div className="pixel-cut bg-panel border border-frost/10 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-void-deep">
                <tr>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">Order</th>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">Placed</th>
                  <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">Total</th>
                  <th className="text-center px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-frost/5">
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-frost/40">
                      No orders yet — <Link href="/" className="text-neon font-semibold hover:underline">top up a game</Link> to get started.
                    </td>
                  </tr>
                )}
                {data.items.map((o) => (
                  <tr key={o.id} className="hover:bg-panel-light/60">
                    <td className="px-4 py-3 font-mono text-frost">{o.orderNumber}</td>
                    <td className="px-4 py-3 text-frost/50">{new Date(o.createdAt).toLocaleString('th-TH')}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-frost">
                      ฿{Number(o.totalPrice).toLocaleString('th-TH')}
                    </td>
                    <td className="px-4 py-3 text-center"><OrderStatusBadge status={o.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/orders/${o.id}`} className="text-neon hover:underline text-xs font-semibold">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-frost/60">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 border border-frost/15 hover:border-pixel disabled:opacity-40 transition-colors"
              >
                ← Previous
              </button>
              <span className="font-mono text-xs">Page {page} of {totalPages}</span>
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
