import express from 'express';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db, initDatabase } from './db.ts';
import {
  extractBearerUser,
  optionalAuth,
  requireAdmin,
  requireAuth,
  requireRole,
  signToken,
  type AuthenticatedRequest,
} from './auth.ts';
import { generateDiagnosticAISummary } from './ai.ts';
import type { Modulo, Pregunta, RolUsuario } from '../src/types.ts';

dotenv.config();

function getDefaultActorId(): number {
  const row = db.prepare('SELECT id FROM usuarios ORDER BY id ASC LIMIT 1').get() as { id: number } | undefined;
  if (row) return row.id;
  const fallbackHash = bcrypt.hashSync('admin123', 10);
  const res = db
    .prepare(
      `INSERT INTO usuarios (nombre, username, email, password_hash, rol, activo)
       VALUES ('Administrador', 'admin', 'admin@diagnostico.com', ?, 'ADMINISTRADOR', 1)`
    )
    .run(fallbackHash);
  return Number(res.lastInsertRowid);
}

let dbInitialized = false;
function ensureDatabase() {
  if (!dbInitialized) {
    initDatabase();
    dbInitialized = true;
  }
}

function logActivity(usuarioNombre: string, accion: string, entidad: string, detalle: string) {
  db.prepare(`
    INSERT INTO actividad_reciente (usuario_nombre, accion, entidad, detalle)
    VALUES (?, ?, ?, ?)
  `).run(usuarioNombre, accion, entidad, detalle);
}

function isQuestionVisible(pregunta: Pregunta, answerMap: Map<number, string>): boolean {
  if (!pregunta.condicion_pregunta_id || !pregunta.condicion_operador) {
    return true;
  }
  const parentValueRaw = answerMap.get(pregunta.condicion_pregunta_id) ?? '';
  let parentValue = parentValueRaw;
  try {
    if (parentValueRaw.startsWith('[')) {
      const parsed = JSON.parse(parentValueRaw);
      if (Array.isArray(parsed)) {
        parentValue = parsed.join(', ');
      }
    }
  } catch {
    // keep raw string
  }

  const expected = (pregunta.condicion_valor ?? '').trim().toLowerCase();
  const actual = parentValue.trim().toLowerCase();

  if (pregunta.condicion_operador === 'equals') {
    return actual === expected;
  }
  if (pregunta.condicion_operador === 'not_equals') {
    return actual !== '' && actual !== expected;
  }
  if (pregunta.condicion_operador === 'contains') {
    return actual.includes(expected);
  }
  return true;
}

function isAnswered(val: string | undefined): boolean {
  if (!val) return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  if (trimmed === '[]') return false;
  return true;
}

function computeProgress(
  preguntas: Pregunta[],
  answers: Array<{ pregunta_id: number; valor_texto: string }>
): { porcentaje: number; visiblePreguntas: Pregunta[]; faltantesObligatorias: Pregunta[] } {
  const answerMap = new Map<number, string>();
  for (const a of answers) {
    answerMap.set(a.pregunta_id, a.valor_texto ?? '');
  }

  const visiblePreguntas = preguntas.filter((q) => isQuestionVisible(q, answerMap));
  if (visiblePreguntas.length === 0) {
    return { porcentaje: 0, visiblePreguntas: [], faltantesObligatorias: [] };
  }

  let answeredCount = 0;
  const faltantesObligatorias: Pregunta[] = [];

  for (const q of visiblePreguntas) {
    const val = answerMap.get(q.id);
    if (isAnswered(val)) {
      answeredCount += 1;
    } else if (q.obligatoria === 1) {
      faltantesObligatorias.push(q);
    }
  }

  const porcentaje = Math.round((answeredCount / visiblePreguntas.length) * 100);
  return { porcentaje, visiblePreguntas, faltantesObligatorias };
}

function canAccessInterview(
  user: { id: number; rol: RolUsuario },
  entrevista: { entrevistador_id: number; evaluado_usuario_id: number | null }
): boolean {
  if (user.rol === 'ADMINISTRADOR') return true;
  if (user.rol === 'ENTREVISTADOR') return entrevista.entrevistador_id === user.id;
  if (user.rol === 'EVALUADO') return entrevista.evaluado_usuario_id === user.id;
  return false;
}

function saveInterviewAnswers(params: {
  entrevistaId: number;
  usuarioId: number | null;
  usuarioNombre: string;
  respuestas: Array<{ pregunta_id: number; modulo_id: number; valor_texto: string; observacion?: string }>;
  observacionesGenerales?: string;
}) {
  const entrevista = db.prepare('SELECT * FROM entrevistas WHERE id = ?').get(params.entrevistaId) as {
    id: number;
    codigo: string;
    estado: string;
    preguntas_snapshot_json: string;
  };
  const preguntas = JSON.parse(entrevista.preguntas_snapshot_json) as Pregunta[];
  const qMap = new Map(preguntas.map((q) => [q.id, q]));

  const selectExisting = db.prepare('SELECT valor_texto, observacion FROM respuestas WHERE entrevista_id = ? AND pregunta_id = ?');
  const upsert = db.prepare(`
    INSERT INTO respuestas (entrevista_id, pregunta_id, modulo_id, valor_texto, observacion, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(entrevista_id, pregunta_id)
    DO UPDATE SET valor_texto = excluded.valor_texto, observacion = excluded.observacion, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
  `);
  const insertHist = db.prepare(`
    INSERT INTO historial_modificaciones (entrevista_id, usuario_id, usuario_nombre, accion, detalle, valor_anterior, valor_nuevo)
    VALUES (?, ?, ?, 'Edición de respuesta', ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const item of params.respuestas) {
      const prev = selectExisting.get(params.entrevistaId, item.pregunta_id) as
        | { valor_texto: string; observacion: string }
        | undefined;
      const nextVal = item.valor_texto ?? '';
      const nextObs = item.observacion ?? '';

      if (!prev || prev.valor_texto !== nextVal || prev.observacion !== nextObs) {
        upsert.run(params.entrevistaId, item.pregunta_id, item.modulo_id, nextVal, nextObs, params.usuarioId);
        if (prev && prev.valor_texto !== nextVal) {
          const qText = qMap.get(item.pregunta_id)?.texto ?? `Pregunta #${item.pregunta_id}`;
          insertHist.run(
            params.entrevistaId,
            params.usuarioId,
            params.usuarioNombre,
            qText.slice(0, 120),
            prev.valor_texto,
            nextVal
          );
        }
      }
    }

    const allAnswers = db
      .prepare('SELECT pregunta_id, valor_texto FROM respuestas WHERE entrevista_id = ?')
      .all(params.entrevistaId) as Array<{ pregunta_id: number; valor_texto: string }>;

    const { porcentaje } = computeProgress(preguntas, allAnswers);
    const nextEstado =
      entrevista.estado === 'Borrador' && porcentaje > 0 ? 'En progreso' : entrevista.estado;

    if (params.observacionesGenerales !== undefined) {
      db.prepare(
        'UPDATE entrevistas SET porcentaje_avance = ?, estado = ?, observaciones_generales = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(porcentaje, nextEstado, params.observacionesGenerales, params.entrevistaId);
    } else {
      db.prepare('UPDATE entrevistas SET porcentaje_avance = ?, estado = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        porcentaje,
        nextEstado,
        params.entrevistaId
      );
    }

    return { porcentaje, estado: nextEstado };
  });

  return tx();
}

export function createApp() {
  ensureDatabase();

  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // ==========================================
  // ADMIN UNLOCK & AUTHENTICATION ROUTES
  // ==========================================

  app.post('/api/admin/unlock', (req, res) => {
    const { password } = req.body as { password?: string };
    const expectedPassword = process.env.ADMIN_PASSWORD || 'admin123';
    if (!password || password !== expectedPassword) {
      res.status(401).json({ error: 'Contraseña de administrador incorrecta.' });
      return;
    }

    let adminId = 1;
    try {
      adminId = getDefaultActorId();
      logActivity('Administrador', 'Acceso de administración', 'Sistema', 'Modo de edición y administración desbloqueado.');
    } catch (err) {
      console.error('Aviso registrando acceso de administrador:', err);
    }

    const payload = {
      id: adminId,
      username: 'admin',
      nombre: 'Administrador',
      email: 'admin@diagnostico.com',
      rol: 'ADMINISTRADOR' as RolUsuario,
    };
    const token = signToken(payload);
    res.json({ token, user: payload });
  });

  app.get('/api/admin/verify', (req: AuthenticatedRequest, res) => {
    const user = extractBearerUser(req) || {
      id: 1,
      username: 'editor',
      nombre: 'Editor',
      email: 'sistema@diagnostico.com',
      rol: 'ADMINISTRADOR' as RolUsuario,
    };
    res.json({ isAdmin: true, user });
  });

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: 'Debe ingresar usuario y contraseña.' });
      return;
    }

    const user = db
      .prepare('SELECT * FROM usuarios WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)')
      .get(username.trim(), username.trim()) as
      | {
          id: number;
          nombre: string;
          username: string;
          email: string;
          password_hash: string;
          rol: RolUsuario;
          activo: number;
        }
      | undefined;

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      res.status(401).json({ error: 'Credenciales incorrectas.' });
      return;
    }

    if (user.activo !== 1) {
      res.status(403).json({ error: 'Esta cuenta se encuentra desactivada. Contacte al administrador.' });
      return;
    }

    db.prepare('UPDATE usuarios SET ultimo_acceso = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    const payload = {
      id: user.id,
      username: user.username,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
    };
    const token = signToken(payload);

    res.json({
      token,
      user: payload,
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user });
  });

  // ==========================================
  // DASHBOARD ROUTE
  // ==========================================

  app.get('/api/dashboard', (_req, res) => {
    const totalEmpresas = (db.prepare('SELECT COUNT(*) as c FROM empresas WHERE activo = 1').get() as { c: number }).c;
    const totalPreguntas = (db.prepare('SELECT COUNT(*) as c FROM preguntas WHERE activo = 1').get() as { c: number }).c;
    const usuariosActivos = (db.prepare('SELECT COUNT(*) as c FROM usuarios WHERE activo = 1').get() as { c: number }).c;

    const entrevistas = db
      .prepare('SELECT id, empresa_id, estado, area_trabajo, porcentaje_avance, modulos_snapshot_json, preguntas_snapshot_json FROM entrevistas')
      .all() as Array<{
      id: number;
      empresa_id: number;
      estado: string;
      area_trabajo: string;
      porcentaje_avance: number;
      modulos_snapshot_json: string;
      preguntas_snapshot_json: string;
    }>;

    const totalEntrevistas = entrevistas.length;
    const entrevistasCompletadas = entrevistas.filter((e) => e.estado === 'Completada' || e.estado === 'Revisada').length;
    const entrevistasPendientes = entrevistas.filter((e) => e.estado === 'Borrador' || e.estado === 'En progreso').length;

    const entrevistasPorEmpresa = db
      .prepare(
        `SELECT emp.nombre_comercial as nombre, COUNT(e.id) as total
         FROM empresas emp
         LEFT JOIN entrevistas e ON e.empresa_id = emp.id
         WHERE emp.activo = 1
         GROUP BY emp.id
         ORDER BY total DESC, emp.nombre_comercial ASC
         LIMIT 8`
      )
      .all() as Array<{ nombre: string; total: number }>;

    const estados = ['Borrador', 'En progreso', 'Completada', 'Revisada'];
    const entrevistasPorEstado = estados.map((estado) => ({
      estado,
      total: entrevistas.filter((e) => e.estado === estado).length,
    }));

    const empresasConEntrevista = (
      db
        .prepare(
          `SELECT COUNT(DISTINCT empresa_id) as c FROM entrevistas e JOIN empresas emp ON emp.id = e.empresa_id WHERE emp.activo = 1`
        )
        .get() as { c: number }
    ).c;

    const areaMap = new Map<string, number>();
    for (const ent of entrevistas) {
      const area = ent.area_trabajo || 'Sin área';
      areaMap.set(area, (areaMap.get(area) ?? 0) + 1);
    }
    const distribucionPorArea = Array.from(areaMap.entries())
      .map(([area, total]) => ({ area, total }))
      .sort((a, b) => b.total - a.total);

    const modulosBase = db.prepare('SELECT id, numero, titulo FROM modulos WHERE activo = 1 ORDER BY orden ASC').all() as Array<{
      id: number;
      numero: number;
      titulo: string;
    }>;

    const avancePorModulo = modulosBase.map((mod) => {
      if (entrevistas.length === 0) {
        return { numero: mod.numero, titulo: mod.titulo, porcentaje: 0 };
      }
      let sumPct = 0;
      let countValid = 0;
      for (const ent of entrevistas) {
        const qs = JSON.parse(ent.preguntas_snapshot_json) as Pregunta[];
        const modQs = qs.filter((q) => q.modulo_id === mod.id);
        if (modQs.length === 0) continue;
        const ans = db
          .prepare('SELECT pregunta_id, valor_texto FROM respuestas WHERE entrevista_id = ? AND modulo_id = ?')
          .all(ent.id, mod.id) as Array<{ pregunta_id: number; valor_texto: string }>;
        const answered = ans.filter((a) => isAnswered(a.valor_texto)).length;
        sumPct += Math.round((answered / modQs.length) * 100);
        countValid += 1;
      }
      return {
        numero: mod.numero,
        titulo: mod.titulo,
        porcentaje: countValid > 0 ? Math.round(sumPct / countValid) : 0,
      };
    });

    const actividadReciente = db
      .prepare('SELECT * FROM actividad_reciente ORDER BY id DESC LIMIT 12')
      .all();

    res.json({
      kpis: {
        totalEmpresas,
        totalEntrevistas,
        entrevistasCompletadas,
        entrevistasPendientes,
        totalPreguntas,
        usuariosActivos,
      },
      entrevistasPorEmpresa,
      entrevistasPorEstado,
      empresasEvaluadas: {
        evaluadas: empresasConEntrevista,
        sinEvaluar: Math.max(0, totalEmpresas - empresasConEntrevista),
      },
      distribucionPorArea,
      avancePorModulo,
      actividadReciente,
    });
  });

  // ==========================================
  // USUARIOS ROUTES (ADMINISTRADOR ONLY)
  // ==========================================

  app.get('/api/usuarios', requireAdmin, (_req, res) => {
    const users = db
      .prepare('SELECT id, nombre, username, email, rol, activo, ultimo_acceso, created_at FROM usuarios ORDER BY id ASC')
      .all();
    res.json(users);
  });

  app.post('/api/usuarios', requireAdmin, (req: AuthenticatedRequest, res) => {
    const { nombre, username, email, password, rol } = req.body as {
      nombre?: string;
      username?: string;
      email?: string;
      password?: string;
      rol?: RolUsuario;
    };

    if (!nombre || !username || !email || !password || !rol) {
      res.status(400).json({ error: 'Todos los campos son obligatorios.' });
      return;
    }

    if (!['ADMINISTRADOR', 'ENTREVISTADOR', 'EVALUADO'].includes(rol)) {
      res.status(400).json({ error: 'Rol inválido.' });
      return;
    }

    const existing = db
      .prepare('SELECT id FROM usuarios WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)')
      .get(username.trim(), email.trim());
    if (existing) {
      res.status(409).json({ error: 'Ya existe un usuario con ese nombre de usuario o correo.' });
      return;
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const result = db
      .prepare('INSERT INTO usuarios (nombre, username, email, password_hash, rol, activo) VALUES (?, ?, ?, ?, ?, 1)')
      .run(nombre.trim(), username.trim(), email.trim(), passwordHash, rol);

    logActivity(req.user!.nombre, 'Usuario creado', 'Usuarios', `Creado usuario ${username.trim()} con rol ${rol}.`);
    const created = db
      .prepare('SELECT id, nombre, username, email, rol, activo, ultimo_acceso, created_at FROM usuarios WHERE id = ?')
      .get(result.lastInsertRowid);
    res.status(201).json(created);
  });

  app.put('/api/usuarios/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const { nombre, username, email, rol, password, activo } = req.body as {
      nombre?: string;
      username?: string;
      email?: string;
      rol?: RolUsuario;
      password?: string;
      activo?: number;
    };

    const existing = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id) as
      | { id: number; nombre: string; username: string; email: string; rol: RolUsuario; activo: number }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }

    const nextNombre = nombre?.trim() || existing.nombre;
    const nextUsername = username?.trim() || existing.username;
    const nextEmail = email?.trim() || existing.email;
    const nextRol = rol || existing.rol;
    const nextActivo = activo !== undefined ? (activo ? 1 : 0) : existing.activo;

    const conflict = db
      .prepare('SELECT id FROM usuarios WHERE (LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)) AND id != ?')
      .get(nextUsername, nextEmail, id);
    if (conflict) {
      res.status(409).json({ error: 'El nombre de usuario o correo ya pertenece a otro usuario.' });
      return;
    }

    if (password && password.trim().length > 0) {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare('UPDATE usuarios SET nombre = ?, username = ?, email = ?, rol = ?, activo = ?, password_hash = ? WHERE id = ?').run(
        nextNombre,
        nextUsername,
        nextEmail,
        nextRol,
        nextActivo,
        hash,
        id
      );
    } else {
      db.prepare('UPDATE usuarios SET nombre = ?, username = ?, email = ?, rol = ?, activo = ? WHERE id = ?').run(
        nextNombre,
        nextUsername,
        nextEmail,
        nextRol,
        nextActivo,
        id
      );
    }

    logActivity(req.user!.nombre, 'Usuario actualizado', 'Usuarios', `Actualizado usuario ${nextUsername} (${nextRol}).`);
    const updated = db
      .prepare('SELECT id, nombre, username, email, rol, activo, ultimo_acceso, created_at FROM usuarios WHERE id = ?')
      .get(id);
    res.json(updated);
  });

  app.patch('/api/usuarios/:id/estado', requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    if (id === req.user!.id) {
      res.status(400).json({ error: 'No puede desactivar su propio usuario en sesión.' });
      return;
    }
    const { activo } = req.body as { activo: boolean | number };
    db.prepare('UPDATE usuarios SET activo = ? WHERE id = ?').run(activo ? 1 : 0, id);
    logActivity(req.user!.nombre, activo ? 'Usuario activado' : 'Usuario desactivado', 'Usuarios', `Estado actualizado para usuario ID ${id}.`);
    res.json({ ok: true });
  });

  // ==========================================
  // EMPRESAS ROUTES (LECTURA/REGISTRO LIBRE, SOLO ADMIN EDITA/ELIMINA)
  // ==========================================

  app.get('/api/empresas', (_req, res) => {
    const empresas = db
      .prepare(
        `SELECT emp.*, COUNT(e.id) as total_entrevistas
         FROM empresas emp
         LEFT JOIN entrevistas e ON e.empresa_id = emp.id
         GROUP BY emp.id
         ORDER BY emp.id DESC`
      )
      .all();
    res.json(empresas);
  });

  app.get('/api/empresas/:id', (req, res) => {
    const id = Number(req.params.id);
    const empresa = db.prepare('SELECT * FROM empresas WHERE id = ?').get(id);
    if (!empresa) {
      res.status(404).json({ error: 'Empresa no encontrada.' });
      return;
    }

    const entrevistas = db
      .prepare(
        `SELECT e.id, e.codigo, e.nombre_entrevistado, e.cargo_entrevistado, e.area_trabajo,
                e.fecha_inicio, e.fecha_finalizacion, e.estado, e.porcentaje_avance,
                u.nombre as entrevistador_nombre
         FROM entrevistas e
         JOIN usuarios u ON u.id = e.entrevistador_id
         WHERE e.empresa_id = ?
         ORDER BY e.id DESC`
      )
      .all(id);

    res.json({ empresa, entrevistas });
  });

  app.post('/api/empresas', optionalAuth, (req: AuthenticatedRequest, res) => {
    const b = req.body as Record<string, string | number>;
    if (!b.razon_social || !b.nombre_comercial || !b.nit) {
      res.status(400).json({ error: 'Razón social, nombre comercial y NIT son obligatorios.' });
      return;
    }

    const count = (db.prepare('SELECT COUNT(*) as c FROM empresas').get() as { c: number }).c;
    const codigo = b.codigo_empresa ? String(b.codigo_empresa).trim() : `EMP-${String(count + 1).padStart(3, '0')}`;
    const actorName = req.user?.nombre || 'Registro directo';
    const createdBy = req.user?.id ?? null;

    const result = db
      .prepare(
        `INSERT INTO empresas (
          codigo_empresa, razon_social, nombre_comercial, nit, actividad_economica,
          sector_empresarial, direccion, ciudad, departamento, pais, telefono,
          correo_electronico, numero_empleados, nombre_representante, observaciones, activo, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
      )
      .run(
        codigo,
        String(b.razon_social ?? '').trim(),
        String(b.nombre_comercial ?? '').trim(),
        String(b.nit ?? '').trim(),
        String(b.actividad_economica ?? '').trim(),
        String(b.sector_empresarial ?? '').trim(),
        String(b.direccion ?? '').trim(),
        String(b.ciudad ?? '').trim(),
        String(b.departamento ?? '').trim(),
        String(b.pais ?? 'Colombia').trim(),
        String(b.telefono ?? '').trim(),
        String(b.correo_electronico ?? '').trim(),
        Number(b.numero_empleados ?? 0),
        String(b.nombre_representante ?? '').trim(),
        String(b.observaciones ?? '').trim(),
        createdBy
      );

    logActivity(actorName, 'Empresa registrada', 'Empresas', `Registrada empresa ${b.nombre_comercial} (${codigo}).`);
    const created = db.prepare('SELECT * FROM empresas WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  });

  app.put('/api/empresas/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM empresas WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Empresa no encontrada.' });
      return;
    }

    const b = req.body as Record<string, string | number | boolean>;
    db.prepare(
      `UPDATE empresas SET
        razon_social = ?, nombre_comercial = ?, nit = ?, actividad_economica = ?,
        sector_empresarial = ?, direccion = ?, ciudad = ?, departamento = ?, pais = ?,
        telefono = ?, correo_electronico = ?, numero_empleados = ?, nombre_representante = ?,
        observaciones = ?, activo = ?
       WHERE id = ?`
    ).run(
      String(b.razon_social ?? '').trim(),
      String(b.nombre_comercial ?? '').trim(),
      String(b.nit ?? '').trim(),
      String(b.actividad_economica ?? '').trim(),
      String(b.sector_empresarial ?? '').trim(),
      String(b.direccion ?? '').trim(),
      String(b.ciudad ?? '').trim(),
      String(b.departamento ?? '').trim(),
      String(b.pais ?? 'Colombia').trim(),
      String(b.telefono ?? '').trim(),
      String(b.correo_electronico ?? '').trim(),
      Number(b.numero_empleados ?? 0),
      String(b.nombre_representante ?? '').trim(),
      String(b.observaciones ?? '').trim(),
      b.activo !== undefined ? (b.activo ? 1 : 0) : 1,
      id
    );

    logActivity(req.user!.nombre, 'Empresa actualizada', 'Empresas', `Actualizada información de ${b.nombre_comercial}.`);
    const updated = db.prepare('SELECT * FROM empresas WHERE id = ?').get(id);
    res.json(updated);
  });

  app.delete('/api/empresas/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const hasInterviews = (db.prepare('SELECT COUNT(*) as c FROM entrevistas WHERE empresa_id = ?').get(id) as { c: number }).c;
    if (hasInterviews > 0) {
      db.prepare('UPDATE empresas SET activo = 0 WHERE id = ?').run(id);
      logActivity(req.user!.nombre, 'Empresa desactivada', 'Empresas', `Empresa ID ${id} desactivada (conserva entrevistas asociadas).`);
      res.json({ ok: true, deactivated: true });
      return;
    }
    db.prepare('DELETE FROM empresas WHERE id = ?').run(id);
    logActivity(req.user!.nombre, 'Empresa eliminada', 'Empresas', `Empresa ID ${id} eliminada.`);
    res.json({ ok: true, deleted: true });
  });

  // ==========================================
  // MÓDULOS Y BANCO DE PREGUNTAS (SOLO ADMIN EDITA)
  // ==========================================

  app.get('/api/modulos', (_req, res) => {
    const modulos = db.prepare('SELECT * FROM modulos ORDER BY orden ASC, id ASC').all();
    res.json(modulos);
  });

  app.post('/api/modulos', requireAdmin, (req: AuthenticatedRequest, res) => {
    const { titulo, descripcion } = req.body as { titulo?: string; descripcion?: string };
    if (!titulo?.trim()) {
      res.status(400).json({ error: 'El título del módulo es obligatorio.' });
      return;
    }
    const maxOrden = (db.prepare('SELECT COALESCE(MAX(orden), 0) as m FROM modulos').get() as { m: number }).m;
    const nextNum = maxOrden + 1;
    const result = db
      .prepare('INSERT INTO modulos (numero, titulo, descripcion, orden, activo) VALUES (?, ?, ?, ?, 1)')
      .run(nextNum, titulo.trim(), (descripcion ?? '').trim(), nextNum);

    logActivity(req.user!.nombre, 'Módulo creado', 'Banco de Preguntas', `Creado módulo ${nextNum}: ${titulo.trim()}.`);
    res.status(201).json(db.prepare('SELECT * FROM modulos WHERE id = ?').get(result.lastInsertRowid));
  });

  app.put('/api/modulos/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const { numero, titulo, descripcion, activo } = req.body as {
      numero?: number;
      titulo?: string;
      descripcion?: string;
      activo?: number | boolean;
    };
    const existing = db.prepare('SELECT * FROM modulos WHERE id = ?').get(id) as Modulo | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Módulo no encontrado.' });
      return;
    }
    db.prepare('UPDATE modulos SET numero = ?, titulo = ?, descripcion = ?, activo = ? WHERE id = ?').run(
      numero ?? existing.numero,
      titulo?.trim() || existing.titulo,
      descripcion !== undefined ? descripcion.trim() : existing.descripcion,
      activo !== undefined ? (activo ? 1 : 0) : existing.activo,
      id
    );
    logActivity(req.user!.nombre, 'Módulo actualizado', 'Banco de Preguntas', `Actualizado módulo ${titulo || existing.titulo}.`);
    res.json(db.prepare('SELECT * FROM modulos WHERE id = ?').get(id));
  });

  app.patch('/api/modulos/reordenar', requireAdmin, (req: AuthenticatedRequest, res) => {
    const { ids } = req.body as { ids?: number[] };
    if (!Array.isArray(ids)) {
      res.status(400).json({ error: 'Lista de IDs inválida.' });
      return;
    }
    const stmt = db.prepare('UPDATE modulos SET orden = ?, numero = ? WHERE id = ?');
    const tx = db.transaction((orderedIds: number[]) => {
      orderedIds.forEach((id, idx) => stmt.run(idx + 1, idx + 1, id));
    });
    tx(ids);
    logActivity(req.user!.nombre, 'Módulos reordenados', 'Banco de Preguntas', 'Actualizado el orden de los módulos del cuestionario.');
    res.json({ ok: true });
  });

  app.delete('/api/modulos/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM modulos WHERE id = ?').run(id);
    logActivity(req.user!.nombre, 'Módulo eliminado', 'Banco de Preguntas', `Eliminado módulo ID ${id}.`);
    res.json({ ok: true });
  });

  app.get('/api/preguntas', (_req, res) => {
    const preguntas = db.prepare('SELECT * FROM preguntas ORDER BY modulo_id ASC, orden ASC, id ASC').all();
    res.json(preguntas);
  });

  app.post('/api/preguntas', requireAdmin, (req: AuthenticatedRequest, res) => {
    const b = req.body as Partial<Pregunta> & { opciones?: string[] };
    if (!b.modulo_id || !b.texto?.trim() || !b.tipo_respuesta) {
      res.status(400).json({ error: 'Módulo, texto y tipo de respuesta son obligatorios.' });
      return;
    }
    const maxOrden = (
      db.prepare('SELECT COALESCE(MAX(orden), 0) as m FROM preguntas WHERE modulo_id = ?').get(b.modulo_id) as { m: number }
    ).m;

    const opcionesJson = b.opciones ? JSON.stringify(b.opciones) : b.opciones_json || '[]';
    const result = db
      .prepare(
        `INSERT INTO preguntas (
          modulo_id, texto, descripcion_ayuda, tipo_respuesta, opciones_json,
          orden, obligatoria, activo, condicion_pregunta_id, condicion_operador, condicion_valor
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        b.modulo_id,
        b.texto.trim(),
        (b.descripcion_ayuda ?? '').trim(),
        b.tipo_respuesta,
        opcionesJson,
        b.orden ?? maxOrden + 1,
        b.obligatoria !== undefined ? (b.obligatoria ? 1 : 0) : 1,
        b.activo !== undefined ? (b.activo ? 1 : 0) : 1,
        b.condicion_pregunta_id || null,
        b.condicion_operador || '',
        (b.condicion_valor ?? '').trim()
      );

    logActivity(req.user!.nombre, 'Pregunta creada', 'Banco de Preguntas', `Agregada pregunta al módulo ${b.modulo_id}.`);
    res.status(201).json(db.prepare('SELECT * FROM preguntas WHERE id = ?').get(result.lastInsertRowid));
  });

  app.put('/api/preguntas/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM preguntas WHERE id = ?').get(id) as Pregunta | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Pregunta no encontrada.' });
      return;
    }

    const b = req.body as Partial<Pregunta> & { opciones?: string[] };
    const opcionesJson = b.opciones ? JSON.stringify(b.opciones) : b.opciones_json ?? existing.opciones_json;

    db.prepare(
      `UPDATE preguntas SET
        modulo_id = ?, texto = ?, descripcion_ayuda = ?, tipo_respuesta = ?,
        opciones_json = ?, orden = ?, obligatoria = ?, activo = ?,
        condicion_pregunta_id = ?, condicion_operador = ?, condicion_valor = ?
       WHERE id = ?`
    ).run(
      b.modulo_id ?? existing.modulo_id,
      b.texto?.trim() || existing.texto,
      b.descripcion_ayuda !== undefined ? b.descripcion_ayuda.trim() : existing.descripcion_ayuda,
      b.tipo_respuesta ?? existing.tipo_respuesta,
      opcionesJson,
      b.orden ?? existing.orden,
      b.obligatoria !== undefined ? (b.obligatoria ? 1 : 0) : existing.obligatoria,
      b.activo !== undefined ? (b.activo ? 1 : 0) : existing.activo,
      b.condicion_pregunta_id !== undefined ? b.condicion_pregunta_id || null : existing.condicion_pregunta_id,
      b.condicion_operador !== undefined ? b.condicion_operador : existing.condicion_operador,
      b.condicion_valor !== undefined ? b.condicion_valor.trim() : existing.condicion_valor,
      id
    );

    logActivity(req.user!.nombre, 'Pregunta actualizada', 'Banco de Preguntas', `Modificada pregunta ID ${id}.`);
    res.json(db.prepare('SELECT * FROM preguntas WHERE id = ?').get(id));
  });

  app.post('/api/preguntas/:id/duplicar', requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const q = db.prepare('SELECT * FROM preguntas WHERE id = ?').get(id) as Pregunta | undefined;
    if (!q) {
      res.status(404).json({ error: 'Pregunta no encontrada.' });
      return;
    }
    const maxOrden = (
      db.prepare('SELECT COALESCE(MAX(orden), 0) as m FROM preguntas WHERE modulo_id = ?').get(q.modulo_id) as { m: number }
    ).m;

    const result = db
      .prepare(
        `INSERT INTO preguntas (
          modulo_id, texto, descripcion_ayuda, tipo_respuesta, opciones_json,
          orden, obligatoria, activo, condicion_pregunta_id, condicion_operador, condicion_valor
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        q.modulo_id,
        `${q.texto} (Copia)`,
        q.descripcion_ayuda,
        q.tipo_respuesta,
        q.opciones_json,
        maxOrden + 1,
        q.obligatoria,
        q.activo,
        q.condicion_pregunta_id,
        q.condicion_operador,
        q.condicion_valor
      );

    logActivity(req.user!.nombre, 'Pregunta duplicada', 'Banco de Preguntas', `Duplicada pregunta ID ${id}.`);
    res.status(201).json(db.prepare('SELECT * FROM preguntas WHERE id = ?').get(result.lastInsertRowid));
  });

  app.patch('/api/preguntas/reordenar', requireAdmin, (_req, res) => {
    const { ids } = _req.body as { ids?: number[] };
    if (!Array.isArray(ids)) {
      res.status(400).json({ error: 'Lista de IDs inválida.' });
      return;
    }
    const stmt = db.prepare('UPDATE preguntas SET orden = ? WHERE id = ?');
    const tx = db.transaction((orderedIds: number[]) => {
      orderedIds.forEach((id, idx) => stmt.run(idx + 1, id));
    });
    tx(ids);
    res.json({ ok: true });
  });

  app.delete('/api/preguntas/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM preguntas WHERE id = ?').run(id);
    logActivity(req.user!.nombre, 'Pregunta eliminada', 'Banco de Preguntas', `Eliminada pregunta ID ${id}.`);
    res.json({ ok: true });
  });

  // ==========================================
  // ENTREVISTAS ROUTES
  // ==========================================

  app.get('/api/entrevistas', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT e.id, e.codigo, e.empresa_id, emp.nombre_comercial as empresa_nombre,
                emp.razon_social as empresa_razon_social, e.entrevistador_id,
                u.nombre as entrevistador_nombre, e.evaluado_usuario_id,
                e.nombre_entrevistado, e.cargo_entrevistado, e.area_trabajo,
                e.fecha_inicio, e.fecha_finalizacion, e.estado, e.observaciones_generales,
                e.enlace_evaluado_activo, e.enlace_evaluado_token, e.porcentaje_avance,
                e.created_at, e.updated_at
         FROM entrevistas e
         JOIN empresas emp ON emp.id = e.empresa_id
         JOIN usuarios u ON u.id = e.entrevistador_id
         ORDER BY e.id DESC`
      )
      .all();
    res.json(rows);
  });

  app.get('/api/entrevistas/:id', (req, res) => {
    const id = Number(req.params.id);
    const entrevista = db
      .prepare(
        `SELECT e.*, emp.nombre_comercial as empresa_nombre, emp.razon_social as empresa_razon_social,
                emp.sector_empresarial, emp.ciudad, u.nombre as entrevistador_nombre
         FROM entrevistas e
         JOIN empresas emp ON emp.id = e.empresa_id
         JOIN usuarios u ON u.id = e.entrevistador_id
         WHERE e.id = ?`
      )
      .get(id) as
      | ({
          id: number;
          entrevistador_id: number;
          evaluado_usuario_id: number | null;
        } & Record<string, unknown>)
      | undefined;

    if (!entrevista) {
      res.status(404).json({ error: 'Entrevista no encontrada.' });
      return;
    }

    const respuestas = db.prepare('SELECT * FROM respuestas WHERE entrevista_id = ?').all(id);
    const historial = db
      .prepare('SELECT * FROM historial_modificaciones WHERE entrevista_id = ? ORDER BY id DESC')
      .all(id);

    res.json({ entrevista, respuestas, historial });
  });

  app.post('/api/entrevistas', optionalAuth, (req: AuthenticatedRequest, res) => {
    const b = req.body as {
      empresa_id?: number;
      nombre_entrevistado?: string;
      cargo_entrevistado?: string;
      area_trabajo?: string;
      fecha_inicio?: string;
      observaciones_generales?: string;
      enlace_evaluado_activo?: boolean | number;
      evaluado_usuario_id?: number | null;
    };

    if (!b.empresa_id || !b.nombre_entrevistado?.trim() || !b.cargo_entrevistado?.trim() || !b.area_trabajo?.trim()) {
      res.status(400).json({ error: 'Empresa, nombre del entrevistado, cargo y área son obligatorios.' });
      return;
    }

    const empresa = db.prepare('SELECT id, nombre_comercial FROM empresas WHERE id = ? AND activo = 1').get(b.empresa_id) as
      | { id: number; nombre_comercial: string }
      | undefined;
    if (!empresa) {
      res.status(404).json({ error: 'Empresa no encontrada o inactiva.' });
      return;
    }

    const modulosSnapshot = db.prepare('SELECT * FROM modulos WHERE activo = 1 ORDER BY orden ASC').all() as Modulo[];
    const activeModuloIds = new Set(modulosSnapshot.map((m) => m.id));
    const preguntasAll = db.prepare('SELECT * FROM preguntas WHERE activo = 1 ORDER BY modulo_id ASC, orden ASC').all() as Pregunta[];
    const preguntasSnapshot = preguntasAll.filter((p) => activeModuloIds.has(p.modulo_id));

    const count = (db.prepare('SELECT COUNT(*) as c FROM entrevistas').get() as { c: number }).c;
    const codigo = `ENT-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    const token = crypto.randomBytes(16).toString('hex');
    const fechaInicio = b.fecha_inicio || new Date().toISOString().slice(0, 10);
    const actorId = req.user?.id ?? getDefaultActorId();
    const actorName = req.user?.nombre || b.nombre_entrevistado.trim();

    const result = db
      .prepare(
        `INSERT INTO entrevistas (
          codigo, empresa_id, entrevistador_id, evaluado_usuario_id,
          nombre_entrevistado, cargo_entrevistado, area_trabajo,
          fecha_inicio, estado, observaciones_generales,
          enlace_evaluado_activo, enlace_evaluado_token, porcentaje_avance,
          modulos_snapshot_json, preguntas_snapshot_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Borrador', ?, ?, ?, 0, ?, ?)`
      )
      .run(
        codigo,
        b.empresa_id,
        actorId,
        b.evaluado_usuario_id || null,
        b.nombre_entrevistado.trim(),
        b.cargo_entrevistado.trim(),
        b.area_trabajo.trim(),
        fechaInicio,
        (b.observaciones_generales ?? '').trim(),
        b.enlace_evaluado_activo ? 1 : 0,
        token,
        JSON.stringify(modulosSnapshot),
        JSON.stringify(preguntasSnapshot)
      );

    const newId = Number(result.lastInsertRowid);
    db.prepare(
      `INSERT INTO historial_modificaciones (entrevista_id, usuario_id, usuario_nombre, accion, detalle, valor_anterior, valor_nuevo)
       VALUES (?, ?, ?, 'Creación', 'Entrevista creada con copia histórica del cuestionario vigente.', '', 'Borrador')`
    ).run(newId, req.user?.id ?? null, actorName);

    logActivity(actorName, 'Entrevista creada', codigo, `Nueva entrevista para ${empresa.nombre_comercial} (${b.area_trabajo}).`);

    res.status(201).json(db.prepare('SELECT * FROM entrevistas WHERE id = ?').get(newId));
  });

  // SOLO ADMINISTRADOR puede editar metadatos, estado, enlaces o eliminar una entrevista
  app.put('/api/entrevistas/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM entrevistas WHERE id = ?').get(id) as
      | {
          id: number;
          codigo: string;
          entrevistador_id: number;
          evaluado_usuario_id: number | null;
          estado: string;
          observaciones_generales: string;
          enlace_evaluado_activo: number;
        }
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Entrevista no encontrada.' });
      return;
    }

    const b = req.body as {
      nombre_entrevistado?: string;
      cargo_entrevistado?: string;
      area_trabajo?: string;
      observaciones_generales?: string;
      estado?: string;
      enlace_evaluado_activo?: boolean | number;
      evaluado_usuario_id?: number | null;
    };

    const nextEstado = b.estado ?? existing.estado;
    db.prepare(
      `UPDATE entrevistas SET
        nombre_entrevistado = COALESCE(?, nombre_entrevistado),
        cargo_entrevistado = COALESCE(?, cargo_entrevistado),
        area_trabajo = COALESCE(?, area_trabajo),
        observaciones_generales = COALESCE(?, observaciones_generales),
        estado = ?,
        enlace_evaluado_activo = COALESCE(?, enlace_evaluado_activo),
        evaluado_usuario_id = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      b.nombre_entrevistado?.trim() || null,
      b.cargo_entrevistado?.trim() || null,
      b.area_trabajo?.trim() || null,
      b.observaciones_generales !== undefined ? b.observaciones_generales : null,
      nextEstado,
      b.enlace_evaluado_activo !== undefined ? (b.enlace_evaluado_activo ? 1 : 0) : null,
      b.evaluado_usuario_id !== undefined ? b.evaluado_usuario_id : existing.evaluado_usuario_id,
      id
    );

    if (b.estado && b.estado !== existing.estado) {
      db.prepare(
        `INSERT INTO historial_modificaciones (entrevista_id, usuario_id, usuario_nombre, accion, detalle, valor_anterior, valor_nuevo)
         VALUES (?, ?, ?, 'Cambio de estado', 'Actualización del estado de la entrevista.', ?, ?)`
      ).run(id, req.user!.id, req.user!.nombre, existing.estado, b.estado);
      logActivity(req.user!.nombre, 'Estado actualizado', existing.codigo, `Estado cambiado de ${existing.estado} a ${b.estado}.`);
    }

    res.json(db.prepare('SELECT * FROM entrevistas WHERE id = ?').get(id));
  });

  app.delete('/api/entrevistas/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT id, codigo FROM entrevistas WHERE id = ?').get(id) as
      | { id: number; codigo: string }
      | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Entrevista no encontrada.' });
      return;
    }
    db.prepare('DELETE FROM entrevistas WHERE id = ?').run(id);
    logActivity(req.user!.nombre, 'Entrevista eliminada', existing.codigo, 'Entrevista eliminada por el administrador.');
    res.json({ ok: true });
  });

  app.put('/api/entrevistas/:id/respuestas', optionalAuth, (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const entrevista = db.prepare('SELECT * FROM entrevistas WHERE id = ?').get(id) as
      | { id: number; nombre_entrevistado: string; estado: string }
      | undefined;

    if (!entrevista) {
      res.status(404).json({ error: 'Entrevista no encontrada.' });
      return;
    }

    const { respuestas, observaciones_generales } = req.body as {
      respuestas?: Array<{ pregunta_id: number; modulo_id: number; valor_texto: string; observacion?: string }>;
      observaciones_generales?: string;
    };

    if (!Array.isArray(respuestas)) {
      res.status(400).json({ error: 'Formato de respuestas inválido.' });
      return;
    }

    const result = saveInterviewAnswers({
      entrevistaId: id,
      usuarioId: req.user?.id ?? null,
      usuarioNombre: req.user?.nombre || entrevista.nombre_entrevistado || 'Encuestado',
      respuestas,
      observacionesGenerales: observaciones_generales,
    });

    res.json(result);
  });

  app.post('/api/entrevistas/:id/finalizar', optionalAuth, (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const entrevista = db.prepare('SELECT * FROM entrevistas WHERE id = ?').get(id) as
      | {
          id: number;
          codigo: string;
          nombre_entrevistado: string;
          estado: string;
          preguntas_snapshot_json: string;
        }
      | undefined;

    if (!entrevista) {
      res.status(404).json({ error: 'Entrevista no encontrada.' });
      return;
    }

    const preguntas = JSON.parse(entrevista.preguntas_snapshot_json) as Pregunta[];
    const answers = db
      .prepare('SELECT pregunta_id, valor_texto FROM respuestas WHERE entrevista_id = ?')
      .all(id) as Array<{ pregunta_id: number; valor_texto: string }>;

    const { porcentaje, faltantesObligatorias } = computeProgress(preguntas, answers);
    if (faltantesObligatorias.length > 0) {
      res.status(400).json({
        error: `Faltan ${faltantesObligatorias.length} pregunta(s) obligatoria(s) por responder.`,
        faltantes: faltantesObligatorias.map((q) => ({ id: q.id, modulo_id: q.modulo_id, texto: q.texto })),
      });
      return;
    }

    const fechaFin = new Date().toISOString().slice(0, 10);
    const actorName = req.user?.nombre || entrevista.nombre_entrevistado || 'Encuestado';
    db.prepare(
      `UPDATE entrevistas SET estado = 'Completada', fecha_finalizacion = ?, porcentaje_avance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(fechaFin, porcentaje, id);

    db.prepare(
      `INSERT INTO historial_modificaciones (entrevista_id, usuario_id, usuario_nombre, accion, detalle, valor_anterior, valor_nuevo)
       VALUES (?, ?, ?, 'Finalización', 'Entrevista finalizada y enviada tras validar preguntas obligatorias.', ?, 'Completada')`
    ).run(id, req.user?.id ?? null, actorName, entrevista.estado);

    logActivity(actorName, 'Entrevista finalizada', entrevista.codigo, `Entrevista completada (${porcentaje}%).`);
    res.json({ ok: true, estado: 'Completada', fecha_finalizacion: fechaFin, porcentaje_avance: porcentaje });
  });

  app.post('/api/entrevistas/:id/sincronizar-preguntas', requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const entrevista = db.prepare('SELECT id, codigo, estado FROM entrevistas WHERE id = ?').get(id) as
      | { id: number; codigo: string; estado: string }
      | undefined;

    if (!entrevista) {
      res.status(404).json({ error: 'Entrevista no encontrada.' });
      return;
    }

    if (entrevista.estado === 'Completada' || entrevista.estado === 'Revisada') {
      res.status(400).json({
        error: 'Las entrevistas completadas o revisadas conservan su cuestionario histórico original y no pueden alterarse.',
      });
      return;
    }

    const modulosSnapshot = db.prepare('SELECT * FROM modulos WHERE activo = 1 ORDER BY orden ASC').all() as Modulo[];
    const activeModuloIds = new Set(modulosSnapshot.map((m) => m.id));
    const preguntasAll = db.prepare('SELECT * FROM preguntas WHERE activo = 1 ORDER BY modulo_id ASC, orden ASC').all() as Pregunta[];
    const preguntasSnapshot = preguntasAll.filter((p) => activeModuloIds.has(p.modulo_id));

    const answers = db
      .prepare('SELECT pregunta_id, valor_texto FROM respuestas WHERE entrevista_id = ?')
      .all(id) as Array<{ pregunta_id: number; valor_texto: string }>;
    const { porcentaje } = computeProgress(preguntasSnapshot, answers);

    db.prepare(
      `UPDATE entrevistas
       SET modulos_snapshot_json = ?, preguntas_snapshot_json = ?, porcentaje_avance = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(JSON.stringify(modulosSnapshot), JSON.stringify(preguntasSnapshot), porcentaje, id);

    db.prepare(
      `INSERT INTO historial_modificaciones (entrevista_id, usuario_id, usuario_nombre, accion, detalle, valor_anterior, valor_nuevo)
       VALUES (?, ?, ?, 'Actualización de cuestionario', 'Sincronizado el formulario con los módulos y preguntas vigentes del Banco de Preguntas.', '', ?)`
    ).run(id, req.user!.id, req.user!.nombre, `${preguntasSnapshot.length} preguntas`);

    logActivity(req.user!.nombre, 'Cuestionario sincronizado', entrevista.codigo, `Actualizado borrador con ${preguntasSnapshot.length} preguntas vigentes.`);
    res.json(db.prepare('SELECT * FROM entrevistas WHERE id = ?').get(id));
  });

  // ==========================================
  // ENLACE SEGURO EVALUADO (TOKEN PÚBLICO)
  // ==========================================

  app.get('/api/evaluacion-publica/:token', (req, res) => {
    const token = req.params.token;
    const entrevista = db
      .prepare(
        `SELECT e.id, e.codigo, e.nombre_entrevistado, e.cargo_entrevistado, e.area_trabajo,
                e.fecha_inicio, e.fecha_finalizacion, e.estado, e.observaciones_generales,
                e.porcentaje_avance, e.enlace_evaluado_activo, e.modulos_snapshot_json,
                e.preguntas_snapshot_json, emp.nombre_comercial as empresa_nombre
         FROM entrevistas e
         JOIN empresas emp ON emp.id = e.empresa_id
         WHERE e.enlace_evaluado_token = ?`
      )
      .get(token) as ({ id: number; enlace_evaluado_activo: number } & Record<string, unknown>) | undefined;

    if (!entrevista || entrevista.enlace_evaluado_activo !== 1) {
      res.status(404).json({ error: 'Enlace de evaluación inválido o deshabilitado por el administrador.' });
      return;
    }

    const respuestas = db.prepare('SELECT pregunta_id, modulo_id, valor_texto, observacion FROM respuestas WHERE entrevista_id = ?').all(entrevista.id);
    res.json({ entrevista, respuestas });
  });

  app.put('/api/evaluacion-publica/:token/respuestas', (req, res) => {
    const token = req.params.token;
    const entrevista = db
      .prepare('SELECT id, nombre_entrevistado, enlace_evaluado_activo, estado FROM entrevistas WHERE enlace_evaluado_token = ?')
      .get(token) as { id: number; nombre_entrevistado: string; enlace_evaluado_activo: number; estado: string } | undefined;

    if (!entrevista || entrevista.enlace_evaluado_activo !== 1) {
      res.status(403).json({ error: 'Enlace no habilitado.' });
      return;
    }

    if (entrevista.estado === 'Completada' || entrevista.estado === 'Revisada') {
      res.status(403).json({ error: 'La entrevista ya fue enviada y cerrada.' });
      return;
    }

    const { respuestas, observaciones_generales } = req.body as {
      respuestas?: Array<{ pregunta_id: number; modulo_id: number; valor_texto: string; observacion?: string }>;
      observaciones_generales?: string;
    };

    const result = saveInterviewAnswers({
      entrevistaId: entrevista.id,
      usuarioId: null,
      usuarioNombre: `${entrevista.nombre_entrevistado} (Evaluado)`,
      respuestas: respuestas ?? [],
      observacionesGenerales: observaciones_generales,
    });

    res.json(result);
  });

  app.post('/api/evaluacion-publica/:token/finalizar', (req, res) => {
    const token = req.params.token;
    const entrevista = db
      .prepare('SELECT id, codigo, nombre_entrevistado, enlace_evaluado_activo, estado, preguntas_snapshot_json FROM entrevistas WHERE enlace_evaluado_token = ?')
      .get(token) as
      | {
          id: number;
          codigo: string;
          nombre_entrevistado: string;
          enlace_evaluado_activo: number;
          estado: string;
          preguntas_snapshot_json: string;
        }
      | undefined;

    if (!entrevista || entrevista.enlace_evaluado_activo !== 1) {
      res.status(403).json({ error: 'Enlace no habilitado.' });
      return;
    }

    const preguntas = JSON.parse(entrevista.preguntas_snapshot_json) as Pregunta[];
    const answers = db
      .prepare('SELECT pregunta_id, valor_texto FROM respuestas WHERE entrevista_id = ?')
      .all(entrevista.id) as Array<{ pregunta_id: number; valor_texto: string }>;

    const { porcentaje, faltantesObligatorias } = computeProgress(preguntas, answers);
    if (faltantesObligatorias.length > 0) {
      res.status(400).json({
        error: `Faltan ${faltantesObligatorias.length} pregunta(s) obligatoria(s) por responder.`,
        faltantes: faltantesObligatorias.map((q) => ({ id: q.id, modulo_id: q.modulo_id, texto: q.texto })),
      });
      return;
    }

    const fechaFin = new Date().toISOString().slice(0, 10);
    db.prepare(
      `UPDATE entrevistas SET estado = 'Completada', fecha_finalizacion = ?, porcentaje_avance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(fechaFin, porcentaje, entrevista.id);

    db.prepare(
      `INSERT INTO historial_modificaciones (entrevista_id, usuario_id, usuario_nombre, accion, detalle, valor_anterior, valor_nuevo)
       VALUES (?, NULL, ?, 'Envío por Evaluado', 'Evaluación completada mediante enlace seguro.', ?, 'Completada')`
    ).run(entrevista.id, `${entrevista.nombre_entrevistado} (Evaluado)`, entrevista.estado);

    logActivity(`${entrevista.nombre_entrevistado} (Evaluado)`, 'Evaluación enviada', entrevista.codigo, 'Respuestas enviadas mediante enlace seguro.');
    res.json({ ok: true, estado: 'Completada', fecha_finalizacion: fechaFin });
  });

  // ==========================================
  // DIAGNÓSTICO LOGÍSTICO & IA (SOLO ADMIN EDITA)
  // ==========================================

  app.get('/api/diagnosticos/:entrevistaId', (req, res) => {
    const entrevistaId = Number(req.params.entrevistaId);
    const entrevista = db.prepare('SELECT id FROM entrevistas WHERE id = ?').get(entrevistaId) as
      | { id: number }
      | undefined;

    if (!entrevista) {
      res.status(404).json({ error: 'Entrevista no encontrada.' });
      return;
    }

    const hallazgos = db
      .prepare('SELECT * FROM hallazgos_diagnostico WHERE entrevista_id = ? ORDER BY id DESC')
      .all(entrevistaId);
    const madurez = db
      .prepare('SELECT * FROM evaluaciones_madurez WHERE entrevista_id = ? ORDER BY id ASC')
      .all(entrevistaId);
    const resumenIA = db
      .prepare('SELECT * FROM resumenes_ia_diagnostico WHERE entrevista_id = ? ORDER BY id DESC LIMIT 1')
      .get(entrevistaId);

    res.json({ hallazgos, madurez, resumenIA: resumenIA || null });
  });

  app.post('/api/diagnosticos/:entrevistaId/hallazgos', requireAdmin, (req: AuthenticatedRequest, res) => {
    const entrevistaId = Number(req.params.entrevistaId);
    const entrevista = db.prepare('SELECT id, empresa_id, codigo FROM entrevistas WHERE id = ?').get(entrevistaId) as
      | { id: number; empresa_id: number; codigo: string }
      | undefined;
    if (!entrevista) {
      res.status(404).json({ error: 'Entrevista no encontrada.' });
      return;
    }

    const b = req.body as Record<string, string>;
    if (!b.hallazgo?.trim() || !b.evidencia?.trim() || !b.proceso_relacionado?.trim()) {
      res.status(400).json({ error: 'Hallazgo, evidencia y proceso relacionado son obligatorios.' });
      return;
    }

    const result = db
      .prepare(
        `INSERT INTO hallazgos_diagnostico (
          entrevista_id, empresa_id, categoria, proceso_relacionado, hallazgo, evidencia,
          nivel_impacto, recomendacion, prioridad, responsable, estado_seguimiento, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entrevistaId,
        entrevista.empresa_id,
        b.categoria || 'Debilidad',
        b.proceso_relacionado.trim(),
        b.hallazgo.trim(),
        b.evidencia.trim(),
        b.nivel_impacto || 'Medio',
        (b.recomendacion ?? '').trim(),
        b.prioridad || 'Media',
        (b.responsable ?? 'Por asignar').trim(),
        b.estado_seguimiento || 'Abierto',
        req.user!.id
      );

    logActivity(req.user!.nombre, 'Hallazgo registrado', entrevista.codigo, `${b.categoria}: ${b.hallazgo.slice(0, 70)}`);
    res.status(201).json(db.prepare('SELECT * FROM hallazgos_diagnostico WHERE id = ?').get(result.lastInsertRowid));
  });

  app.put('/api/diagnosticos/hallazgos/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const b = req.body as Record<string, string>;
    const existing = db.prepare('SELECT * FROM hallazgos_diagnostico WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Hallazgo no encontrado.' });
      return;
    }

    db.prepare(
      `UPDATE hallazgos_diagnostico SET
        categoria = ?, proceso_relacionado = ?, hallazgo = ?, evidencia = ?,
        nivel_impacto = ?, recomendacion = ?, prioridad = ?, responsable = ?, estado_seguimiento = ?
       WHERE id = ?`
    ).run(
      b.categoria,
      b.proceso_relacionado,
      b.hallazgo,
      b.evidencia,
      b.nivel_impacto,
      b.recomendacion,
      b.prioridad,
      b.responsable,
      b.estado_seguimiento,
      id
    );

    res.json(db.prepare('SELECT * FROM hallazgos_diagnostico WHERE id = ?').get(id));
  });

  app.delete('/api/diagnosticos/hallazgos/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM hallazgos_diagnostico WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  app.put('/api/diagnosticos/:entrevistaId/madurez', requireAdmin, (req: AuthenticatedRequest, res) => {
    const entrevistaId = Number(req.params.entrevistaId);
    const b = req.body as {
      proceso?: string;
      criterios_evaluacion?: string;
      evidencia_suficiente?: boolean | number;
      evidencia_respaldo?: string;
      nivel_madurez?: number | null;
      justificacion?: string;
    };

    if (!b.proceso?.trim() || !b.criterios_evaluacion?.trim()) {
      res.status(400).json({ error: 'Proceso y criterios de evaluación son obligatorios.' });
      return;
    }

    const tieneEvidencia = b.evidencia_suficiente ? 1 : 0;
    if (tieneEvidencia === 1 && (!b.evidencia_respaldo?.trim() || !b.nivel_madurez || b.nivel_madurez < 1 || b.nivel_madurez > 5)) {
      res.status(400).json({
        error: 'Para asignar un nivel de madurez de 1 a 5 debe documentar la evidencia de respaldo suficiente.',
      });
      return;
    }

    const nivelFinal = tieneEvidencia === 1 ? Number(b.nivel_madurez) : null;

    db.prepare(
      `INSERT INTO evaluaciones_madurez (
        entrevista_id, proceso, criterios_evaluacion, evidencia_suficiente,
        evidencia_respaldo, nivel_madurez, justificacion, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(entrevista_id, proceso)
      DO UPDATE SET
        criterios_evaluacion = excluded.criterios_evaluacion,
        evidencia_suficiente = excluded.evidencia_suficiente,
        evidencia_respaldo = excluded.evidencia_respaldo,
        nivel_madurez = excluded.nivel_madurez,
        justificacion = excluded.justificacion,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP`
    ).run(
      entrevistaId,
      b.proceso.trim(),
      b.criterios_evaluacion.trim(),
      tieneEvidencia,
      (b.evidencia_respaldo ?? '').trim(),
      nivelFinal,
      (b.justificacion ?? '').trim(),
      req.user!.id
    );

    const saved = db
      .prepare('SELECT * FROM evaluaciones_madurez WHERE entrevista_id = ? AND proceso = ?')
      .get(entrevistaId, b.proceso.trim());
    res.json(saved);
  });

  app.post('/api/diagnosticos/:entrevistaId/ai-summary', requireAdmin, async (req: AuthenticatedRequest, res) => {
    const entrevistaId = Number(req.params.entrevistaId);
    const entrevista = db
      .prepare(
        `SELECT e.*, emp.nombre_comercial as empresa_nombre, emp.sector_empresarial
         FROM entrevistas e
         JOIN empresas emp ON emp.id = e.empresa_id
         WHERE e.id = ?`
      )
      .get(entrevistaId) as
      | {
          id: number;
          codigo: string;
          entrevistador_id: number;
          evaluado_usuario_id: number | null;
          empresa_nombre: string;
          sector_empresarial: string;
          nombre_entrevistado: string;
          cargo_entrevistado: string;
          estado: string;
          porcentaje_avance: number;
          modulos_snapshot_json: string;
          preguntas_snapshot_json: string;
        }
      | undefined;

    if (!entrevista) {
      res.status(404).json({ error: 'Entrevista no encontrada.' });
      return;
    }

    const modulos = JSON.parse(entrevista.modulos_snapshot_json) as Modulo[];
    const preguntas = JSON.parse(entrevista.preguntas_snapshot_json) as Pregunta[];
    const modMap = new Map(modulos.map((m) => [m.id, `${m.numero}. ${m.titulo}`]));

    const answers = db
      .prepare('SELECT pregunta_id, valor_texto, observacion FROM respuestas WHERE entrevista_id = ?')
      .all(entrevistaId) as Array<{ pregunta_id: number; valor_texto: string; observacion: string }>;
    const ansMap = new Map(answers.map((a) => [a.pregunta_id, a]));

    const answerTextMap = new Map(answers.map((a) => [a.pregunta_id, a.valor_texto]));
    const visiblePreguntas = preguntas.filter((q) => isQuestionVisible(q, answerTextMap));

    const respuestasContext = [];
    const preguntasSinResponder: string[] = [];

    for (const q of visiblePreguntas) {
      const ans = ansMap.get(q.id);
      const modName = modMap.get(q.modulo_id) || 'Módulo';
      if (ans && isAnswered(ans.valor_texto)) {
        let formatted = ans.valor_texto;
        try {
          if (formatted.startsWith('[')) {
            const parsed = JSON.parse(formatted);
            if (Array.isArray(parsed)) formatted = parsed.join(', ');
          }
        } catch {
          // ignore
        }
        respuestasContext.push({
          modulo: modName,
          pregunta: q.texto,
          tipo: q.tipo_respuesta,
          respuesta: formatted,
          observacion: ans.observacion || '',
        });
      } else {
        preguntasSinResponder.push(`[${modName}] ${q.texto}`);
      }
    }

    try {
      const summary = await generateDiagnosticAISummary({
        empresa: entrevista.empresa_nombre,
        sector: entrevista.sector_empresarial,
        codigoEntrevista: entrevista.codigo,
        entrevistado: entrevista.nombre_entrevistado,
        cargo: entrevista.cargo_entrevistado,
        estado: entrevista.estado,
        porcentajeAvance: entrevista.porcentaje_avance,
        respuestas: respuestasContext,
        preguntasSinResponder,
      });

      const insertRes = db
        .prepare(
          `INSERT INTO resumenes_ia_diagnostico (
            entrevista_id, resumen_ejecutivo, fortalezas_identificadas,
            brechas_riesgos, limitaciones_informacion, preguntas_sin_responder, generado_por
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          entrevistaId,
          summary.resumen_ejecutivo,
          summary.fortalezas_identificadas,
          summary.brechas_riesgos,
          summary.limitaciones_informacion,
          preguntasSinResponder.length,
          req.user!.id
        );

      logActivity(req.user!.nombre, 'Resumen IA generado', entrevista.codigo, 'Generado resumen diagnóstico basado en respuestas registradas.');
      res.json(db.prepare('SELECT * FROM resumenes_ia_diagnostico WHERE id = ?').get(insertRes.lastInsertRowid));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al generar el resumen diagnóstico con IA.';
      res.status(500).json({ error: message });
    }
  });

  // ==========================================
  // PESTAÑAS DEL MENÚ LATERAL (SOLO ADMIN EDITA)
  // ==========================================

  app.get('/api/pestanas', (_req, res) => {
    const tabs = db.prepare('SELECT * FROM pestanas_menu ORDER BY orden ASC, id ASC').all();
    res.json(tabs);
  });

  app.post('/api/pestanas', requireAdmin, (req: AuthenticatedRequest, res) => {
    const b = req.body as {
      titulo?: string;
      icono?: string;
      tipo?: 'sistema' | 'personalizada' | 'enlace';
      vista_sistema?: string;
      contenido?: string;
      url_externa?: string;
      activo?: boolean | number;
    };

    if (!b.titulo?.trim()) {
      res.status(400).json({ error: 'El título de la pestaña es obligatorio.' });
      return;
    }

    const tipo = b.tipo || 'personalizada';
    if (!['sistema', 'personalizada', 'enlace'].includes(tipo)) {
      res.status(400).json({ error: 'Tipo de pestaña inválido.' });
      return;
    }

    if (tipo === 'sistema' && !b.vista_sistema?.trim()) {
      res.status(400).json({ error: 'Debe seleccionar una vista del sistema.' });
      return;
    }

    if (tipo === 'enlace' && !b.url_externa?.trim()) {
      res.status(400).json({ error: 'Debe ingresar la URL del enlace.' });
      return;
    }

    const slugBase = b.titulo
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'pestana';

    let clave = tipo === 'sistema' && b.vista_sistema ? b.vista_sistema.trim() : `${slugBase}-${Date.now().toString(36)}`;
    const existingClave = db.prepare('SELECT id FROM pestanas_menu WHERE clave = ?').get(clave);
    if (existingClave) {
      clave = `${slugBase}-${Date.now().toString(36)}`;
    }

    const maxOrden = (db.prepare('SELECT COALESCE(MAX(orden), 0) as m FROM pestanas_menu').get() as { m: number }).m;
    const result = db
      .prepare(
        `INSERT INTO pestanas_menu (clave, titulo, icono, tipo, vista_sistema, contenido, url_externa, orden, activo, protegida)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
      )
      .run(
        clave,
        b.titulo.trim(),
        b.icono?.trim() || 'FileText',
        tipo,
        tipo === 'sistema' ? (b.vista_sistema ?? '').trim() : '',
        tipo === 'personalizada' ? (b.contenido ?? '').trim() : '',
        tipo === 'enlace' ? (b.url_externa ?? '').trim() : '',
        maxOrden + 1,
        b.activo !== undefined ? (b.activo ? 1 : 0) : 1
      );

    logActivity(req.user!.nombre, 'Pestaña creada', 'Menú Lateral', `Implementada pestaña "${b.titulo.trim()}".`);
    res.status(201).json(db.prepare('SELECT * FROM pestanas_menu WHERE id = ?').get(result.lastInsertRowid));
  });

  app.put('/api/pestanas/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM pestanas_menu WHERE id = ?').get(id) as
      | {
          id: number;
          clave: string;
          titulo: string;
          icono: string;
          tipo: string;
          vista_sistema: string;
          contenido: string;
          url_externa: string;
          activo: number;
          protegida: number;
        }
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Pestaña no encontrada.' });
      return;
    }

    const b = req.body as {
      titulo?: string;
      icono?: string;
      tipo?: 'sistema' | 'personalizada' | 'enlace';
      vista_sistema?: string;
      contenido?: string;
      url_externa?: string;
      activo?: boolean | number;
    };

    const nextActivo = existing.protegida === 1 ? 1 : b.activo !== undefined ? (b.activo ? 1 : 0) : existing.activo;
    const nextTipo = existing.protegida === 1 ? existing.tipo : b.tipo ?? existing.tipo;
    const nextVista = existing.protegida === 1 ? existing.vista_sistema : b.vista_sistema ?? existing.vista_sistema;

    db.prepare(
      `UPDATE pestanas_menu SET
        titulo = ?, icono = ?, tipo = ?, vista_sistema = ?, contenido = ?, url_externa = ?, activo = ?
       WHERE id = ?`
    ).run(
      b.titulo?.trim() || existing.titulo,
      b.icono?.trim() || existing.icono,
      nextTipo,
      nextTipo === 'sistema' ? nextVista : '',
      nextTipo === 'personalizada' ? (b.contenido !== undefined ? b.contenido : existing.contenido) : '',
      nextTipo === 'enlace' ? (b.url_externa !== undefined ? b.url_externa.trim() : existing.url_externa) : '',
      nextActivo,
      id
    );

    logActivity(req.user!.nombre, 'Pestaña actualizada', 'Menú Lateral', `Actualizada pestaña "${b.titulo?.trim() || existing.titulo}".`);
    res.json(db.prepare('SELECT * FROM pestanas_menu WHERE id = ?').get(id));
  });

  app.patch('/api/pestanas/reordenar', requireAdmin, (req: AuthenticatedRequest, res) => {
    const { ids } = req.body as { ids?: number[] };
    if (!Array.isArray(ids)) {
      res.status(400).json({ error: 'Lista de IDs inválida.' });
      return;
    }
    const stmt = db.prepare('UPDATE pestanas_menu SET orden = ? WHERE id = ?');
    const tx = db.transaction((orderedIds: number[]) => {
      orderedIds.forEach((id, idx) => stmt.run(idx + 1, id));
    });
    tx(ids);
    logActivity(req.user!.nombre, 'Pestañas reordenadas', 'Menú Lateral', 'Actualizado el orden de las pestañas del panel izquierdo.');
    res.json({ ok: true });
  });

  app.delete('/api/pestanas/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT id, titulo, protegida FROM pestanas_menu WHERE id = ?').get(id) as
      | { id: number; titulo: string; protegida: number }
      | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Pestaña no encontrada.' });
      return;
    }
    if (existing.protegida === 1) {
      res.status(400).json({ error: 'La pestaña principal de Configuración no puede eliminarse.' });
      return;
    }

    db.prepare('DELETE FROM pestanas_menu WHERE id = ?').run(id);
    logActivity(req.user!.nombre, 'Pestaña eliminada', 'Menú Lateral', `Eliminada pestaña "${existing.titulo}".`);
    res.json({ ok: true });
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: `Ruta API no encontrada: ${req.method} ${req.originalUrl}` });
  });

  return app;
}
