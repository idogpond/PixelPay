'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';

const schema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().min(1).max(100),
  priceCost: z.coerce.number().min(0),
  priceSell: z.coerce.number().min(0),
  currency: z.string().length(3).default('THB'),
  productType: z.enum(['DIRECT', 'VOUCHER']).default('DIRECT'),
  requiresServer: z.boolean().default(false),
  requiresUsername: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export type ProductFormData = z.infer<typeof schema>;

interface Props {
  initial?: Partial<ProductFormData>;
  onSubmit: (data: ProductFormData) => Promise<void>;
  onClose: () => void;
  title: string;
}

export function ProductFormModal({ initial, onSubmit, onClose, title }: Props) {
  const t = useTranslations('admin.products.form');
  const tc = useTranslations('common');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<ProductFormData>({
    resolver: zodResolver(schema),
    defaultValues: { currency: 'THB', productType: 'DIRECT', isActive: true, sortOrder: 0, requiresServer: false, requiresUsername: false, ...initial },
  });

  const submit = async (data: ProductFormData) => {
    try { await onSubmit(data); }
    catch (e: any) { setError('root', { message: e.message }); }
  };

  return (
    <div className="fixed inset-0 bg-void-deep/80 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="pixel-cut bg-panel border border-frost/10 w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="font-display text-lg text-frost mb-4">{title}</h2>
        <form onSubmit={handleSubmit(submit)} className="space-y-3">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('name')}</label>
            <input {...register('name')} className="w-full border border-frost/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" placeholder="100 Diamonds" />
            {errors.name && <p className="text-pink text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('sku')}</label>
              <input {...register('sku')} className="w-full border border-frost/15 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" placeholder="MLBB-100" />
              {errors.sku && <p className="text-pink text-xs mt-1">{errors.sku.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('currency')}</label>
              <input {...register('currency')} className="w-full border border-frost/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('costPrice')}</label>
              <input type="number" step="0.01" {...register('priceCost')} className="w-full border border-frost/15 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" />
              {errors.priceCost && <p className="text-pink text-xs mt-1">{errors.priceCost.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('sellPrice')}</label>
              <input type="number" step="0.01" {...register('priceSell')} className="w-full border border-frost/15 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" />
              {errors.priceSell && <p className="text-pink text-xs mt-1">{errors.priceSell.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('type')}</label>
              <select {...register('productType')} className="w-full border border-frost/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel">
                <option value="DIRECT">DIRECT</option>
                <option value="VOUCHER">VOUCHER</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">{t('sortOrder')}</label>
              <input type="number" {...register('sortOrder')} className="w-full border border-frost/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" />
            </div>
          </div>
          <div className="flex gap-6 pt-1">
            <label className="flex items-center gap-2 text-sm text-frost">
              <input type="checkbox" {...register('requiresServer')} className="w-4 h-4 accent-pixel" />
              {t('requiresServer')}
            </label>
            <label className="flex items-center gap-2 text-sm text-frost">
              <input type="checkbox" {...register('requiresUsername')} className="w-4 h-4 accent-pixel" />
              {t('requiresUsername')}
            </label>
            <label className="flex items-center gap-2 text-sm text-frost">
              <input type="checkbox" {...register('isActive')} className="w-4 h-4 accent-pixel" />
              {t('active')}
            </label>
          </div>
          {errors.root && (
            <div className="bg-pink/10 border border-pink/30 px-3 py-2 text-pink text-sm">
              {errors.root.message}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-frost/15 py-2 text-sm text-frost/60 hover:bg-panel-light">{tc('cancel')}</button>
            <button type="submit" disabled={isSubmitting} className="flex-1 grad-brand text-white py-2 text-sm font-bold hover:brightness-110 disabled:opacity-50 transition-colors">
              {isSubmitting ? tc('saving') : tc('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
