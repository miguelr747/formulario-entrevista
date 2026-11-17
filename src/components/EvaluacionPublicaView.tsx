import { useEffect, useState } from 'react';
import { Building2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { apiFetch } from '../utils/api';
import type { Entrevista, Respuesta } from '../types';
import { DynamicInterviewForm } from './DynamicInterviewForm';

interface EvaluacionPublicaViewProps {
  token: string;
  onExit: () => void;
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export function EvaluacionPublicaView({ token, onExit, onNotify }: EvaluacionPublicaViewProps) {
  const [entrevista, setEntrevista] = useState<Entrevista | null>(null);
  const [respuestas, setRespuestas] = useState<Respuesta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiFetch<{ entrevista: Entrevista; respuestas: Respuesta[] }>(`/api/evaluacion-publica/${token}`)
      .then((data) => {
        setEntrevista(data.entrevista);
        setRespuestas(data.respuestas);
        if (data.entrevista.estado === 'Completada' || data.entrevista.estado === 'Revisada') {
          setSubmitted(true);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Enlace inválido o deshabilitado.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-[#0F2942] text-white px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Building2 className="w-5 h-5 text-sky-300" />
            <span className="font-bold tracking-tight">Sistema de Diagnóstico Empresarial</span>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-200 hover:text-white"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Ir al inicio de sesión</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        {loading ? (
          <div className="p-12 bg-white border border-slate-200 rounded-xl text-center text-sm text-slate-500">
            Verificando enlace seguro de evaluación...
          </div>
        ) : error ? (
          <div className="max-w-lg mx-auto mt-12 p-8 bg-white border border-red-200 rounded-xl text-center space-y-4">
            <p className="text-base font-semibold text-red-700">{error}</p>
            <button
              type="button"
              onClick={onExit}
              className="px-4 py-2 text-sm font-medium text-white bg-[#0F2942] rounded-lg"
            >
              Volver
            </button>
          </div>
        ) : submitted && entrevista ? (
          <div className="max-w-xl mx-auto mt-10 p-8 bg-white border border-emerald-200 rounded-xl text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <h2 className="text-xl font-bold text-slate-900">Evaluación enviada correctamente</h2>
            <p className="text-sm text-slate-600">
              Sus respuestas para <span className="font-semibold">{entrevista.empresa_nombre}</span> ({entrevista.codigo}) han sido registradas.
            </p>
          </div>
        ) : entrevista ? (
          <DynamicInterviewForm
            entrevista={entrevista}
            initialRespuestas={respuestas}
            onSaveDraft={async (payload) => {
              const res = await apiFetch<{ porcentaje: number; estado: string }>(
                `/api/evaluacion-publica/${token}/respuestas`,
                {
                  method: 'PUT',
                  body: JSON.stringify(payload),
                }
              );
              return res;
            }}
            onFinalize={async () => {
              await apiFetch(`/api/evaluacion-publica/${token}/finalizar`, { method: 'POST' });
              onNotify('success', 'Sus respuestas han sido enviadas exitosamente.');
              setSubmitted(true);
            }}
            onNotify={onNotify}
          />
        ) : null}
      </main>
    </div>
  );
}
