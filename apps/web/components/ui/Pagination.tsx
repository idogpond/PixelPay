'use client';
import { useTranslations } from 'next-intl';

interface Props {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  suffix?: string;
}

export function Pagination({ page, totalPages, onPageChange, suffix }: Props) {
  const t = useTranslations('common');
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-4 text-sm text-frost/60">
      <button
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="px-3 py-1.5 border border-frost/15 hover:border-pixel disabled:opacity-40 transition-colors"
      >
        {t('previous')}
      </button>
      <span className="font-mono text-xs">
        {t('pageOf', { page, total: totalPages })}
        {suffix ? ` ${suffix}` : ''}
      </span>
      <button
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="px-3 py-1.5 border border-frost/15 hover:border-pixel disabled:opacity-40 transition-colors"
      >
        {t('next')}
      </button>
    </div>
  );
}
