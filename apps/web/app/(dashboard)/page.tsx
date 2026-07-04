import Image from 'next/image';
import { apiFetch } from '../../lib/api-client';
import { GameCard } from '../../components/games/GameCard';
import { Zap, ShieldCheck, BadgePercent } from 'lucide-react';

interface Game {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  category: string | null;
}

// The logo's own tagline — เติมเกมไว ปลอดภัย คุ้มค่า — is the value prop,
// so the feature trio simply spells it out.
const PROMISES = [
  { th: 'เติมเกมไว', en: 'Orders clear in seconds', Icon: Zap },
  { th: 'ปลอดภัย', en: 'Paid by PromptPay, tracked live', Icon: ShieldCheck },
  { th: 'คุ้มค่า', en: 'Fair prices in THB, no card needed', Icon: BadgePercent },
];

export default async function HomePage() {
  const games = await apiFetch<Game[]>('/games').catch(() => []);

  return (
    <div>
      <section className="bg-void-deep text-frost overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 pt-12 pb-14 grid md:grid-cols-[1fr_auto] items-center gap-8">
          <div>
            <p className="font-display text-sm tracking-[0.2em] text-neon mb-4">
              เติมเกมไว · ปลอดภัย · คุ้มค่า
            </p>
            <h1 className="font-display italic font-bold text-5xl sm:text-6xl leading-[1.02] max-w-2xl">
              <span className="text-frost">Top up fast.</span>
              <br />
              <span className="grad-text">Play non-stop.</span>
            </h1>
            <p className="text-frost/60 mt-5 max-w-md font-light">
              Scan a PromptPay QR and your credits land in the game before the code goes cold.
            </p>

            <dl className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl">
              {PROMISES.map(({ th, en, Icon }) => (
                <div key={th} className="flex items-start gap-3">
                  <Icon size={20} className="text-pixel-bright shrink-0 mt-1" />
                  <div>
                    <dt className="font-display font-semibold text-sm">{th}</dt>
                    <dd className="text-frost/50 text-sm font-light">{en}</dd>
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
        <h2 className="font-display text-2xl text-frost mb-6">Choose a game</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {games.map((g) => <GameCard key={g.id} {...g} />)}
        </div>
        {games.length === 0 && (
          <div className="text-center py-20 text-frost/40 font-body">
            No games are live right now — check back soon.
          </div>
        )}
      </section>
    </div>
  );
}
