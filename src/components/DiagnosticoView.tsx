import { useEffect, useState, type FormEvent } from 'react';
import {
  Plus,
  Sparkles,
  Trash2,
  Pencil,
  ShieldAlert,
  FileDown,
  FileSpreadsheet,
} from 'lucide-react';
import { apiFetch } from '../utils/api';
import { exportDiagnosticoPDF, exportHallazgosExcel } from '../utils/exports';
import type {
  CategoriaHallazgo,
  Entrevista,
  EstadoSeguimiento,
  EvaluacionMadurez,
  HallazgoDiagnostico,
  NivelImpacto,
  PrioridadHallazgo,
  ResumenIADiagnostico,
  Usuario,
} from '../types';
import { Modal } from './Modal';

interface DiagnosticoViewProps {
  user: Usuario;
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
}

const CATEGORIAS: CategoriaHallazgo[] = [
  'Fortaleza',
  'Debilidad',
  'Problema operativo',
  'Riesgo logístico',
  'Falta de procedimiento',
  'Falta de indicador',
  'Oportunidad de mejora',
];

const PROCESOS_LOGISTICOS = [
  'Compras y Abastecimiento',
  'Gestión de Inventarios',
  'Almacenamiento',
  'Transporte y Distribución',
  'Gestión de Pedidos',
  'Tecnología y Sistemas de Información',
  'Indicadores de Gestión',
];

export function DiagnosticoView({ user, onNotify }: DiagnosticoViewProps) {
  const [entrevistas, setEntrevistas] = useState<Entrevista[]>([]);
  const [selectedId, setSelectedId] = useState<number>(0);
  const [hallazgos, setHallazgos] = useState<HallazgoDiagnostico[]>([]);
  const [madurez, setMadurez] = useState<EvaluacionMadurez[]>([]);
  const [resumenIA, setResumenIA] = useState<ResumenIADiagnostico | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingAI, setGeneratingAI] = useState(false);

  const [catFilter, setCatFilter] = useState<string>('TODAS');

  // Finding Modal
  const [hModalOpen, setHModalOpen] = useState(false);
  const [editingH, setEditingH] = useState<HallazgoDiagnostico | null>(null);
  const [hForm, setHForm] = useState({
    categoria: 'Debilidad' as CategoriaHallazgo,
    proceso_relacionado: PROCESOS_LOGISTICOS[0],
    hallazgo: '',
    evidencia: '',
    nivel_impacto: 'Medio' as NivelImpacto,
    recomendacion: '',
    prioridad: 'Media' as PrioridadHallazgo,
    responsable: '',
    estado_seguimiento: 'Abierto' as EstadoSeguimiento,
  });

  // Maturity Modal
  const [mModalOpen, setMModalOpen] = useState(false);
  const [mForm, setMForm] = useState({
    proceso: PROCESOS_LOGISTICOS[0],
    criterios_evaluacion: '',
    evidencia_suficiente: false,
    evidencia_respaldo: '',
    nivel_madurez: 1,
    justificacion: '',
  });

  const loadInterviews = async () => {
    setLoading(true);
    try {
      const ents = await apiFetch<Entrevista[]>('/api/entrevistas');
      setEntrevistas(ents);
      if (ents.length > 0 && !selectedId) {
        setSelectedId(ents[0].id);
      }
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error cargando entrevistas.');
    } finally {
      setLoading(false);
    }
  };

  const loadDiagnostico = async (entId: number) => {
    if (!entId) return;
    try {
      const data = await apiFetch<{
        hallazgos: HallazgoDiagnostico[];
        madurez: EvaluacionMadurez[];
        resumenIA: ResumenIADiagnostico | null;
      }>(`/api/diagnosticos/${entId}`);
      setHallazgos(data.hallazgos);
      setMadurez(data.madurez);
      setResumenIA(data.resumenIA);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error cargando diagnóstico.');
    }
  };

  useEffect(() => {
    loadInterviews();
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadDiagnostico(selectedId);
    }
  }, [selectedId]);

  const selectedEntrevista = entrevistas.find((e) => e.id === selectedId) || null;
  const isAdmin = user.rol === 'ADMINISTRADOR';

  const handleSaveHallazgo = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editingH) {
        await apiFetch(`/api/diagnosticos/hallazgos/${editingH.id}`, {
          method: 'PUT',
          body: JSON.stringify(hForm),
        });
        onNotify('success', 'Hallazgo actualizado.');
      } else {
        await apiFetch(`/api/diagnosticos/${selectedId}/hallazgos`, {
          method: 'POST',
          body: JSON.stringify(hForm),
        });
        onNotify('success', 'Hallazgo registrado correctamente.');
      }
      setHModalOpen(false);
      await loadDiagnostico(selectedId);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error guardando hallazgo.');
    }
  };

  const handleDeleteHallazgo = async (id: number) => {
    try {
      await apiFetch(`/api/diagnosticos/hallazgos/${id}`, { method: 'DELETE' });
      onNotify('success', 'Hallazgo eliminado.');
      await loadDiagnostico(selectedId);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error eliminando hallazgo.');
    }
  };

  const handleSaveMadurez = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch(`/api/diagnosticos/${selectedId}/madurez`, {
        method: 'PUT',
        body: JSON.stringify({
          proceso: mForm.proceso,
          criterios_evaluacion: mForm.criterios_evaluacion,
          evidencia_suficiente: mForm.evidencia_suficiente ? 1 : 0,
          evidencia_respaldo: mForm.evidencia_respaldo,
          nivel_madurez: mForm.evidencia_suficiente ? Number(mForm.nivel_madurez) : null,
          justificacion: mForm.justificacion,
        }),
      });
      onNotify('success', 'Evaluación de proceso actualizada.');
      setMModalOpen(false);
      await loadDiagnostico(selectedId);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error guardando evaluación de madurez.');
    }
  };

  const handleGenerateAISummary = async () => {
    if (!selectedId) return;
    setGeneratingAI(true);
    try {
      const res = await apiFetch<ResumenIADiagnostico>(`/api/diagnosticos/${selectedId}/ai-summary`, {
        method: 'POST',
      });
      setResumenIA(res);
      onNotify('success', 'Resumen diagnóstico generado con base en las respuestas registradas.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error al generar resumen.');
    } finally {
      setGeneratingAI(false);
    }
  };

  const openMaturityEditor = (proceso: string) => {
    const existing = madurez.find((m) => m.proceso === proceso);
    setMForm({
      proceso,
      criterios_evaluacion:
        existing?.criterios_evaluacion ||
        'Evaluación basada en procedimientos documentados, trazabilidad operativa e indicadores medidos.',
      evidencia_suficiente: existing?.evidencia_suficiente === 1,
      evidencia_respaldo: existing?.evidencia_respaldo || '',
      nivel_madurez: existing?.nivel_madurez ?? 2,
      justificacion: existing?.justificacion || '',
    });
    setMModalOpen(true);
  };

  const filteredHallazgos =
    catFilter === 'TODAS' ? hallazgos : hallazgos.filter((h) => h.categoria === catFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Diagnóstico Logístico</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Análisis por proceso basado estrictamente en evidencias recopiladas, hallazgos y madurez evaluada.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(Number(e.target.value))}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium text-slate-800 max-w-xs"
          >
            {entrevistas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.codigo} · {e.empresa_nombre} ({e.porcentaje_avance}%)
              </option>
            ))}
          </select>

          {selectedEntrevista && (
            <>
              <button
                type="button"
                onClick={() =>
                  exportDiagnosticoPDF({
                    entrevista: selectedEntrevista,
                    hallazgos,
                    madurez,
                    resumenIA,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
              <button
                type="button"
                onClick={() => exportHallazgosExcel(selectedEntrevista.codigo, hallazgos)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-8 bg-white border border-slate-200 rounded-xl text-center text-sm text-slate-500">
          Cargando módulo de diagnóstico...
        </div>
      ) : !selectedEntrevista ? (
        <div className="p-8 bg-white border border-slate-200 rounded-xl text-center text-sm text-slate-500">
          No existen entrevistas registradas para analizar.
        </div>
      ) : (
        <>
          {/* Category Summary Counts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {CATEGORIAS.map((cat) => {
              const count = hallazgos.filter((h) => h.categoria === cat).length;
              const active = catFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCatFilter(active ? 'TODAS' : cat)}
                  className={`text-left p-3 rounded-xl border transition-colors ${
                    active
                      ? 'bg-[#0F2942] border-[#0F2942] text-white'
                      : 'bg-white border-slate-200 hover:border-sky-300 text-slate-800'
                  }`}
                >
                  <p className={`text-[11px] font-medium leading-tight ${active ? 'text-slate-200' : 'text-slate-500'}`}>
                    {cat}
                  </p>
                  <p className="mt-2 text-xl font-bold font-mono tabular-nums">{count}</p>
                </button>
              );
            })}
          </div>

          {/* AI Diagnostic Summary Section */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Resumen Diagnóstico Asistido por Inteligencia Artificial
                </h3>
                <p className="text-xs text-slate-500">
                  Generado exclusivamente con base en las respuestas registradas en {selectedEntrevista.codigo}, detallando limitaciones de información.
                </p>
              </div>
              <button
                type="button"
                onClick={handleGenerateAISummary}
                disabled={generatingAI}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{generatingAI ? 'Analizando respuestas...' : resumenIA ? 'Regenerar resumen' : 'Generar resumen IA'}</span>
              </button>
            </div>

            {resumenIA ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-sm">
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-500">Resumen ejecutivo observado</h4>
                  <p className="text-slate-800 leading-relaxed whitespace-pre-line">{resumenIA.resumen_ejecutivo}</p>
                </div>
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-emerald-700">Fortalezas respaldadas</h4>
                  <p className="text-slate-800 leading-relaxed whitespace-pre-line">
                    {resumenIA.fortalezas_identificadas}
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-amber-700">Brechas y riesgos reportados</h4>
                  <p className="text-slate-800 leading-relaxed whitespace-pre-line">{resumenIA.brechas_riesgos}</p>
                </div>
                <div className="space-y-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold text-[#0F2942] flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-sky-700" />
                      <span>Limitaciones de la información</span>
                    </h4>
                    <span className="text-[11px] font-mono text-slate-500">
                      {resumenIA.preguntas_sin_responder} sin responder
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                    {resumenIA.limitaciones_informacion}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400 py-4">
                Aún no se ha generado un resumen IA para esta entrevista. Presione "Generar resumen IA" para sintetizar únicamente los datos registrados.
              </p>
            )}
          </div>

          {/* Process Maturity Evaluation (Evidence-based strictly) */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Análisis y Nivel de Madurez por Proceso Logístico
                </h3>
                <p className="text-xs text-slate-500">
                  El nivel de madurez (1 a 5) solo se asigna cuando existen criterios de evaluación y evidencia suficiente documentada.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-2.5 px-4">Proceso Logístico</th>
                    <th className="py-2.5 px-4">Nivel de Madurez</th>
                    <th className="py-2.5 px-4">Criterios y Evidencia de Respaldo</th>
                    {isAdmin && <th className="py-2.5 px-4 text-right">Evaluar</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {PROCESOS_LOGISTICOS.map((proc) => {
                    const ev = madurez.find((m) => m.proceso === proc);
                    const hasScore = ev && ev.evidencia_suficiente === 1 && ev.nivel_madurez !== null;
                    return (
                      <tr key={proc} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">{proc}</td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {hasScore ? (
                            <span className="font-mono font-bold text-[#0F2942] tabular-nums">
                              Nivel {ev.nivel_madurez} / 5
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Sin evidencia suficiente</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {ev ? (
                            <div className="space-y-0.5">
                              <p className="text-slate-800">{ev.justificacion || ev.criterios_evaluacion}</p>
                              {ev.evidencia_respaldo && (
                                <p className="text-slate-500">Evidencia: {ev.evidencia_respaldo}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">Pendiente de evaluación documental.</span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openMaturityEditor(proc)}
                              className="text-xs font-medium text-sky-700 hover:text-sky-900"
                            >
                              {ev ? 'Actualizar' : 'Evaluar'}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Findings Registry Table */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Registro de Hallazgos, Riesgos y Oportunidades ({filteredHallazgos.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Trazabilidad directa entre evidencia de entrevista, impacto, recomendación y seguimiento.
                </p>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingH(null);
                    setHForm({
                      categoria: 'Debilidad',
                      proceso_relacionado: PROCESOS_LOGISTICOS[0],
                      hallazgo: '',
                      evidencia: '',
                      nivel_impacto: 'Medio',
                      recomendacion: '',
                      prioridad: 'Media',
                      responsable: '',
                      estado_seguimiento: 'Abierto',
                    });
                    setHModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0F2942] hover:bg-[#173B5E] rounded-lg whitespace-nowrap shrink-0 self-start sm:self-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Registrar hallazgo</span>
                </button>
              )}
            </div>

            {filteredHallazgos.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">
                No hay hallazgos registrados para el filtro seleccionado.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-2.5 px-3">Categoría / Proceso</th>
                      <th className="py-2.5 px-3">Hallazgo y Evidencia</th>
                      <th className="py-2.5 px-3">Impacto / Prioridad</th>
                      <th className="py-2.5 px-3">Recomendación y Responsable</th>
                      <th className="py-2.5 px-3">Seguimiento</th>
                      {isAdmin && <th className="py-2.5 px-3 text-right">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredHallazgos.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50/70 align-top">
                        <td className="py-3 px-3 whitespace-nowrap">
                          <p className="text-xs font-semibold text-[#0F2942]">{h.categoria}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{h.proceso_relacionado}</p>
                        </td>
                        <td className="py-3 px-3 max-w-sm">
                          <p className="font-medium text-slate-900">{h.hallazgo}</p>
                          <p className="text-xs text-slate-500 mt-1">Evidencia: {h.evidencia}</p>
                        </td>
                        <td className="py-3 px-3 text-xs whitespace-nowrap">
                          <p className="font-medium text-slate-800">Impacto: {h.nivel_impacto}</p>
                          <p className="text-slate-500">Prioridad: {h.prioridad}</p>
                        </td>
                        <td className="py-3 px-3 max-w-sm text-xs">
                          <p className="text-slate-700">{h.recomendacion}</p>
                          <p className="text-slate-500 mt-1">Resp: {h.responsable}</p>
                        </td>
                        <td className="py-3 px-3 text-xs font-medium whitespace-nowrap text-sky-700">
                          {h.estado_seguimiento}
                        </td>
                        {isAdmin && (
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingH(h);
                                setHForm({
                                  categoria: h.categoria,
                                  proceso_relacionado: h.proceso_relacionado,
                                  hallazgo: h.hallazgo,
                                  evidencia: h.evidencia,
                                  nivel_impacto: h.nivel_impacto,
                                  recomendacion: h.recomendacion,
                                  prioridad: h.prioridad,
                                  responsable: h.responsable,
                                  estado_seguimiento: h.estado_seguimiento,
                                });
                                setHModalOpen(true);
                              }}
                              className="p-1.5 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteHallazgo(h.id)}
                              className="p-1.5 text-slate-500 hover:text-red-600 rounded hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Finding Modal */}
      <Modal
        open={hModalOpen}
        onClose={() => setHModalOpen(false)}
        title={editingH ? 'Editar Hallazgo Diagnóstico' : 'Registrar Hallazgo Diagnóstico'}
        maxWidthClass="max-w-2xl"
      >
        <form id="h-form" onSubmit={handleSaveHallazgo} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Categoría *</label>
              <select
                value={hForm.categoria}
                onChange={(e) => setHForm({ ...hForm, categoria: e.target.value as CategoriaHallazgo })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Proceso relacionado *</label>
              <select
                value={hForm.proceso_relacionado}
                onChange={(e) => setHForm({ ...hForm, proceso_relacionado: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {PROCESOS_LOGISTICOS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Hallazgo *</label>
            <textarea
              rows={2}
              required
              value={hForm.hallazgo}
              onChange={(e) => setHForm({ ...hForm, hallazgo: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Evidencia exacta (cita de respuesta o documento) *</label>
            <textarea
              rows={2}
              required
              value={hForm.evidencia}
              onChange={(e) => setHForm({ ...hForm, evidencia: e.target.value })}
              placeholder="Ej. Respuesta M5.P4: 'No existe procedimiento documentado...'"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Recomendación</label>
            <textarea
              rows={2}
              value={hForm.recomendacion}
              onChange={(e) => setHForm({ ...hForm, recomendacion: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nivel de impacto</label>
              <select
                value={hForm.nivel_impacto}
                onChange={(e) => setHForm({ ...hForm, nivel_impacto: e.target.value as NivelImpacto })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {(['Bajo', 'Medio', 'Alto', 'Crítico'] as const).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Prioridad</label>
              <select
                value={hForm.prioridad}
                onChange={(e) => setHForm({ ...hForm, prioridad: e.target.value as PrioridadHallazgo })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {(['Baja', 'Media', 'Alta', 'Urgente'] as const).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Responsable</label>
              <input
                type="text"
                value={hForm.responsable}
                onChange={(e) => setHForm({ ...hForm, responsable: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Seguimiento</label>
              <select
                value={hForm.estado_seguimiento}
                onChange={(e) => setHForm({ ...hForm, estado_seguimiento: e.target.value as EstadoSeguimiento })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {(['Abierto', 'En proceso', 'Implementado', 'Cerrado'] as const).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </form>
        <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setHModalOpen(false)}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="h-form"
            className="px-4 py-2 text-sm font-medium text-white bg-[#0F2942] hover:bg-[#173B5E] rounded-lg"
          >
            Guardar hallazgo
          </button>
        </div>
      </Modal>

      {/* Maturity Modal */}
      <Modal
        open={mModalOpen}
        onClose={() => setMModalOpen(false)}
        title={`Evaluar Madurez · ${mForm.proceso}`}
        subtitle="Solo asigne un nivel de 1 a 5 si cuenta con criterios definidos y evidencia verificada."
        maxWidthClass="max-w-lg"
      >
        <form id="m-form" onSubmit={handleSaveMadurez} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Criterios de evaluación aplicados *</label>
            <textarea
              rows={2}
              required
              value={mForm.criterios_evaluacion}
              onChange={(e) => setMForm({ ...mForm, criterios_evaluacion: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <input
              type="checkbox"
              checked={mForm.evidencia_suficiente}
              onChange={(e) => setMForm({ ...mForm, evidencia_suficiente: e.target.checked })}
              className="mt-0.5 rounded text-sky-600"
            />
            <div>
              <span className="font-medium text-slate-900 block">Existen evidencias suficientes para calificar madurez</span>
              <span className="text-xs text-slate-500">
                Si no se marca, el proceso permanecerá sin calificación numérica (evitando suposiciones).
              </span>
            </div>
          </label>

          {mForm.evidencia_suficiente && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Evidencia de respaldo *</label>
                <textarea
                  rows={2}
                  required
                  value={mForm.evidencia_respaldo}
                  onChange={(e) => setMForm({ ...mForm, evidencia_respaldo: e.target.value })}
                  placeholder="Cite exactamente las respuestas o registros verificados."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nivel de madurez (1 a 5) *</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setMForm({ ...mForm, nivel_madurez: n })}
                      className={`flex-1 py-2 text-sm font-mono font-semibold rounded-lg border ${
                        mForm.nivel_madurez === n
                          ? 'bg-[#0F2942] text-white border-[#0F2942]'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Justificación técnica</label>
            <textarea
              rows={2}
              value={mForm.justificacion}
              onChange={(e) => setMForm({ ...mForm, justificacion: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </form>
        <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setMModalOpen(false)}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="m-form"
            className="px-4 py-2 text-sm font-medium text-white bg-[#0F2942] hover:bg-[#173B5E] rounded-lg"
          >
            Guardar evaluación
          </button>
        </div>
      </Modal>
    </div>
  );
}
