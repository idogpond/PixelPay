'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { GameCard } from './GameCard';

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

interface Props {
  games: Game[];
  categories: Category[];
}

export function GameCategoryFilter({ games, categories }: Props) {
  const t = useTranslations('home');
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = useMemo(
    () => (selected ? games.filter((g) => g.category?.slug === selected) : games),
    [games, selected],
  );

  return (
    <>
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className={`px-3 py-1.5 pixel-cut text-xs font-mono uppercase tracking-wider transition-colors ${
              selected === null ? 'bg-pixel text-white' : 'bg-panel text-frost/60 hover:text-frost border border-frost/10'
            }`}
          >
            {t('categoryAll')}
          </button>
          {categories.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => setSelected(c.slug)}
              className={`px-3 py-1.5 pixel-cut text-xs font-mono uppercase tracking-wider transition-colors ${
                selected === c.slug ? 'bg-pixel text-white' : 'bg-panel text-frost/60 hover:text-frost border border-frost/10'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filtered.map((g) => <GameCard key={g.id} {...g} />)}
      </div>
      {filtered.length === 0 && (
        <div className="text-center py-20 text-frost/40 font-body">
          {t('noGames')}
        </div>
      )}
    </>
  );
}
