import { useEffect, useState, type FormEvent } from 'react';
import {
  Search,
  Plus,
  Building2,
  Pencil,
  Eye,
  Trash2,
  MapPin,
  Phone,
  Mail,
  Users,
} from 'lucide-react';
import { apiFetch } from '../utils/api';
import type { Empresa, Entrevista, Usuario } from '../types';
import { ConfirmModal, Modal } from './Modal';

interface EmpresasViewProps {
  user: Usuario;
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
  onOpenInterview: (entrevistaId: number) => void;
}

const EMPTY_FORM = {
  codigo_empresa: '',
  razon_social: '',
  nombre_comercial: '',
  nit: '',
  actividad_economica: '',
  sector_empresarial: '',
  direccion: '',
  ciudad: '',
  departamento: '',
  pais: 'Colombia',
  telefono: '',
  correo_electronico: '',
  numero_empleados: 10,
  nombre_representante: '',
  observaciones: '',
};

export function EmpresasView({ user, onNotify, onOpenInterview }: EmpresasViewProps) {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('TODOS');
  const [estadoFilter, setEstadoFilter] = useState<'TODAS' | 'ACTIVAS' | 'INACTIVAS'>('ACTIVAS');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Empresa | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<{ empresa: Empresa; entrevistas: Entrevista[] } | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Empresa | null>(null);

  const loadEmpresas = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Empresa[]>('/api/empresas');
      setEmpresas(data);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error al cargar empresas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmpresas();
  }, []);

  const sectors = Array.from(new Set(empresas.map((e) => e.sector_empresarial).filter(Boolean)));

  const filtered = empresas.filter((e) => {
    const q = search.toLowerCase();
    const matchesText =
      e.razon_social.toLowerCase().includes(q) ||
      e.nombre_comercial.toLowerCase().includes(q) ||
      e.nit.toLowerCase().includes(q) ||
      e.codigo_empresa.toLowerCase().includes(q) ||
      e.ciudad.toLowerCase().includes(q);
    const matchesSector = sectorFilter === 'TODOS' || e.sector_empresarial === sectorFilter;
    const matchesEstado =
      estadoFilter === 'TODAS' ||
      (estadoFilter === 'ACTIVAS' && e.activo === 1) ||
      (estadoFilter === 'INACTIVAS' && e.activo === 0);
    return matchesText && matchesSector && matchesEstado;
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (emp: Empresa) => {
    setEditing(emp);
    setForm({
      codigo_empresa: emp.codigo_empresa,
      razon_social: emp.razon_social,
      nombre_comercial: emp.nombre_comercial,
      nit: emp.nit,
      actividad_economica: emp.actividad_economica,
      sector_empresarial: emp.sector_empresarial,
      direccion: emp.direccion,
      ciudad: emp.ciudad,
      departamento: emp.departamento,
      pais: emp.pais,
      telefono: emp.telefono,
      correo_electronico: emp.correo_electronico,
      numero_empleados: emp.numero_empleados,
      nombre_representante: emp.nombre_representante,
      observaciones: emp.observaciones,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`/api/empresas/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...form, activo: editing.activo }),
        });
        onNotify('success', 'Información de la empresa actualizada.');
      } else {
        await apiFetch('/api/empresas', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        onNotify('success', 'Empresa registrada correctamente.');
      }
      setModalOpen(false);
      await loadEmpresas();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error guardando empresa.');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (emp: Empresa) => {
    try {
      const data = await apiFetch<{ empresa: Empresa; entrevistas: Entrevista[] }>(`/api/empresas/${emp.id}`);
      setSelectedDetail(data);
      setDetailOpen(true);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error consultando detalle.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await apiFetch<{ deactivated?: boolean; deleted?: boolean }>(`/api/empresas/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      onNotify(
        'success',
        res.deactivated
          ? 'Empresa desactivada (conserva historial de entrevistas asociadas).'
          : 'Empresa eliminada correctamente.'
      );
      setDeleteTarget(null);
      await loadEmpresas();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error al procesar solicitud.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Administración de Empresas</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Directorio de organizaciones evaluadas, datos fiscales y entrevistas asociadas.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F2942] hover:bg-[#173B5E] text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Registrar empresa</span>
        </button>
      </div>

      {/* Filters bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por razón social, nombre comercial, NIT, código o ciudad..."
            className="w-full pl-10 pr-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <select
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="TODOS">Todos los sectores</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
          {(['ACTIVAS', 'INACTIVAS', 'TODAS'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setEstadoFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                estadoFilter === st ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st === 'ACTIVAS' ? 'Activas' : st === 'INACTIVAS' ? 'Inactivas' : 'Todas'}
            </button>
          ))}
        </div>
      </div>

      {/* Companies Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Cargando directorio de empresas...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700">No se encontraron empresas con los filtros actuales.</p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-4 px-4 py-2 text-sm font-medium text-white bg-[#0F2942] rounded-lg hover:bg-[#173B5E]"
            >
              Registrar primera empresa
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">ID</th>
                  <th className="py-3 px-4">Empresa</th>
                  <th className="py-3 px-4">NIT</th>
                  <th className="py-3 px-4">Sector</th>
                  <th className="py-3 px-4">Ubicación</th>
                  <th className="py-3 px-4 text-right">Empleados</th>
                  <th className="py-3 px-4 text-right">Entrevistas</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {emp.codigo_empresa}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{emp.nombre_comercial}</p>
                      <p className="text-xs text-slate-500">{emp.razon_social}</p>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">{emp.nit}</td>
                    <td className="py-3 px-4 text-slate-600">{emp.sector_empresarial}</td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {emp.ciudad}, {emp.departamento}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                      {emp.numero_empleados}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#0F2942]">
                      {emp.total_entrevistas ?? 0}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-xs font-medium">
                      <span className={emp.activo === 1 ? 'text-emerald-700' : 'text-slate-400'}>
                        {emp.activo === 1 ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openDetail(emp)}
                          title="Ver detalle y entrevistas"
                          className="p-1.5 text-slate-500 hover:text-sky-700 hover:bg-sky-50 rounded-md"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {user.rol === 'ADMINISTRADOR' && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(emp)}
                              title="Editar empresa"
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(emp)}
                              title="Desactivar o eliminar"
                              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar Empresa · ${editing.codigo_empresa}` : 'Registrar Nueva Empresa'}
        subtitle="Complete la ficha técnica organizacional."
        maxWidthClass="max-w-3xl"
      >
        <form id="empresa-form" onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">ID de empresa (opcional)</label>
              <input
                type="text"
                value={form.codigo_empresa}
                onChange={(e) => setForm({ ...form, codigo_empresa: e.target.value })}
                disabled={!!editing}
                placeholder="Auto (EMP-00X)"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Razón social *</label>
              <input
                type="text"
                required
                value={form.razon_social}
                onChange={(e) => setForm({ ...form, razon_social: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Nombre comercial *</label>
              <input
                type="text"
                required
                value={form.nombre_comercial}
                onChange={(e) => setForm({ ...form, nombre_comercial: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">NIT *</label>
              <input
                type="text"
                required
                value={form.nit}
                onChange={(e) => setForm({ ...form, nit: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Actividad económica *</label>
              <input
                type="text"
                required
                value={form.actividad_economica}
                onChange={(e) => setForm({ ...form, actividad_economica: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Sector empresarial *</label>
              <input
                type="text"
                required
                value={form.sector_empresarial}
                onChange={(e) => setForm({ ...form, sector_empresarial: e.target.value })}
                placeholder="Ej. Manufactura, Comercio y Distribución..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Dirección</label>
              <input
                type="text"
                value={form.direccion}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Ciudad</label>
              <input
                type="text"
                value={form.ciudad}
                onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Departamento</label>
              <input
                type="text"
                value={form.departamento}
                onChange={(e) => setForm({ ...form, departamento: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">País</label>
              <input
                type="text"
                value={form.pais}
                onChange={(e) => setForm({ ...form, pais: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Teléfono</label>
              <input
                type="text"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Correo electrónico</label>
              <input
                type="email"
                value={form.correo_electronico}
                onChange={(e) => setForm({ ...form, correo_electronico: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Número de empleados</label>
              <input
                type="number"
                min={0}
                value={form.numero_empleados}
                onChange={(e) => setForm({ ...form, numero_empleados: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Nombre del representante</label>
              <input
                type="text"
                value={form.nombre_representante}
                onChange={(e) => setForm({ ...form, nombre_representante: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Observaciones</label>
            <textarea
              rows={2}
              value={form.observaciones}
              onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
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
            form="empresa-form"
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-[#0F2942] hover:bg-[#173B5E] rounded-lg disabled:opacity-50"
          >
            {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Registrar empresa'}
          </button>
        </div>
      </Modal>

      {/* Detail + Associated Interviews Modal */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={selectedDetail ? selectedDetail.empresa.nombre_comercial : 'Detalle de empresa'}
        subtitle={
          selectedDetail
            ? `${selectedDetail.empresa.codigo_empresa} · ${selectedDetail.empresa.razon_social} · NIT ${selectedDetail.empresa.nit}`
            : ''
        }
        maxWidthClass="max-w-3xl"
      >
        {selectedDetail && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="space-y-1.5">
                <p className="text-xs text-slate-500">Actividad económica y sector</p>
                <p className="font-medium text-slate-900">{selectedDetail.empresa.actividad_economica}</p>
                <p className="text-xs text-slate-600">{selectedDetail.empresa.sector_empresarial}</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-slate-500">Representante y tamaño</p>
                <p className="font-medium text-slate-900">{selectedDetail.empresa.nombre_representante}</p>
                <p className="text-xs text-slate-600 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <span className="font-mono tabular-nums">{selectedDetail.empresa.numero_empleados}</span> empleados
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>
                  {selectedDetail.empresa.direccion}, {selectedDetail.empresa.ciudad} ({selectedDetail.empresa.departamento},{' '}
                  {selectedDetail.empresa.pais})
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {selectedDetail.empresa.telefono}
                </span>
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  {selectedDetail.empresa.correo_electronico}
                </span>
              </div>
              {selectedDetail.empresa.observaciones && (
                <div className="sm:col-span-2 pt-2 border-t border-slate-200 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">Observaciones:</span>{' '}
                  {selectedDetail.empresa.observaciones}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-3">
                Entrevistas asociadas ({selectedDetail.entrevistas.length})
              </h4>
              {selectedDetail.entrevistas.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 border border-dashed border-slate-200 rounded-lg text-center">
                  No hay entrevistas registradas para esta empresa.
                </p>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                        <th className="py-2 px-3">Código</th>
                        <th className="py-2 px-3">Entrevistado</th>
                        <th className="py-2 px-3">Área</th>
                        <th className="py-2 px-3">Estado</th>
                        <th className="py-2 px-3 text-right">Avance</th>
                        <th className="py-2 px-3 text-right">Abrir</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedDetail.entrevistas.map((ent) => (
                        <tr key={ent.id}>
                          <td className="py-2 px-3 font-mono text-xs">{ent.codigo}</td>
                          <td className="py-2 px-3">
                            <p className="font-medium text-slate-900">{ent.nombre_entrevistado}</p>
                            <p className="text-xs text-slate-500">{ent.cargo_entrevistado}</p>
                          </td>
                          <td className="py-2 px-3 text-xs text-slate-600">{ent.area_trabajo}</td>
                          <td className="py-2 px-3 text-xs font-medium text-slate-700">{ent.estado}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-xs">
                            {ent.porcentaje_avance}%
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setDetailOpen(false);
                                onOpenInterview(ent.id);
                              }}
                              className="text-xs font-medium text-sky-700 hover:text-sky-900"
                            >
                              Ir a entrevista
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Desactivar / Eliminar Empresa"
        description={
          deleteTarget
            ? `¿Confirma desactivar o eliminar a "${deleteTarget.nombre_comercial}"? Si posee entrevistas asociadas, se desactivará para preservar la integridad histórica.`
            : ''
        }
        confirmLabel="Confirmar"
        destructive
      />
    </div>
  );
}
