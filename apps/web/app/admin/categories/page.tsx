'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '../../../lib/api-client';
import { CategoryFormModal, CategoryFormData } from '../../../components/admin/categories/CategoryFormModal';

interface Category {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder: number;
}

export default function AdminCategoriesPage() {
  const t = useTranslations('admin.categories');
  const tc = useTranslations('common');
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; category: Category } | null>(null);

  const load = async () => {
    try {
      const data = await apiFetch<Category[]>('/admin/categories');
      setCategories(data);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async (data: CategoryFormData) => {
    await apiFetch('/admin/categories', { method: 'POST', body: JSON.stringify(data) });
    setModal(null);
    load();
  };

  const handleEdit = async (data: CategoryFormData) => {
    if (modal?.mode !== 'edit') return;
    await apiFetch(`/admin/categories/${modal.category.id}`, { method: 'PATCH', body: JSON.stringify(data) });
    setModal(null);
    load();
  };

  const handleDelete = async (category: Category) => {
    if (!confirm(t('deleteConfirm', { name: category.name }))) return;
    try {
      await apiFetch(`/admin/categories/${category.id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      setError(e.message);
    }
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
          {t('newCategory')}
        </button>
      </div>

      <div className="pixel-cut bg-panel border border-frost/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-void-deep">
            <tr>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('name')}</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('slug')}</th>
              <th className="text-center px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('order')}</th>
              <th className="text-center px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">{t('status')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-frost/5">
            {categories.length === 0 && (
              <tr><td colSpan={5} className="text-center py-12 text-frost/40">{t('noCategories')}</td></tr>
            )}
            {categories.map((c) => (
              <tr key={c.id} className="hover:bg-panel-light/60">
                <td className="px-4 py-3 font-medium text-frost">{c.name}</td>
                <td className="px-4 py-3 text-frost/50 font-mono">{c.slug}</td>
                <td className="px-4 py-3 text-center text-frost/50 font-mono tabular-nums">{c.sortOrder}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.isActive ? 'bg-mint/15 text-mint' : 'bg-frost/10 text-frost/50'}`}>
                    {c.isActive ? tc('active') : tc('inactive')}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button onClick={() => setModal({ mode: 'edit', category: c })} className="text-frost/50 hover:text-frost text-xs">{tc('edit')}</button>
                    <button onClick={() => handleDelete(c)} className="text-pink hover:text-pink-dim text-xs">{tc('delete')}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal?.mode === 'create' && (
        <CategoryFormModal title={t('newCategoryTitle')} onSubmit={handleCreate} onClose={() => setModal(null)} />
      )}
      {modal?.mode === 'edit' && (
        <CategoryFormModal
          title={t('editTitle', { name: modal.category.name })}
          initial={modal.category}
          onSubmit={handleEdit}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
