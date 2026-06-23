'use client';
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type OrderStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; icon: string }> = {
  PENDING: { label: 'Pending', color: 'text-yellow-600 bg-yellow-50', icon: '⏳' },
  PROCESSING: { label: 'Processing', color: 'text-blue-600 bg-blue-50', icon: '⚡' },
  COMPLETED: { label: 'Completed', color: 'text-green-600 bg-green-50', icon: '✅' },
  FAILED: { label: 'Failed', color: 'text-red-600 bg-red-50', icon: '❌' },
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

    const socket: Socket = io(process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3000', {
      path: '/orders',
    });

    socket.on('connect', () => socket.emit('join', `user:${userId}`));
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

  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium ${config.color}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
      {(status === 'PENDING' || status === 'PROCESSING') && (
        <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
    </div>
  );
}
