import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { apiFetch } from '../../../../lib/api-client';
import { ProductSelector, Product } from '../../../../components/games/ProductSelector';

interface Game {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  description: string | null;
  descriptionTh: string | null;
  category: { name: string } | null;
}

export default async function GameDetailPage({ params }: { params: { slug: string } }) {
  const [locale, game, products] = await Promise.all([
    getLocale(),
    apiFetch<Game>(`/games/${params.slug}`).catch(() => null),
    apiFetch<Product[]>(`/games/${params.slug}/products`).catch(() => [] as Product[]),
  ]);

  if (!game) notFound();

  const description = (locale === 'th' ? game.descriptionTh : null) ?? game.description;

  return (
    <div>
      <section className="bg-void-deep text-frost">
        <div className="max-w-6xl mx-auto px-4 py-10 flex items-center gap-6">
          <div className="relative w-20 h-20 shrink-0 overflow-hidden bg-panel-light pixel-cut">
            {game.logoUrl && (
              <Image src={game.logoUrl} alt={game.name} fill className="object-cover" />
            )}
          </div>
          <div>
            {game.category && (
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-neon mb-1">
                {game.category.name}
              </p>
            )}
            <h1 className="font-display text-4xl text-pixel-bright">{game.name}</h1>
            {description && (
              <p className="text-frost/60 mt-2 max-w-xl text-sm">{description}</p>
            )}
          </div>
        </div>
        <div className="glow-strip" />
      </section>

      <section className="max-w-6xl mx-auto px-4 py-10">
        <ProductSelector products={products} />
      </section>
    </div>
  );
}
