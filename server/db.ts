import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function resolveDataDir(): string {
  if (process.env.VERCEL === '1' || process.env.VERCEL_ENV) {
    const tmpDir = path.join('/tmp', 'sde-data');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    return tmpDir;
  }
  const localDir = path.resolve(process.cwd(), 'data');
  try {
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    fs.accessSync(localDir, fs.constants.W_OK);
    return localDir;
  } catch {
    const tmpDir = path.join('/tmp', 'sde-data');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    return tmpDir;
  }
}

const dataDir = resolveDataDir();
const dbPath = path.join(dataDir, 'diagnostico.db');
export const db = new Database(dbPath);
try {
  db.pragma('journal_mode = WAL');
} catch {
  // Fallback to default SQLite journal mode in constrained environments
}
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      rol TEXT NOT NULL CHECK(rol IN ('ADMINISTRADOR', 'ENTREVISTADOR', 'EVALUADO')),
      activo INTEGER NOT NULL DEFAULT 1,
      ultimo_acceso TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS empresas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo_empresa TEXT UNIQUE NOT NULL,
      razon_social TEXT NOT NULL,
      nombre_comercial TEXT NOT NULL,
      nit TEXT NOT NULL,
      actividad_economica TEXT NOT NULL,
      sector_empresarial TEXT NOT NULL,
      direccion TEXT NOT NULL,
      ciudad TEXT NOT NULL,
      departamento TEXT NOT NULL,
      pais TEXT NOT NULL DEFAULT 'Colombia',
      telefono TEXT NOT NULL,
      correo_electronico TEXT NOT NULL,
      numero_empleados INTEGER NOT NULL DEFAULT 0,
      nombre_representante TEXT NOT NULL,
      observaciones TEXT DEFAULT '',
      activo INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES usuarios(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS modulos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero INTEGER NOT NULL,
      titulo TEXT NOT NULL,
      descripcion TEXT DEFAULT '',
      orden INTEGER NOT NULL,
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS preguntas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      modulo_id INTEGER NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
      texto TEXT NOT NULL,
      descripcion_ayuda TEXT DEFAULT '',
      tipo_respuesta TEXT NOT NULL CHECK(tipo_respuesta IN (
        'respuesta_abierta', 'respuesta_corta', 'seleccion_unica',
        'seleccion_multiple', 'si_no', 'escala_1_5', 'fecha',
        'numero', 'porcentaje', 'observaciones'
      )),
      opciones_json TEXT DEFAULT '[]',
      orden INTEGER NOT NULL,
      obligatoria INTEGER NOT NULL DEFAULT 1,
      activo INTEGER NOT NULL DEFAULT 1,
      condicion_pregunta_id INTEGER REFERENCES preguntas(id) ON DELETE SET NULL,
      condicion_operador TEXT DEFAULT '',
      condicion_valor TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS entrevistas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id),
      entrevistador_id INTEGER NOT NULL REFERENCES usuarios(id),
      evaluado_usuario_id INTEGER REFERENCES usuarios(id),
      nombre_entrevistado TEXT NOT NULL,
      cargo_entrevistado TEXT NOT NULL,
      area_trabajo TEXT NOT NULL,
      fecha_inicio TEXT NOT NULL,
      fecha_finalizacion TEXT,
      estado TEXT NOT NULL DEFAULT 'Borrador' CHECK(estado IN ('Borrador', 'En progreso', 'Completada', 'Revisada')),
      observaciones_generales TEXT DEFAULT '',
      enlace_evaluado_activo INTEGER NOT NULL DEFAULT 0,
      enlace_evaluado_token TEXT UNIQUE,
      porcentaje_avance INTEGER NOT NULL DEFAULT 0,
      modulos_snapshot_json TEXT NOT NULL,
      preguntas_snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS respuestas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entrevista_id INTEGER NOT NULL REFERENCES entrevistas(id) ON DELETE CASCADE,
      pregunta_id INTEGER NOT NULL,
      modulo_id INTEGER NOT NULL,
      valor_texto TEXT DEFAULT '',
      observacion TEXT DEFAULT '',
      updated_by INTEGER REFERENCES usuarios(id),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entrevista_id, pregunta_id)
    );

    CREATE TABLE IF NOT EXISTS historial_modificaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entrevista_id INTEGER NOT NULL REFERENCES entrevistas(id) ON DELETE CASCADE,
      usuario_id INTEGER REFERENCES usuarios(id),
      usuario_nombre TEXT NOT NULL,
      accion TEXT NOT NULL,
      detalle TEXT NOT NULL,
      valor_anterior TEXT DEFAULT '',
      valor_nuevo TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS hallazgos_diagnostico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entrevista_id INTEGER NOT NULL REFERENCES entrevistas(id) ON DELETE CASCADE,
      empresa_id INTEGER NOT NULL REFERENCES empresas(id),
      categoria TEXT NOT NULL CHECK(categoria IN (
        'Fortaleza', 'Debilidad', 'Problema operativo', 'Riesgo logístico',
        'Falta de procedimiento', 'Falta de indicador', 'Oportunidad de mejora'
      )),
      proceso_relacionado TEXT NOT NULL,
      hallazgo TEXT NOT NULL,
      evidencia TEXT NOT NULL,
      nivel_impacto TEXT NOT NULL CHECK(nivel_impacto IN ('Bajo', 'Medio', 'Alto', 'Crítico')),
      recomendacion TEXT NOT NULL,
      prioridad TEXT NOT NULL CHECK(prioridad IN ('Baja', 'Media', 'Alta', 'Urgente')),
      responsable TEXT NOT NULL,
      estado_seguimiento TEXT NOT NULL DEFAULT 'Abierto' CHECK(estado_seguimiento IN ('Abierto', 'En proceso', 'Implementado', 'Cerrado')),
      created_by INTEGER REFERENCES usuarios(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS evaluaciones_madurez (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entrevista_id INTEGER NOT NULL REFERENCES entrevistas(id) ON DELETE CASCADE,
      proceso TEXT NOT NULL,
      criterios_evaluacion TEXT NOT NULL,
      evidencia_suficiente INTEGER NOT NULL DEFAULT 0,
      evidencia_respaldo TEXT DEFAULT '',
      nivel_madurez INTEGER CHECK((nivel_madurez BETWEEN 1 AND 5) OR nivel_madurez IS NULL),
      justificacion TEXT DEFAULT '',
      updated_by INTEGER REFERENCES usuarios(id),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entrevista_id, proceso)
    );

    CREATE TABLE IF NOT EXISTS resumenes_ia_diagnostico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entrevista_id INTEGER NOT NULL REFERENCES entrevistas(id) ON DELETE CASCADE,
      resumen_ejecutivo TEXT NOT NULL,
      fortalezas_identificadas TEXT NOT NULL,
      brechas_riesgos TEXT NOT NULL,
      limitaciones_informacion TEXT NOT NULL,
      preguntas_sin_responder INTEGER NOT NULL DEFAULT 0,
      generado_por INTEGER REFERENCES usuarios(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS actividad_reciente (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_nombre TEXT NOT NULL,
      accion TEXT NOT NULL,
      entidad TEXT NOT NULL,
      detalle TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pestanas_menu (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clave TEXT UNIQUE NOT NULL,
      titulo TEXT NOT NULL,
      icono TEXT NOT NULL DEFAULT 'FileText',
      tipo TEXT NOT NULL DEFAULT 'personalizada' CHECK(tipo IN ('sistema', 'personalizada', 'enlace')),
      vista_sistema TEXT DEFAULT '',
      contenido TEXT DEFAULT '',
      url_externa TEXT DEFAULT '',
      orden INTEGER NOT NULL DEFAULT 1,
      activo INTEGER NOT NULL DEFAULT 1,
      protegida INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  seedDefaultSidebarTabs();
  seedInitialData();
}

function seedDefaultSidebarTabs() {
  const count = (db.prepare('SELECT COUNT(*) as c FROM pestanas_menu').get() as { c: number }).c;
  if (count > 0) {
    db.prepare(
      `UPDATE pestanas_menu SET titulo = 'Configuración', icono = 'Settings' WHERE clave = 'admin' AND titulo = 'Administración'`
    ).run();
    return;
  }

  const insertTab = db.prepare(`
    INSERT INTO pestanas_menu (clave, titulo, icono, tipo, vista_sistema, contenido, url_externa, orden, activo, protegida)
    VALUES (?, ?, ?, 'sistema', ?, '', '', ?, 1, ?)
  `);

  insertTab.run('empresas', 'Empresas', 'Building2', 'empresas', 1, 0);
  insertTab.run('entrevistas', 'Entrevistas', 'ClipboardList', 'entrevistas', 2, 0);
  insertTab.run('resultados', 'Resultados', 'FileCheck2', 'resultados', 3, 0);
  insertTab.run('admin', 'Configuración', 'Settings', 'admin', 4, 1);
}

function seedInitialData() {
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM usuarios').get() as { count: number }).count;
  if (userCount > 0) return;

  const insertUser = db.prepare(`
    INSERT INTO usuarios (nombre, username, email, password_hash, rol, activo)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  const adminHash = bcrypt.hashSync('Admin2026*', 10);
  const entHash = bcrypt.hashSync('Entrevistador2026*', 10);
  const evalHash = bcrypt.hashSync('Evaluado2026*', 10);

  const adminId = Number(insertUser.run('Carlos Mendoza', 'admin', 'admin@diagnostico.com', adminHash, 'ADMINISTRADOR').lastInsertRowid);
  const entId = Number(insertUser.run('Laura Gómez', 'entrevistador', 'laura.gomez@diagnostico.com', entHash, 'ENTREVISTADOR').lastInsertRowid);
  const evalId = Number(insertUser.run('Andrés Rojas', 'evaluado', 'andres.rojas@logisticaandina.co', evalHash, 'EVALUADO').lastInsertRowid);

  // Seed initial 10 modules and 65 exact questions
  interface SeedQuestion {
    texto: string;
    tipo: string;
    ayuda?: string;
    opciones?: string[];
    obligatoria?: number;
    condicionParentIndex?: number;
    condicionOp?: string;
    condicionVal?: string;
  }

  interface SeedModule {
    numero: number;
    titulo: string;
    descripcion: string;
    preguntas: SeedQuestion[];
  }

  const modulesData: SeedModule[] = [
    {
      numero: 1,
      titulo: 'Información General',
      descripcion: 'Caracterización básica de la organización, actividad económica, clientes y cobertura.',
      preguntas: [
        { texto: '¿Cuál es la actividad económica principal de la empresa?', tipo: 'respuesta_abierta', ayuda: 'Describa el objeto social principal y líneas de negocio.' },
        { texto: '¿Cuántos empleados tiene actualmente?', tipo: 'numero', ayuda: 'Incluya personal operativo, administrativo y logístico.' },
        { texto: '¿Cuáles son sus principales productos o servicios?', tipo: 'respuesta_abierta' },
        { texto: '¿Cuáles son sus principales clientes?', tipo: 'respuesta_abierta', ayuda: 'Indique segmentos B2B, B2C, retail o institucionales.' },
        {
          texto: '¿Cuál es su cobertura geográfica?',
          tipo: 'seleccion_unica',
          opciones: ['Local / Municipal', 'Regional / Departamental', 'Nacional', 'Internacional'],
        },
      ],
    },
    {
      numero: 2,
      titulo: 'Organización Empresarial',
      descripcion: 'Estructura organizacional, áreas funcionales, responsabilidades y comunicación interna.',
      preguntas: [
        { texto: '¿Cómo está estructurada la organización?', tipo: 'respuesta_abierta' },
        {
          texto: '¿Qué áreas componen la empresa?',
          tipo: 'seleccion_multiple',
          opciones: [
            'Dirección General',
            'Compras y Abastecimiento',
            'Producción / Operaciones',
            'Almacén e Inventarios',
            'Transporte y Distribución',
            'Comercial y Ventas',
            'Finanzas y Contabilidad',
            'Talento Humano',
            'Tecnología / TI',
            'Calidad',
          ],
        },
        { texto: '¿Cuáles son las responsabilidades de cada área?', tipo: 'respuesta_abierta' },
        { texto: '¿Existe un organigrama?', tipo: 'si_no' },
        { texto: '¿Cómo se comunican las diferentes áreas?', tipo: 'respuesta_abierta', ayuda: 'Canales formales, reuniones operativas, sistemas internos.' },
      ],
    },
    {
      numero: 3,
      titulo: 'Compras y Abastecimiento',
      descripcion: 'Gestión de requerimientos, selección y evaluación de proveedores y recepción de materiales.',
      preguntas: [
        { texto: '¿Cómo se identifican las necesidades de compra?', tipo: 'respuesta_abierta' },
        { texto: '¿Cómo se seleccionan los proveedores?', tipo: 'respuesta_abierta' },
        { texto: '¿Existe un proceso de evaluación de proveedores?', tipo: 'si_no' },
        { texto: '¿Cómo se generan las órdenes de compra?', tipo: 'respuesta_abierta' },
        {
          texto: '¿Qué criterios se utilizan para negociar con proveedores?',
          tipo: 'seleccion_multiple',
          opciones: [
            'Precio',
            'Plazo de pago',
            'Tiempo de entrega',
            'Calidad certificada',
            'Capacidad de respuesta',
            'Descuentos por volumen',
            'Garantía y postventa',
          ],
        },
        { texto: '¿Cómo se realiza la recepción de materiales?', tipo: 'respuesta_abierta' },
        { texto: '¿Qué problemas se presentan durante el abastecimiento?', tipo: 'observaciones', obligatoria: 0 },
      ],
    },
    {
      numero: 4,
      titulo: 'Gestión de Inventarios',
      descripcion: 'Control de entradas y salidas, valoración, conteos cíclicos y stock de seguridad.',
      preguntas: [
        { texto: '¿La empresa maneja inventarios?', tipo: 'si_no', ayuda: 'Si selecciona No, las preguntas técnicas de inventario se omitirán.' },
        { texto: '¿Cómo se controlan las entradas y salidas?', tipo: 'respuesta_abierta', condicionParentIndex: 0, condicionOp: 'equals', condicionVal: 'Sí' },
        {
          texto: '¿Qué método de valoración de inventarios utilizan?',
          tipo: 'seleccion_unica',
          opciones: ['PEPS (FIFO)', 'UEPS (LIFO)', 'Promedio Ponderado', 'Identificación Específica', 'No definido'],
          condicionParentIndex: 0,
          condicionOp: 'equals',
          condicionVal: 'Sí',
        },
        { texto: '¿Se realizan inventarios físicos periódicamente?', tipo: 'si_no', condicionParentIndex: 0, condicionOp: 'equals', condicionVal: 'Sí' },
        { texto: '¿Cómo se controlan los productos vencidos o deteriorados?', tipo: 'respuesta_abierta', condicionParentIndex: 0, condicionOp: 'equals', condicionVal: 'Sí' },
        { texto: '¿Cómo se determina el nivel de inventario de seguridad?', tipo: 'respuesta_abierta', condicionParentIndex: 0, condicionOp: 'equals', condicionVal: 'Sí' },
        { texto: '¿Qué software utilizan para controlar inventarios?', tipo: 'respuesta_corta', condicionParentIndex: 0, condicionOp: 'equals', condicionVal: 'Sí' },
      ],
    },
    {
      numero: 5,
      titulo: 'Almacenamiento',
      descripcion: 'Infraestructura física, distribución de bodega, ubicación, equipos y conservación.',
      preguntas: [
        { texto: '¿La empresa cuenta con instalaciones propias para almacenar productos?', tipo: 'si_no' },
        { texto: '¿Cómo se encuentran distribuidos los espacios?', tipo: 'respuesta_abierta' },
        { texto: '¿Cómo se identifican y ubican los productos?', tipo: 'respuesta_abierta' },
        { texto: '¿Existe un procedimiento de recepción y almacenamiento?', tipo: 'si_no' },
        {
          texto: '¿Qué equipos se utilizan para manipular mercancías?',
          tipo: 'seleccion_multiple',
          opciones: [
            'Montacargas',
            'Estibadores manuales / transpaletas',
            'Estanterías selectivas',
            'Bandas transportadoras',
            'Lectores de código de barras / RFID',
            'Manipulación manual',
          ],
        },
        { texto: '¿Cómo se garantiza la conservación de los productos?', tipo: 'respuesta_abierta' },
        { texto: '¿Qué dificultades existen en el almacenamiento?', tipo: 'observaciones', obligatoria: 0 },
      ],
    },
    {
      numero: 6,
      titulo: 'Transporte y Distribución',
      descripcion: 'Flota, tercerización, ruteo, control de tiempos, rastreo y logística inversa.',
      preguntas: [
        { texto: '¿Cómo se realiza el transporte de los productos?', tipo: 'respuesta_abierta' },
        {
          texto: '¿La empresa cuenta con vehículos propios o terceriza el transporte?',
          tipo: 'seleccion_unica',
          opciones: ['Flota propia', 'Transporte tercerizado', 'Esquema mixto (propio y tercerizado)', 'No realiza transporte directo'],
        },
        { texto: '¿Cómo se planifican las rutas?', tipo: 'respuesta_abierta' },
        { texto: '¿Cómo se controlan los tiempos de entrega?', tipo: 'respuesta_abierta' },
        { texto: '¿Existe seguimiento de los vehículos?', tipo: 'si_no' },
        { texto: '¿Cómo se gestionan las devoluciones?', tipo: 'respuesta_abierta' },
        { texto: '¿Qué problemas se presentan durante la distribución?', tipo: 'observaciones', obligatoria: 0 },
      ],
    },
    {
      numero: 7,
      titulo: 'Gestión de Pedidos',
      descripcion: 'Recepción, autorización, alistamiento, verificación, atrasos y cumplimiento.',
      preguntas: [
        {
          texto: '¿Cómo reciben los pedidos de los clientes?',
          tipo: 'seleccion_multiple',
          opciones: [
            'Correo electrónico',
            'Teléfono / WhatsApp',
            'Portal web / E-commerce',
            'Fuerza de ventas en campo',
            'EDI / Integración ERP',
            'Presencial en punto de venta',
          ],
        },
        { texto: '¿Qué proceso se sigue desde la recepción hasta la entrega?', tipo: 'respuesta_abierta' },
        { texto: '¿Quién autoriza los pedidos?', tipo: 'respuesta_corta' },
        { texto: '¿Cómo se prepara la mercancía?', tipo: 'respuesta_abierta' },
        { texto: '¿Cómo se verifica que los pedidos estén completos?', tipo: 'respuesta_abierta' },
        { texto: '¿Cómo se gestionan los pedidos retrasados?', tipo: 'respuesta_abierta' },
        { texto: '¿Qué porcentaje de pedidos se entrega a tiempo?', tipo: 'porcentaje', ayuda: 'Ingrese valor aproximado de 0 a 100.' },
      ],
    },
    {
      numero: 8,
      titulo: 'Tecnología y Sistemas de Información',
      descripcion: 'Software empresarial, nivel de automatización, integración entre áreas y necesidades TIC.',
      preguntas: [
        { texto: '¿Qué sistemas informáticos utiliza la empresa?', tipo: 'respuesta_abierta' },
        {
          texto: '¿Utilizan ERP, WMS, TMS u otros sistemas?',
          tipo: 'seleccion_multiple',
          opciones: [
            'ERP',
            'WMS (Gestión de Almacenes)',
            'TMS (Gestión de Transporte)',
            'CRM',
            'Hojas de cálculo (Excel / Sheets)',
            'Sistema desarrollado a la medida',
            'Ninguno',
          ],
        },
        { texto: '¿Los procesos se encuentran automatizados?', tipo: 'escala_1_5', ayuda: '1 = Totalmente manual, 5 = Completamente automatizado e integrado.' },
        { texto: '¿Cómo se comparte la información entre departamentos?', tipo: 'respuesta_abierta' },
        { texto: '¿Qué procesos todavía se realizan manualmente?', tipo: 'respuesta_abierta' },
        { texto: '¿Qué herramientas tecnológicas necesitan implementar?', tipo: 'observaciones', obligatoria: 0 },
      ],
    },
    {
      numero: 9,
      titulo: 'Indicadores de Gestión',
      descripcion: 'Medición de desempeño operativo, entregas, costos logísticos, rotación y seguimiento.',
      preguntas: [
        { texto: '¿Qué indicadores utiliza la empresa para medir su desempeño?', tipo: 'respuesta_abierta' },
        { texto: '¿Cómo mide el cumplimiento de las entregas?', tipo: 'respuesta_abierta' },
        { texto: '¿Cómo controla sus costos logísticos?', tipo: 'respuesta_abierta' },
        { texto: '¿Cómo mide la rotación de inventarios?', tipo: 'respuesta_abierta' },
        { texto: '¿Cómo mide la productividad?', tipo: 'respuesta_abierta' },
        { texto: '¿Se realizan reuniones de seguimiento?', tipo: 'si_no' },
        {
          texto: '¿Con qué frecuencia se revisan los resultados?',
          tipo: 'seleccion_unica',
          opciones: ['Diaria', 'Semanal', 'Quincenal', 'Mensual', 'Trimestral', 'No se revisan periódicamente'],
        },
      ],
    },
    {
      numero: 10,
      titulo: 'Problemas y Oportunidades de Mejora',
      descripcion: 'Cuellos de botella, sobrecostos, restricciones de recursos y prioridades estratégicas.',
      preguntas: [
        { texto: '¿Cuáles son los principales problemas logísticos?', tipo: 'respuesta_abierta' },
        { texto: '¿Qué procesos presentan mayores retrasos?', tipo: 'respuesta_abierta' },
        { texto: '¿Dónde se generan mayores costos?', tipo: 'respuesta_abierta' },
        { texto: '¿Qué actividades podrían optimizarse?', tipo: 'respuesta_abierta' },
        { texto: '¿Qué recursos hacen falta?', tipo: 'respuesta_abierta' },
        { texto: '¿Qué cambios considera prioritarios?', tipo: 'respuesta_abierta' },
        { texto: '¿Qué oportunidades de mejora identifica?', tipo: 'observaciones', obligatoria: 0 },
      ],
    },
  ];

  const insertModulo = db.prepare(`
    INSERT INTO modulos (numero, titulo, descripcion, orden, activo)
    VALUES (?, ?, ?, ?, 1)
  `);
  const insertPregunta = db.prepare(`
    INSERT INTO preguntas (
      modulo_id, texto, descripcion_ayuda, tipo_respuesta, opciones_json,
      orden, obligatoria, activo, condicion_pregunta_id, condicion_operador, condicion_valor
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `);

  for (const mod of modulesData) {
    const moduloId = Number(insertModulo.run(mod.numero, mod.titulo, mod.descripcion, mod.numero).lastInsertRowid);
    const createdQuestionIds: number[] = [];
    mod.preguntas.forEach((p, idx) => {
      const parentId = p.condicionParentIndex !== undefined ? createdQuestionIds[p.condicionParentIndex] : null;
      const qId = Number(
        insertPregunta.run(
          moduloId,
          p.texto,
          p.ayuda ?? '',
          p.tipo,
          JSON.stringify(p.opciones ?? []),
          idx + 1,
          p.obligatoria ?? 1,
          parentId,
          p.condicionOp ?? '',
          p.condicionVal ?? ''
        ).lastInsertRowid
      );
      createdQuestionIds.push(qId);
    });
  }

  // Seed 2 realistic companies
  const insertEmpresa = db.prepare(`
    INSERT INTO empresas (
      codigo_empresa, razon_social, nombre_comercial, nit, actividad_economica,
      sector_empresarial, direccion, ciudad, departamento, pais, telefono,
      correo_electronico, numero_empleados, nombre_representante, observaciones, activo, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);

  const emp1Id = Number(
    insertEmpresa.run(
      'EMP-001',
      'Comercializadora Logística Andina S.A.S.',
      'Logística Andina',
      '900.412.885-3',
      'Distribución mayorista de insumos industriales y ferretería',
      'Comercio y Distribución',
      'Calle 17 # 68B-45 Zona Industrial',
      'Bogotá D.C.',
      'Cundinamarca',
      'Colombia',
      '+57 601 482 9100',
      'contacto@logisticaandina.co',
      84,
      'Andrés Rojas Velásquez',
      'Opera centro de distribución principal en Bogotá con despachos regionales.',
      adminId
    ).lastInsertRowid
  );

  const emp2Id = Number(
    insertEmpresa.run(
      'EMP-002',
      'Alimentos del Valle & Pacífico Ltda.',
      'Alimentos del Pacífico',
      '805.029.314-7',
      'Procesamiento y comercialización de alimentos empacados',
      'Manufactura y Alimentos',
      'Km 4 Vía Cali - Yumbo Bodega 12',
      'Yumbo',
      'Valle del Cauca',
      'Colombia',
      '+57 602 664 3210',
      'operaciones@alimentospacifico.co',
      142,
      'María Fernanda Castro',
      'Requiere cadena de frío parcial y control estricto de vencimientos.',
      entId
    ).lastInsertRowid
  );

  // Snapshot active modules & questions for initial seeded interviews
  const modulosSnapshot = db.prepare('SELECT * FROM modulos WHERE activo = 1 ORDER BY orden ASC').all();
  const preguntasSnapshot = db.prepare('SELECT * FROM preguntas WHERE activo = 1 ORDER BY modulo_id ASC, orden ASC').all() as Array<{
    id: number;
    modulo_id: number;
    texto: string;
    tipo_respuesta: string;
  }>;

  const insertEntrevista = db.prepare(`
    INSERT INTO entrevistas (
      codigo, empresa_id, entrevistador_id, evaluado_usuario_id,
      nombre_entrevistado, cargo_entrevistado, area_trabajo,
      fecha_inicio, fecha_finalizacion, estado, observaciones_generales,
      enlace_evaluado_activo, enlace_evaluado_token, porcentaje_avance,
      modulos_snapshot_json, preguntas_snapshot_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const token1 = crypto.randomBytes(16).toString('hex');
  const token2 = crypto.randomBytes(16).toString('hex');

  const ent1Id = Number(
    insertEntrevista.run(
      'ENT-2026-0001',
      emp1Id,
      entId,
      evalId,
      'Andrés Rojas Velásquez',
      'Jefe de Operaciones y Logística',
      'Logística y Cadena de Suministro',
      '2026-11-10',
      '2026-11-12',
      'Completada',
      'Entrevista presencial de diagnóstico integral en centro de distribución.',
      1,
      token1,
      100,
      JSON.stringify(modulosSnapshot),
      JSON.stringify(preguntasSnapshot)
    ).lastInsertRowid
  );

  const ent2Id = Number(
    insertEntrevista.run(
      'ENT-2026-0002',
      emp2Id,
      entId,
      null,
      'Jorge Iván Salgado',
      'Coordinador de Almacén',
      'Almacén e Inventarios',
      '2026-11-14',
      null,
      'En progreso',
      'Pendiente completar módulos de transporte, tecnología e indicadores.',
      1,
      token2,
      32,
      JSON.stringify(modulosSnapshot),
      JSON.stringify(preguntasSnapshot)
    ).lastInsertRowid
  );

  // Seed realistic answers for Interview 1 (all 65 questions)
  const sampleAnswersMap: Record<number, string> = {
    1: 'Distribución mayorista de insumos industriales, herramientas eléctricas y elementos de seguridad industrial.',
    2: '84',
    3: 'Tornillería especializada, equipos de protección personal (EPP), herramientas industriales y abrasivos.',
    4: 'Empresas constructoras, talleres metalmecánicos y ferreterías medianas en el centro del país.',
    5: 'Regional / Departamental',
    6: 'Estructura funcional jerárquica encabezada por Gerencia General, con cuatro direcciones operativas.',
    7: JSON.stringify(['Dirección General', 'Compras y Abastecimiento', 'Almacén e Inventarios', 'Transporte y Distribución', 'Comercial y Ventas', 'Finanzas y Contabilidad']),
    8: 'Compras negocia con fabricantes; Almacén custodia y alista pedidos; Transporte programa despachos; Comercial gestiona cartera y ventas.',
    9: 'Sí',
    10: 'Reunión semanal de comité operativo y comunicación diaria vía correo y grupos de mensajería.',
    11: 'Mediante alertas de punto de reorden en hojas de cálculo y solicitudes directas del área comercial.',
    12: 'Comparación de tres cotizaciones considerando precio y tiempo de entrega.',
    13: 'No',
    14: 'Se generan manualmente en formato PDF desde el módulo administrativo tras aprobación de gerencia.',
    15: JSON.stringify(['Precio', 'Plazo de pago', 'Tiempo de entrega']),
    16: 'Se verifica cantidad física contra remisión del proveedor en muelle de descarga sin lector de códigos.',
    17: 'Retrasos frecuentes en entregas de proveedores importados y diferencias ocasionales en cantidades facturadas.',
    18: 'Sí',
    19: 'Registro manual en planillas diarias que luego se digitan al sistema contable al cierre del día.',
    20: 'Promedio Ponderado',
    21: 'Sí',
    22: 'Se separan en una estantería de cuarentena y se da de baja semestralmente.',
    23: 'Se estima empíricamente según criterio del jefe de bodega (aproximadamente 15 días de venta).',
    24: 'Software contable local + Excel',
    25: 'Sí',
    26: 'Bodega de 1.800 m2 dividida en zona de recepción, estantería pesada, picking de baja rotación y despacho.',
    27: 'Por código alfanumérico de pasillo y nivel, aunque algunas referencias de alta rotación se ubican en piso.',
    28: 'No',
    29: JSON.stringify(['Montacargas', 'Estibadores manuales / transpaletas', 'Estanterías selectivas', 'Manipulación manual']),
    30: 'Control visual de humedad, limpieza semanal y empaque en estibas plásticas.',
    31: 'Congestión en pasillos principales durante horas pico de alistamiento y falta de señalización en zona de devoluciones.',
    32: 'Despachos diarios en rutas urbanas y entregas dos veces por semana a municipios cercanos.',
    33: 'Esquema mixto (propio y tercerizado)',
    34: 'El coordinador de transporte agrupa facturas por zona geográfica la tarde anterior al despacho.',
    35: 'Mediante llamadas telefónicas a conductores y firma física de remisión al entregar.',
    36: 'No',
    37: 'El conductor recibe la mercancía devuelta y la entrega al auxiliar de bodega al finalizar la ruta.',
    38: 'Tiempos muertos en cargue matutino y falta de trazabilidad en tiempo real sobre novedades en ruta.',
    39: JSON.stringify(['Correo electrónico', 'Teléfono / WhatsApp', 'Fuerza de ventas en campo']),
    40: 'Recepción por asesor -> validación de cartera -> impresión de orden -> alistamiento en bodega -> facturación -> despacho.',
    41: 'Coordinador Comercial y Cartera',
    42: 'Alistamiento manual con lista impresa en papel por orden de llegada.',
    43: 'Doble conteo visual en zona de empaque antes de sellar cajas.',
    44: 'Se reprograman para el primer turno del día siguiente y se notifica por teléfono al cliente.',
    45: '82',
    46: 'Sistema contable administrativo local, hojas de cálculo en Excel y correo corporativo.',
    47: JSON.stringify(['Hojas de cálculo (Excel / Sheets)', 'Sistema desarrollado a la medida']),
    48: '2',
    49: 'Mediante archivos compartidos en red local y envío de reportes diarios por correo.',
    50: 'Picking, control de ubicaciones, programación de rutas, conciliación de inventario y seguimiento de entregas.',
    51: 'Sistema WMS básico con lectores de código de barras, módulo de rutas y tablero de indicadores en tiempo real.',
    52: 'Nivel de cumplimiento de ventas mensuales y valor total de inventario al cierre.',
    53: 'No se calcula formalmente el OTIF; se revisan quejas de clientes por retraso.',
    54: 'Por factura global de fletes y combustible al cierre contable mensual, sin costo por ruta o pedido.',
    55: 'Cálculo trimestral manual en hoja de cálculo.',
    56: 'Cantidad de pedidos despachados por día por equipo de bodega.',
    57: 'Sí',
    58: 'Mensual',
    59: 'Desfase entre inventario físico y sistema, demoras en alistamiento de pedidos complejos y falta de visibilidad de entregas.',
    60: 'Alistamiento de pedidos fraccionados y actualización de entradas al sistema.',
    61: 'Horas extras en bodega, reprocesos por errores de despacho y fletes subutilizados.',
    62: 'Digitalización de recepción y picking, estandarización de rutas y formalización de indicadores logísticos.',
    63: 'Lectores de código de barras, capacitación en gestión de inventarios y software de trazabilidad.',
    64: 'Implementar conteos cíclicos y procedimiento documentado de recepción y almacenamiento.',
    65: 'Reducir tiempos de despacho en 30% y aumentar la confiabilidad del inventario por encima del 97%.',
  };

  const insertRespuesta = db.prepare(`
    INSERT INTO respuestas (entrevista_id, pregunta_id, modulo_id, valor_texto, observacion, updated_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const q of preguntasSnapshot) {
    const val = sampleAnswersMap[q.id] ?? '';
    if (val) {
      insertRespuesta.run(ent1Id, q.id, q.modulo_id, val, '', entId);
    }
  }

  // Partial answers for Interview 2 (Modules 1-3)
  for (const q of preguntasSnapshot.slice(0, 17)) {
    let val = '';
    if (q.tipo_respuesta === 'si_no') val = 'Sí';
    else if (q.tipo_respuesta === 'numero') val = '142';
    else if (q.tipo_respuesta === 'seleccion_unica') val = 'Nacional';
    else if (q.tipo_respuesta === 'seleccion_multiple') val = JSON.stringify(['Dirección General', 'Producción / Operaciones', 'Almacén e Inventarios', 'Calidad']);
    else val = `Registro preliminar levantado en sitio para: ${q.texto}`;
    insertRespuesta.run(ent2Id, q.id, q.modulo_id, val, '', entId);
  }

  // Seed sample findings grounded strictly in Interview 1 answers
  const insertHallazgo = db.prepare(`
    INSERT INTO hallazgos_diagnostico (
      entrevista_id, empresa_id, categoria, proceso_relacionado, hallazgo, evidencia,
      nivel_impacto, recomendacion, prioridad, responsable, estado_seguimiento, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertHallazgo.run(
    ent1Id,
    emp1Id,
    'Falta de procedimiento',
    'Almacenamiento',
    'Ausencia de procedimiento formal documentado para recepción y almacenamiento de mercancías.',
    'Respuesta M5.P4: "No" existe procedimiento de recepción y almacenamiento; M3.P6 indica verificación manual sin código de barras.',
    'Alto',
    'Documentar e implementar un POES de recepción, verificación y ubicación en bodega con lista de chequeo.',
    'Alta',
    'Jefe de Operaciones y Logística',
    'En proceso',
    adminId
  );

  insertHallazgo.run(
    ent1Id,
    emp1Id,
    'Falta de indicador',
    'Indicadores de Gestión',
    'No se mide formalmente el cumplimiento de entregas (OTIF) ni el costo logístico unitario por ruta o pedido.',
    'Respuestas M9.P2 ("No se calcula formalmente el OTIF") y M9.P3 ("Por factura global al cierre mensual, sin costo por ruta").',
    'Medio',
    'Definir ficha técnica de indicadores OTIF, exactitud de inventario (ERI) y costo logístico sobre ventas.',
    'Alta',
    'Analista de Operaciones',
    'Abierto',
    adminId
  );

  insertHallazgo.run(
    ent1Id,
    emp1Id,
    'Fortaleza',
    'Gestión de Inventarios',
    'Realización periódica de inventarios físicos y separación de productos deteriorados en cuarentena.',
    'Respuestas M4.P4 ("Sí" realizan inventarios físicos periódicos) y M4.P5 ("Se separan en estantería de cuarentena").',
    'Medio',
    'Complementar el conteo físico general con conteos cíclicos semanales para referencias tipo A.',
    'Media',
    'Coordinador de Bodega',
    'Implementado',
    adminId
  );

  // Seed process maturity evaluations (only those with explicit criteria and evidence!)
  const insertMadurez = db.prepare(`
    INSERT INTO evaluaciones_madurez (
      entrevista_id, proceso, criterios_evaluacion, evidencia_suficiente,
      evidencia_respaldo, nivel_madurez, justificacion, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertMadurez.run(
    ent1Id,
    'Compras y Abastecimiento',
    'Existencia de selección por cotizaciones, evaluación formal de proveedores y trazabilidad de órdenes de compra.',
    1,
    'M3.P2 (3 cotizaciones), M3.P3 (No existe evaluación formal de proveedores), M3.P4 (órdenes manuales en PDF).',
    2,
    'Nivel 2 (Básico): Cuenta con criterios de cotización y órdenes de compra, pero carece de evaluación formal de proveedores y automatización.',
    adminId
  );

  insertMadurez.run(
    ent1Id,
    'Gestión de Inventarios',
    'Control de entradas/salidas, método de valoración definido, inventarios físicos, stock de seguridad y soporte tecnológico.',
    1,
    'M4.P2 (registro manual en planillas), M4.P3 (Promedio Ponderado), M4.P4 (inventarios físicos sí), M4.P6 (stock empírico).',
    2,
    'Nivel 2 (Básico): Método de valoración definido y conteos periódicos activos, pero alta dependencia de registro manual y cálculo empírico de stock.',
    adminId
  );

  insertMadurez.run(
    ent1Id,
    'Almacenamiento',
    'Infraestructura, zonificación, codificación de ubicaciones, procedimientos documentados y equipos de manipulación.',
    1,
    'M5.P1 (bodega propia 1.800 m2), M5.P3 (código pasillo/nivel), M5.P4 (sin procedimiento formal), M5.P5 (montacargas y estanterías).',
    2,
    'Nivel 2 (Básico): Infraestructura y equipos adecuados, pero sin procedimiento formal de recepción/almacenamiento y con congestión en horas pico.',
    adminId
  );

  // Seed history & recent activity
  db.prepare(`
    INSERT INTO historial_modificaciones (entrevista_id, usuario_id, usuario_nombre, accion, detalle, valor_anterior, valor_nuevo)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(ent1Id, entId, 'Laura Gómez', 'Finalización de entrevista', 'Entrevista completada al 100% y enviada a revisión.', 'En progreso', 'Completada');

  const insertAct = db.prepare(`
    INSERT INTO actividad_reciente (usuario_nombre, accion, entidad, detalle)
    VALUES (?, ?, ?, ?)
  `);
  insertAct.run('Carlos Mendoza', 'Registro inicial', 'Empresas', 'Empresa Logística Andina registrada en el sistema.');
  insertAct.run('Laura Gómez', 'Entrevista completada', 'ENT-2026-0001', 'Levantamiento integral completado para Logística Andina (100%).');
  insertAct.run('Laura Gómez', 'Entrevista iniciada', 'ENT-2026-0002', 'Entrevista en progreso para Alimentos del Pacífico (32%).');
  insertAct.run('Carlos Mendoza', 'Hallazgo registrado', 'Diagnóstico', 'Documentados 3 hallazgos iniciales con evidencia para ENT-2026-0001.');
}
