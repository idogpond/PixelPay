'use client';
import { useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { clsx } from 'clsx';
import { apiFetch } from '../../lib/api-client';

export interface Product {
  id: string;
  name: string;
  priceSell: string;
  requiresServer: boolean;
  requiresUsername: boolean;
}

interface Props {
  products: Product[];
}

type FormData = { gameUid: string; gameServer?: string; gameUsername?: string; couponCode?: string };

export function ProductSelector({ products }: Props) {
  const t = useTranslations('games');
  const router = useRouter();
  const [selected, setSelected] = useState<Product | null>(null);
  const selectedRef = useRef<Product | null>(null);

  // Conditional requirements depend on which product is selected, so the
  // refinement reads the ref (current at validation time) rather than state.
  const resolver = useMemo(
    () =>
      zodResolver(
        z
          .object({
            gameUid: z.string().min(1, t('errors.uidRequired')).max(100),
            gameServer: z.string().max(100).optional(),
            gameUsername: z.string().max(100).optional(),
            couponCode: z.string().max(50).optional(),
          })
          .superRefine((data, ctx) => {
            const p = selectedRef.current;
            if (p?.requiresServer && !data.gameServer?.trim()) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gameServer'], message: t('errors.serverRequired') });
            }
            if (p?.requiresUsername && !data.gameUsername?.trim()) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gameUsername'], message: t('errors.usernameRequired') });
            }
          }),
      ),
    [t],
  );

  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<FormData>({ resolver });

  const pick = (p: Product) => {
    setSelected(p);
    selectedRef.current = p;
  };

  const onSubmit = async (data: FormData) => {
    const product = selectedRef.current;
    if (!product) {
      setError('root', { message: t('errors.pickFirst') });
      return;
    }
    try {
      const order = await apiFetch<{ id: string }>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          gameProductId: product.id,
          paymentMethod: 'WALLET',
          gameUid: data.gameUid,
          gameServer: data.gameServer?.trim() || undefined,
          gameUsername: data.gameUsername?.trim() || undefined,
          couponCode: data.couponCode?.trim() || undefined,
        }),
      });
      router.push(`/orders/${order.id}`);
    } catch (e: any) {
      setError('root', { message: e.message });
    }
  };

  const inputClasses =
    'w-full border border-frost/15 bg-void px-3 py-2.5 text-frost focus:outline-none focus:ring-2 focus:ring-pixel focus:border-pixel';
  const labelClasses = 'block text-xs font-mono uppercase tracking-wider text-frost/50 mb-1';

  return (
    <div className="grid md:grid-cols-2 gap-8">
      <section>
        <h2 className="font-display text-xl text-frost mb-4">{t('pickPackage')}</h2>
        {products.length === 0 && (
          <p className="text-frost/40 py-8">{t('noPackages')}</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p)}
              className={clsx(
                'pixel-cut text-left bg-panel p-4 border transition-all hover:-translate-y-0.5',
                selected?.id === p.id
                  ? 'border-pixel shadow-glow'
                  : 'border-frost/10 hover:border-pixel',
              )}
            >
              <p className="font-body font-bold text-frost text-sm">{p.name}</p>
              <p className="font-mono text-neon font-bold mt-2 tabular-nums">
                ฿{Number(p.priceSell).toLocaleString('th-TH')}
              </p>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl text-frost mb-4">{t('enterDetails')}</h2>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="pixel-cut bg-panel border border-frost/10 p-6 space-y-4"
        >
          <div>
            <label htmlFor="gameUid" className={labelClasses}>{t('gameUid')}</label>
            <input id="gameUid" {...register('gameUid')} className={inputClasses} placeholder={t('gameUidPlaceholder')} />
            {errors.gameUid && <p className="text-pink text-xs mt-1">{errors.gameUid.message}</p>}
          </div>

          {selected?.requiresServer && (
            <div>
              <label htmlFor="gameServer" className={labelClasses}>{t('server')}</label>
              <input id="gameServer" {...register('gameServer')} className={inputClasses} placeholder={t('serverPlaceholder')} />
              {errors.gameServer && <p className="text-pink text-xs mt-1">{errors.gameServer.message}</p>}
            </div>
          )}

          {selected?.requiresUsername && (
            <div>
              <label htmlFor="gameUsername" className={labelClasses}>{t('username')}</label>
              <input id="gameUsername" {...register('gameUsername')} className={inputClasses} placeholder={t('usernamePlaceholder')} />
              {errors.gameUsername && <p className="text-pink text-xs mt-1">{errors.gameUsername.message}</p>}
            </div>
          )}

          <div>
            <label htmlFor="couponCode" className={labelClasses}>{t('coupon')}</label>
            <input id="couponCode" {...register('couponCode')} className={inputClasses} placeholder="PIXEL10" />
            {errors.couponCode && <p className="text-pink text-xs mt-1">{errors.couponCode.message}</p>}
          </div>

          {errors.root && (
            <div className="bg-pink/10 border border-pink/30 px-3 py-2 text-pink text-sm">
              {errors.root.message}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !selected}
            className="w-full grad-brand text-white py-2.5 font-body font-bold pixel-cut hover:brightness-110 disabled:opacity-50 transition-colors"
          >
            {isSubmitting
              ? t('placingOrder')
              : selected
                ? t('payFromCredits', { amount: Number(selected.priceSell).toLocaleString('th-TH') })
                : t('pickToContinue')}
          </button>
          <p className="text-xs text-frost/40 text-center">
            {t('paidFromCreditsNote')}
          </p>
        </form>
      </section>
    </div>
  );
}
