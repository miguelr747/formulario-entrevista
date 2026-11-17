import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type {
  Empresa,
  Entrevista,
  EvaluacionMadurez,
  HallazgoDiagnostico,
  Modulo,
  Pregunta,
  Respuesta,
  ResumenIADiagnostico,
} from '../types';
import { formatAnswerDisplay } from './api';

export function exportEntrevistaPDF(params: {
  entrevista: Entrevista;
  respuestas: Respuesta[];
}) {
  const { entrevista, respuestas } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const modulos = JSON.parse(entrevista.modulos_snapshot_json || '[]') as Modulo[];
  const preguntas = JSON.parse(entrevista.preguntas_snapshot_json || '[]') as Pregunta[];
  const respMap = new Map(respuestas.map((r) => [r.pregunta_id, r]));

  // Header band
  doc.setFillColor(15, 41, 66);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('SISTEMA DE DIAGNÓSTICO EMPRESARIAL', 14, 12);
  doc.setFontSize(10);
  doc.text(`Informe de Entrevista · ${entrevista.codigo}`, 14, 20);

  // General Info table
  doc.setTextColor(15, 23, 42);
  autoTable(doc, {
    startY: 34,
    head: [['Información General de la Entrevista', 'Detalle']],
    body: [
      ['Código de entrevista', entrevista.codigo],
      ['Empresa evaluada', entrevista.empresa_nombre || entrevista.empresa_razon_social || 'N/D'],
      ['Entrevistado', `${entrevista.nombre_entrevistado} (${entrevista.cargo_entrevistado})`],
      ['Área de trabajo', entrevista.area_trabajo],
      ['Entrevistador', entrevista.entrevistador_nombre || 'N/D'],
      ['Fecha de inicio / cierre', `${entrevista.fecha_inicio} / ${entrevista.fecha_finalizacion || 'En curso'}`],
      ['Estado y avance', `${entrevista.estado} (${entrevista.porcentaje_avance}%)`],
      ['Observaciones generales', entrevista.observaciones_generales || 'Sin observaciones'],
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 41, 66], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
  });

  // Modules Q&A
  for (const mod of modulos) {
    const modPreguntas = preguntas.filter((p) => p.modulo_id === mod.id);
    if (modPreguntas.length === 0) continue;

    const currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    const rows = modPreguntas.map((q, i) => {
      const r = respMap.get(q.id);
      const ansText = formatAnswerDisplay(r?.valor_texto);
      const obs = r?.observacion ? `\nObs: ${r.observacion}` : '';
      return [`${i + 1}`, q.texto, `${ansText}${obs}`];
    });

    autoTable(doc, {
      startY: currentY > 250 ? 20 : currentY,
      head: [[`Módulo ${mod.numero}: ${mod.titulo}`, 'Pregunta', 'Respuesta registrada']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 8.5 },
      bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 72 },
        2: { cellWidth: 'auto' },
      },
    });
  }

  doc.save(`Entrevista_${entrevista.codigo}.pdf`);
}

export function exportDiagnosticoPDF(params: {
  entrevista: Entrevista;
  hallazgos: HallazgoDiagnostico[];
  madurez: EvaluacionMadurez[];
  resumenIA: ResumenIADiagnostico | null;
}) {
  const { entrevista, hallazgos, madurez, resumenIA } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFillColor(15, 41, 66);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('INFORME DE DIAGNÓSTICO LOGÍSTICO', 14, 12);
  doc.setFontSize(10);
  doc.text(`${entrevista.empresa_nombre || ''} · ${entrevista.codigo}`, 14, 20);

  autoTable(doc, {
    startY: 34,
    head: [['Contexto de Evaluación', 'Valor']],
    body: [
      ['Empresa', entrevista.empresa_nombre || 'N/D'],
      ['Código Entrevista', entrevista.codigo],
      ['Entrevistado', `${entrevista.nombre_entrevistado} · ${entrevista.cargo_entrevistado}`],
      ['Avance del cuestionario', `${entrevista.porcentaje_avance}% (${entrevista.estado})`],
      ['Total hallazgos documentados', String(hallazgos.length)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 41, 66], fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
  });

  if (madurez.length > 0) {
    const startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    autoTable(doc, {
      startY,
      head: [['Proceso Logístico', 'Nivel Madurez (1-5)', 'Evidencia Suficiente', 'Criterios y Evidencia de Respaldo']],
      body: madurez.map((m) => [
        m.proceso,
        m.evidencia_suficiente === 1 && m.nivel_madurez ? `${m.nivel_madurez} / 5` : 'No evaluado (sin evidencia suficiente)',
        m.evidencia_suficiente === 1 ? 'Sí' : 'No',
        `${m.criterios_evaluacion}\nRespaldo: ${m.evidencia_respaldo || 'Pendiente'}\n${m.justificacion || ''}`,
      ]),
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235], fontSize: 8.5 },
      bodyStyles: { fontSize: 8 },
    });
  }

  if (hallazgos.length > 0) {
    const startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    autoTable(doc, {
      startY: startY > 240 ? 20 : startY,
      head: [['Categoría', 'Proceso', 'Hallazgo y Evidencia', 'Impacto / Prioridad', 'Recomendación y Seguimiento']],
      body: hallazgos.map((h) => [
        h.categoria,
        h.proceso_relacionado,
        `${h.hallazgo}\nEvidencia: ${h.evidencia}`,
        `${h.nivel_impacto} / ${h.prioridad}`,
        `${h.recomendacion}\nResp: ${h.responsable} (${h.estado_seguimiento})`,
      ]),
      theme: 'striped',
      headStyles: { fillColor: [15, 41, 66], fontSize: 8 },
      bodyStyles: { fontSize: 7.5 },
    });
  }

  if (resumenIA) {
    const startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    autoTable(doc, {
      startY: startY > 240 ? 20 : startY,
      head: [['Síntesis Diagnóstica Asistida (Basada exclusivamente en respuestas registradas)', 'Contenido']],
      body: [
        ['Resumen ejecutivo', resumenIA.resumen_ejecutivo],
        ['Fortalezas identificadas', resumenIA.fortalezas_identificadas],
        ['Brechas y riesgos', resumenIA.brechas_riesgos],
        ['Limitaciones de la información', resumenIA.limitaciones_informacion],
      ],
      theme: 'grid',
      headStyles: { fillColor: [2, 132, 199], fontSize: 8.5 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48 } },
    });
  }

  doc.save(`Diagnostico_Logistico_${entrevista.codigo}.pdf`);
}

export function exportEmpresasPDF(empresas: Empresa[]) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFillColor(15, 41, 66);
  doc.rect(0, 0, 297, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text('SISTEMA DE DIAGNÓSTICO EMPRESARIAL · DIRECTORIO DE EMPRESAS', 14, 14);

  autoTable(doc, {
    startY: 30,
    head: [['Código', 'Razón Social', 'Nombre Comercial', 'NIT', 'Sector', 'Ciudad / Dpto', 'Empleados', 'Representante', 'Estado']],
    body: empresas.map((e) => [
      e.codigo_empresa,
      e.razon_social,
      e.nombre_comercial,
      e.nit,
      e.sector_empresarial,
      `${e.ciudad}, ${e.departamento}`,
      String(e.numero_empleados),
      e.nombre_representante,
      e.activo === 1 ? 'Activa' : 'Inactiva',
    ]),
    theme: 'striped',
    headStyles: { fillColor: [15, 41, 66], fontSize: 8 },
    bodyStyles: { fontSize: 7.5 },
  });

  doc.save('Directorio_Empresas.pdf');
}

export function exportEntrevistaExcel(params: {
  entrevista: Entrevista;
  respuestas: Respuesta[];
}) {
  const { entrevista, respuestas } = params;
  const modulos = JSON.parse(entrevista.modulos_snapshot_json || '[]') as Modulo[];
  const preguntas = JSON.parse(entrevista.preguntas_snapshot_json || '[]') as Pregunta[];
  const modMap = new Map(modulos.map((m) => [m.id, `Módulo ${m.numero}: ${m.titulo}`]));
  const respMap = new Map(respuestas.map((r) => [r.pregunta_id, r]));

  const summaryRows = [
    { Campo: 'Código de Entrevista', Valor: entrevista.codigo },
    { Campo: 'Empresa Evaluada', Valor: entrevista.empresa_nombre || '' },
    { Campo: 'Entrevistado', Valor: entrevista.nombre_entrevistado },
    { Campo: 'Cargo', Valor: entrevista.cargo_entrevistado },
    { Campo: 'Área', Valor: entrevista.area_trabajo },
    { Campo: 'Entrevistador', Valor: entrevista.entrevistador_nombre || '' },
    { Campo: 'Fecha Inicio', Valor: entrevista.fecha_inicio },
    { Campo: 'Fecha Finalización', Valor: entrevista.fecha_finalizacion || 'Pendiente' },
    { Campo: 'Estado', Valor: entrevista.estado },
    { Campo: 'Avance (%)', Valor: `${entrevista.porcentaje_avance}%` },
    { Campo: 'Observaciones Generales', Valor: entrevista.observaciones_generales },
  ];

  const qaRows = preguntas.map((q, idx) => {
    const r = respMap.get(q.id);
    return {
      '#': idx + 1,
      Módulo: modMap.get(q.modulo_id) || String(q.modulo_id),
      Pregunta: q.texto,
      Tipo: q.tipo_respuesta,
      Obligatoria: q.obligatoria === 1 ? 'Sí' : 'No',
      Respuesta: formatAnswerDisplay(r?.valor_texto),
      Observación: r?.observacion || '',
    };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Información General');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(qaRows), 'Respuestas');
  XLSX.writeFile(wb, `Respuestas_${entrevista.codigo}.xlsx`);
}

export function exportTodasEntrevistasExcel(entrevistas: Entrevista[]) {
  const rows = entrevistas.map((e) => ({
    Código: e.codigo,
    Empresa: e.empresa_nombre || '',
    Entrevistado: e.nombre_entrevistado,
    Cargo: e.cargo_entrevistado,
    Área: e.area_trabajo,
    Entrevistador: e.entrevistador_nombre || '',
    'Fecha Inicio': e.fecha_inicio,
    'Fecha Finalización': e.fecha_finalizacion || '',
    Estado: e.estado,
    'Avance (%)': e.porcentaje_avance,
    Observaciones: e.observaciones_generales || '',
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Entrevistas');
  XLSX.writeFile(wb, 'Consolidado_Entrevistas.xlsx');
}

export function exportEmpresasExcel(empresas: Empresa[]) {
  const rows = empresas.map((e) => ({
    'ID / Código': e.codigo_empresa,
    'Razón Social': e.razon_social,
    'Nombre Comercial': e.nombre_comercial,
    NIT: e.nit,
    'Actividad Económica': e.actividad_economica,
    'Sector Empresarial': e.sector_empresarial,
    Dirección: e.direccion,
    Ciudad: e.ciudad,
    Departamento: e.departamento,
    País: e.pais,
    Teléfono: e.telefono,
    'Correo Electrónico': e.correo_electronico,
    'Número de Empleados': e.numero_empleados,
    'Nombre del Representante': e.nombre_representante,
    Observaciones: e.observaciones,
    Estado: e.activo === 1 ? 'Activa' : 'Inactiva',
    'Entrevistas Asociadas': e.total_entrevistas ?? 0,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Empresas');
  XLSX.writeFile(wb, 'Base_Empresas.xlsx');
}

export function exportHallazgosExcel(codigo: string, hallazgos: HallazgoDiagnostico[]) {
  const rows = hallazgos.map((h) => ({
    Categoría: h.categoria,
    'Proceso Relacionado': h.proceso_relacionado,
    Hallazgo: h.hallazgo,
    Evidencia: h.evidencia,
    'Nivel de Impacto': h.nivel_impacto,
    Recomendación: h.recomendacion,
    Prioridad: h.prioridad,
    Responsable: h.responsable,
    'Estado Seguimiento': h.estado_seguimiento,
    Fecha: h.created_at,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Hallazgos Diagnóstico');
  XLSX.writeFile(wb, `Hallazgos_${codigo}.xlsx`);
}
