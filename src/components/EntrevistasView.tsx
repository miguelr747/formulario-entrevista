import { useEffect, useState, type FormEvent } from 'react';
import {
  Plus,
  PlayCircle,
  Link2,
  Copy,
  ArrowLeft,
  ClipboardList,
  Check,
  Search,
  Settings2,
  RefreshCw,
  Pencil,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../utils/api';
import type { Empresa, Entrevista, Respuesta, Usuario } from '../types';
import { DynamicInterviewForm } from './DynamicInterviewForm';
import { ConfirmModal, Modal } from './Modal';

interface EntrevistasViewProps {
  user: Usuario;
  initialOpenId?: number | null;
  onClearInitialOpen?: () => void;
  onOpenBancoPreguntas?: () => void;
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export function EntrevistasView({
  user,
  initialOpenId,
  onClearInitialOpen,
  onOpenBancoPreguntas,
  onNotify,
}: EntrevistasViewProps) {
  const [entrevistas, setEntrevistas] = useState<Entrevista[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('TODOS');

  // Active interview runner state
  const [activeEntrevista, setActiveEntrevista] = useState<Entrevista | null>(null);
  const [activeRespuestas, setActiveRespuestas] = useState<Respuesta[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    empresa_id: '',
    nombre_entrevistado: '',
    cargo_entrevistado: '',
    area_trabajo: '',
    fecha_inicio: new Date().toISOString().slice(0, 10),
    observaciones_generales: '',
    enlace_evaluado_activo: true,
  });
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Admin edit / delete modal
  const [editTarget, setEditTarget] = useState<Entrevista | null>(null);
  const [editForm, setEditForm] = useState({
    nombre_entrevistado: '',
    cargo_entrevistado: '',
    area_trabajo: '',
    estado: 'Borrador' as Entrevista['estado'],
    observaciones_generales: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Entrevista | null>(null);

  const loadList = async () => {
    setLoading(true);
    try {
      const [ents, emps] = await Promise.all([
        apiFetch<Entrevista[]>('/api/entrevistas'),
        user.rol === 'EVALUADO' ? Promise.resolve([]) : apiFetch<Empresa[]>('/api/empresas'),
      ]);
      setEntrevistas(ents);
      setEmpresas(emps.filter((e) => e.activo === 1));
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error cargando entrevistas.');
    } finally {
      setLoading(false);
    }
  };

  const openRunner = async (id: number) => {
    setLoadingDetail(true);
    try {
      const data = await apiFetch<{ entrevista: Entrevista; respuestas: Respuesta[] }>(`/api/entrevistas/${id}`);
      setActiveEntrevista(data.entrevista);
      setActiveRespuestas(data.respuestas);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'No se pudo abrir la entrevista.');
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    loadList();
  }, []);

  useEffect(() => {
    if (initialOpenId) {
      openRunner(initialOpenId);
      onClearInitialOpen?.();
    }
  }, [initialOpenId]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await apiFetch<Entrevista>('/api/entrevistas', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          empresa_id: Number(form.empresa_id),
        }),
      });
      onNotify('success', `Entrevista ${created.codigo} creada correctamente.`);
      setCreateOpen(false);
      setForm({
        empresa_id: '',
        nombre_entrevistado: '',
        cargo_entrevistado: '',
        area_trabajo: '',
        fecha_inicio: new Date().toISOString().slice(0, 10),
        observaciones_generales: '',
        enlace_evaluado_activo: true,
      });
      await loadList();
      await openRunner(created.id);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error al crear entrevista.');
    } finally {
      setCreating(false);
    }
  };

  const copyEvaluadoLink = async (ent: Entrevista) => {
    if (!ent.enlace_evaluado_token) return;
    const url = `${window.location.origin}/?evaluacion=${ent.enlace_evaluado_token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(ent.id);
      onNotify('success', 'Enlace seguro para Evaluado copiado al portapapeles.');
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      onNotify('info', `Enlace de evaluación: ${url}`);
    }
  };

  const toggleLinkActive = async (ent: Entrevista) => {
    try {
      const next = ent.enlace_evaluado_activo === 1 ? 0 : 1;
      await apiFetch(`/api/entrevistas/${ent.id}`, {
        method: 'PUT',
        body: JSON.stringify({ enlace_evaluado_activo: next }),
      });
      onNotify('success', next === 1 ? 'Enlace de Evaluado habilitado.' : 'Enlace de Evaluado deshabilitado.');
      await loadList();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error cambiando estado del enlace.');
    }
  };

  const openEditModal = (ent: Entrevista) => {
    setEditTarget(ent);
    setEditForm({
      nombre_entrevistado: ent.nombre_entrevistado,
      cargo_entrevistado: ent.cargo_entrevistado,
      area_trabajo: ent.area_trabajo,
      estado: ent.estado,
      observaciones_generales: ent.observaciones_generales || '',
    });
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSavingEdit(true);
    try {
      await apiFetch(`/api/entrevistas/${editTarget.id}`, {
        method: 'PUT',
        body: JSON.stringify(editForm),
      });
      onNotify('success', `Entrevista ${editTarget.codigo} actualizada.`);
      setEditTarget(null);
      await loadList();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error actualizando entrevista.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/entrevistas/${deleteTarget.id}`, { method: 'DELETE' });
      onNotify('success', `Entrevista ${deleteTarget.codigo} eliminada.`);
      setDeleteTarget(null);
      await loadList();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error eliminando entrevista.');
    }
  };

  if (loadingDetail) {
    return (
      <div className="p-10 bg-white border border-slate-200 rounded-xl text-center text-sm text-slate-500">
        Cargando formulario de entrevista...
      </div>
    );
  }

  if (activeEntrevista) {
    const isReadOnly =
      (activeEntrevista.estado === 'Completada' || activeEntrevista.estado === 'Revisada') &&
      user.rol !== 'ADMINISTRADOR';

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setActiveEntrevista(null);
              loadList();
            }}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al listado de entrevistas</span>
          </button>

          <div className="flex flex-wrap items-center gap-3">
            {user.rol === 'ADMINISTRADOR' &&
              (activeEntrevista.estado === 'Borrador' || activeEntrevista.estado === 'En progreso') && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const updated = await apiFetch<Entrevista>(
                        `/api/entrevistas/${activeEntrevista.id}/sincronizar-preguntas`,
                        { method: 'POST' }
                      );
                      setActiveEntrevista((prev) =>
                        prev ? { ...prev, ...updated } : updated
                      );
                      onNotify('success', 'Formulario actualizado con las preguntas vigentes del Banco de Preguntas.');
                    } catch (err) {
                      onNotify('error', err instanceof Error ? err.message : 'Error sincronizando preguntas.');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sincronizar con Banco de Preguntas</span>
                </button>
              )}
            <span className="text-xs font-medium text-slate-500">
              Estado actual: <strong className="text-slate-900">{activeEntrevista.estado}</strong>
            </span>
          </div>
        </div>

        <DynamicInterviewForm
          entrevista={activeEntrevista}
          initialRespuestas={activeRespuestas}
          readOnly={isReadOnly}
          onSaveDraft={async (payload) => {
            const res = await apiFetch<{ porcentaje: number; estado: string }>(
              `/api/entrevistas/${activeEntrevista.id}/respuestas`,
              {
                method: 'PUT',
                body: JSON.stringify(payload),
              }
            );
            setActiveEntrevista((prev) =>
              prev ? { ...prev, porcentaje_avance: res.porcentaje, estado: res.estado as Entrevista['estado'] } : prev
            );
            return res;
          }}
          onFinalize={async () => {
            await apiFetch(`/api/entrevistas/${activeEntrevista.id}/finalizar`, { method: 'POST' });
            onNotify('success', 'Entrevista finalizada y enviada correctamente.');
            setActiveEntrevista(null);
            await loadList();
          }}
          onNotify={onNotify}
        />
      </div>
    );
  }

  const filtered = entrevistas.filter((e) => {
    const q = search.toLowerCase();
    const matchText =
      e.codigo.toLowerCase().includes(q) ||
      (e.empresa_nombre || '').toLowerCase().includes(q) ||
      e.nombre_entrevistado.toLowerCase().includes(q) ||
      e.area_trabajo.toLowerCase().includes(q);
    const matchEstado = estadoFilter === 'TODOS' || e.estado === estadoFilter;
    return matchText && matchEstado;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {user.rol === 'EVALUADO' ? 'Mis Evaluaciones Asignadas' : 'Módulo de Entrevistas'}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {user.rol === 'EVALUADO'
              ? 'Diligencie y envíe sus entrevistas habilitadas.'
              : 'Gestione entrevistas empresariales, guarde avances parciales y habilite enlaces para evaluados.'}
          </p>
        </div>
        {user.rol !== 'EVALUADO' && (
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {user.rol === 'ADMINISTRADOR' && onOpenBancoPreguntas && (
              <button
                type="button"
                onClick={onOpenBancoPreguntas}
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Settings2 className="w-4 h-4 text-sky-700" />
                <span>Editar preguntas del formulario</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F2942] hover:bg-[#173B5E] text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva entrevista</span>
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código, empresa, entrevistado o área..."
            className="w-full pl-10 pr-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <select
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-700"
        >
          <option value="TODOS">Todos los estados</option>
          <option value="Borrador">Borrador</option>
          <option value="En progreso">En progreso</option>
          <option value="Completada">Completada</option>
          <option value="Revisada">Revisada</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Cargando entrevistas...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700">No hay entrevistas registradas.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Código</th>
                  <th className="py-3 px-4">Empresa</th>
                  <th className="py-3 px-4">Entrevistado</th>
                  <th className="py-3 px-4">Área</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Avance</th>
                  {user.rol !== 'EVALUADO' && <th className="py-3 px-4">Enlace Evaluado</th>}
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((ent) => (
                  <tr key={ent.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-[#0F2942] whitespace-nowrap">
                      {ent.codigo}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">{ent.empresa_nombre}</td>
                    <td className="py-3 px-4">
                      <p className="text-slate-900">{ent.nombre_entrevistado}</p>
                      <p className="text-xs text-slate-500">{ent.cargo_entrevistado}</p>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">{ent.area_trabajo}</td>
                    <td className="py-3 px-4 whitespace-nowrap text-xs font-medium">
                      <span
                        className={
                          ent.estado === 'Completada' || ent.estado === 'Revisada'
                            ? 'text-emerald-700'
                            : ent.estado === 'En progreso'
                            ? 'text-sky-700'
                            : 'text-slate-500'
                        }
                      >
                        {ent.estado}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-sky-600 rounded-full"
                            style={{ width: `${ent.porcentaje_avance}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs tabular-nums text-slate-700">
                          {ent.porcentaje_avance}%
                        </span>
                      </div>
                    </td>
                    {user.rol !== 'EVALUADO' && (
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          {user.rol === 'ADMINISTRADOR' ? (
                            <button
                              type="button"
                              onClick={() => toggleLinkActive(ent)}
                              className={`text-xs font-medium underline-offset-2 hover:underline ${
                                ent.enlace_evaluado_activo === 1 ? 'text-sky-700' : 'text-slate-400'
                              }`}
                            >
                              {ent.enlace_evaluado_activo === 1 ? 'Activo' : 'Inactivo'}
                            </button>
                          ) : (
                            <span
                              className={`text-xs font-medium ${
                                ent.enlace_evaluado_activo === 1 ? 'text-sky-700' : 'text-slate-400'
                              }`}
                            >
                              {ent.enlace_evaluado_activo === 1 ? 'Activo' : 'Inactivo'}
                            </span>
                          )}
                          {ent.enlace_evaluado_activo === 1 && (
                            <button
                              type="button"
                              onClick={() => copyEvaluadoLink(ent)}
                              title="Copiar enlace seguro para el Evaluado"
                              className="p-1 text-slate-500 hover:text-sky-700 rounded hover:bg-sky-50"
                            >
                              {copiedId === ent.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {user.rol === 'ADMINISTRADOR' && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(ent)}
                              title="Editar datos de la entrevista"
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(ent)}
                              title="Eliminar entrevista"
                              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => openRunner(ent.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0F2942] hover:bg-[#173B5E] rounded-lg"
                        >
                          <PlayCircle className="w-3.5 h-3.5" />
                          <span>
                            {(ent.estado === 'Completada' || ent.estado === 'Revisada') && user.rol !== 'ADMINISTRADOR'
                              ? 'Ver'
                              : ent.estado === 'Borrador'
                              ? 'Iniciar'
                              : 'Diligenciar'}
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Interview Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nueva Entrevista Empresarial"
        subtitle="Se generará una copia histórica del banco de preguntas activo actual."
      >
        <form id="create-interview-form" onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Empresa evaluada *</label>
            <select
              required
              value={form.empresa_id}
              onChange={(e) => setForm({ ...form, empresa_id: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Seleccione una empresa...</option>
              {empresas.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.codigo_empresa} · {emp.nombre_comercial} ({emp.razon_social})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nombre del entrevistado *</label>
              <input
                type="text"
                required
                value={form.nombre_entrevistado}
                onChange={(e) => setForm({ ...form, nombre_entrevistado: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Cargo del entrevistado *</label>
              <input
                type="text"
                required
                value={form.cargo_entrevistado}
                onChange={(e) => setForm({ ...form, cargo_entrevistado: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Área de trabajo *</label>
              <input
                type="text"
                required
                value={form.area_trabajo}
                onChange={(e) => setForm({ ...form, area_trabajo: e.target.value })}
                placeholder="Ej. Logística, Compras, Almacén..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Fecha de inicio</label>
              <input
                type="date"
                value={form.fecha_inicio}
                onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Observaciones generales</label>
            <textarea
              rows={2}
              value={form.observaciones_generales}
              onChange={(e) => setForm({ ...form, observaciones_generales: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={form.enlace_evaluado_activo}
              onChange={(e) => setForm({ ...form, enlace_evaluado_activo: e.target.checked })}
              className="rounded text-sky-600"
            />
            <Link2 className="w-4 h-4 text-sky-600" />
            <span>Habilitar enlace seguro para que el Evaluado responda directamente</span>
          </label>
        </form>
        <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setCreateOpen(false)}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="create-interview-form"
            disabled={creating}
            className="px-4 py-2 text-sm font-medium text-white bg-[#0F2942] hover:bg-[#173B5E] rounded-lg disabled:opacity-50"
          >
            {creating ? 'Creando...' : 'Crear e iniciar'}
          </button>
        </div>
      </Modal>

      {/* Admin Edit Interview Modal */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={editTarget ? `Editar Entrevista · ${editTarget.codigo}` : 'Editar Entrevista'}
        subtitle="Modifique los datos generales o el estado de la entrevista."
      >
        <form id="edit-interview-form" onSubmit={handleSaveEdit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nombre del entrevistado *</label>
              <input
                type="text"
                required
                value={editForm.nombre_entrevistado}
                onChange={(e) => setEditForm({ ...editForm, nombre_entrevistado: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Cargo del entrevistado *</label>
              <input
                type="text"
                required
                value={editForm.cargo_entrevistado}
                onChange={(e) => setEditForm({ ...editForm, cargo_entrevistado: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Área de trabajo *</label>
              <input
                type="text"
                required
                value={editForm.area_trabajo}
                onChange={(e) => setEditForm({ ...editForm, area_trabajo: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Estado</label>
              <select
                value={editForm.estado}
                onChange={(e) => setEditForm({ ...editForm, estado: e.target.value as Entrevista['estado'] })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="Borrador">Borrador</option>
                <option value="En progreso">En progreso</option>
                <option value="Completada">Completada</option>
                <option value="Revisada">Revisada</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Observaciones generales</label>
            <textarea
              rows={2}
              value={editForm.observaciones_generales}
              onChange={(e) => setEditForm({ ...editForm, observaciones_generales: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </form>
        <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setEditTarget(null)}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="edit-interview-form"
            disabled={savingEdit}
            className="px-4 py-2 text-sm font-medium text-white bg-[#0F2942] hover:bg-[#173B5E] rounded-lg disabled:opacity-50"
          >
            {savingEdit ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Eliminar Entrevista"
        description={
          deleteTarget
            ? `¿Confirma eliminar la entrevista "${deleteTarget.codigo}" (${deleteTarget.empresa_nombre})? Se eliminarán sus respuestas asociadas.`
            : ''
        }
        confirmLabel="Eliminar"
        destructive
      />
    </div>
  );
}
