'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiFetch } from '../../../../lib/api-client';
import { useAuthStore } from '../../../../stores/auth.store';
import { OrderTracker } from '../../../../components/orders/OrderTracker';
import { OrderStatusBadge, OrderStatus } from '../../../../components/orders/OrderStatusBadge';
import { CreditCounter } from '../../../../components/ui/CreditCounter';

interface Order {
  id: string;
  orderNumber: string;
  unitPrice: string;
  totalPrice: string;
  discountAmount: string;
  paymentMethod: string;
  gameUid: string;
  gameServer: string | null;
  gameUsername: string | null;
  status: OrderStatus;
  createdAt: string;
  completedAt: string | null;
  gameProduct: {
    name: string;
    game: { name: string; slug: string };
  };
}

const TRACKABLE: OrderStatus[] = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'];

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(() => {
    apiFetch<Order>(`/orders/${id}`).then(setOrder).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleCancel = async () => {
    if (!confirm('Cancel this order? Your credits will be released back to your wallet.')) return;
    setCancelling(true);
    try {
      await apiFetch(`/orders/${id}/cancel`, { method: 'POST' });
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCancelling(false);
    }
  };

  if (error) return <div className="max-w-3xl mx-auto px-4 py-10 text-pink">Error: {error}</div>;
  if (!order) return <div className="max-w-3xl mx-auto px-4 py-10 text-frost/40">Loading…</div>;

  const rows: Array<[string, React.ReactNode]> = [
    ['Game', order.gameProduct.game.name],
    ['Package', order.gameProduct.name],
    ['Game UID', <span key="uid" className="font-mono">{order.gameUid}</span>],
    ...(order.gameServer ? [['Server', order.gameServer] as [string, React.ReactNode]] : []),
    ...(order.gameUsername ? [['Username', order.gameUsername] as [string, React.ReactNode]] : []),
    ['Payment', order.paymentMethod === 'WALLET' ? 'PixelPay credits' : 'PromptPay'],
    ['Placed', new Date(order.createdAt).toLocaleString('th-TH')],
    ...(order.completedAt
      ? [['Completed', new Date(order.completedAt).toLocaleString('th-TH')] as [string, React.ReactNode]]
      : []),
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/orders" className="text-sm text-frost/50 hover:text-frost transition-colors">
        ← All orders
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4 mt-3 mb-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-frost/40 mb-1">Order</p>
          <h1 className="font-display text-3xl text-frost">{order.orderNumber}</h1>
        </div>
        {TRACKABLE.includes(order.status) && user ? (
          <OrderTracker orderId={order.id} initialStatus={order.status as 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'} userId={user.id} />
        ) : (
          <OrderStatusBadge status={order.status} />
        )}
      </div>

      <div className="pixel-cut bg-panel border border-frost/10 p-6">
        <dl className="divide-y divide-frost/5">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-2.5 text-sm">
              <dt className="font-mono text-[10px] uppercase tracking-wider text-frost/40 self-center">{label}</dt>
              <dd className="text-frost text-right">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap items-end justify-between gap-4 mt-5 pt-5 border-t border-frost/10">
          <div className="text-sm text-frost/50">
            {Number(order.discountAmount) > 0 && (
              <p>
                Discount: <span className="text-mint font-medium">−฿{Number(order.discountAmount).toLocaleString('th-TH')}</span>
              </p>
            )}
          </div>
          <CreditCounter
            label="Total paid"
            value={`฿${Number(order.totalPrice).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`}
            tone="neon"
          />
        </div>
      </div>

      {order.status === 'PENDING' && (
        <button
          onClick={handleCancel}
          disabled={cancelling}
          className="mt-5 px-4 py-2 border border-pink/40 text-pink text-sm hover:bg-pink/10 disabled:opacity-50 transition-colors"
        >
          {cancelling ? 'Cancelling…' : 'Cancel order'}
        </button>
      )}
    </div>
  );
}
