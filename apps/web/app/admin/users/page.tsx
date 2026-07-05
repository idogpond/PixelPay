'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '../../../lib/api-client';
import { DataTable } from '../../../components/admin/DataTable';
import { Pagination } from '../../../components/ui/Pagination';

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
  const t = useTranslations('admin.users');
  const tc = useTranslations('common');
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
        <h1 className="font-display text-2xl text-frost">{t('title')}</h1>
        <form
          onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); setPage(1); }}
          className="flex gap-2"
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="border border-frost/15 bg-void px-3 py-2 text-sm text-frost focus:outline-none focus:ring-2 focus:ring-pixel w-64"
          />
          <button
            type="submit"
            className="grad-brand text-white px-4 py-2 pixel-cut text-sm font-bold hover:brightness-110 transition-colors"
          >
            {tc('search')}
          </button>
        </form>
      </div>

      {error && <div className="text-pink mb-4">{tc('error', { message: error })}</div>}
      {!data && !error && <div className="text-frost/40 py-8">{tc('loading')}</div>}

      {data && (
        <>
          <DataTable<AdminUser>
            emptyMessage={t('noUsers')}
            data={data.items}
            columns={[
              {
                key: 'displayName',
                header: t('user'),
                render: (_, row) => (
                  <div>
                    <p className="text-frost font-medium">{row.displayName}</p>
                    <p className="text-xs text-frost/40">{row.email}</p>
                  </div>
                ),
              },
              {
                key: 'createdAt',
                header: t('joined'),
                render: (_, row) => (
                  <span className="text-frost/50 whitespace-nowrap">
                    {new Date(row.createdAt).toLocaleDateString('th-TH')}
                  </span>
                ),
              },
              {
                key: 'isVerified',
                header: t('verified'),
                render: (_, row) => (
                  <span className={row.isVerified ? 'text-mint' : 'text-frost/30'}>
                    {row.isVerified ? tc('yes') : tc('no')}
                  </span>
                ),
              },
              {
                key: 'role',
                header: t('role'),
                render: (_, row) => (
                  <select
                    value={row.role}
                    onChange={(e) => {
                      const role = e.target.value as Role;
                      if (role !== row.role && confirm(t('roleConfirm', { email: row.email, role }))) {
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
                header: t('status'),
                render: (_, row) => (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${row.isActive ? 'bg-mint/15 text-mint' : 'bg-pink/15 text-pink'}`}>
                    {row.isActive ? tc('active') : t('suspended')}
                  </span>
                ),
              },
              {
                key: 'id',
                header: t('actions'),
                render: (_, row) => (
                  <button
                    onClick={() => {
                      const message = row.isActive
                        ? t('suspendConfirm', { email: row.email })
                        : t('reactivateConfirm', { email: row.email });
                      if (confirm(message)) update(row, { isActive: !row.isActive });
                    }}
                    disabled={busyId === row.id}
                    className={`text-xs font-semibold hover:underline disabled:opacity-50 ${row.isActive ? 'text-pink' : 'text-mint'}`}
                  >
                    {row.isActive ? t('suspend') : t('reactivate')}
                  </button>
                ),
              },
            ]}
          />

          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} suffix={t('countSuffix', { count: data.total })} />
        </>
      )}
    </div>
  );
}
