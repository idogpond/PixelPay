'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
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
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const byCategory = selected ? games.filter((g) => g.category?.slug === selected) : games;
    const q = query.trim().toLowerCase();
    return q ? byCategory.filter((g) => g.name.toLowerCase().includes(q)) : byCategory;
  }, [games, selected, query]);

  return (
    <>
      <div className="relative mb-5 max-w-xs">
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-frost/40" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="w-full pixel-cut bg-panel border border-frost/10 pl-9 pr-3 py-2 text-sm text-frost placeholder:text-frost/30 focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel"
        />
      </div>
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
          {games.length === 0 ? t('noGames') : t('noSearchResults')}
        </div>
      )}
    </>
  );
}
