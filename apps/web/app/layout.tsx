import type { Metadata } from 'next';
import { Chakra_Petch, Prompt, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../components/AuthProvider';

// Chakra Petch & Prompt are Thai foundry faces — they carry both the Latin UI
// text and the Thai brand tagline without fallback-font seams.
const display = Chakra_Petch({
  weight: ['600', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin', 'thai'],
  variable: '--font-display',
  display: 'swap',
});

const body = Prompt({
  weight: ['300', '400', '500', '600'],
  subsets: ['latin', 'thai'],
  variable: '--font-body',
  display: 'swap',
});

const counter = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-counter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PixelPay — เติมเกมไว ปลอดภัย คุ้มค่า',
  description: 'Game top-ups over PromptPay — fast, safe, great value.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${counter.variable}`}>
      <body className="bg-void text-frost antialiased font-body">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
