import type { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
}

export function StatsCard({ title, value, subtitle, icon: Icon, trend }: Props) {
  return (
    <div className="pixel-cut bg-panel border border-frost/10 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-frost/40">{title}</p>
          <p className="font-mono text-3xl font-bold text-frost mt-1.5 tabular-nums">{value}</p>
          {subtitle && <p className="text-xs text-frost/40 mt-1">{subtitle}</p>}
          {trend && (
            <p className={`text-sm mt-2 font-medium ${trend.value >= 0 ? 'text-mint' : 'text-pink'}`}>
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        <Icon size={22} className="text-neon shrink-0" strokeWidth={1.75} />
      </div>
    </div>
  );
}
