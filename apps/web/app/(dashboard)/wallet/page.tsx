'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '../../../lib/api-client';
import { CreditCounter } from '../../../components/ui/CreditCounter';
import { Pagination } from '../../../components/ui/Pagination';
import { QrPaymentModal } from '../../../components/wallet/QrPaymentModal';
import { TransactionList, WalletTransaction } from '../../../components/wallet/TransactionList';

interface Wallet {
  balance: string;
  lockedBalance: string;
}

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

const PRESETS = [100, 300, 500, 1000];
const LIMIT = 20;

export default function WalletPage() {
  const t = useTranslations('wallet');
  const tc = useTranslations('common');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Paginated<WalletTransaction> | null>(null);
  const [page, setPage] = useState(1);
  const [amount, setAmount] = useState<number>(PRESETS[0]);
  const [customAmount, setCustomAmount] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<Wallet>('/wallet').then(setWallet).catch((e) => setError(e.message));
    apiFetch<Paginated<WalletTransaction>>('/wallet/transactions', {
      params: { page: String(page), limit: String(LIMIT) },
    }).then(setTransactions).catch((e) => setError(e.message));
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const effectiveAmount = customAmount ? Number(customAmount) : amount;
  const amountValid = Number.isFinite(effectiveAmount) && effectiveAmount > 0;
  const totalPages = transactions ? Math.max(1, Math.ceil(transactions.total / transactions.limit)) : 1;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="font-display text-3xl text-frost mb-6">{t('title')}</h1>

      {error && <div className="text-pink mb-4">{tc('error', { message: error })}</div>}

      <div className="grid md:grid-cols-2 gap-6 mb-10">
        <div className="pixel-cut bg-void-deep p-6 flex flex-wrap gap-6">
          {wallet ? (
            <>
              <CreditCounter
                label={t('credits')}
                value={`฿${Number(wallet.balance).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`}
                tone="neon"
                size="lg"
              />
              {Number(wallet.lockedBalance) > 0 && (
                <CreditCounter
                  label={t('onHold')}
                  value={`฿${Number(wallet.lockedBalance).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`}
                  tone="pixel"
                  size="sm"
                />
              )}
            </>
          ) : (
            <p className="text-frost/40">{tc('loading')}</p>
          )}
        </div>

        <div className="pixel-cut bg-panel border border-frost/10 p-6">
          <h2 className="font-display text-lg text-frost mb-3">{t('addCredits')}</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => { setAmount(p); setCustomAmount(''); }}
                className={`px-3 py-1.5 border text-sm font-mono tabular-nums transition-colors ${
                  !customAmount && amount === p
                    ? 'border-pixel bg-pixel/10 text-frost'
                    : 'border-frost/15 text-frost/60 hover:border-pixel'
                }`}
              >
                ฿{p.toLocaleString('th-TH')}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={1}
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder={t('customAmount')}
            className="w-full border border-frost/15 bg-void px-3 py-2.5 text-frost focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel mb-3"
          />
          <button
            onClick={() => setShowQr(true)}
            disabled={!amountValid}
            className="w-full grad-brand text-white py-2.5 font-body font-bold pixel-cut hover:brightness-110 disabled:opacity-50 transition-colors"
          >
            {amountValid
              ? t('topUpVia', { amount: effectiveAmount.toLocaleString('th-TH') })
              : t('enterAmount')}
          </button>
        </div>
      </div>

      <h2 className="font-display text-xl text-frost mb-4">{t('history')}</h2>
      {transactions ? (
        <>
          <TransactionList transactions={transactions.items} />
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      ) : (
        <div className="text-frost/40 py-8">{tc('loading')}</div>
      )}

      {showQr && amountValid && (
        <QrPaymentModal
          amount={effectiveAmount}
          onClose={() => setShowQr(false)}
          onSuccess={() => { setShowQr(false); load(); }}
        />
      )}
    </div>
  );
}
