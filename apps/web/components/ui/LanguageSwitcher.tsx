'use client';
import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { setLocale, Locale } from '../../app/actions/locale';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const switchTo = (next: Locale) => {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  };

  return (
    <div
      role="group"
      aria-label="Language"
      className="flex items-center border border-frost/20 font-mono text-xs pixel-cut"
    >
      {(['en', 'th'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchTo(l)}
          disabled={isPending}
          aria-pressed={l === locale}
          className={
            l === locale
              ? 'px-2 py-1 bg-pixel/20 text-pixel-bright font-bold'
              : 'px-2 py-1 text-frost/50 hover:text-frost transition-colors'
          }
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
