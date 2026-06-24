'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Lowercase, numbers and hyphens only'),
  category: z.string().max(50).optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  description: z.string().max(500).optional(),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0),
});

export type GameFormData = z.infer<typeof schema>;

interface Props {
  initial?: Partial<GameFormData>;
  onSubmit: (data: GameFormData) => Promise<void>;
  onClose: () => void;
  title: string;
}

export function GameFormModal({ initial, onSubmit, onClose, title }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<GameFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      isActive: true,
      sortOrder: 0,
      ...initial,
    },
  });

  const submit = async (data: GameFormData) => {
    try {
      await onSubmit(data);
    } catch (e: any) {
      setError('root', { message: e.message });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold mb-4">{title}</h2>
        <form onSubmit={handleSubmit(submit)} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input {...register('name')} className="w-full border rounded-lg px-3 py-2 text-sm" />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Slug * <span className="text-gray-400 font-normal">(lowercase-hyphens)</span></label>
            <input {...register('slug')} className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="mobile-legends" />
            {errors.slug && <p className="text-red-500 text-xs mt-1">{errors.slug.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <input {...register('category')} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="MOBA, RPG, FPS…" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Logo URL</label>
            <input {...register('logoUrl')} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="https://…" />
            {errors.logoUrl && <p className="text-red-500 text-xs mt-1">{errors.logoUrl.message}</p>}
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Sort Order</label>
              <input type="number" {...register('sortOrder')} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex items-end gap-2 pb-2">
              <input type="checkbox" id="isActive" {...register('isActive')} className="w-4 h-4" />
              <label htmlFor="isActive" className="text-sm font-medium">Active</label>
            </div>
          </div>
          {errors.root && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-600 text-sm">
              {errors.root.message}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="flex-1 bg-brand text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
              {isSubmitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
