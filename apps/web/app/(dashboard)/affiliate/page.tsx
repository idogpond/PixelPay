'use client';
import { useEffect, useState } from 'react';
import { Users, CircleDollarSign, Hourglass, Copy, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '../../../lib/api-client';
import { StatsCard } from '../../../components/admin/StatsCard';
import { CreditCounter } from '../../../components/ui/CreditCounter';
import { Pagination } from '../../../components/ui/Pagination';

interface Dashboard {
  referralCode: string;
  totalReferrals: number;
  totalEarnings: number;
  pendingEarnings: number;
  status: 'ACTIVE' | 'SUSPENDED';
}

interface Commission {
  id: string;
  commissionAmount: number;
  status: 'PENDING' | 'PAID';
  createdAt: string;
  order: { orderNumber: string; totalPrice: number; createdAt: string };
}

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

const LIMIT = 20;

export default function AffiliatePage() {
  const t = useTranslations('affiliate');
  const tc = useTranslations('common');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [commissions, setCommissions] = useState<Paginated<Commission> | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch<Dashboard>('/affiliates/dashboard').then(setDashboard).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    apiFetch<Paginated<Commission>>('/affiliates/commissions', {
      params: { page: String(page), limit: String(LIMIT) },
    }).then(setCommissions).catch((e) => setError(e.message));
  }, [page]);

  const referralLink = dashboard
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/register?ref=${dashboard.referralCode}`
    : '';

  const copyLink = async () => {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalPages = commissions ? Math.max(1, Math.ceil(commissions.total / commissions.limit)) : 1;

  if (error) return <div className="max-w-4xl mx-auto px-4 py-10 text-pink">{tc('error', { message: error })}</div>;
  if (!dashboard) return <div className="max-w-4xl mx-auto px-4 py-10 text-frost/40">{tc('loading')}</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="font-display text-3xl text-frost mb-1">{t('title')}</h1>
      <p className="text-sm text-frost/50 mb-8">
        {t('subtitle')}
        {dashboard.status === 'SUSPENDED' && (
          <span className="text-pink font-medium">{' '}{t('suspendedNote')}</span>
        )}
      </p>

      <div className="pixel-cut bg-void-deep p-6 mb-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <CreditCounter label={t('referralCode')} value={dashboard.referralCode} tone="pixel" />
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-2 grad-brand text-white px-4 py-2 pixel-cut text-sm font-bold hover:brightness-110 transition-colors"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? t('copied') : t('copyLink')}
          </button>
        </div>
        <p className="text-frost/40 text-xs mt-3 font-mono break-all">{referralLink}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <StatsCard title={t('referrals')} value={dashboard.totalReferrals.toLocaleString()} icon={Users} />
        <StatsCard
          title={t('totalEarned')}
          value={`฿${dashboard.totalEarnings.toLocaleString('th-TH')}`}
          icon={CircleDollarSign}
        />
        <StatsCard
          title={t('pendingPayout')}
          value={`฿${dashboard.pendingEarnings.toLocaleString('th-TH')}`}
          icon={Hourglass}
        />
      </div>

      <h2 className="font-display text-xl text-frost mb-4">{t('commissions')}</h2>
      {commissions ? (
        <>
          <div className="pixel-cut bg-panel border border-frost/10 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-void-deep">
                <tr>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('table.date')}</th>
                  <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('table.order')}</th>
                  <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('table.orderTotal')}</th>
                  <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('table.commission')}</th>
                  <th className="text-center px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('table.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-frost/5">
                {commissions.items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-frost/40">
                      {t('noCommissions')}
                    </td>
                  </tr>
                )}
                {commissions.items.map((c) => (
                  <tr key={c.id} className="hover:bg-panel-light/60">
                    <td className="px-4 py-3 text-frost/50 whitespace-nowrap">
                      {new Date(c.createdAt).toLocaleDateString('th-TH')}
                    </td>
                    <td className="px-4 py-3 font-mono text-frost">{c.order.orderNumber}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-frost/60">
                      ฿{c.order.totalPrice.toLocaleString('th-TH')}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-medium text-mint">
                      +฿{c.commissionAmount.toLocaleString('th-TH')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.status === 'PAID' ? 'bg-mint/15 text-mint' : 'bg-gold/15 text-neon'
                        }`}
                      >
                        {c.status === 'PAID' ? t('paid') : t('pending')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      ) : (
        <div className="text-frost/40 py-8">{tc('loading')}</div>
      )}
    </div>
  );
}
