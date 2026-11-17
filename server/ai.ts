import { GoogleGenAI, Type } from '@google/genai';

export interface DiagnosticAnswerContext {
  modulo: string;
  pregunta: string;
  tipo: string;
  respuesta: string;
  observacion: string;
}

export interface DiagnosticSummaryResult {
  resumen_ejecutivo: string;
  fortalezas_identificadas: string;
  brechas_riesgos: string;
  limitaciones_informacion: string;
}

export async function generateDiagnosticAISummary(params: {
  empresa: string;
  sector: string;
  codigoEntrevista: string;
  entrevistado: string;
  cargo: string;
  estado: string;
  porcentajeAvance: number;
  respuestas: DiagnosticAnswerContext[];
  preguntasSinResponder: string[];
}): Promise<DiagnosticSummaryResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada en las variables de entorno del servidor.');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const answeredText = params.respuestas
    .map(
      (r, idx) =>
        `${idx + 1}. [${r.modulo}] ${r.pregunta}\n   Respuesta: ${r.respuesta}${r.observacion ? `\n   Observación: ${r.observacion}` : ''}`
    )
    .join('\n\n');

  const unansweredText =
    params.preguntasSinResponder.length > 0
      ? params.preguntasSinResponder.map((q, idx) => `${idx + 1}. ${q}`).join('\n')
      : 'Ninguna (todas las preguntas aplicables fueron respondidas).';

  const systemInstruction = `Eres un consultor senior en diagnóstico empresarial y gestión logística.
REGLAS ESTRICTAS DE RIGOR Y VERACIDAD:
1. Basa tu análisis EXCLUSIVAMENTE en las respuestas registradas de la entrevista proporcionada.
2. NO inventes datos, cifras, herramientas, procedimientos ni problemas que no estén explícitamente respaldados por las respuestas.
3. NO asumas que una respuesta negativa ("No") constituye automáticamente una deficiencia si el contexto operativo de la empresa no lo justifica o no existe evidencia suficiente.
4. Indica explícita y claramente las LIMITACIONES DE LA INFORMACIÓN: preguntas sin responder, respuestas breves o ambiguas, y aspectos donde se requiere verificación documental o medición cuantitativa adicional antes de concluir.
5. Redacta en español profesional, claro, objetivo y estructurado para dirección empresarial.`;

  const prompt = `Analiza la siguiente entrevista empresarial y genera un resumen diagnóstico objetivo:

EMPRESA: ${params.empresa} (Sector: ${params.sector})
ENTREVISTA: ${params.codigoEntrevista} | Estado: ${params.estado} | Avance: ${params.porcentajeAvance}%
ENTREVISTADO: ${params.entrevistado} (${params.cargo})

RESPUESTAS REGISTRADAS (${params.respuestas.length}):
${answeredText || 'No hay respuestas registradas aún.'}

PREGUNTAS SIN RESPONDER (${params.preguntasSinResponder.length}):
${unansweredText}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          resumen_ejecutivo: {
            type: Type.STRING,
            description: 'Síntesis objetiva de la situación operativa y logística observada exclusivamente en las respuestas registradas.',
          },
          fortalezas_identificadas: {
            type: Type.STRING,
            description: 'Lista o párrafos de fortalezas respaldadas por respuestas concretas, citando el módulo.',
          },
          brechas_riesgos: {
            type: Type.STRING,
            description: 'Problemas operativos, riesgos o ausencias de procesos/indicadores reportados explícitamente en las respuestas.',
          },
          limitaciones_informacion: {
            type: Type.STRING,
            description: 'Detalle claro de vacíos de información, preguntas sin responder, falta de mediciones cuantitativas o aspectos que requieren evidencia adicional.',
          },
        },
        required: [
          'resumen_ejecutivo',
          'fortalezas_identificadas',
          'brechas_riesgos',
          'limitaciones_informacion',
        ],
      },
    },
  });

  const text = (response.text ?? '').trim();
  if (!text) {
    throw new Error('El modelo no devolvió contenido.');
  }

  return JSON.parse(text) as DiagnosticSummaryResult;
}
