import { useState } from 'react';

interface BarItem {
  label: string;
  value: number;
}

export function VerticalBarChart({
  data,
  emptyText = 'Sin datos suficientes para graficar',
}: {
  data: BarItem[];
  emptyText?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const maxVal = Math.max(1, ...data.map((d) => d.value));

  if (data.length === 0) {
    return <p className="text-sm text-slate-400 py-10 text-center">{emptyText}</p>;
  }

  return (
    <div className="w-full">
      <div className="flex items-end gap-3 h-48 pt-6 pb-2 border-b border-slate-200">
        {data.map((item, idx) => {
          const pct = Math.round((item.value / maxVal) * 100);
          return (
            <div
              key={item.label}
              onMouseEnter={() => setHovered(idx)}
              onMouseLeave={() => setHovered(null)}
              className="flex-1 flex flex-col items-center justify-end h-full min-w-0 group relative"
            >
              <span
                className={`text-xs font-mono tabular-nums mb-1.5 transition-opacity ${
                  hovered === idx ? 'text-[#0F2942] font-semibold' : 'text-slate-600'
                }`}
              >
                {item.value}
              </span>
              <div className="w-full max-w-[44px] bg-slate-100 rounded-t-md h-full flex items-end overflow-hidden">
                <div
                  style={{ height: `${Math.max(item.value > 0 ? 10 : 0, pct)}%` }}
                  className={`w-full rounded-t-md transition-all duration-200 ${
                    hovered === idx ? 'bg-sky-500' : 'bg-[#0F2942]'
                  }`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-start gap-3 pt-2">
        {data.map((item) => (
          <div key={item.label} className="flex-1 min-w-0 text-center">
            <span className="block text-[11px] text-slate-500 truncate" title={item.label}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const ESTADO_COLORS: Record<string, string> = {
  Borrador: '#94A3B8',
  'En progreso': '#0284C7',
  Completada: '#16A34A',
  Revisada: '#0F2942',
};

export function DonutStatusChart({
  data,
}: {
  data: Array<{ estado: string; total: number }>;
}) {
  const total = data.reduce((acc, d) => acc + d.total, 0);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 py-2">
      <div className="relative w-36 h-36 shrink-0">
        <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="18" />
          {total > 0 &&
            data.map((item) => {
              if (item.total === 0) return null;
              const fraction = item.total / total;
              const dash = fraction * circumference;
              const offset = -cumulative * circumference;
              cumulative += fraction;
              return (
                <circle
                  key={item.estado}
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke={ESTADO_COLORS[item.estado] || '#38BDF8'}
                  strokeWidth="18"
                  strokeDasharray={`${dash} ${circumference}`}
                  strokeDashoffset={offset}
                />
              );
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">{total}</span>
          <span className="text-[11px] text-slate-500">Total</span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2.5">
        {data.map((item) => {
          const pct = total > 0 ? Math.round((item.total / total) * 100) : 0;
          return (
            <div key={item.estado} className="flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: ESTADO_COLORS[item.estado] || '#38BDF8' }}
                />
                <span className="text-slate-700 truncate">{item.estado}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums text-xs">
                <span className="font-semibold text-slate-900">{item.total}</span>
                <span className="text-slate-400 w-9 text-right">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HorizontalProgressList({
  items,
  accentClass = 'bg-sky-600',
  suffix = '',
  maxOverride,
}: {
  items: Array<{ label: string; value: number }>;
  accentClass?: string;
  suffix?: string;
  maxOverride?: number;
}) {
  const maxVal = maxOverride ?? Math.max(1, ...items.map((i) => i.value));

  if (items.length === 0) {
    return <p className="text-sm text-slate-400 py-8 text-center">No hay registros disponibles aún.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const pct = Math.min(100, Math.round((item.value / maxVal) * 100));
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-slate-700 truncate" title={item.label}>
                {item.label}
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 shrink-0">
                {item.value}
                {suffix}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${accentClass}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
