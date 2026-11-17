import type { Pregunta } from '../types';

const TOKEN_STORAGE_KEY = 'sde_auth_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });
  const rawText = await res.text();
  let data: Record<string, unknown> = {};
  if (rawText) {
    try {
      data = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }
  if (!res.ok) {
    const fallback =
      res.status === 404
        ? `Ruta no encontrada (404) en ${url}. Verifique que la API esté activa en el servidor.`
        : `Error ${res.status} en la solicitud.`;
    const errMsg = typeof data.error === 'string' && data.error ? data.error : fallback;
    const err = new Error(errMsg) as Error & {
      faltantes?: Array<{ id: number; modulo_id: number; texto: string }>;
    };
    if (Array.isArray(data.faltantes)) {
      err.faltantes = data.faltantes as Array<{ id: number; modulo_id: number; texto: string }>;
    }
    throw err;
  }
  return data as T;
}

export function isQuestionVisibleClient(pregunta: Pregunta, answerMap: Map<number, string>): boolean {
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
    // keep raw
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

export function isAnsweredClient(val: string | undefined): boolean {
  if (!val) return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  if (trimmed === '[]') return false;
  return true;
}

export function formatAnswerDisplay(val: string | undefined): string {
  if (!val || !val.trim() || val.trim() === '[]') return 'Sin respuesta';
  if (val.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        return parsed.length > 0 ? parsed.join(', ') : 'Sin respuesta';
      }
    } catch {
      return val;
    }
  }
  return val;
}

export const TIPO_RESPUESTA_LABELS: Record<string, string> = {
  respuesta_abierta: 'Respuesta abierta',
  respuesta_corta: 'Respuesta corta',
  seleccion_unica: 'Selección única',
  seleccion_multiple: 'Selección múltiple',
  si_no: 'Sí o No',
  escala_1_5: 'Escala de 1 a 5',
  fecha: 'Fecha',
  numero: 'Número',
  porcentaje: 'Porcentaje (%)',
  observaciones: 'Observaciones',
};
