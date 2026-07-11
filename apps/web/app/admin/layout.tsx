import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { ThemeToggle } from '../../components/theme/ThemeToggle';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('admin.nav');
  return (
    <div className="min-h-screen bg-void">
      <nav className="bg-void-deep text-frost px-6 py-3 flex items-center gap-6 border-b border-frost/10">
        <span className="flex items-center gap-2">
          <Image src="/logo-mark.png" alt="" width={32} height={26} className="mix-blend-screen" />
          <span className="font-display italic font-bold text-lg">
            <span className="text-frost">Pixel</span><span className="grad-text">Pay</span>
            <span className="text-frost/50 text-sm font-body not-italic font-normal align-middle ml-2">{t('badge')}</span>
          </span>
        </span>
        <Link href="/admin" className="text-sm font-body text-frost/70 hover:text-pixel-bright transition-colors">{t('dashboard')}</Link>
        <Link href="/admin/games" className="text-sm font-body text-frost/70 hover:text-pixel-bright transition-colors">{t('games')}</Link>
        <Link href="/admin/categories" className="text-sm font-body text-frost/70 hover:text-pixel-bright transition-colors">{t('categories')}</Link>
        <Link href="/admin/orders" className="text-sm font-body text-frost/70 hover:text-pixel-bright transition-colors">{t('orders')}</Link>
        <Link href="/admin/users" className="text-sm font-body text-frost/70 hover:text-pixel-bright transition-colors">{t('users')}</Link>
        <div className="ml-auto flex items-center gap-4">
          <ThemeToggle />
          <LanguageSwitcher />
          <Link href="/" className="text-sm font-body text-frost/40 hover:text-pixel-bright transition-colors">{t('backToStore')}</Link>
        </div>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
