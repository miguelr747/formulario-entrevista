import { useState, type FormEvent } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
} from 'lucide-react';
import { apiFetch } from '../utils/api';
import type { PestanaMenu, TipoPestana } from '../types';
import { SYSTEM_VIEW_OPTIONS, TAB_ICON_OPTIONS, resolveTabIcon } from '../utils/tabIcons';
import { ConfirmModal, Modal } from './Modal';

interface AdminTabsManagerProps {
  tabs: PestanaMenu[];
  onTabsChanged: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
}

const EMPTY_FORM = {
  titulo: '',
  icono: 'FileText',
  tipo: 'personalizada' as TipoPestana,
  vista_sistema: 'diagnostico',
  contenido: '',
  url_externa: '',
  activo: true,
};

export function AdminTabsManager({ tabs, onTabsChanged, onNotify }: AdminTabsManagerProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PestanaMenu | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PestanaMenu | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (tab: PestanaMenu) => {
    setEditing(tab);
    setForm({
      titulo: tab.titulo,
      icono: tab.icono || 'FileText',
      tipo: tab.tipo,
      vista_sistema: tab.vista_sistema || 'empresas',
      contenido: tab.contenido || '',
      url_externa: tab.url_externa || '',
      activo: tab.activo === 1,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`/api/pestanas/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        onNotify('success', `Pestaña "${form.titulo}" actualizada en el panel izquierdo.`);
      } else {
        await apiFetch('/api/pestanas', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        onNotify('success', `Pestaña "${form.titulo}" agregada al panel izquierdo.`);
      }
      setModalOpen(false);
      await onTabsChanged();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error guardando pestaña.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleVisible = async (tab: PestanaMenu) => {
    if (tab.protegida === 1) return;
    try {
      await apiFetch(`/api/pestanas/${tab.id}`, {
        method: 'PUT',
        body: JSON.stringify({ activo: tab.activo === 1 ? 0 : 1 }),
      });
      onNotify('success', tab.activo === 1 ? `Pestaña "${tab.titulo}" ocultada.` : `Pestaña "${tab.titulo}" visible.`);
      await onTabsChanged();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error cambiando visibilidad.');
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= tabs.length) return;
    const reordered = [...tabs];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(nextIndex, 0, moved);
    try {
      await apiFetch('/api/pestanas/reordenar', {
        method: 'PATCH',
        body: JSON.stringify({ ids: reordered.map((t) => t.id) }),
      });
      await onTabsChanged();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error reordenando pestañas.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/pestanas/${deleteTarget.id}`, { method: 'DELETE' });
      onNotify('success', `Pestaña "${deleteTarget.titulo}" eliminada del menú lateral.`);
      setDeleteTarget(null);
      await onTabsChanged();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error eliminando pestaña.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Pestañas del Panel Izquierdo</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Agregue nuevas pestañas (páginas informativas, enlaces o vistas adicionales), edite títulos e iconos, reordene o elimine apartados.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F2942] hover:bg-[#173B5E] text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva pestaña</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Orden</th>
                <th className="py-3 px-4">Pestaña</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4">Destino / Contenido</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {tabs.map((tab, idx) => {
                const Icon = resolveTabIcon(tab.icono);
                const tipoLabel =
                  tab.tipo === 'sistema'
                    ? 'Vista del sistema'
                    : tab.tipo === 'enlace'
                    ? 'Enlace externo'
                    : 'Página personalizada';
                const destinoLabel =
                  tab.tipo === 'sistema'
                    ? SYSTEM_VIEW_OPTIONS.find((v) => v.value === tab.vista_sistema)?.label || tab.vista_sistema
                    : tab.tipo === 'enlace'
                    ? tab.url_externa
                    : tab.contenido
                    ? `${tab.contenido.slice(0, 60)}${tab.contenido.length > 60 ? '...' : ''}`
                    : 'Sin contenido';

                return (
                  <tr key={tab.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMove(idx, -1)}
                          title="Subir"
                          className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100 disabled:opacity-30"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === tabs.length - 1}
                          onClick={() => handleMove(idx, 1)}
                          title="Bajar"
                          className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100 disabled:opacity-30"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 text-[#0F2942] flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">
                            {tab.titulo}
                          </p>
                          <p className="text-[11px] font-mono text-slate-400">{tab.clave}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">{tipoLabel}</td>
                    <td className="py-3 px-4 text-xs text-slate-500 max-w-xs truncate">{destinoLabel}</td>
                    <td className="py-3 px-4 whitespace-nowrap text-xs font-medium">
                      <span className={tab.activo === 1 ? 'text-emerald-700' : 'text-slate-400'}>
                        {tab.activo === 1 ? 'Visible' : 'Oculta'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        {tab.protegida !== 1 && (
                          <button
                            type="button"
                            onClick={() => handleToggleVisible(tab)}
                            title={tab.activo === 1 ? 'Ocultar del menú' : 'Mostrar en el menú'}
                            className="p-1.5 text-slate-500 hover:text-sky-700 hover:bg-sky-50 rounded-md"
                          >
                            {tab.activo === 1 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEdit(tab)}
                          title="Editar pestaña"
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {tab.protegida !== 1 && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(tab)}
                            title="Eliminar pestaña"
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar Pestaña · ${editing.titulo}` : 'Implementar Nueva Pestaña'}
        subtitle="Configure cómo aparecerá este apartado en el panel izquierdo."
        maxWidthClass="max-w-xl"
      >
        <form id="tab-form" onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Título de la pestaña *</label>
              <input
                type="text"
                required
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Ej. Instructivo, Diagnóstico, Anexos..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Icono</label>
              <select
                value={form.icono}
                onChange={(e) => setForm({ ...form, icono: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {TAB_ICON_OPTIONS.map((opt) => (
                  <option key={opt.name} value={opt.name}>
                    {opt.label} ({opt.name})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {(!editing || editing.protegida !== 1) && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tipo de contenido *</label>
              <select
                value={form.tipo}
                onChange={(e) => {
                  const nextTipo = e.target.value as TipoPestana;
                  setForm({ ...form, tipo: nextTipo });
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="personalizada">Página personalizada (texto, guía o instrucciones)</option>
                <option value="sistema">Vista integrada del sistema (Diagnóstico, Estadísticas, etc.)</option>
                <option value="enlace">Enlace externo / Recurso web</option>
              </select>
            </div>
          )}

          {form.tipo === 'sistema' && (!editing || editing.protegida !== 1) && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Vista del sistema *</label>
              <select
                value={form.vista_sistema}
                onChange={(e) => {
                  const selected = SYSTEM_VIEW_OPTIONS.find((v) => v.value === e.target.value);
                  setForm({
                    ...form,
                    vista_sistema: e.target.value,
                    titulo: form.titulo || selected?.label || '',
                    icono: selected?.defaultIcon || form.icono,
                  });
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {SYSTEM_VIEW_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {form.tipo === 'personalizada' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Contenido de la página</label>
              <textarea
                rows={6}
                value={form.contenido}
                onChange={(e) => setForm({ ...form, contenido: e.target.value })}
                placeholder="Escriba aquí instrucciones, lineamientos, información para los encuestados o notas del proyecto..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          )}

          {form.tipo === 'enlace' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">URL del enlace *</label>
              <input
                type="url"
                required
                value={form.url_externa}
                onChange={(e) => setForm({ ...form, url_externa: e.target.value })}
                placeholder="https://..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          )}

          {(!editing || editing.protegida !== 1) && (
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                className="rounded text-sky-600"
              />
              <span>Mostrar pestaña en el menú lateral izquierdo</span>
            </label>
          )}
        </form>
        <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="tab-form"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-[#0F2942] hover:bg-[#173B5E] rounded-lg disabled:opacity-50"
          >
            {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Agregar pestaña'}
          </button>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Eliminar Pestaña del Menú"
        description={
          deleteTarget
            ? `¿Confirma eliminar la pestaña "${deleteTarget.titulo}" del panel izquierdo? Podrá volver a implementarla más adelante si la necesita.`
            : ''
        }
        confirmLabel="Eliminar"
        destructive
      />
    </div>
  );
}
