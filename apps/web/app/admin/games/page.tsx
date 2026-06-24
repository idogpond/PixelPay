'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api-client';
import { GameFormModal, GameFormData } from '../../../components/admin/games/GameFormModal';

interface Game {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  isActive: boolean;
  sortOrder: number;
  logoUrl: string | null;
}

export default function AdminGamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; game: Game } | null>(null);

  const load = async () => {
    try {
      const data = await apiFetch<Game[]>('/admin/games');
      setGames(data);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async (data: GameFormData) => {
    await apiFetch('/admin/games', { method: 'POST', body: JSON.stringify(data) });
    setModal(null);
    load();
  };

  const handleEdit = async (data: GameFormData) => {
    if (modal?.mode !== 'edit') return;
    await apiFetch(`/admin/games/${modal.game.id}`, { method: 'PATCH', body: JSON.stringify(data) });
    setModal(null);
    load();
  };

  const handleDelete = async (game: Game) => {
    if (!confirm(`Delete "${game.name}"? This will also delete all its products.`)) return;
    try {
      await apiFetch(`/admin/games/${game.id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (error) return <div className="text-red-500">Error: {error}</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Games</h1>
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-semibold"
        >
          + New Game
        </button>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Slug</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Order</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {games.length === 0 && (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">No games yet. Click &quot;+ New Game&quot; to create one.</td></tr>
            )}
            {games.map((g) => (
              <tr key={g.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{g.name}</td>
                <td className="px-4 py-3 text-gray-500 font-mono">{g.slug}</td>
                <td className="px-4 py-3 text-gray-500">{g.category ?? '—'}</td>
                <td className="px-4 py-3 text-center text-gray-500">{g.sortOrder}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${g.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {g.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link href={`/admin/games/${g.id}`} className="text-blue-600 hover:underline text-xs">Products</Link>
                    <button onClick={() => setModal({ mode: 'edit', game: g })} className="text-gray-500 hover:text-gray-800 text-xs">Edit</button>
                    <button onClick={() => handleDelete(g)} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal?.mode === 'create' && (
        <GameFormModal title="New Game" onSubmit={handleCreate} onClose={() => setModal(null)} />
      )}
      {modal?.mode === 'edit' && (
        <GameFormModal
          title={`Edit — ${modal.game.name}`}
          initial={{ ...modal.game, category: modal.game.category ?? undefined, logoUrl: modal.game.logoUrl ?? undefined }}
          onSubmit={handleEdit}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
