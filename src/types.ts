export type RolUsuario = 'ADMINISTRADOR' | 'ENTREVISTADOR' | 'EVALUADO';

export type EstadoEntrevista = 'Borrador' | 'En progreso' | 'Completada' | 'Revisada';

export type TipoRespuesta =
  | 'respuesta_abierta'
  | 'respuesta_corta'
  | 'seleccion_unica'
  | 'seleccion_multiple'
  | 'si_no'
  | 'escala_1_5'
  | 'fecha'
  | 'numero'
  | 'porcentaje'
  | 'observaciones';

export type CondicionOperador = '' | 'equals' | 'not_equals' | 'contains';

export type CategoriaHallazgo =
  | 'Fortaleza'
  | 'Debilidad'
  | 'Problema operativo'
  | 'Riesgo logístico'
  | 'Falta de procedimiento'
  | 'Falta de indicador'
  | 'Oportunidad de mejora';

export type NivelImpacto = 'Bajo' | 'Medio' | 'Alto' | 'Crítico';
export type PrioridadHallazgo = 'Baja' | 'Media' | 'Alta' | 'Urgente';
export type EstadoSeguimiento = 'Abierto' | 'En proceso' | 'Implementado' | 'Cerrado';

export interface Usuario {
  id: number;
  nombre: string;
  username: string;
  email: string;
  rol: RolUsuario;
  activo: number;
  ultimo_acceso: string | null;
  created_at: string;
}

export interface Empresa {
  id: number;
  codigo_empresa: string;
  razon_social: string;
  nombre_comercial: string;
  nit: string;
  actividad_economica: string;
  sector_empresarial: string;
  direccion: string;
  ciudad: string;
  departamento: string;
  pais: string;
  telefono: string;
  correo_electronico: string;
  numero_empleados: number;
  nombre_representante: string;
  observaciones: string;
  activo: number;
  created_by: number | null;
  created_at: string;
  total_entrevistas?: number;
}

export interface Modulo {
  id: number;
  numero: number;
  titulo: string;
  descripcion: string;
  orden: number;
  activo: number;
  created_at?: string;
}

export interface Pregunta {
  id: number;
  modulo_id: number;
  texto: string;
  descripcion_ayuda: string;
  tipo_respuesta: TipoRespuesta;
  opciones_json: string;
  orden: number;
  obligatoria: number;
  activo: number;
  condicion_pregunta_id: number | null;
  condicion_operador: CondicionOperador;
  condicion_valor: string;
  created_at?: string;
}

export interface Respuesta {
  id?: number;
  entrevista_id: number;
  pregunta_id: number;
  modulo_id: number;
  valor_texto: string;
  observacion: string;
  updated_by?: number | null;
  updated_at?: string;
}

export interface HistorialModificacion {
  id: number;
  entrevista_id: number;
  usuario_id: number | null;
  usuario_nombre: string;
  accion: string;
  detalle: string;
  valor_anterior: string;
  valor_nuevo: string;
  created_at: string;
}

export interface Entrevista {
  id: number;
  codigo: string;
  empresa_id: number;
  empresa_nombre?: string;
  empresa_razon_social?: string;
  entrevistador_id: number;
  entrevistador_nombre?: string;
  evaluado_usuario_id: number | null;
  nombre_entrevistado: string;
  cargo_entrevistado: string;
  area_trabajo: string;
  fecha_inicio: string;
  fecha_finalizacion: string | null;
  estado: EstadoEntrevista;
  observaciones_generales: string;
  enlace_evaluado_activo: number;
  enlace_evaluado_token: string | null;
  porcentaje_avance: number;
  modulos_snapshot_json: string;
  preguntas_snapshot_json: string;
  created_at: string;
  updated_at: string;
}

export interface HallazgoDiagnostico {
  id: number;
  entrevista_id: number;
  empresa_id: number;
  categoria: CategoriaHallazgo;
  proceso_relacionado: string;
  hallazgo: string;
  evidencia: string;
  nivel_impacto: NivelImpacto;
  recomendacion: string;
  prioridad: PrioridadHallazgo;
  responsable: string;
  estado_seguimiento: EstadoSeguimiento;
  created_by: number | null;
  created_at: string;
}

export interface EvaluacionMadurez {
  id?: number;
  entrevista_id: number;
  proceso: string;
  criterios_evaluacion: string;
  evidencia_suficiente: number;
  evidencia_respaldo: string;
  nivel_madurez: number | null;
  justificacion: string;
  updated_at?: string;
}

export interface ResumenIADiagnostico {
  id: number;
  entrevista_id: number;
  resumen_ejecutivo: string;
  fortalezas_identificadas: string;
  brechas_riesgos: string;
  limitaciones_informacion: string;
  preguntas_sin_responder: number;
  created_at: string;
}

export interface ActividadReciente {
  id: number;
  usuario_nombre: string;
  accion: string;
  entidad: string;
  detalle: string;
  created_at: string;
}

export interface DashboardStats {
  kpis: {
    totalEmpresas: number;
    totalEntrevistas: number;
    entrevistasCompletadas: number;
    entrevistasPendientes: number;
    totalPreguntas: number;
    usuariosActivos: number;
  };
  entrevistasPorEmpresa: Array<{ nombre: string; total: number }>;
  entrevistasPorEstado: Array<{ estado: string; total: number }>;
  empresasEvaluadas: { evaluadas: number; sinEvaluar: number };
  distribucionPorArea: Array<{ area: string; total: number }>;
  avancePorModulo: Array<{ numero: number; titulo: string; porcentaje: number }>;
  actividadReciente: ActividadReciente[];
}

export type TipoPestana = 'sistema' | 'personalizada' | 'enlace';

export interface PestanaMenu {
  id: number;
  clave: string;
  titulo: string;
  icono: string;
  tipo: TipoPestana;
  vista_sistema: string;
  contenido: string;
  url_externa: string;
  orden: number;
  activo: number;
  protegida: number;
  created_at?: string;
}

