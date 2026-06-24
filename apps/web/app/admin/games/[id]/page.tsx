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
    const all = await apiFetch<Game[]>('/admin/games');
    setGame(all.find((g) => g.id === id) ?? null);
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

  if (error) return <div className="text-red-500">Error: {error}</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/games" className="text-gray-400 hover:text-gray-600 text-sm">← Games</Link>
        <h1 className="text-2xl font-bold">{game?.name ?? 'Game'} — Products</h1>
      </div>

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="bg-brand text-white px-4 py-2 rounded-lg text-sm font-semibold"
        >
          + Add Product
        </button>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">SKU</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Cost</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Sell</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Type</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {products.length === 0 && (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">No products yet. Click &quot;+ Add Product&quot; to create one.</td></tr>
            )}
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 font-mono text-gray-500">{p.sku}</td>
                <td className="px-4 py-3 text-right text-gray-500">฿{Number(p.priceCost).toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-semibold">฿{Number(p.priceSell).toFixed(2)}</td>
                <td className="px-4 py-3 text-center">
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{p.productType}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setModal({ mode: 'edit', product: p })} className="text-gray-500 hover:text-gray-800 text-xs">Edit</button>
                    <button onClick={() => handleDelete(p)} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
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
