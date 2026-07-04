'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiFetch } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth.store';
import { CreditCounter } from '../ui/CreditCounter';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import { ThemeToggle } from '../theme/ThemeToggle';

interface Wallet {
  balance: string;
}

export function SiteHeader() {
  const t = useTranslations('nav');
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [wallet, setWallet] = useState<Wallet | null>(null);

  useEffect(() => {
    if (!user) { setWallet(null); return; }
    apiFetch<Wallet>('/wallet').then(setWallet).catch(() => setWallet(null));
  }, [user]);

  const handleLogout = () => {
    document.cookie = 'pixelpay-token=; path=/; max-age=0';
    document.cookie = 'pixelpay-refresh=; path=/; max-age=0';
    logout();
    router.push('/login');
  };

  return (
    <header className="bg-void-deep text-frost sticky top-0 z-40 border-b border-frost/10">
      <div className="glow-strip" />
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/logo-mark.png" alt="" width={40} height={33} priority className="mix-blend-screen" />
          <span className="font-display italic font-bold text-xl tracking-wide">
            <span className="text-frost">Pixel</span><span className="grad-text">Pay</span>
          </span>
        </Link>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          <LanguageSwitcher />
          {user ? (
            <>
              <nav className="hidden sm:flex items-center gap-4">
                <Link href="/orders" className="text-sm font-body text-frost/70 hover:text-pixel-bright transition-colors">
                  {t('orders')}
                </Link>
                <Link href="/wallet" className="text-sm font-body text-frost/70 hover:text-pixel-bright transition-colors">
                  {t('wallet')}
                </Link>
                <Link href="/affiliate" className="text-sm font-body text-frost/70 hover:text-pixel-bright transition-colors">
                  {t('affiliate')}
                </Link>
                {user.role === 'ADMIN' && (
                  <Link href="/admin" className="text-sm font-body text-neon hover:text-pixel-bright transition-colors">
                    {t('admin')}
                  </Link>
                )}
              </nav>
              {wallet && (
                <Link href="/wallet">
                  <CreditCounter
                    label={t('credits')}
                    value={`฿${Number(wallet.balance).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`}
                    tone="neon"
                    size="sm"
                  />
                </Link>
              )}
              <Link
                href="/profile"
                className="hidden sm:block text-sm text-frost/60 font-body hover:text-pixel-bright transition-colors"
              >
                {user.displayName}
              </Link>
              <button
                onClick={handleLogout}
                className="text-sm font-body text-frost/70 hover:text-pixel-bright transition-colors"
              >
                {t('logout')}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm font-body text-frost/80 hover:text-pixel-bright transition-colors">
                {t('login')}
              </Link>
              <Link
                href="/register"
                className="text-sm font-semibold font-body grad-brand text-white px-4 py-2 pixel-cut hover:brightness-110 transition-colors"
              >
                {t('getCredits')}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
