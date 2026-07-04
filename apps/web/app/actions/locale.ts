'use server';
import { cookies } from 'next/headers';

const LOCALES = ['en', 'th'] as const;
export type Locale = (typeof LOCALES)[number];

export async function setLocale(locale: Locale) {
  if (!LOCALES.includes(locale)) return;
  cookies().set('pixelpay-locale', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
}
