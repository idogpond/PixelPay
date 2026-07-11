import type { Metadata } from 'next';
import { Chakra_Petch, Prompt, JetBrains_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
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

// Runs before hydration so the page never flashes the wrong theme.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('pixelpay-theme');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.dataset.theme = theme;
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${display.variable} ${body.variable} ${counter.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-void text-frost antialiased font-body transition-colors duration-200">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthProvider>{children}</AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
