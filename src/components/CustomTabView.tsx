import { ExternalLink } from 'lucide-react';
import type { PestanaMenu } from '../types';
import { resolveTabIcon } from '../utils/tabIcons';

interface CustomTabViewProps {
  tab: PestanaMenu;
}

export function CustomTabView({ tab }: CustomTabViewProps) {
  const Icon = resolveTabIcon(tab.icono);

  if (tab.tipo === 'enlace') {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#0F2942] text-white flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">{tab.titulo}</h2>
              <p className="text-xs text-slate-500 break-all mt-0.5">{tab.url_externa}</p>
            </div>
          </div>
          {tab.url_externa && (
            <a
              href={tab.url_externa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F2942] hover:bg-[#173B5E] text-white text-sm font-medium rounded-lg whitespace-nowrap shrink-0 self-start sm:self-auto"
            >
              <span>Abrir recurso</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>

        {tab.url_externa && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden h-[70vh]">
            <iframe
              src={tab.url_externa}
              title={tab.titulo}
              className="w-full h-full border-0"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-4">
      <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
        <div className="w-10 h-10 rounded-lg bg-[#0F2942] text-white flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-sky-300" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">{tab.titulo}</h2>
      </div>
      {tab.contenido?.trim() ? (
        <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
          {tab.contenido}
        </div>
      ) : (
        <p className="text-sm text-slate-400 italic">
          Esta pestaña aún no tiene contenido configurado. Puede editarla desde Administración &rarr; Pestañas del Menú.
        </p>
      )}
    </div>
  );
}
