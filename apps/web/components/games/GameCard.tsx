import Image from 'next/image';
import Link from 'next/link';
import { Gamepad2 } from 'lucide-react';

interface Props {
  name: string;
  slug: string;
  logoUrl: string | null;
  category: string | null;
}

export function GameCard({ name, slug, logoUrl, category }: Props) {
  return (
    <Link
      href={`/games/${slug}`}
      className="pixel-cut group block bg-panel p-3 border border-frost/10 transition-all hover:-translate-y-0.5 hover:border-pixel hover:shadow-glow"
    >
      <div className="relative w-full h-32 mb-3 overflow-hidden bg-panel-light">
        {logoUrl ? (
          <Image src={logoUrl} alt={name} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="flex items-center justify-center h-full text-frost/30">
            <Gamepad2 size={36} strokeWidth={1.5} />
          </div>
        )}
      </div>
      <h3 className="font-body font-bold text-frost truncate">{name}</h3>
      {category && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-frost/40 mt-1">{category}</p>
      )}
    </Link>
  );
}
