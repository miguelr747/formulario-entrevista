import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Save,
  Send,
  AlertTriangle,
  MessageSquarePlus,
} from 'lucide-react';
import type { Entrevista, Modulo, Pregunta, Respuesta } from '../types';
import { isAnsweredClient, isQuestionVisibleClient } from '../utils/api';

interface DynamicInterviewFormProps {
  entrevista: Entrevista;
  initialRespuestas: Respuesta[];
  readOnly?: boolean;
  onSaveDraft: (payload: {
    respuestas: Array<{ pregunta_id: number; modulo_id: number; valor_texto: string; observacion: string }>;
    observaciones_generales: string;
  }) => Promise<{ porcentaje: number; estado: string }>;
  onFinalize: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export function DynamicInterviewForm({
  entrevista,
  initialRespuestas,
  readOnly = false,
  onSaveDraft,
  onFinalize,
  onNotify,
}: DynamicInterviewFormProps) {
  const modulos = useMemo(
    () => (JSON.parse(entrevista.modulos_snapshot_json || '[]') as Modulo[]).sort((a, b) => a.orden - b.orden),
    [entrevista.modulos_snapshot_json]
  );
  const preguntas = useMemo(
    () => (JSON.parse(entrevista.preguntas_snapshot_json || '[]') as Pregunta[]),
    [entrevista.preguntas_snapshot_json]
  );

  const [activeModuloId, setActiveModuloId] = useState<number>(modulos[0]?.id ?? 0);
  const [answers, setAnswers] = useState<Map<number, { valor_texto: string; observacion: string }>>(() => {
    const map = new Map<number, { valor_texto: string; observacion: string }>();
    for (const r of initialRespuestas) {
      map.set(r.pregunta_id, { valor_texto: r.valor_texto ?? '', observacion: r.observacion ?? '' });
    }
    return map;
  });
  const [obsGenerales, setObsGenerales] = useState(entrevista.observaciones_generales || '');
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());
  const [missingIds, setMissingIds] = useState<Set<number>>(new Set());

  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const dirtyQuestionsRef = useRef<Set<number>>(new Set());
  const dirtyObsRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const answerTextMap = useMemo(() => {
    const m = new Map<number, string>();
    answers.forEach((v, k) => m.set(k, v.valor_texto));
    return m;
  }, [answers]);

  // Overall progress
  const progressInfo = useMemo(() => {
    const visibleAll = preguntas.filter((q) => isQuestionVisibleClient(q, answerTextMap));
    const answeredAll = visibleAll.filter((q) => isAnsweredClient(answerTextMap.get(q.id))).length;
    const pct = visibleAll.length > 0 ? Math.round((answeredAll / visibleAll.length) * 100) : 0;
    return { total: visibleAll.length, answered: answeredAll, pct };
  }, [preguntas, answerTextMap]);

  const flushSave = async (silent = true) => {
    if (readOnly) return;
    const dirtyIds = Array.from(dirtyQuestionsRef.current);
    if (dirtyIds.length === 0 && !dirtyObsRef.current) return;

    const payloadRespuestas = dirtyIds.map((qId) => {
      const q = preguntas.find((p) => p.id === qId);
      const ans = answers.get(qId) || { valor_texto: '', observacion: '' };
      return {
        pregunta_id: qId,
        modulo_id: q?.modulo_id ?? activeModuloId,
        valor_texto: ans.valor_texto,
        observacion: ans.observacion,
      };
    });

    setSavingStatus('saving');
    try {
      await onSaveDraft({
        respuestas: payloadRespuestas,
        observaciones_generales: obsGenerales,
      });
      dirtyQuestionsRef.current.clear();
      dirtyObsRef.current = false;
      setSavingStatus('saved');
      setLastSavedTime(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      if (!silent) {
        onNotify('success', 'Progreso guardado correctamente.');
      }
    } catch (err) {
      setSavingStatus('idle');
      if (!silent) {
        onNotify('error', err instanceof Error ? err.message : 'Error al guardar respuestas.');
      }
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const scheduleAutoSave = () => {
    if (readOnly) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void flushSave(true);
    }, 1100);
  };

  const updateAnswer = (preguntaId: number, valorTexto: string, observacion?: string) => {
    if (readOnly) return;
    setAnswers((prev) => {
      const next = new Map(prev);
      const current = next.get(preguntaId) || { valor_texto: '', observacion: '' };
      next.set(preguntaId, {
        valor_texto: valorTexto,
        observacion: observacion !== undefined ? observacion : current.observacion,
      });
      return next;
    });
    setMissingIds((prev) => {
      if (!prev.has(preguntaId)) return prev;
      const next = new Set(prev);
      next.delete(preguntaId);
      return next;
    });
    dirtyQuestionsRef.current.add(preguntaId);
    scheduleAutoSave();
  };

  const toggleMultiOption = (preguntaId: number, option: string) => {
    const currentRaw = answers.get(preguntaId)?.valor_texto || '[]';
    let list: string[] = [];
    try {
      const parsed = JSON.parse(currentRaw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
    const nextList = list.includes(option) ? list.filter((x) => x !== option) : [...list, option];
    updateAnswer(preguntaId, JSON.stringify(nextList));
  };

  const handleManualSave = async () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    // If nothing dirty, still save current module answers or general obs to confirm
    if (dirtyQuestionsRef.current.size === 0) {
      dirtyObsRef.current = true;
    }
    await flushSave(false);
  };

  const handleSubmitFinal = async () => {
    if (readOnly) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setSubmitting(true);
    try {
      await flushSave(true);

      // Client-side mandatory validation check
      const visibleAll = preguntas.filter((q) => isQuestionVisibleClient(q, answerTextMap));
      const missing = visibleAll.filter((q) => q.obligatoria === 1 && !isAnsweredClient(answerTextMap.get(q.id)));
      if (missing.length > 0) {
        setMissingIds(new Set(missing.map((m) => m.id)));
        setActiveModuloId(missing[0].modulo_id);
        onNotify('error', `Faltan ${missing.length} pregunta(s) obligatoria(s) por completar.`);
        setSubmitting(false);
        return;
      }

      await onFinalize();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error al finalizar la entrevista.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeModIndex = modulos.findIndex((m) => m.id === activeModuloId);
  const activeModulo = modulos[activeModIndex] || modulos[0];
  const activeQuestions = useMemo(
    () =>
      preguntas
        .filter((q) => q.modulo_id === activeModulo?.id)
        .sort((a, b) => a.orden - b.orden)
        .filter((q) => isQuestionVisibleClient(q, answerTextMap)),
    [preguntas, activeModulo, answerTextMap]
  );

  return (
    <div className="space-y-5">
      {/* Progress & Save Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono font-semibold text-[#0F2942]">{entrevista.codigo}</span>
              <span aria-hidden="true">·</span>
              <span>{entrevista.empresa_nombre}</span>
              <span aria-hidden="true">·</span>
              <span>{entrevista.nombre_entrevistado} ({entrevista.cargo_entrevistado})</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-48 sm:w-64 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-600 rounded-full transition-all duration-300"
                  style={{ width: `${progressInfo.pct}%` }}
                />
              </div>
              <span className="text-sm font-mono tabular-nums font-semibold text-slate-900">
                {progressInfo.pct}% ({progressInfo.answered}/{progressInfo.total})
              </span>
            </div>
          </div>

          {!readOnly && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-slate-500">
                {savingStatus === 'saving'
                  ? 'Guardando cambios...'
                  : savingStatus === 'saved'
                  ? `Guardado automático ${lastSavedTime}`
                  : 'Guardado automático activo'}
              </span>
              <button
                type="button"
                onClick={handleManualSave}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Guardar borrador</span>
              </button>
              <button
                type="button"
                onClick={handleSubmitFinal}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0F2942] hover:bg-[#173B5E] rounded-lg whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{submitting ? 'Enviando...' : 'Finalizar y enviar'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Split: Module Navigation + Active Questions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Modules Sidebar */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-3 space-y-1">
          <p className="px-3 py-2 text-xs font-semibold text-slate-500">Módulos del cuestionario</p>
          {modulos.map((mod) => {
            const modVisibleQs = preguntas.filter(
              (q) => q.modulo_id === mod.id && isQuestionVisibleClient(q, answerTextMap)
            );
            const modAnswered = modVisibleQs.filter((q) => isAnsweredClient(answerTextMap.get(q.id))).length;
            const modComplete = modVisibleQs.length > 0 && modAnswered === modVisibleQs.length;
            const hasMissing = modVisibleQs.some((q) => missingIds.has(q.id));
            const isActive = mod.id === activeModulo?.id;

            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => setActiveModuloId(mod.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center justify-between gap-2 ${
                  isActive
                    ? 'bg-[#0F2942] text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">
                    {mod.numero}. {mod.titulo}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {hasMissing && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                  {modComplete && (
                    <CheckCircle2 className={`w-3.5 h-3.5 ${isActive ? 'text-sky-300' : 'text-emerald-600'}`} />
                  )}
                  <span
                    className={`text-[11px] font-mono tabular-nums ${
                      isActive ? 'text-slate-200' : 'text-slate-400'
                    }`}
                  >
                    {modAnswered}/{modVisibleQs.length}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Questions Form Area */}
        <div className="lg:col-span-8 space-y-4">
          {activeModulo && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              <div className="pb-4 border-b border-slate-200">
                <p className="text-xs font-semibold text-sky-700">Módulo {activeModulo.numero}</p>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">{activeModulo.titulo}</h3>
                {activeModulo.descripcion && (
                  <p className="text-sm text-slate-500 mt-1">{activeModulo.descripcion}</p>
                )}
              </div>

              {activeQuestions.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">
                  No hay preguntas activas visibles en este módulo según las condiciones actuales.
                </p>
              ) : (
                <div className="space-y-6">
                  {activeQuestions.map((q, idx) => {
                    const ans = answers.get(q.id) || { valor_texto: '', observacion: '' };
                    const isMissing = missingIds.has(q.id);
                    const opciones = (() => {
                      try {
                        return JSON.parse(q.opciones_json || '[]') as string[];
                      } catch {
                        return [];
                      }
                    })();
                    const noteVisible = expandedNotes.has(q.id) || Boolean(ans.observacion);

                    return (
                      <div
                        key={q.id}
                        className={`pb-6 border-b border-slate-100 last:border-b-0 last:pb-0 ${
                          isMissing ? 'bg-red-50/40 -mx-3 px-3 py-3 rounded-lg border border-red-200' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <label className="text-sm font-semibold text-slate-900 leading-snug">
                            <span className="font-mono text-slate-400 mr-2">{idx + 1}.</span>
                            {q.texto}
                            {q.obligatoria === 1 && <span className="text-red-600 ml-1">*</span>}
                          </label>
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedNotes((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(q.id)) next.delete(q.id);
                                  else next.add(q.id);
                                  return next;
                                })
                              }
                              className="text-xs text-slate-400 hover:text-sky-700 inline-flex items-center gap-1 shrink-0"
                              title="Agregar nota u observación adicional"
                            >
                              <MessageSquarePlus className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Nota</span>
                            </button>
                          )}
                        </div>

                        {q.descripcion_ayuda && (
                          <p className="text-xs text-slate-500 mb-3">{q.descripcion_ayuda}</p>
                        )}

                        {/* Render by Question Type */}
                        {q.tipo_respuesta === 'respuesta_abierta' && (
                          <textarea
                            rows={3}
                            disabled={readOnly}
                            value={ans.valor_texto}
                            onChange={(e) => updateAnswer(q.id, e.target.value)}
                            placeholder="Escriba la respuesta detallada..."
                            className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                          />
                        )}

                        {q.tipo_respuesta === 'observaciones' && (
                          <textarea
                            rows={3}
                            disabled={readOnly}
                            value={ans.valor_texto}
                            onChange={(e) => updateAnswer(q.id, e.target.value)}
                            placeholder="Registre observaciones, hallazgos o comentarios operativos..."
                            className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                          />
                        )}

                        {q.tipo_respuesta === 'respuesta_corta' && (
                          <input
                            type="text"
                            disabled={readOnly}
                            value={ans.valor_texto}
                            onChange={(e) => updateAnswer(q.id, e.target.value)}
                            placeholder="Respuesta breve..."
                            className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                          />
                        )}

                        {q.tipo_respuesta === 'numero' && (
                          <input
                            type="number"
                            disabled={readOnly}
                            value={ans.valor_texto}
                            onChange={(e) => updateAnswer(q.id, e.target.value)}
                            placeholder="0"
                            className="w-48 px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                          />
                        )}

                        {q.tipo_respuesta === 'porcentaje' && (
                          <div className="relative w-44">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.1"
                              disabled={readOnly}
                              value={ans.valor_texto}
                              onChange={(e) => updateAnswer(q.id, e.target.value)}
                              placeholder="0 - 100"
                              className="w-full pl-3.5 pr-8 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                              %
                            </span>
                          </div>
                        )}

                        {q.tipo_respuesta === 'fecha' && (
                          <input
                            type="date"
                            disabled={readOnly}
                            value={ans.valor_texto}
                            onChange={(e) => updateAnswer(q.id, e.target.value)}
                            className="w-52 px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                          />
                        )}

                        {q.tipo_respuesta === 'si_no' && (
                          <div className="inline-flex items-center gap-2">
                            {['Sí', 'No'].map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                disabled={readOnly}
                                onClick={() => updateAnswer(q.id, opt)}
                                className={`px-5 py-2 text-sm font-medium rounded-lg border transition-colors ${
                                  ans.valor_texto === opt
                                    ? 'bg-[#0F2942] text-white border-[#0F2942]'
                                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        )}

                        {q.tipo_respuesta === 'escala_1_5' && (
                          <div className="flex flex-wrap items-center gap-2">
                            {[1, 2, 3, 4, 5].map((num) => (
                              <button
                                key={num}
                                type="button"
                                disabled={readOnly}
                                onClick={() => updateAnswer(q.id, String(num))}
                                className={`w-11 h-10 text-sm font-mono font-semibold rounded-lg border transition-colors ${
                                  ans.valor_texto === String(num)
                                    ? 'bg-[#0F2942] text-white border-[#0F2942]'
                                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                                }`}
                              >
                                {num}
                              </button>
                            ))}
                            <span className="text-xs text-slate-500 ml-2">1 = Muy bajo · 5 = Óptimo</span>
                          </div>
                        )}

                        {q.tipo_respuesta === 'seleccion_unica' && (
                          <div className="space-y-2">
                            {opciones.map((opt) => (
                              <label
                                key={opt}
                                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                                  ans.valor_texto === opt
                                    ? 'border-sky-600 bg-sky-50/60 text-slate-900 font-medium'
                                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <input
                                  type="radio"
                                  disabled={readOnly}
                                  name={`q-${q.id}`}
                                  checked={ans.valor_texto === opt}
                                  onChange={() => updateAnswer(q.id, opt)}
                                  className="text-sky-600 focus:ring-sky-500"
                                />
                                <span>{opt}</span>
                              </label>
                            ))}
                          </div>
                        )}

                        {q.tipo_respuesta === 'seleccion_multiple' && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {opciones.map((opt) => {
                              let selectedList: string[] = [];
                              try {
                                const parsed = JSON.parse(ans.valor_texto || '[]');
                                if (Array.isArray(parsed)) selectedList = parsed;
                              } catch {
                                selectedList = [];
                              }
                              const checked = selectedList.includes(opt);
                              return (
                                <label
                                  key={opt}
                                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                                    checked
                                      ? 'border-sky-600 bg-sky-50/60 text-slate-900 font-medium'
                                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={readOnly}
                                    checked={checked}
                                    onChange={() => toggleMultiOption(q.id, opt)}
                                    className="rounded text-sky-600 focus:ring-sky-500"
                                  />
                                  <span>{opt}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}

                        {noteVisible && (
                          <div className="mt-3">
                            <input
                              type="text"
                              disabled={readOnly}
                              value={ans.observacion}
                              onChange={(e) => updateAnswer(q.id, ans.valor_texto, e.target.value)}
                              placeholder="Nota aclaratoria u observación de soporte..."
                              className="w-full px-3 py-1.5 text-xs border border-slate-200 bg-slate-50 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-500"
                            />
                          </div>
                        )}

                        {isMissing && (
                          <p className="mt-2 text-xs font-medium text-red-600">
                            Esta pregunta es obligatoria para finalizar la entrevista.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bottom Module Navigation */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-4">
                <button
                  type="button"
                  disabled={activeModIndex <= 0}
                  onClick={() => setActiveModuloId(modulos[activeModIndex - 1].id)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Módulo anterior</span>
                </button>

                {activeModIndex < modulos.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setActiveModuloId(modulos[activeModIndex + 1].id)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg"
                  >
                    <span>Siguiente módulo</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : !readOnly ? (
                  <button
                    type="button"
                    onClick={handleSubmitFinal}
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    <span>Finalizar entrevista</span>
                  </button>
                ) : null}
              </div>
            </div>
          )}

          {/* General Observations */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Observaciones generales de la entrevista
            </label>
            <textarea
              rows={2}
              disabled={readOnly}
              value={obsGenerales}
              onChange={(e) => {
                setObsGenerales(e.target.value);
                dirtyObsRef.current = true;
                scheduleAutoSave();
              }}
              placeholder="Contexto de la sesión, aclaraciones del entrevistado o notas de campo..."
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
