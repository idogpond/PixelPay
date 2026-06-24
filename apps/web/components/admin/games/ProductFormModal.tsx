'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-4">{title}</h2>
        <form onSubmit={handleSubmit(submit)} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Product Name *</label>
            <input {...register('name')} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="100 Diamonds" />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">SKU *</label>
              <input {...register('sku')} className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="MLBB-100" />
              {errors.sku && <p className="text-red-500 text-xs mt-1">{errors.sku.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Currency</label>
              <input {...register('currency')} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Cost Price (฿) *</label>
              <input type="number" step="0.01" {...register('priceCost')} className="w-full border rounded-lg px-3 py-2 text-sm" />
              {errors.priceCost && <p className="text-red-500 text-xs mt-1">{errors.priceCost.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Sell Price (฿) *</label>
              <input type="number" step="0.01" {...register('priceSell')} className="w-full border rounded-lg px-3 py-2 text-sm" />
              {errors.priceSell && <p className="text-red-500 text-xs mt-1">{errors.priceSell.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select {...register('productType')} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="DIRECT">DIRECT</option>
                <option value="VOUCHER">VOUCHER</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Sort Order</label>
              <input type="number" {...register('sortOrder')} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-6 pt-1">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register('requiresServer')} className="w-4 h-4" />
              Requires Server
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register('requiresUsername')} className="w-4 h-4" />
              Requires Username
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register('isActive')} className="w-4 h-4" />
              Active
            </label>
          </div>
          {errors.root && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-600 text-sm">
              {errors.root.message}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="flex-1 bg-brand text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
              {isSubmitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
