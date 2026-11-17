import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Pencil, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { apiFetch } from '../utils/api';
import type { RolUsuario, Usuario } from '../types';
import { Modal } from './Modal';

interface UsuariosViewProps {
  currentUser: Usuario;
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export function UsuariosView({ currentUser, onNotify }: UsuariosViewProps) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [form, setForm] = useState({
    nombre: '',
    username: '',
    email: '',
    password: '',
    rol: 'ENTREVISTADOR' as RolUsuario,
  });

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Usuario[]>('/api/usuarios');
      setUsuarios(data);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error cargando usuarios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ nombre: '', username: '', email: '', password: '', rol: 'ENTREVISTADOR' });
    setModalOpen(true);
  };

  const openEdit = (u: Usuario) => {
    setEditing(u);
    setForm({
      nombre: u.nombre,
      username: u.username,
      email: u.email,
      password: '',
      rol: u.rol,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await apiFetch(`/api/usuarios/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        onNotify('success', 'Usuario actualizado correctamente.');
      } else {
        await apiFetch('/api/usuarios', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        onNotify('success', 'Usuario creado con contraseña cifrada.');
      }
      setModalOpen(false);
      await loadUsers();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error guardando usuario.');
    }
  };

  const toggleActive = async (u: Usuario) => {
    try {
      await apiFetch(`/api/usuarios/${u.id}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: u.activo === 1 ? 0 : 1 }),
      });
      onNotify('success', u.activo === 1 ? 'Usuario desactivado.' : 'Usuario activado.');
      await loadUsers();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error actualizando estado.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Administración de Usuarios</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Gestione cuentas, roles de acceso y estado de habilitación en la plataforma.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F2942] hover:bg-[#173B5E] text-white text-sm font-medium rounded-lg whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo usuario</span>
        </button>
      </div>

      {/* Role Permissions Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-[#0F2942] font-semibold text-sm">
            <ShieldCheck className="w-4 h-4 text-sky-600" />
            <span>ADMINISTRADOR</span>
          </div>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            Acceso total: usuarios, roles, empresas, módulos, banco de preguntas, entrevistas, diagnóstico y exportaciones.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[#0F2942] font-semibold text-sm">ENTREVISTADOR</p>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            Registra empresas, crea y diligencia entrevistas, guarda avances parciales y consulta sus propios evaluados.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[#0F2942] font-semibold text-sm">EVALUADO</p>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            Responde sus entrevistas asignadas o vía enlace seguro, guarda y envía respuestas sin acceso a terceros.
          </p>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Cargando usuarios...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Nombre</th>
                  <th className="py-3 px-4">Usuario</th>
                  <th className="py-3 px-4">Correo electrónico</th>
                  <th className="py-3 px-4">Rol asignado</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Último acceso</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {usuarios.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-semibold text-slate-900">{u.nombre}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-700">{u.username}</td>
                    <td className="py-3 px-4 text-slate-600">{u.email}</td>
                    <td className="py-3 px-4 text-xs font-semibold text-[#0F2942]">{u.rol}</td>
                    <td className="py-3 px-4 text-xs font-medium">
                      <span className={u.activo === 1 ? 'text-emerald-700' : 'text-slate-400'}>
                        {u.activo === 1 ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-500">
                      {u.ultimo_acceso ? u.ultimo_acceso.replace('T', ' ').slice(0, 16) : 'Nunca'}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(u)}
                          title="Editar usuario"
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {u.id !== currentUser.id && (
                          <button
                            type="button"
                            onClick={() => toggleActive(u)}
                            title={u.activo === 1 ? 'Desactivar usuario' : 'Activar usuario'}
                            className={`p-1.5 rounded-md ${
                              u.activo === 1
                                ? 'text-slate-500 hover:text-red-600 hover:bg-red-50'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                          >
                            {u.activo === 1 ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>
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

      {/* Create / Edit User Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar Usuario · ${editing.username}` : 'Crear Nuevo Usuario'}
        maxWidthClass="max-w-md"
      >
        <form id="u-form" onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nombre completo *</label>
            <input
              type="text"
              required
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nombre de usuario *</label>
            <input
              type="text"
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Correo electrónico *</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Rol y permisos *</label>
            <select
              value={form.rol}
              onChange={(e) => setForm({ ...form, rol: e.target.value as RolUsuario })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="ADMINISTRADOR">ADMINISTRADOR</option>
              <option value="ENTREVISTADOR">ENTREVISTADOR</option>
              <option value="EVALUADO">EVALUADO</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {editing ? 'Nueva contraseña (dejar vacío para mantener)' : 'Contraseña *'}
            </label>
            <input
              type="password"
              required={!editing}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={editing ? 'Opcional' : 'Mínimo 6 caracteres'}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </form>
        <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="u-form"
            className="px-4 py-2 text-sm font-medium text-white bg-[#0F2942] hover:bg-[#173B5E] rounded-lg"
          >
            {editing ? 'Guardar cambios' : 'Crear usuario'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
