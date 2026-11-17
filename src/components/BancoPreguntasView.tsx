import { useEffect, useState, type FormEvent } from 'react';
import {
  Plus,
  Pencil,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  Search,
  Layers,
  HelpCircle,
  Eye,
} from 'lucide-react';
import { apiFetch, TIPO_RESPUESTA_LABELS } from '../utils/api';
import type { CondicionOperador, Modulo, Pregunta, TipoRespuesta } from '../types';
import { ConfirmModal, Modal } from './Modal';

interface BancoPreguntasViewProps {
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
}

const TIPOS_RESPUESTA: TipoRespuesta[] = [
  'respuesta_abierta',
  'respuesta_corta',
  'seleccion_unica',
  'seleccion_multiple',
  'si_no',
  'escala_1_5',
  'fecha',
  'numero',
  'porcentaje',
  'observaciones',
];

export function BancoPreguntasView({ onNotify }: BancoPreguntasViewProps) {
  const [activeTab, setActiveTab] = useState<'preguntas' | 'modulos' | 'vista_previa'>('preguntas');
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [moduloFilter, setModuloFilter] = useState<string>('TODOS');
  const [search, setSearch] = useState('');

  // Question Modal
  const [qModalOpen, setQModalOpen] = useState(false);
  const [editingQ, setEditingQ] = useState<Pregunta | null>(null);
  const [qForm, setQForm] = useState({
    modulo_id: 1,
    texto: '',
    descripcion_ayuda: '',
    tipo_respuesta: 'respuesta_abierta' as TipoRespuesta,
    opciones_text: '',
    obligatoria: true,
    activo: true,
    condicion_pregunta_id: '' as string | number,
    condicion_operador: '' as CondicionOperador,
    condicion_valor: '',
  });

  // Module Modal
  const [mModalOpen, setMModalOpen] = useState(false);
  const [editingM, setEditingM] = useState<Modulo | null>(null);
  const [mForm, setMForm] = useState({ titulo: '', descripcion: '', activo: true });

  const [deleteTarget, setDeleteTarget] = useState<{ type: 'pregunta' | 'modulo'; id: number; label: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [mods, qs] = await Promise.all([
        apiFetch<Modulo[]>('/api/modulos'),
        apiFetch<Pregunta[]>('/api/preguntas'),
      ]);
      setModulos(mods);
      setPreguntas(qs);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error cargando banco de preguntas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateQuestion = () => {
    setEditingQ(null);
    setQForm({
      modulo_id: moduloFilter !== 'TODOS' ? Number(moduloFilter) : modulos[0]?.id ?? 1,
      texto: '',
      descripcion_ayuda: '',
      tipo_respuesta: 'respuesta_abierta',
      opciones_text: '',
      obligatoria: true,
      activo: true,
      condicion_pregunta_id: '',
      condicion_operador: '',
      condicion_valor: '',
    });
    setQModalOpen(true);
  };

  const openEditQuestion = (q: Pregunta) => {
    let opts: string[] = [];
    try {
      opts = JSON.parse(q.opciones_json || '[]');
    } catch {
      opts = [];
    }
    setEditingQ(q);
    setQForm({
      modulo_id: q.modulo_id,
      texto: q.texto,
      descripcion_ayuda: q.descripcion_ayuda,
      tipo_respuesta: q.tipo_respuesta,
      opciones_text: opts.join('\n'),
      obligatoria: q.obligatoria === 1,
      activo: q.activo === 1,
      condicion_pregunta_id: q.condicion_pregunta_id ?? '',
      condicion_operador: q.condicion_operador || '',
      condicion_valor: q.condicion_valor || '',
    });
    setQModalOpen(true);
  };

  const handleSaveQuestion = async (e: FormEvent) => {
    e.preventDefault();
    const opciones = qForm.opciones_text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      modulo_id: Number(qForm.modulo_id),
      texto: qForm.texto,
      descripcion_ayuda: qForm.descripcion_ayuda,
      tipo_respuesta: qForm.tipo_respuesta,
      opciones,
      obligatoria: qForm.obligatoria ? 1 : 0,
      activo: qForm.activo ? 1 : 0,
      condicion_pregunta_id: qForm.condicion_pregunta_id ? Number(qForm.condicion_pregunta_id) : null,
      condicion_operador: qForm.condicion_pregunta_id ? qForm.condicion_operador || 'equals' : '',
      condicion_valor: qForm.condicion_pregunta_id ? qForm.condicion_valor : '',
    };

    try {
      if (editingQ) {
        await apiFetch(`/api/preguntas/${editingQ.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        onNotify('success', 'Pregunta actualizada.');
      } else {
        await apiFetch('/api/preguntas', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onNotify('success', 'Pregunta agregada al banco.');
      }
      setQModalOpen(false);
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error guardando pregunta.');
    }
  };

  const handleDuplicateQuestion = async (id: number) => {
    try {
      await apiFetch(`/api/preguntas/${id}/duplicar`, { method: 'POST' });
      onNotify('success', 'Pregunta duplicada correctamente.');
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error duplicando pregunta.');
    }
  };

  const handleToggleQuestionActive = async (q: Pregunta) => {
    try {
      await apiFetch(`/api/preguntas/${q.id}`, {
        method: 'PUT',
        body: JSON.stringify({ activo: q.activo === 1 ? 0 : 1 }),
      });
      onNotify('success', q.activo === 1 ? 'Pregunta desactivada.' : 'Pregunta activada.');
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error cambiando estado.');
    }
  };

  const moveQuestion = async (q: Pregunta, dir: -1 | 1) => {
    const sameMod = preguntas.filter((p) => p.modulo_id === q.modulo_id).sort((a, b) => a.orden - b.orden);
    const idx = sameMod.findIndex((p) => p.id === q.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sameMod.length) return;
    const reordered = [...sameMod];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    try {
      await apiFetch('/api/preguntas/reordenar', {
        method: 'PATCH',
        body: JSON.stringify({ ids: reordered.map((r) => r.id) }),
      });
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error reordenando preguntas.');
    }
  };

  const handleSaveModule = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editingM) {
        await apiFetch(`/api/modulos/${editingM.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            titulo: mForm.titulo,
            descripcion: mForm.descripcion,
            activo: mForm.activo ? 1 : 0,
          }),
        });
        onNotify('success', 'Módulo actualizado.');
      } else {
        await apiFetch('/api/modulos', {
          method: 'POST',
          body: JSON.stringify({ titulo: mForm.titulo, descripcion: mForm.descripcion }),
        });
        onNotify('success', 'Módulo creado.');
      }
      setMModalOpen(false);
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error guardando módulo.');
    }
  };

  const moveModule = async (mod: Modulo, dir: -1 | 1) => {
    const sorted = [...modulos].sort((a, b) => a.orden - b.orden);
    const idx = sorted.findIndex((m) => m.id === mod.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    [sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]];
    try {
      await apiFetch('/api/modulos/reordenar', {
        method: 'PATCH',
        body: JSON.stringify({ ids: sorted.map((m) => m.id) }),
      });
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error reordenando módulos.');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'pregunta') {
        await apiFetch(`/api/preguntas/${deleteTarget.id}`, { method: 'DELETE' });
        onNotify('success', 'Pregunta eliminada.');
      } else {
        await apiFetch(`/api/modulos/${deleteTarget.id}`, { method: 'DELETE' });
        onNotify('success', 'Módulo eliminado.');
      }
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error al eliminar.');
    }
  };

  const modMap = new Map(modulos.map((m) => [m.id, m]));
  const filteredQuestions = preguntas.filter((q) => {
    const matchesMod = moduloFilter === 'TODOS' || q.modulo_id === Number(moduloFilter);
    const matchesSearch = q.texto.toLowerCase().includes(search.toLowerCase());
    return matchesMod && matchesSearch;
  });

  const needsOptions = qForm.tipo_respuesta === 'seleccion_unica' || qForm.tipo_respuesta === 'seleccion_multiple';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Banco de Preguntas y Módulos</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure dinámicamente el cuestionario. Las entrevistas anteriores conservan su copia histórica intacta.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('preguntas')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'preguntas' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Preguntas ({preguntas.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('modulos')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'modulos' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Módulos ({modulos.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('vista_previa')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'vista_previa' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Vista previa</span>
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'preguntas' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Module Navigator */}
          <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-3 space-y-1">
            <p className="px-3 py-2 text-xs font-semibold text-slate-500">Estructura por módulo</p>
            <button
              type="button"
              onClick={() => setModuloFilter('TODOS')}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between gap-2 transition-colors ${
                moduloFilter === 'TODOS'
                  ? 'bg-[#0F2942] text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span>Todos los módulos</span>
              <span className="font-mono tabular-nums opacity-80">{preguntas.length}</span>
            </button>
            {modulos.map((m) => {
              const count = preguntas.filter((p) => p.modulo_id === m.id).length;
              const isSelected = moduloFilter === String(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModuloFilter(String(m.id))}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 transition-colors ${
                    isSelected
                      ? 'bg-[#0F2942] text-white font-semibold'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="truncate">
                    {m.numero}. {m.titulo}
                  </span>
                  <span className="font-mono tabular-nums opacity-80 shrink-0">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Right Question Editor List */}
          <div className="lg:col-span-9 space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar pregunta por texto..."
                  className="w-full pl-10 pr-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <button
                type="button"
                onClick={openCreateQuestion}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#0F2942] hover:bg-[#173B5E] text-white text-sm font-medium rounded-lg whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Nueva pregunta</span>
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {loading ? (
                <div className="p-8 text-center text-sm text-slate-500">Cargando banco de preguntas...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                        <th className="py-3 px-4">Orden</th>
                        <th className="py-3 px-4">Pregunta</th>
                        <th className="py-3 px-4">Tipo</th>
                        <th className="py-3 px-4 text-center">Oblig.</th>
                        <th className="py-3 px-4">Estado</th>
                        <th className="py-3 px-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {filteredQuestions.map((q) => {
                        const mod = modMap.get(q.modulo_id);
                        return (
                          <tr key={q.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-mono text-xs text-slate-500 whitespace-nowrap">
                              {mod ? `M${mod.numero}.${q.orden}` : `#${q.orden}`}
                            </td>
                            <td className="py-3 px-4 max-w-md">
                              <p className="font-medium text-slate-900">{q.texto}</p>
                              {q.descripcion_ayuda && (
                                <p className="text-xs text-slate-500 mt-0.5">{q.descripcion_ayuda}</p>
                              )}
                              {q.condicion_pregunta_id && (
                                <p className="text-[11px] text-sky-700 mt-0.5">
                                  Condicional: depende de pregunta #{q.condicion_pregunta_id} ({q.condicion_operador} "{q.condicion_valor}")
                                </p>
                              )}
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                              {TIPO_RESPUESTA_LABELS[q.tipo_respuesta] || q.tipo_respuesta}
                            </td>
                            <td className="py-3 px-4 text-center text-xs text-slate-700">
                              {q.obligatoria === 1 ? 'Sí' : 'No'}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleToggleQuestionActive(q)}
                                className={`text-xs font-medium hover:underline ${
                                  q.activo === 1 ? 'text-emerald-700' : 'text-slate-400'
                                }`}
                              >
                                {q.activo === 1 ? 'Activa' : 'Inactiva'}
                              </button>
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => moveQuestion(q, -1)}
                                  title="Subir orden"
                                  className="p-1 text-slate-400 hover:text-slate-800 rounded hover:bg-slate-100"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveQuestion(q, 1)}
                                  title="Bajar orden"
                                  className="p-1 text-slate-400 hover:text-slate-800 rounded hover:bg-slate-100"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditQuestion(q)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md ml-1"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>Editar</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDuplicateQuestion(q.id)}
                                  title="Duplicar"
                                  className="p-1.5 text-slate-500 hover:text-sky-700 rounded hover:bg-sky-50"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeleteTarget({ type: 'pregunta', id: q.id, label: q.texto })
                                  }
                                  title="Eliminar"
                                  className="p-1.5 text-slate-500 hover:text-red-600 rounded hover:bg-red-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredQuestions.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-sm text-slate-400">
                            No hay preguntas en esta vista. Use "Nueva pregunta" para agregar una.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === 'vista_previa' ? (
        /* Live Form Structure Preview */
        <div className="space-y-4">
          <div className="bg-sky-50 border border-sky-200 rounded-xl px-5 py-3.5 text-xs text-sky-900">
            Vista previa de la estructura vigente del formulario para <strong>nuevas entrevistas</strong> (solo se incluyen módulos y preguntas activas).
          </div>
          {modulos
            .filter((m) => m.activo === 1)
            .map((mod) => {
              const modQs = preguntas
                .filter((p) => p.modulo_id === mod.id && p.activo === 1)
                .sort((a, b) => a.orden - b.orden);
              return (
                <div key={mod.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Módulo {mod.numero}. {mod.titulo}
                      </h3>
                      {mod.descripcion && <p className="text-xs text-slate-500 mt-0.5">{mod.descripcion}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setModuloFilter(String(mod.id));
                        setActiveTab('preguntas');
                      }}
                      className="text-xs font-medium text-sky-700 hover:text-sky-900 whitespace-nowrap"
                    >
                      Editar preguntas de este módulo
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {modQs.map((q, idx) => (
                      <div key={q.id} className="px-6 py-3 flex items-center justify-between gap-4 text-sm">
                        <div>
                          <span className="font-mono text-xs text-slate-400 mr-2">{idx + 1}.</span>
                          <span className="text-slate-900 font-medium">{q.texto}</span>
                          {q.obligatoria === 1 && <span className="text-red-600 ml-1">*</span>}
                        </div>
                        <span className="text-xs text-slate-500 whitespace-nowrap">
                          {TIPO_RESPUESTA_LABELS[q.tipo_respuesta]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      ) : (
        /* Modules Management Tab */
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setEditingM(null);
                setMForm({ titulo: '', descripcion: '', activo: true });
                setMModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F2942] hover:bg-[#173B5E] text-white text-sm font-medium rounded-lg"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo módulo</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Orden</th>
                  <th className="py-3 px-4">Título del Módulo</th>
                  <th className="py-3 px-4">Descripción</th>
                  <th className="py-3 px-4 text-right">Preguntas</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {modulos.map((mod) => {
                  const qCount = preguntas.filter((p) => p.modulo_id === mod.id).length;
                  return (
                    <tr key={mod.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-700">
                        M{mod.numero}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{mod.titulo}</td>
                      <td className="py-3 px-4 text-xs text-slate-600 max-w-md">{mod.descripcion}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">{qCount}</td>
                      <td className="py-3 px-4 text-xs font-medium">
                        <span className={mod.activo === 1 ? 'text-emerald-700' : 'text-slate-400'}>
                          {mod.activo === 1 ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveModule(mod, -1)}
                            className="p-1 text-slate-400 hover:text-slate-800 rounded hover:bg-slate-100"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveModule(mod, 1)}
                            className="p-1 text-slate-400 hover:text-slate-800 rounded hover:bg-slate-100"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingM(mod);
                              setMForm({
                                titulo: mod.titulo,
                                descripcion: mod.descripcion,
                                activo: mod.activo === 1,
                              });
                              setMModalOpen(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteTarget({ type: 'modulo', id: mod.id, label: mod.titulo })
                            }
                            className="p-1.5 text-slate-500 hover:text-red-600 rounded hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Question Modal */}
      <Modal
        open={qModalOpen}
        onClose={() => setQModalOpen(false)}
        title={editingQ ? `Editar Pregunta #${editingQ.id}` : 'Nueva Pregunta'}
        maxWidthClass="max-w-2xl"
      >
        <form id="q-form" onSubmit={handleSaveQuestion} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Módulo asociado *</label>
              <select
                value={qForm.modulo_id}
                onChange={(e) => setQForm({ ...qForm, modulo_id: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {modulos.map((m) => (
                  <option key={m.id} value={m.id}>
                    Módulo {m.numero}: {m.titulo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tipo de respuesta *</label>
              <select
                value={qForm.tipo_respuesta}
                onChange={(e) => setQForm({ ...qForm, tipo_respuesta: e.target.value as TipoRespuesta })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {TIPOS_RESPUESTA.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_RESPUESTA_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Texto de la pregunta *</label>
            <textarea
              rows={2}
              required
              value={qForm.texto}
              onChange={(e) => setQForm({ ...qForm, texto: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Descripción o texto de ayuda</label>
            <input
              type="text"
              value={qForm.descripcion_ayuda}
              onChange={(e) => setQForm({ ...qForm, descripcion_ayuda: e.target.value })}
              placeholder="Guía opcional para el entrevistador o evaluado"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          {needsOptions && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Opciones de respuesta (una opción por línea)
              </label>
              <textarea
                rows={4}
                value={qForm.opciones_text}
                onChange={(e) => setQForm({ ...qForm, opciones_text: e.target.value })}
                placeholder={'Opción 1\nOpción 2\nOpción 3'}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          )}

          {/* Conditional Visibility Section */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <p className="text-xs font-semibold text-slate-700">Condición de visualización (opcional)</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3">
                <label className="block text-[11px] text-slate-500 mb-1">Mostrar solo si la pregunta:</label>
                <select
                  value={qForm.condicion_pregunta_id}
                  onChange={(e) => setQForm({ ...qForm, condicion_pregunta_id: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Siempre visible (sin condición)</option>
                  {preguntas
                    .filter((p) => p.id !== editingQ?.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.id}: {p.texto.slice(0, 75)}
                      </option>
                    ))}
                </select>
              </div>
              {qForm.condicion_pregunta_id && (
                <>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Operador</label>
                    <select
                      value={qForm.condicion_operador || 'equals'}
                      onChange={(e) => setQForm({ ...qForm, condicion_operador: e.target.value as CondicionOperador })}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="equals">Es igual a</option>
                      <option value="not_equals">Es diferente de</option>
                      <option value="contains">Contiene</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-500 mb-1">Valor esperado</label>
                    <input
                      type="text"
                      value={qForm.condicion_valor}
                      onChange={(e) => setQForm({ ...qForm, condicion_valor: e.target.value })}
                      placeholder="Ej. Sí"
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-6 pt-1">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={qForm.obligatoria}
                onChange={(e) => setQForm({ ...qForm, obligatoria: e.target.checked })}
                className="rounded text-sky-600"
              />
              <span>Pregunta obligatoria</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={qForm.activo}
                onChange={(e) => setQForm({ ...qForm, activo: e.target.checked })}
                className="rounded text-sky-600"
              />
              <span>Activa para nuevas entrevistas</span>
            </label>
          </div>
        </form>
        <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setQModalOpen(false)}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="q-form"
            className="px-4 py-2 text-sm font-medium text-white bg-[#0F2942] hover:bg-[#173B5E] rounded-lg"
          >
            Guardar pregunta
          </button>
        </div>
      </Modal>

      {/* Module Modal */}
      <Modal
        open={mModalOpen}
        onClose={() => setMModalOpen(false)}
        title={editingM ? `Editar Módulo ${editingM.numero}` : 'Nuevo Módulo'}
        maxWidthClass="max-w-lg"
      >
        <form id="m-form" onSubmit={handleSaveModule} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Título del módulo *</label>
            <input
              type="text"
              required
              value={mForm.titulo}
              onChange={(e) => setMForm({ ...mForm, titulo: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Descripción</label>
            <textarea
              rows={3}
              value={mForm.descripcion}
              onChange={(e) => setMForm({ ...mForm, descripcion: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          {editingM && (
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={mForm.activo}
                onChange={(e) => setMForm({ ...mForm, activo: e.target.checked })}
                className="rounded text-sky-600"
              />
              <span>Módulo activo</span>
            </label>
          )}
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
            Guardar módulo
          </button>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Confirmar eliminación"
        description={
          deleteTarget
            ? `¿Confirma eliminar ${deleteTarget.type === 'modulo' ? 'el módulo y sus preguntas' : 'la pregunta'} "${deleteTarget.label}"? Las entrevistas ya creadas conservarán su copia histórica.`
            : ''
        }
        confirmLabel="Eliminar"
        destructive
      />
    </div>
  );
}
