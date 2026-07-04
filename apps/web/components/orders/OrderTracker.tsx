'use client';
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Clock, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { getAccessToken } from '../../lib/api-client';
import { CreditCounter } from '../ui/CreditCounter';

type OrderStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

const STATUS_CONFIG: Record<OrderStatus, { label: string; tone: 'gold' | 'neon' | 'mint' | 'pink'; Icon: typeof Clock }> = {
  PENDING: { label: 'Pending', tone: 'gold', Icon: Clock },
  PROCESSING: { label: 'Processing', tone: 'neon', Icon: Loader2 },
  COMPLETED: { label: 'Completed', tone: 'mint', Icon: CheckCircle2 },
  FAILED: { label: 'Failed', tone: 'pink', Icon: XCircle },
};

interface Props {
  orderId: string;
  initialStatus: OrderStatus;
  userId: string;
}

export function OrderTracker({ orderId, initialStatus, userId }: Props) {
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  const statusRef = useRef(status);

  // Keep ref in sync with state
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (statusRef.current === 'COMPLETED' || statusRef.current === 'FAILED') return;

    const wsBase = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3000';
    const token = getAccessToken();

    // Connect to the /orders namespace directly in the URL (not as a `path` option)
    const socket: Socket = io(`${wsBase}/orders`, {
      auth: { token },
    });

    socket.on('connect', () => socket.emit('join'));
    socket.on('order.status', (data: { orderId: string; status: OrderStatus }) => {
      if (data.orderId === orderId) {
        setStatus(data.status);
        statusRef.current = data.status;
        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          socket.disconnect();
        }
      }
    });

    return () => { socket.disconnect(); };
  }, [orderId, userId]);

  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  const isLive = status === 'PENDING' || status === 'PROCESSING';

  return (
    <CreditCounter
      label="Order status"
      tone={config.tone}
      live={isLive}
      value={
        <span className="inline-flex items-center gap-2">
          <config.Icon size={16} className={status === 'PROCESSING' ? 'animate-spin' : ''} />
          {config.label}
        </span>
      }
    />
  );
}
