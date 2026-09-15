'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '../../../lib/api-client';
import { ProviderFormModal, ProviderFormData } from '../../../components/admin/providers/ProviderFormModal';

interface Provider {
  id: string;
  name: string;
  slug: string;
  apiUrl: string;
  priority: number;
  isActive: boolean;
  rateLimitPerMin: number;
  healthCheckUrl: string | null;
}

export default function AdminProvidersPage() {
  const t = useTranslations('admin.providers');
  const tc = useTranslations('common');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; provider: Provider } | null>(null);

  const load = async () => {
    try {
      const data = await apiFetch<Provider[]>('/admin/providers');
      setProviders(data);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async (data: ProviderFormData) => {
    await apiFetch('/admin/providers', { method: 'POST', body: JSON.stringify(data) });
    setModal(null);
    load();
  };

  const handleEdit = async (data: ProviderFormData) => {
    if (modal?.mode !== 'edit') return;
    await apiFetch(`/admin/providers/${modal.provider.id}`, { method: 'PATCH', body: JSON.stringify(data) });
    setModal(null);
    load();
  };

  if (error) return <div className="text-pink">{tc('error', { message: error })}</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl text-frost">{t('title')}</h1>
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="grad-brand text-white px-4 py-2 pixel-cut text-sm font-bold hover:brightness-110 transition-colors"
        >
          {t('newProvider')}
        </button>
      </div>

      <p className="text-sm text-frost/50 mb-4">{t('credentialHint')}</p>

      <div className="pixel-cut bg-panel border border-frost/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-void-deep">
            <tr>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('name')}</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('slug')}</th>
              <th className="text-center px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('priority')}</th>
              <th className="text-center px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('rateLimit')}</th>
              <th className="text-center px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('status')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-frost/5">
            {providers.length === 0 && (
              <tr><td colSpan={6} className="text-center py-12 text-frost/40">{t('noProviders')}</td></tr>
            )}
            {providers.map((p) => (
              <tr key={p.id} className="hover:bg-panel-light/60">
                <td className="px-4 py-3 font-medium text-frost">{p.name}</td>
                <td className="px-4 py-3 text-frost/50 font-mono">{p.slug}</td>
                <td className="px-4 py-3 text-center text-frost/50 font-mono tabular-nums">{p.priority}</td>
                <td className="px-4 py-3 text-center text-frost/50 font-mono tabular-nums">{p.rateLimitPerMin}/min</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.isActive ? 'bg-mint/15 text-mint' : 'bg-frost/10 text-frost/50'}`}>
                    {p.isActive ? tc('active') : tc('inactive')}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setModal({ mode: 'edit', provider: p })} className="text-frost/50 hover:text-frost text-xs">{tc('edit')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal?.mode === 'create' && (
        <ProviderFormModal title={t('newProviderTitle')} isEdit={false} onSubmit={handleCreate} onClose={() => setModal(null)} />
      )}
      {modal?.mode === 'edit' && (
        <ProviderFormModal
          title={t('editTitle', { name: modal.provider.name })}
          isEdit
          initial={{ ...modal.provider, healthCheckUrl: modal.provider.healthCheckUrl ?? '', apiKey: '', apiSecret: '' } as Partial<ProviderFormData>}
          onSubmit={handleEdit}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
