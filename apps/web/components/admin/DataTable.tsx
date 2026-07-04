import React from 'react';

interface Column<T> {
  key: keyof T;
  header: string;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
}

export function DataTable<T extends { id: string }>({ columns, data, emptyMessage = 'No data.' }: Props<T>) {
  return (
    <div className="overflow-x-auto pixel-cut border border-frost/10 bg-panel">
      <table className="min-w-full divide-y divide-frost/10 text-sm">
        <thead className="bg-void-deep">
          <tr>
            {columns.map((col) => (
              <th key={String(col.key)} className="px-4 py-3 text-left font-mono text-[10px] font-medium text-frost/60 uppercase tracking-wider">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-frost/5">
          {data.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-frost/40">{emptyMessage}</td></tr>
          ) : (
            data.map((row) => (
              <tr key={row.id} className="hover:bg-panel-light/60">
                {columns.map((col) => (
                  <td key={String(col.key)} className="px-4 py-3 text-frost/80">
                    {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
