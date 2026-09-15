'use client';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';

const SUPPORTED_SLUGS = ['smileone', 'unipin'] as const;

export interface ProviderFormData {
  name: string;
  slug: (typeof SUPPORTED_SLUGS)[number];
  apiUrl: string;
  apiKey: string;
  apiSecret: string;
  priority: number;
  rateLimitPerMin: number;
  healthCheckUrl: string;
  isActive: boolean;
}

interface Props {
  initial?: Partial<ProviderFormData>;
  isEdit: boolean;
  onSubmit: (data: ProviderFormData) => Promise<void>;
  onClose: () => void;
  title: string;
}

export function ProviderFormModal({ initial, isEdit, onSubmit, onClose, title }: Props) {
  const t = useTranslations('admin.providers.form');
  const tc = useTranslations('common');

  const resolver = useMemo(
    () =>
      zodResolver(
        z.object({
          name: z.string().min(1).max(100),
          slug: z.enum(SUPPORTED_SLUGS),
          apiUrl: z.string().url(t('apiUrlInvalid')),
          // Blank is valid on edit (keep existing credential); create requires it — enforced below.
          apiKey: z.string().max(500),
          apiSecret: z.string().max(500),
          priority: z.coerce.number().int().min(1).max(100),
          rateLimitPerMin: z.coerce.number().int().min(1),
          healthCheckUrl: z.union([z.string().url(t('apiUrlInvalid')), z.literal('')]),
          isActive: z.boolean(),
        }),
      ),
    [t],
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<ProviderFormData>({
    resolver,
    defaultValues: {
      slug: 'smileone',
      priority: 1,
      rateLimitPerMin: 60,
      healthCheckUrl: '',
      apiKey: '',
      apiSecret: '',
      isActive: true,
      ...initial,
    },
  });

  const submit = async (data: ProviderFormData) => {
    if (!isEdit && !data.apiKey) {
      setError('apiKey', { message: t('apiKeyRequired') });
      return;
    }
    try {
      await onSubmit(data);
    } catch (e: any) {
      setError('root', { message: e.message });
    }
  };

  return (
    <div className="fixed inset-0 bg-void-deep/80 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="pixel-cut bg-panel border border-frost/10 w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="font-display text-lg text-frost mb-4">{title}</h2>
        <form onSubmit={handleSubmit(submit)} className="space-y-3">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('name')}</label>
            <input {...register('name')} className="w-full border border-frost/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" />
            {errors.name && <p className="text-pink text-xs mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('slug')}</label>
            <select
              {...register('slug')}
              disabled={isEdit}
              className="w-full border border-frost/15 bg-void px-3 py-2 text-sm text-frost focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel disabled:opacity-50"
            >
              {SUPPORTED_SLUGS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('apiUrl')}</label>
            <input {...register('apiUrl')} placeholder={t('apiUrlHint')} className="w-full border border-frost/15 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" />
            {errors.apiUrl && <p className="text-pink text-xs mt-1">{errors.apiUrl.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('apiKey')}</label>
            <input type="password" autoComplete="off" {...register('apiKey')} placeholder={isEdit ? t('keepExisting') : ''} className="w-full border border-frost/15 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" />
            {errors.apiKey && <p className="text-pink text-xs mt-1">{errors.apiKey.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('apiSecret')}</label>
            <input type="password" autoComplete="off" {...register('apiSecret')} placeholder={isEdit ? t('keepExisting') : t('optional')} className="w-full border border-frost/15 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('priority')}</label>
              <input type="number" {...register('priority')} className="w-full border border-frost/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('rateLimit')}</label>
              <input type="number" {...register('rateLimitPerMin')} className="w-full border border-frost/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('healthCheckUrl')} <span className="text-frost/30 normal-case font-body">{t('optional')}</span></label>
            <input {...register('healthCheckUrl')} className="w-full border border-frost/15 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" />
            {errors.healthCheckUrl && <p className="text-pink text-xs mt-1">{errors.healthCheckUrl.message}</p>}
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="isActive" {...register('isActive')} className="w-4 h-4 accent-pixel" />
            <label htmlFor="isActive" className="text-sm font-medium text-frost">{t('active')}</label>
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
