'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api-client';
import { DataTable } from '../../../components/admin/DataTable';

type Role = 'USER' | 'ADMIN' | 'RESELLER';

interface AdminUser {
  id: string;
  email: string;
  phone: string | null;
  displayName: string;
  role: Role;
  isVerified: boolean;
  isActive: boolean;
  createdAt: string;
}

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

const ROLES: Role[] = ['USER', 'ADMIN', 'RESELLER'];
const LIMIT = 20;

export default function AdminUsersPage() {
  const [data, setData] = useState<Paginated<AdminUser> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<Paginated<AdminUser>>('/admin/users', {
      params: {
        page: String(page),
        limit: String(LIMIT),
        ...(query ? { search: query } : {}),
      },
    }).then(setData).catch((e) => setError(e.message));
  }, [page, query]);

  useEffect(() => { load(); }, [load]);

  const update = async (user: AdminUser, dto: { isActive?: boolean; role?: Role }) => {
    setBusyId(user.id);
    try {
      await apiFetch(`/admin/users/${user.id}`, { method: 'PATCH', body: JSON.stringify(dto) });
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="font-display text-2xl text-frost">Users</h1>
        <form
          onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); setPage(1); }}
          className="flex gap-2"
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email or name…"
            className="border border-frost/15 bg-void px-3 py-2 text-sm text-frost focus:outline-none focus:ring-2 focus:ring-pixel w-64"
          />
          <button
            type="submit"
            className="grad-brand text-white px-4 py-2 pixel-cut text-sm font-bold hover:brightness-110 transition-colors"
          >
            Search
          </button>
        </form>
      </div>

      {error && <div className="text-pink mb-4">Error: {error}</div>}
      {!data && !error && <div className="text-frost/40 py-8">Loading…</div>}

      {data && (
        <>
          <DataTable<AdminUser>
            emptyMessage="No users found."
            data={data.items}
            columns={[
              {
                key: 'displayName',
                header: 'User',
                render: (_, row) => (
                  <div>
                    <p className="text-frost font-medium">{row.displayName}</p>
                    <p className="text-xs text-frost/40">{row.email}</p>
                  </div>
                ),
              },
              {
                key: 'createdAt',
                header: 'Joined',
                render: (_, row) => (
                  <span className="text-frost/50 whitespace-nowrap">
                    {new Date(row.createdAt).toLocaleDateString('th-TH')}
                  </span>
                ),
              },
              {
                key: 'isVerified',
                header: 'Verified',
                render: (_, row) => (
                  <span className={row.isVerified ? 'text-mint' : 'text-frost/30'}>
                    {row.isVerified ? 'Yes' : 'No'}
                  </span>
                ),
              },
              {
                key: 'role',
                header: 'Role',
                render: (_, row) => (
                  <select
                    value={row.role}
                    onChange={(e) => {
                      const role = e.target.value as Role;
                      if (role !== row.role && confirm(`Change ${row.email} to ${role}?`)) {
                        update(row, { role });
                      } else {
                        e.target.value = row.role;
                      }
                    }}
                    disabled={busyId === row.id}
                    className="border border-frost/15 bg-void px-2 py-1 text-xs text-frost focus:outline-none disabled:opacity-50"
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                ),
              },
              {
                key: 'isActive',
                header: 'Status',
                render: (_, row) => (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${row.isActive ? 'bg-mint/15 text-mint' : 'bg-pink/15 text-pink'}`}>
                    {row.isActive ? 'Active' : 'Suspended'}
                  </span>
                ),
              },
              {
                key: 'id',
                header: 'Actions',
                render: (_, row) => (
                  <button
                    onClick={() => {
                      const verb = row.isActive ? 'Suspend' : 'Reactivate';
                      if (confirm(`${verb} ${row.email}?`)) update(row, { isActive: !row.isActive });
                    }}
                    disabled={busyId === row.id}
                    className={`text-xs font-semibold hover:underline disabled:opacity-50 ${row.isActive ? 'text-pink' : 'text-mint'}`}
                  >
                    {row.isActive ? 'Suspend' : 'Reactivate'}
                  </button>
                ),
              },
            ]}
          />

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-frost/60">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 border border-frost/15 hover:border-pixel disabled:opacity-40 transition-colors"
              >
                ← Previous
              </button>
              <span className="font-mono text-xs">Page {page} of {totalPages} · {data.total} users</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 border border-frost/15 hover:border-pixel disabled:opacity-40 transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
