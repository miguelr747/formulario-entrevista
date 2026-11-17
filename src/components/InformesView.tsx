import { useEffect, useState } from 'react';
import { FileDown, FileSpreadsheet, Building2, ClipboardCheck, BarChart3 } from 'lucide-react';
import { apiFetch } from '../utils/api';
import {
  exportDiagnosticoPDF,
  exportEmpresasExcel,
  exportEmpresasPDF,
  exportEntrevistaExcel,
  exportEntrevistaPDF,
  exportHallazgosExcel,
  exportTodasEntrevistasExcel,
} from '../utils/exports';
import type {
  Empresa,
  Entrevista,
  EvaluacionMadurez,
  HallazgoDiagnostico,
  Respuesta,
  ResumenIADiagnostico,
} from '../types';

interface InformesViewProps {
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export function InformesView({ onNotify }: InformesViewProps) {
  const [entrevistas, setEntrevistas] = useState<Entrevista[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [selectedEntrevistaId, setSelectedEntrevistaId] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([apiFetch<Entrevista[]>('/api/entrevistas'), apiFetch<Empresa[]>('/api/empresas')])
      .then(([ents, emps]) => {
        setEntrevistas(ents);
        setEmpresas(emps);
        if (ents.length > 0) setSelectedEntrevistaId(ents[0].id);
      })
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'Error cargando datos de informes.'))
      .finally(() => setLoading(false));
  }, []);

  const handleExportEntrevistaPDF = async () => {
    if (!selectedEntrevistaId) return;
    try {
      const data = await apiFetch<{ entrevista: Entrevista; respuestas: Respuesta[] }>(
        `/api/entrevistas/${selectedEntrevistaId}`
      );
      exportEntrevistaPDF({ entrevista: data.entrevista, respuestas: data.respuestas });
      onNotify('success', 'Informe PDF de entrevista generado.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error exportando PDF.');
    }
  };

  const handleExportEntrevistaExcel = async () => {
    if (!selectedEntrevistaId) return;
    try {
      const data = await apiFetch<{ entrevista: Entrevista; respuestas: Respuesta[] }>(
        `/api/entrevistas/${selectedEntrevistaId}`
      );
      exportEntrevistaExcel({ entrevista: data.entrevista, respuestas: data.respuestas });
      onNotify('success', 'Libro Excel de respuestas descargado.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error exportando Excel.');
    }
  };

  const handleExportDiagnosticoPDF = async () => {
    if (!selectedEntrevistaId) return;
    try {
      const [entData, diagData] = await Promise.all([
        apiFetch<{ entrevista: Entrevista }>(`/api/entrevistas/${selectedEntrevistaId}`),
        apiFetch<{
          hallazgos: HallazgoDiagnostico[];
          madurez: EvaluacionMadurez[];
          resumenIA: ResumenIADiagnostico | null;
        }>(`/api/diagnosticos/${selectedEntrevistaId}`),
      ]);
      exportDiagnosticoPDF({
        entrevista: entData.entrevista,
        hallazgos: diagData.hallazgos,
        madurez: diagData.madurez,
        resumenIA: diagData.resumenIA,
      });
      onNotify('success', 'Informe PDF de diagnóstico logístico generado.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error exportando diagnóstico PDF.');
    }
  };

  const handleExportHallazgosExcel = async () => {
    if (!selectedEntrevistaId) return;
    const ent = entrevistas.find((e) => e.id === selectedEntrevistaId);
    if (!ent) return;
    try {
      const diagData = await apiFetch<{ hallazgos: HallazgoDiagnostico[] }>(
        `/api/diagnosticos/${selectedEntrevistaId}`
      );
      exportHallazgosExcel(ent.codigo, diagData.hallazgos);
      onNotify('success', 'Matriz de hallazgos en Excel descargada.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error exportando hallazgos.');
    }
  };

  if (loading) {
    return (
      <div className="p-8 bg-white border border-slate-200 rounded-xl text-center text-sm text-slate-500">
        Preparando módulo de informes y exportaciones...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Informes y Exportaciones</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Genere documentos ejecutivos en PDF y descargue bases estructuradas en Excel.
        </p>
      </div>

      {/* Interview Selector */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-500">Entrevista seleccionada para informes individuales</p>
          <p className="text-sm text-slate-700 mt-0.5">
            Aplica a los reportes de respuestas detalladas y diagnóstico logístico.
          </p>
        </div>
        <select
          value={selectedEntrevistaId}
          onChange={(e) => setSelectedEntrevistaId(Number(e.target.value))}
          className="px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium text-slate-900 sm:min-w-[320px]"
        >
          {entrevistas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.codigo} · {e.empresa_nombre} ({e.estado} · {e.porcentaje_avance}%)
            </option>
          ))}
        </select>
      </div>

      {/* 3 Export Pillars */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. Entrevistas & Respuestas */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div>
            <ClipboardCheck className="w-6 h-6 text-sky-600 mb-3" />
            <h3 className="text-base font-bold text-slate-900">Respuestas de Entrevistas</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Exporte el cuestionario completo con preguntas históricas, respuestas por módulo y observaciones de campo, o el consolidado general.
            </p>
          </div>
          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              disabled={!selectedEntrevistaId}
              onClick={handleExportEntrevistaPDF}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#0F2942] hover:bg-[#173B5E] rounded-lg disabled:opacity-40"
            >
              <FileDown className="w-4 h-4" />
              <span>Descargar Entrevista en PDF</span>
            </button>
            <button
              type="button"
              disabled={!selectedEntrevistaId}
              onClick={handleExportEntrevistaExcel}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg disabled:opacity-40"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              <span>Exportar Respuestas a Excel</span>
            </button>
            <button
              type="button"
              disabled={entrevistas.length === 0}
              onClick={() => {
                exportTodasEntrevistasExcel(entrevistas);
                onNotify('success', 'Consolidado de entrevistas exportado a Excel.');
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg disabled:opacity-40"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Consolidado General (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* 2. Diagnóstico Logístico */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div>
            <BarChart3 className="w-6 h-6 text-sky-600 mb-3" />
            <h3 className="text-base font-bold text-slate-900">Diagnóstico Logístico</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Incluye niveles de madurez sustentados con evidencia, matriz de hallazgos, riesgos, recomendaciones y resumen IA con limitaciones.
            </p>
          </div>
          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              disabled={!selectedEntrevistaId}
              onClick={handleExportDiagnosticoPDF}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#0F2942] hover:bg-[#173B5E] rounded-lg disabled:opacity-40"
            >
              <FileDown className="w-4 h-4" />
              <span>Informe Diagnóstico PDF</span>
            </button>
            <button
              type="button"
              disabled={!selectedEntrevistaId}
              onClick={handleExportHallazgosExcel}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg disabled:opacity-40"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              <span>Matriz de Hallazgos (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* 3. Directorio de Empresas */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div>
            <Building2 className="w-6 h-6 text-sky-600 mb-3" />
            <h3 className="text-base font-bold text-slate-900">Información de Empresas</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Descargue el directorio completo de organizaciones registradas ({empresas.length} empresas) con datos fiscales, ubicación y representantes.
            </p>
          </div>
          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              disabled={empresas.length === 0}
              onClick={() => {
                exportEmpresasPDF(empresas);
                onNotify('success', 'Directorio de empresas exportado en PDF.');
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#0F2942] hover:bg-[#173B5E] rounded-lg disabled:opacity-40"
            >
              <FileDown className="w-4 h-4" />
              <span>Directorio de Empresas PDF</span>
            </button>
            <button
              type="button"
              disabled={empresas.length === 0}
              onClick={() => {
                exportEmpresasExcel(empresas);
                onNotify('success', 'Base completa de empresas exportada a Excel.');
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg disabled:opacity-40"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              <span>Descargar Base Excel (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
