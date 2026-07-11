'use client';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';

export interface CategoryFormData {
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder: number;
}

interface Props {
  initial?: Partial<CategoryFormData>;
  onSubmit: (data: CategoryFormData) => Promise<void>;
  onClose: () => void;
  title: string;
}

export function CategoryFormModal({ initial, onSubmit, onClose, title }: Props) {
  const t = useTranslations('admin.categories.form');
  const tc = useTranslations('common');
  const resolver = useMemo(
    () =>
      zodResolver(
        z.object({
          name: z.string().min(1).max(50),
          slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, t('slugPattern')),
          isActive: z.boolean(),
          sortOrder: z.coerce.number().int().min(0),
        }),
      ),
    [t],
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<CategoryFormData>({
    resolver,
    defaultValues: {
      isActive: true,
      sortOrder: 0,
      ...initial,
    },
  });

  const submit = async (data: CategoryFormData) => {
    try {
      await onSubmit(data);
    } catch (e: any) {
      setError('root', { message: e.message });
    }
  };

  return (
    <div className="fixed inset-0 bg-void-deep/80 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="pixel-cut bg-panel border border-frost/10 w-full max-w-md p-6">
        <h2 className="font-display text-lg text-frost mb-4">{title}</h2>
        <form onSubmit={handleSubmit(submit)} className="space-y-3">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('name')}</label>
            <input {...register('name')} className="w-full border border-frost/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" />
            {errors.name && <p className="text-pink text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('slugLabel')} <span className="text-frost/30 normal-case font-body">{t('slugHint')}</span></label>
            <input {...register('slug')} className="w-full border border-frost/15 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" placeholder="battle-royale" />
            {errors.slug && <p className="text-pink text-xs mt-1">{errors.slug.message}</p>}
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('sortOrder')}</label>
              <input type="number" {...register('sortOrder')} className="w-full border border-frost/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" />
            </div>
            <div className="flex items-end gap-2 pb-2">
              <input type="checkbox" id="isActive" {...register('isActive')} className="w-4 h-4 accent-pixel" />
              <label htmlFor="isActive" className="text-sm font-medium text-frost">{t('active')}</label>
            </div>
          </div>
          {errors.root && (
            <div className="bg-pink/10 border border-pink/30 px-3 py-2 text-pink text-sm">
              {errors.root.message}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-frost/15 py-2 text-sm text-frost/60 hover:bg-panel-light">
              {tc('cancel')}
            </button>
            <button type="submit" disabled={isSubmitting} className="flex-1 grad-brand text-white py-2 text-sm font-bold hover:brightness-110 disabled:opacity-50 transition-colors">
              {isSubmitting ? tc('saving') : tc('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
