import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { apiFetch } from '../../lib/api-client';
import { GameCategoryFilter } from '../../components/games/GameCategoryFilter';
import { Zap, ShieldCheck, BadgePercent } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Game {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  category: Category | null;
}

// The logo's tagline (เติมเกมไว ปลอดภัย คุ้มค่า) is the value prop,
// so the feature trio simply spells it out.
const PROMISES = [
  { titleKey: 'promiseSpeedTitle', key: 'promiseSpeed', Icon: Zap },
  { titleKey: 'promiseSafetyTitle', key: 'promiseSafety', Icon: ShieldCheck },
  { titleKey: 'promiseValueTitle', key: 'promiseValue', Icon: BadgePercent },
] as const;

export default async function HomePage() {
  const t = await getTranslations('home');
  const [games, categories] = await Promise.all([
    apiFetch<Game[]>('/games').catch(() => []),
    apiFetch<Category[]>('/categories').catch(() => []),
  ]);

  return (
    <div>
      <section className="bg-void-deep text-frost overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 pt-12 pb-14 grid md:grid-cols-[1fr_auto] items-center gap-8">
          <div>
            <p className="font-display text-sm tracking-[0.2em] text-neon mb-4">
              {t('heroTagline')}
            </p>
            <h1 className="font-display italic font-bold text-5xl sm:text-6xl leading-[1.02] max-w-2xl">
              <span className="text-frost">{t('heroLine1')}</span>
              <br />
              <span className="grad-text">{t('heroLine2')}</span>
            </h1>
            <p className="text-frost/60 mt-5 max-w-md font-light">
              {t('heroSub')}
            </p>

            <dl className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl">
              {PROMISES.map(({ titleKey, key, Icon }) => (
                <div key={key} className="flex items-start gap-3">
                  <Icon size={20} className="text-pixel-bright shrink-0 mt-1" />
                  <div>
                    <dt className="font-display font-semibold text-sm">{t(titleKey)}</dt>
                    <dd className="text-frost/50 text-sm font-light">{t(key)}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>

          <div className="hidden md:block relative w-64 lg:w-80 aspect-square select-none" aria-hidden>
            <div className="absolute inset-0 rounded-full bg-pixel/20 blur-3xl" />
            <Image src="/logo-mark.png" alt="" fill className="object-contain relative mix-blend-screen" priority />
          </div>
        </div>
        <div className="glow-strip" />
      </section>

      <section className="max-w-6xl mx-auto px-4 py-10">
        <h2 className="font-display text-2xl text-frost mb-6">{t('chooseGame')}</h2>
        <GameCategoryFilter games={games} categories={categories} />
      </section>
    </div>
  );
}
