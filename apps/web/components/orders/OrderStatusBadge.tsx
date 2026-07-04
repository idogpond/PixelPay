export type OrderStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REFUNDED'
  | 'CANCELLED';

const STATUS_CLASSES: Record<OrderStatus, string> = {
  PENDING: 'bg-gold/15 text-gold',
  PROCESSING: 'bg-neon/15 text-neon',
  COMPLETED: 'bg-mint/15 text-mint',
  FAILED: 'bg-pink/15 text-pink',
  REFUNDED: 'bg-frost/10 text-frost/60',
  CANCELLED: 'bg-frost/10 text-frost/50',
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
  CANCELLED: 'Cancelled',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const classes = STATUS_CLASSES[status] ?? STATUS_CLASSES.PENDING;
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${classes}`}>
      {label}
    </span>
  );
}
