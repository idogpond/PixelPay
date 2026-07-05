'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('admin.games');
  const tc = useTranslations('common');
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
    if (!confirm(t('deleteConfirm', { name: game.name }))) return;
    try {
      await apiFetch(`/admin/games/${game.id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (error) return <div className="text-pink">{tc('error', { message: error })}</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl text-frost">{t('title')}</h1>
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="grad-brand text-white px-4 py-2 pixel-cut text-sm font-bold hover:brightness-110 transition-colors"
        >
          {t('newGame')}
        </button>
      </div>

      <div className="pixel-cut bg-panel border border-frost/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-void-deep">
            <tr>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('name')}</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('slug')}</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('category')}</th>
              <th className="text-center px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('order')}</th>
              <th className="text-center px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('status')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-frost/5">
            {games.length === 0 && (
              <tr><td colSpan={6} className="text-center py-12 text-frost/40">{t('noGames')}</td></tr>
            )}
            {games.map((g) => (
              <tr key={g.id} className="hover:bg-panel-light/60">
                <td className="px-4 py-3 font-medium text-frost">{g.name}</td>
                <td className="px-4 py-3 text-frost/50 font-mono">{g.slug}</td>
                <td className="px-4 py-3 text-frost/50">{g.category ?? '—'}</td>
                <td className="px-4 py-3 text-center text-frost/50 font-mono tabular-nums">{g.sortOrder}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${g.isActive ? 'bg-mint/15 text-mint' : 'bg-frost/10 text-frost/50'}`}>
                    {g.isActive ? tc('active') : tc('inactive')}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/admin/games/${g.id}`} className="text-neon hover:underline text-xs font-semibold">{t('products')}</Link>
                    <button onClick={() => setModal({ mode: 'edit', game: g })} className="text-frost/50 hover:text-frost text-xs">{tc('edit')}</button>
                    <button onClick={() => handleDelete(g)} className="text-pink hover:text-pink-dim text-xs">{tc('delete')}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal?.mode === 'create' && (
        <GameFormModal title={t('newGameTitle')} onSubmit={handleCreate} onClose={() => setModal(null)} />
      )}
      {modal?.mode === 'edit' && (
        <GameFormModal
          title={t('editTitle', { name: modal.game.name })}
          initial={{ ...modal.game, category: modal.game.category ?? undefined, logoUrl: modal.game.logoUrl ?? undefined }}
          onSubmit={handleEdit}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
