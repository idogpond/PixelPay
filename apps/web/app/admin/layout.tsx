import Image from 'next/image';
import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-void">
      <nav className="bg-void-deep text-frost px-6 py-3 flex items-center gap-6 border-b border-white/10">
        <span className="flex items-center gap-2">
          <Image src="/logo-mark.png" alt="" width={32} height={26} className="mix-blend-screen" />
          <span className="font-display italic font-bold text-lg">
            <span className="text-frost">Pixel</span><span className="grad-text">Pay</span>
            <span className="text-frost/50 text-sm font-body not-italic font-normal align-middle ml-2">Admin</span>
          </span>
        </span>
        <Link href="/admin" className="text-sm font-body text-frost/70 hover:text-pixel-bright transition-colors">Dashboard</Link>
        <Link href="/admin/games" className="text-sm font-body text-frost/70 hover:text-pixel-bright transition-colors">Games</Link>
        <Link href="/admin/orders" className="text-sm font-body text-frost/70 hover:text-pixel-bright transition-colors">Orders</Link>
        <Link href="/admin/users" className="text-sm font-body text-frost/70 hover:text-pixel-bright transition-colors">Users</Link>
        <Link href="/" className="ml-auto text-sm font-body text-frost/40 hover:text-pixel-bright transition-colors">← Store</Link>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
