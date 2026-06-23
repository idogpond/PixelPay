import { apiFetch } from '../../lib/api-client';
import { GameCard } from '../../components/games/GameCard';

interface Game {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  category: string | null;
}

export default async function HomePage() {
  const games = await apiFetch<Game[]>('/games').catch(() => []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Top Up Games</h1>
      <p className="text-gray-500 mb-8">Fast, secure game top-ups powered by PixelPay</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {games.map((g) => <GameCard key={g.id} {...g} />)}
      </div>
      {games.length === 0 && (
        <div className="text-center py-20 text-gray-400">No games available yet.</div>
      )}
    </div>
  );
}
