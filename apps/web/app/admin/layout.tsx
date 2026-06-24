import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-4 flex items-center gap-6">
        <span className="font-bold text-brand text-lg">PixelPay Admin</span>
        <Link href="/admin" className="text-sm text-gray-600 hover:text-brand">Dashboard</Link>
        <Link href="/admin/games" className="text-sm text-gray-600 hover:text-brand">Games</Link>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
