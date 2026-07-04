'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '../../../../lib/api-client';
import { ProductFormModal, ProductFormData } from '../../../../components/admin/games/ProductFormModal';

interface Product {
  id: string;
  name: string;
  sku: string;
  priceCost: number;
  priceSell: number;
  currency: string;
  productType: 'DIRECT' | 'VOUCHER';
  requiresServer: boolean;
  requiresUsername: boolean;
  isActive: boolean;
  sortOrder: number;
}

interface Game {
  id: string;
  name: string;
  slug: string;
}

export default function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [game, setGame] = useState<Game | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; product: Product } | null>(null);

  const loadGame = async () => {
    try {
      const all = await apiFetch<Game[]>('/admin/games');
      setGame(all.find((g) => g.id === id) ?? null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const loadProducts = async () => {
    try {
      const data = await apiFetch<Product[]>(`/admin/games/${id}/products`);
      setProducts(data);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    loadGame();
    loadProducts();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async (data: ProductFormData) => {
    await apiFetch(`/admin/games/${id}/products`, { method: 'POST', body: JSON.stringify(data) });
    setModal(null);
    loadProducts();
  };

  const handleEdit = async (data: ProductFormData) => {
    if (modal?.mode !== 'edit') return;
    await apiFetch(`/admin/games/${id}/products/${modal.product.id}`, { method: 'PATCH', body: JSON.stringify(data) });
    setModal(null);
    loadProducts();
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`Delete product "${product.name}"?`)) return;
    try {
      await apiFetch(`/admin/games/${id}/products/${product.id}`, { method: 'DELETE' });
      loadProducts();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (error) return <div className="text-pink">Error: {error}</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/games" className="text-frost/40 hover:text-frost text-sm">← Games</Link>
        <h1 className="font-display text-2xl text-frost">{game?.name ?? 'Game'} — Products</h1>
      </div>

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="grad-brand text-white px-4 py-2 pixel-cut text-sm font-bold hover:brightness-110 transition-colors"
        >
          + Add product
        </button>
      </div>

      <div className="pixel-cut bg-panel border border-frost/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-void-deep">
            <tr>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">Name</th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">SKU</th>
              <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">Cost</th>
              <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">Sell</th>
              <th className="text-center px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">Type</th>
              <th className="text-center px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-frost/60">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-frost/5">
            {products.length === 0 && (
              <tr><td colSpan={7} className="text-center py-12 text-frost/40">No products yet. Click &quot;+ Add product&quot; to create one.</td></tr>
            )}
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-panel-light/60">
                <td className="px-4 py-3 font-medium text-frost">{p.name}</td>
                <td className="px-4 py-3 font-mono text-frost/50">{p.sku}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-frost/50">฿{Number(p.priceCost).toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-frost">฿{Number(p.priceSell).toFixed(2)}</td>
                <td className="px-4 py-3 text-center">
                  <span className="text-xs bg-neon/15 text-neon px-2 py-0.5 rounded-full">{p.productType}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.isActive ? 'bg-mint/15 text-mint' : 'bg-frost/10 text-frost/50'}`}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button onClick={() => setModal({ mode: 'edit', product: p })} className="text-frost/50 hover:text-frost text-xs">Edit</button>
                    <button onClick={() => handleDelete(p)} className="text-pink hover:text-pink-dim text-xs">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal?.mode === 'create' && (
        <ProductFormModal title="Add Product" onSubmit={handleCreate} onClose={() => setModal(null)} />
      )}
      {modal?.mode === 'edit' && (
        <ProductFormModal
          title={`Edit — ${modal.product.name}`}
          initial={{
            ...modal.product,
            priceCost: Number(modal.product.priceCost),
            priceSell: Number(modal.product.priceSell),
          }}
          onSubmit={handleEdit}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
