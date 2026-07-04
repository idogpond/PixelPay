import { SiteHeader } from '../../components/layout/SiteHeader';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-void">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <footer className="bg-void-deep border-t border-white/5 py-6 text-center">
        <p className="font-display text-sm text-frost/50">เติมเกมไว ปลอดภัย คุ้มค่า</p>
        <p className="text-xs text-frost/30 mt-1 font-light">PixelPay — game top-ups over PromptPay</p>
      </footer>
    </div>
  );
}
