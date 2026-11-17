import { useEffect, useState } from 'react';
import {
  Search,
  Eye,
  FileDown,
  FileSpreadsheet,
  ArrowLeft,
  History,
  CheckCircle,
  Pencil,
  Save,
} from 'lucide-react';
import { apiFetch, formatAnswerDisplay } from '../utils/api';
import { exportEntrevistaExcel, exportEntrevistaPDF } from '../utils/exports';
import type {
  Empresa,
  Entrevista,
  HistorialModificacion,
  Modulo,
  Pregunta,
  Respuesta,
  Usuario,
} from '../types';

interface ResultadosViewProps {
  user: Usuario;
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export function ResultadosView({ user, onNotify }: ResultadosViewProps) {
  const [entrevistas, setEntrevistas] = useState<Entrevista[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [empresaFilter, setEmpresaFilter] = useState('TODAS');
  const [entrevistadorFilter, setEntrevistadorFilter] = useState('TODOS');
  const [estadoFilter, setEstadoFilter] = useState('TODOS');
  const [fechaFilter, setFechaFilter] = useState('');

  // Selected detail
  const [detail, setDetail] = useState<{
    entrevista: Entrevista;
    respuestas: Respuesta[];
    historial: HistorialModificacion[];
  } | null>(null);
  const [editingQId, setEditingQId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editObs, setEditObs] = useState('');

  const loadList = async () => {
    setLoading(true);
    try {
      const [ents, emps] = await Promise.all([
        apiFetch<Entrevista[]>('/api/entrevistas'),
        apiFetch<Empresa[]>('/api/empresas'),
      ]);
      setEntrevistas(ents);
      setEmpresas(emps);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error cargando resultados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  const openDetail = async (id: number) => {
    try {
      const data = await apiFetch<{
        entrevista: Entrevista;
        respuestas: Respuesta[];
        historial: HistorialModificacion[];
      }>(`/api/entrevistas/${id}`);
      setDetail(data);
      setEditingQId(null);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error abriendo resultados.');
    }
  };

  const handleMarkReviewed = async () => {
    if (!detail) return;
    try {
      await apiFetch(`/api/entrevistas/${detail.entrevista.id}`, {
        method: 'PUT',
        body: JSON.stringify({ estado: 'Revisada' }),
      });
      onNotify('success', 'Entrevista marcada como Revisada.');
      await openDetail(detail.entrevista.id);
      await loadList();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error actualizando estado.');
    }
  };

  const handleSaveInlineEdit = async (pregunta: Pregunta) => {
    if (!detail) return;
    try {
      await apiFetch(`/api/entrevistas/${detail.entrevista.id}/respuestas`, {
        method: 'PUT',
        body: JSON.stringify({
          respuestas: [
            {
              pregunta_id: pregunta.id,
              modulo_id: pregunta.modulo_id,
              valor_texto: editValue,
              observacion: editObs,
            },
          ],
        }),
      });
      onNotify('success', 'Respuesta actualizada y registrada en el historial.');
      setEditingQId(null);
      await openDetail(detail.entrevista.id);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error al actualizar respuesta.');
    }
  };

  if (detail) {
    const { entrevista, respuestas, historial } = detail;
    const modulos = JSON.parse(entrevista.modulos_snapshot_json || '[]') as Modulo[];
    const preguntas = JSON.parse(entrevista.preguntas_snapshot_json || '[]') as Pregunta[];
    const respMap = new Map(respuestas.map((r) => [r.pregunta_id, r]));
    const canEditAnswers = user.rol === 'ADMINISTRADOR';

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setDetail(null)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 self-start"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a Resultados de Entrevistas</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => exportEntrevistaPDF({ entrevista, respuestas })}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Exportar PDF</span>
            </button>
            <button
              type="button"
              onClick={() => exportEntrevistaExcel({ entrevista, respuestas })}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Exportar Excel</span>
            </button>
            {user.rol === 'ADMINISTRADOR' && entrevista.estado === 'Completada' && (
              <button
                type="button"
                onClick={handleMarkReviewed}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0F2942] hover:bg-[#173B5E] rounded-lg"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Marcar como Revisada</span>
              </button>
            )}
          </div>
        </div>

        {/* General Information Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <p className="text-xs font-mono font-semibold text-sky-700">{entrevista.codigo}</p>
              <h2 className="text-xl font-bold text-slate-900 mt-0.5">{entrevista.empresa_nombre}</h2>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Estado y Avance</p>
              <p className="text-sm font-semibold text-slate-900 font-mono tabular-nums">
                {entrevista.estado} · {entrevista.porcentaje_avance}%
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 text-sm">
            <div>
              <p className="text-xs text-slate-500">Entrevistado</p>
              <p className="font-medium text-slate-900">{entrevista.nombre_entrevistado}</p>
              <p className="text-xs text-slate-500">{entrevista.cargo_entrevistado}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Área de trabajo</p>
              <p className="font-medium text-slate-900">{entrevista.area_trabajo}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Entrevistador</p>
              <p className="font-medium text-slate-900">{entrevista.entrevistador_nombre}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Fechas</p>
              <p className="font-mono text-xs text-slate-800">
                Inicio: {entrevista.fecha_inicio}
              </p>
              <p className="font-mono text-xs text-slate-500">
                Fin: {entrevista.fecha_finalizacion || 'En curso'}
              </p>
            </div>
            {entrevista.observaciones_generales && (
              <div className="sm:col-span-2 lg:col-span-4 pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">Observaciones generales</p>
                <p className="text-sm text-slate-700 mt-0.5">{entrevista.observaciones_generales}</p>
              </div>
            )}
          </div>
        </div>

        {/* Modules Q&A */}
        <div className="space-y-4">
          {modulos.map((mod) => {
            const modQs = preguntas.filter((q) => q.modulo_id === mod.id).sort((a, b) => a.orden - b.orden);
            if (modQs.length === 0) return null;
            return (
              <div key={mod.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">
                    Módulo {mod.numero}. {mod.titulo}
                  </h3>
                  <span className="text-xs font-mono text-slate-500">{modQs.length} preguntas</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {modQs.map((q, idx) => {
                    const r = respMap.get(q.id);
                    const isEditing = editingQId === q.id;
                    return (
                      <div key={q.id} className="px-6 py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-900">
                              <span className="font-mono text-slate-400 mr-2">{idx + 1}.</span>
                              {q.texto}
                            </p>

                            {isEditing ? (
                              <div className="mt-3 space-y-2 max-w-2xl">
                                <textarea
                                  rows={2}
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  className="w-full px-3 py-2 text-sm border border-sky-400 rounded-lg focus:outline-none"
                                />
                                <input
                                  type="text"
                                  value={editObs}
                                  onChange={(e) => setEditObs(e.target.value)}
                                  placeholder="Observación (opcional)"
                                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                                />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleSaveInlineEdit(q)}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[#0F2942] rounded-md"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                    <span>Guardar</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingQId(null)}
                                    className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-md"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-1.5">
                                <p
                                  className={`text-sm ${
                                    r?.valor_texto && r.valor_texto !== '[]'
                                      ? 'text-slate-700'
                                      : 'text-slate-400 italic'
                                  }`}
                                >
                                  {formatAnswerDisplay(r?.valor_texto)}
                                </p>
                                {r?.observacion && (
                                  <p className="text-xs text-slate-500 mt-1">
                                    Observación: {r.observacion}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>

                          {canEditAnswers && !isEditing && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingQId(q.id);
                                setEditValue(r?.valor_texto || '');
                                setEditObs(r?.observacion || '');
                              }}
                              title="Editar respuesta"
                              className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-md shrink-0"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Audit History */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-slate-500" />
            <h3 className="text-base font-semibold text-slate-900">Historial de modificaciones</h3>
          </div>
          {historial.length === 0 ? (
            <p className="text-sm text-slate-400">Sin modificaciones posteriores registradas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-4">Fecha</th>
                    <th className="py-2 pr-4">Usuario</th>
                    <th className="py-2 pr-4">Acción</th>
                    <th className="py-2 pr-4">Detalle</th>
                    <th className="py-2 pr-4">Anterior</th>
                    <th className="py-2">Nuevo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historial.map((h) => (
                    <tr key={h.id}>
                      <td className="py-2 pr-4 font-mono text-slate-500 whitespace-nowrap">
                        {h.created_at.replace('T', ' ').slice(0, 16)}
                      </td>
                      <td className="py-2 pr-4 font-medium text-slate-800 whitespace-nowrap">{h.usuario_nombre}</td>
                      <td className="py-2 pr-4 text-sky-700 whitespace-nowrap">{h.accion}</td>
                      <td className="py-2 pr-4 text-slate-600">{h.detalle}</td>
                      <td className="py-2 pr-4 text-slate-400 max-w-xs truncate">{h.valor_anterior || '-'}</td>
                      <td className="py-2 text-slate-800 max-w-xs truncate">{h.valor_nuevo || '-'}</td>
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

  const interviewers = Array.from(new Set(entrevistas.map((e) => e.entrevistador_nombre).filter(Boolean)));
  const filtered = entrevistas.filter((e) => {
    const q = search.toLowerCase();
    const matchText =
      e.codigo.toLowerCase().includes(q) ||
      (e.empresa_nombre || '').toLowerCase().includes(q) ||
      e.nombre_entrevistado.toLowerCase().includes(q) ||
      e.cargo_entrevistado.toLowerCase().includes(q);
    const matchEmpresa = empresaFilter === 'TODAS' || e.empresa_id === Number(empresaFilter);
    const matchEntrevistador =
      entrevistadorFilter === 'TODOS' || e.entrevistador_nombre === entrevistadorFilter;
    const matchEstado = estadoFilter === 'TODOS' || e.estado === estadoFilter;
    const matchFecha = !fechaFilter || e.fecha_inicio === fechaFilter;
    return matchText && matchEmpresa && matchEntrevistador && matchEstado && matchFecha;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Resultados de Entrevistas</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Consulte respuestas completas, edite registros autorizados, revise el historial de cambios y exporte resultados.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="relative lg:col-span-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>
        <select
          value={empresaFilter}
          onChange={(e) => setEmpresaFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
        >
          <option value="TODAS">Todas las empresas</option>
          {empresas.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.nombre_comercial}
            </option>
          ))}
        </select>
        <select
          value={entrevistadorFilter}
          onChange={(e) => setEntrevistadorFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
        >
          <option value="TODOS">Todos los entrevistadores</option>
          {interviewers.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
        >
          <option value="TODOS">Todos los estados</option>
          <option value="Borrador">Borrador</option>
          <option value="En progreso">En progreso</option>
          <option value="Completada">Completada</option>
          <option value="Revisada">Revisada</option>
        </select>
        <input
          type="date"
          value={fechaFilter}
          onChange={(e) => setFechaFilter(e.target.value)}
          className="px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg bg-white"
        />
      </div>

      {/* Results Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Cargando resultados...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Código</th>
                  <th className="py-3 px-4">Empresa</th>
                  <th className="py-3 px-4">Entrevistado</th>
                  <th className="py-3 px-4">Cargo</th>
                  <th className="py-3 px-4">Entrevistador</th>
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Avance</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-[#0F2942] whitespace-nowrap">
                      {e.codigo}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">{e.empresa_nombre}</td>
                    <td className="py-3 px-4 text-slate-800">{e.nombre_entrevistado}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{e.cargo_entrevistado}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{e.entrevistador_nombre}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {e.fecha_inicio}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium whitespace-nowrap">
                      <span
                        className={
                          e.estado === 'Completada' || e.estado === 'Revisada'
                            ? 'text-emerald-700'
                            : e.estado === 'En progreso'
                            ? 'text-sky-700'
                            : 'text-slate-500'
                        }
                      >
                        {e.estado}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs font-semibold text-slate-800">
                      {e.porcentaje_avance}%
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openDetail(e.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Visualizar</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-sm text-slate-400">
                      No hay entrevistas que coincidan con los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
