export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-4 flex items-center gap-4">
        <span className="font-bold text-brand text-lg">PixelPay Admin</span>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
