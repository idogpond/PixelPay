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
    <div className="fixed inset-0 bg-void-deep/80 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="pixel-cut bg-panel border border-frost/10 w-full max-w-md p-6">
        <h2 className="font-display text-lg text-frost mb-4">{title}</h2>
        <form onSubmit={handleSubmit(submit)} className="space-y-3">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">Name *</label>
            <input {...register('name')} className="w-full border border-frost/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" />
            {errors.name && <p className="text-pink text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">Slug * <span className="text-frost/30 normal-case font-body">(lowercase-hyphens)</span></label>
            <input {...register('slug')} className="w-full border border-frost/15 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" placeholder="mobile-legends" />
            {errors.slug && <p className="text-pink text-xs mt-1">{errors.slug.message}</p>}
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">Category</label>
            <input {...register('category')} className="w-full border border-frost/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" placeholder="MOBA, RPG, FPS…" />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">Logo URL</label>
            <input {...register('logoUrl')} className="w-full border border-frost/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" placeholder="https://…" />
            {errors.logoUrl && <p className="text-pink text-xs mt-1">{errors.logoUrl.message}</p>}
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1">Sort order</label>
              <input type="number" {...register('sortOrder')} className="w-full border border-frost/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel" />
            </div>
            <div className="flex items-end gap-2 pb-2">
              <input type="checkbox" id="isActive" {...register('isActive')} className="w-4 h-4 accent-pixel" />
              <label htmlFor="isActive" className="text-sm font-medium text-frost">Active</label>
            </div>
          </div>
          {errors.root && (
            <div className="bg-pink/10 border border-pink/30 px-3 py-2 text-pink text-sm">
              {errors.root.message}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-frost/15 py-2 text-sm text-frost/60 hover:bg-panel-light">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="flex-1 grad-brand text-white py-2 text-sm font-bold hover:brightness-110 disabled:opacity-50 transition-colors">
              {isSubmitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
