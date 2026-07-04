export interface WalletTransaction {
  id: string;
  type:
    | 'DEPOSIT'
    | 'WITHDRAWAL'
    | 'TOPUP_DEBIT'
    | 'TOPUP_REFUND'
    | 'CASHBACK_CREDIT'
    | 'AFFILIATE_CREDIT'
    | 'LOCK'
    | 'UNLOCK';
  amount: string;
  balanceAfter: string;
  metadata: { description?: string } | null;
  createdAt: string;
}

const TYPE_CONFIG: Record<WalletTransaction['type'], { label: string; credit: boolean }> = {
  DEPOSIT: { label: 'Deposit', credit: true },
  WITHDRAWAL: { label: 'Withdrawal', credit: false },
  TOPUP_DEBIT: { label: 'Top-up', credit: false },
  TOPUP_REFUND: { label: 'Refund', credit: true },
  CASHBACK_CREDIT: { label: 'Cashback', credit: true },
  AFFILIATE_CREDIT: { label: 'Affiliate', credit: true },
  LOCK: { label: 'Hold', credit: false },
  UNLOCK: { label: 'Hold released', credit: true },
};

export function TransactionList({ transactions }: { transactions: WalletTransaction[] }) {
  return (
    <div className="pixel-cut bg-panel border border-frost/10 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-void-deep">
          <tr>
            <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">Date</th>
            <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">Type</th>
            <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">Description</th>
            <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">Amount</th>
            <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-frost/5">
          {transactions.length === 0 && (
            <tr>
              <td colSpan={5} className="text-center py-12 text-frost/40">No transactions yet.</td>
            </tr>
          )}
          {transactions.map((t) => {
            const config = TYPE_CONFIG[t.type] ?? { label: t.type, credit: false };
            return (
              <tr key={t.id} className="hover:bg-panel-light/60">
                <td className="px-4 py-3 text-frost/50 whitespace-nowrap">
                  {new Date(t.createdAt).toLocaleString('th-TH')}
                </td>
                <td className="px-4 py-3 text-frost">{config.label}</td>
                <td className="px-4 py-3 text-frost/50">{t.metadata?.description ?? '—'}</td>
                <td
                  className={`px-4 py-3 text-right font-mono tabular-nums font-medium ${config.credit ? 'text-mint' : 'text-pink'}`}
                >
                  {config.credit ? '+' : '−'}฿{Number(t.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-frost/60">
                  ฿{Number(t.balanceAfter).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
