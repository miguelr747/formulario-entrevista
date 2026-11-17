import { useState } from 'react';
import {
  HelpCircle,
  Building2,
  ClipboardList,
  FileCheck2,
  Settings,
  PanelLeft,
} from 'lucide-react';
import type { PestanaMenu, Usuario } from '../types';
import { BancoPreguntasView } from './BancoPreguntasView';
import { EmpresasView } from './EmpresasView';
import { EntrevistasView } from './EntrevistasView';
import { ResultadosView } from './ResultadosView';
import { AdminTabsManager } from './AdminTabsManager';

interface AdminViewProps {
  editorUser: Usuario;
  tabs: PestanaMenu[];
  onTabsChanged: () => Promise<void>;
  onOpenInterview: (entrevistaId: number) => void;
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
}

type EditorSubTab = 'banco' | 'pestanas' | 'empresas' | 'entrevistas' | 'resultados';

export function AdminView({
  editorUser,
  tabs,
  onTabsChanged,
  onOpenInterview,
  onNotify,
}: AdminViewProps) {
  const [subTab, setSubTab] = useState<EditorSubTab>('banco');

  const editorTabs: Array<{ id: EditorSubTab; label: string; icon: typeof HelpCircle }> = [
    { id: 'banco', label: 'Preguntas y Módulos', icon: HelpCircle },
    { id: 'pestanas', label: 'Pestañas del Menú', icon: PanelLeft },
    { id: 'empresas', label: 'Editar Empresas', icon: Building2 },
    { id: 'entrevistas', label: 'Editar Entrevistas', icon: ClipboardList },
    { id: 'resultados', label: 'Editar Resultados', icon: FileCheck2 },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-[#0F2942] text-white rounded-xl p-5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-sky-500/20 border border-sky-400/30 flex items-center justify-center shrink-0">
          <Settings className="w-5 h-5 text-sky-300" />
        </div>
        <div>
          <h2 className="text-base font-bold">Configuración y Edición del Sistema</h2>
          <p className="text-xs text-slate-300 mt-0.5">
            Edite preguntas y módulos del formulario, agregue o elimine pestañas del menú lateral, y gestione empresas, entrevistas y resultados directamente.
          </p>
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {editorTabs.map((t) => {
          const Icon = t.icon;
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                active
                  ? 'bg-[#0F2942] text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {subTab === 'banco' && <BancoPreguntasView onNotify={onNotify} />}
      {subTab === 'pestanas' && (
        <AdminTabsManager tabs={tabs} onTabsChanged={onTabsChanged} onNotify={onNotify} />
      )}
      {subTab === 'empresas' && (
        <EmpresasView
          user={editorUser}
          onNotify={onNotify}
          onOpenInterview={onOpenInterview}
        />
      )}
      {subTab === 'entrevistas' && (
        <EntrevistasView
          user={editorUser}
          onOpenBancoPreguntas={() => setSubTab('banco')}
          onNotify={onNotify}
        />
      )}
      {subTab === 'resultados' && (
        <ResultadosView user={editorUser} onNotify={onNotify} />
      )}
    </div>
  );
}
