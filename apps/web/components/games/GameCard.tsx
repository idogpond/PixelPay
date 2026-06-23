import Image from 'next/image';
import Link from 'next/link';

interface Props {
  name: string;
  slug: string;
  logoUrl: string | null;
  category: string | null;
}

export function GameCard({ name, slug, logoUrl, category }: Props) {
  return (
    <Link href={`/games/${slug}`} className="group block bg-white rounded-xl shadow hover:shadow-md transition-shadow p-4">
      <div className="relative w-full h-32 mb-3 rounded-lg overflow-hidden bg-gray-100">
        {logoUrl ? (
          <Image src={logoUrl} alt={name} fill className="object-cover group-hover:scale-105 transition-transform" />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-4xl">🎮</div>
        )}
      </div>
      <h3 className="font-semibold text-gray-800 truncate">{name}</h3>
      {category && <p className="text-xs text-gray-400 mt-1">{category}</p>}
    </Link>
  );
}
