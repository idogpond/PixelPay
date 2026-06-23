import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PixelPay',
  description: 'Fast, secure game top-ups',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
