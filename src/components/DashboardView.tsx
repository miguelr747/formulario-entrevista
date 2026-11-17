import { useEffect, useState } from 'react';
import {
  Building2,
  ClipboardList,
  CheckCircle2,
  Clock,
  HelpCircle,
  Users,
  Plus,
} from 'lucide-react';
import { apiFetch } from '../utils/api';
import type { DashboardStats, Usuario } from '../types';
import { DonutStatusChart, HorizontalProgressList, VerticalBarChart } from './Charts';

interface DashboardViewProps {
  user: Usuario;
  onNavigate: (tab: string) => void;
}

export function DashboardView({ user, onNavigate }: DashboardViewProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<DashboardStats>('/api/dashboard')
      .then((data) => {
        if (active) setStats(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Error cargando indicadores.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
          <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-6 bg-white border border-red-200 rounded-xl text-sm text-red-700">
        {error || 'No se pudieron cargar los datos del panel principal.'}
      </div>
    );
  }

  const kpiCards = [
    {
      label: 'Empresas registradas',
      value: stats.kpis.totalEmpresas,
      icon: Building2,
      action: () => onNavigate('empresas'),
    },
    {
      label: 'Entrevistas realizadas',
      value: stats.kpis.totalEntrevistas,
      icon: ClipboardList,
      action: () => onNavigate('entrevistas'),
    },
    {
      label: 'Entrevistas completadas',
      value: stats.kpis.entrevistasCompletadas,
      icon: CheckCircle2,
      action: () => onNavigate('resultados'),
    },
    {
      label: 'Entrevistas pendientes',
      value: stats.kpis.entrevistasPendientes,
      icon: Clock,
      action: () => onNavigate('entrevistas'),
    },
    {
      label: 'Preguntas activas',
      value: stats.kpis.totalPreguntas,
      icon: HelpCircle,
      action: () => user.rol === 'ADMINISTRADOR' && onNavigate('banco'),
    },
    {
      label: 'Usuarios activos',
      value: stats.kpis.usuariosActivos,
      icon: Users,
      action: () => user.rol === 'ADMINISTRADOR' && onNavigate('usuarios'),
    },
  ];

  const empresasTotalEval = stats.empresasEvaluadas.evaluadas + stats.empresasEvaluadas.sinEvaluar;
  const coberturaPct = empresasTotalEval > 0 ? Math.round((stats.empresasEvaluadas.evaluadas / empresasTotalEval) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header action strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Panel Principal de Diagnóstico</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Indicadores consolidados de empresas, entrevistas y avance por proceso logístico.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('entrevistas')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F2942] hover:bg-[#173B5E] text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva entrevista</span>
        </button>
      </div>

      {/* 6 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={card.action}
              className="text-left bg-white border border-slate-200 hover:border-sky-300 rounded-xl p-4 transition-colors"
            >
              <div className="flex items-center justify-between gap-2 text-slate-500">
                <span className="text-xs font-medium leading-tight">{card.label}</span>
                <Icon className="w-4 h-4 text-sky-600 shrink-0" />
              </div>
              <p className="mt-3 text-2xl font-bold font-mono tabular-nums text-slate-900">
                {card.value}
              </p>
            </button>
          );
        })}
      </div>

      {/* Row 1 Charts: Entrevistas por empresa + Entrevistas por estado */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">Entrevistas por empresa</h3>
            <p className="text-xs text-slate-500">Volumen de levantamientos registrados por organización</p>
          </div>
          <VerticalBarChart
            data={stats.entrevistasPorEmpresa.map((e) => ({ label: e.nombre, value: e.total }))}
          />
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">Entrevistas por estado</h3>
            <p className="text-xs text-slate-500">Distribución actual del ciclo de entrevista</p>
          </div>
          <DonutStatusChart data={stats.entrevistasPorEstado} />
        </div>
      </div>

      {/* Row 2 Charts: Empresas evaluadas + Distribución por área + Avance por módulo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Empresas evaluadas</h3>
            <p className="text-xs text-slate-500 mt-0.5">Cobertura frente al directorio activo</p>

            <div className="mt-6 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono tabular-nums text-[#0F2942]">{coberturaPct}%</span>
              <span className="text-xs text-slate-500">de empresas con al menos una entrevista</span>
            </div>

            <div className="mt-4 w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-sky-600 rounded-full" style={{ width: `${coberturaPct}%` }} />
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500">Evaluadas</p>
              <p className="text-lg font-bold font-mono tabular-nums text-slate-900">
                {stats.empresasEvaluadas.evaluadas}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Sin entrevistas</p>
              <p className="text-lg font-bold font-mono tabular-nums text-slate-900">
                {stats.empresasEvaluadas.sinEvaluar}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">Distribución por área</h3>
            <p className="text-xs text-slate-500">Áreas de trabajo entrevistadas</p>
          </div>
          <HorizontalProgressList
            items={stats.distribucionPorArea.map((a) => ({ label: a.area, value: a.total }))}
            accentClass="bg-[#0F2942]"
          />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">Avance por módulo</h3>
            <p className="text-xs text-slate-500">Porcentaje promedio diligenciado</p>
          </div>
          <div className="max-h-64 overflow-y-auto pr-1">
            <HorizontalProgressList
              items={stats.avancePorModulo.map((m) => ({
                label: `M${m.numero}. ${m.titulo}`,
                value: m.porcentaje,
              }))}
              suffix="%"
              maxOverride={100}
              accentClass="bg-sky-600"
            />
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-slate-900">Actividad reciente</h3>
          <p className="text-xs text-slate-500">Últimos movimientos registrados en la plataforma</p>
        </div>
        {stats.actividadReciente.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No hay actividad registrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="py-2.5 pr-4">Usuario</th>
                  <th className="py-2.5 pr-4">Acción</th>
                  <th className="py-2.5 pr-4">Referencia</th>
                  <th className="py-2.5 pr-4">Detalle</th>
                  <th className="py-2.5 text-right">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {stats.actividadReciente.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 pr-4 font-medium text-slate-900 whitespace-nowrap">{item.usuario_nombre}</td>
                    <td className="py-2.5 pr-4 text-sky-700 font-medium whitespace-nowrap">{item.accion}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-slate-600 whitespace-nowrap">{item.entidad}</td>
                    <td className="py-2.5 pr-4 text-slate-600 max-w-md truncate">{item.detalle}</td>
                    <td className="py-2.5 text-right font-mono text-xs text-slate-400 whitespace-nowrap tabular-nums">
                      {item.created_at.replace('T', ' ').slice(0, 16)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
