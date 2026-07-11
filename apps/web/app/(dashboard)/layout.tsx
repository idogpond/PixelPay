import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '../../components/layout/SiteHeader';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('nav');
  const tc = await getTranslations('common');
  return (
    <div className="min-h-screen flex flex-col bg-void">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <footer className="bg-void-deep border-t border-frost/5 py-6 text-center">
        <p className="font-display text-sm text-frost/50">{tc('tagline')}</p>
        <p className="text-xs text-frost/30 mt-1 font-light">{t('footerNote')}</p>
      </footer>
    </div>
  );
}
