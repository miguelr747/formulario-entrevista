import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  Menu,
  X,
} from 'lucide-react';
import { apiFetch, setStoredToken } from './utils/api';
import { resolveTabIcon } from './utils/tabIcons';
import type { PestanaMenu, Usuario } from './types';
import { ToastContainer, type ToastMessage } from './components/Toast';
import { EmpresasView } from './components/EmpresasView';
import { EntrevistasView } from './components/EntrevistasView';
import { ResultadosView } from './components/ResultadosView';
import { AdminView } from './components/AdminView';
import { DashboardView } from './components/DashboardView';
import { DiagnosticoView } from './components/DiagnosticoView';
import { InformesView } from './components/InformesView';
import { BancoPreguntasView } from './components/BancoPreguntasView';
import { CustomTabView } from './components/CustomTabView';
import { EvaluacionPublicaView } from './components/EvaluacionPublicaView';

const EDITOR_USER: Usuario = {
  id: 1,
  nombre: 'Editor',
  username: 'editor',
  email: 'sistema@diagnostico.com',
  rol: 'ADMINISTRADOR',
  activo: 1,
  ultimo_acceso: null,
  created_at: '',
};

const DEFAULT_TABS: PestanaMenu[] = [
  {
    id: 1,
    clave: 'empresas',
    titulo: 'Empresas',
    icono: 'Building2',
    tipo: 'sistema',
    vista_sistema: 'empresas',
    contenido: '',
    url_externa: '',
    orden: 1,
    activo: 1,
    protegida: 0,
  },
  {
    id: 2,
    clave: 'entrevistas',
    titulo: 'Entrevistas',
    icono: 'ClipboardList',
    tipo: 'sistema',
    vista_sistema: 'entrevistas',
    contenido: '',
    url_externa: '',
    orden: 2,
    activo: 1,
    protegida: 0,
  },
  {
    id: 3,
    clave: 'resultados',
    titulo: 'Resultados',
    icono: 'FileCheck2',
    tipo: 'sistema',
    vista_sistema: 'resultados',
    contenido: '',
    url_externa: '',
    orden: 3,
    activo: 1,
    protegida: 0,
  },
  {
    id: 4,
    clave: 'admin',
    titulo: 'Configuración',
    icono: 'Settings',
    tipo: 'sistema',
    vista_sistema: 'admin',
    contenido: '',
    url_externa: '',
    orden: 4,
    activo: 1,
    protegida: 1,
  },
];

export default function App() {
  const [tabs, setTabs] = useState<PestanaMenu[]>(DEFAULT_TABS);
  const [activeTabKey, setActiveTabKey] = useState<string>('entrevistas');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openInterviewId, setOpenInterviewId] = useState<number | null>(null);

  const [publicToken, setPublicToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('evaluacion');
  });

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const loadTabs = useCallback(async () => {
    try {
      const data = await apiFetch<PestanaMenu[]>('/api/pestanas');
      if (Array.isArray(data) && data.length > 0) {
        setTabs(data);
      }
    } catch {
      // Keep current tabs on transient error
    }
  }, []);

  useEffect(() => {
    setStoredToken(null);
    loadTabs();
  }, [loadTabs]);

  const visibleTabs = tabs.filter((t) => t.activo === 1);

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some((t) => t.clave === activeTabKey)) {
      setActiveTabKey(visibleTabs[0].clave);
    }
  }, [visibleTabs, activeTabKey]);

  if (publicToken) {
    return (
      <>
        <EvaluacionPublicaView
          token={publicToken}
          onExit={() => {
            setPublicToken(null);
            window.history.replaceState({}, '', '/');
          }}
          onNotify={notify}
        />
        <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
      </>
    );
  }

  const activeTabObj = visibleTabs.find((t) => t.clave === activeTabKey) || visibleTabs[0];
  const currentNavLabel = activeTabObj?.titulo || 'Sistema de Diagnóstico';

  const handleOpenInterviewFromCompany = (id: number) => {
    setOpenInterviewId(id);
    const interviewsTab = visibleTabs.find((t) => t.tipo === 'sistema' && t.vista_sistema === 'entrevistas');
    if (interviewsTab) {
      setActiveTabKey(interviewsTab.clave);
    }
  };

  const openEditorTab = () => {
    const editorTab = visibleTabs.find((t) => t.protegida === 1 || t.vista_sistema === 'admin');
    if (editorTab) {
      setActiveTabKey(editorTab.clave);
    }
  };

  const renderTabContent = (tab: PestanaMenu | undefined) => {
    if (!tab) return null;
    if (tab.tipo === 'personalizada' || tab.tipo === 'enlace') {
      return <CustomTabView tab={tab} />;
    }

    switch (tab.vista_sistema) {
      case 'empresas':
        return (
          <EmpresasView
            user={EDITOR_USER}
            onNotify={notify}
            onOpenInterview={handleOpenInterviewFromCompany}
          />
        );
      case 'entrevistas':
        return (
          <EntrevistasView
            user={EDITOR_USER}
            initialOpenId={openInterviewId}
            onClearInitialOpen={() => setOpenInterviewId(null)}
            onOpenBancoPreguntas={openEditorTab}
            onNotify={notify}
          />
        );
      case 'resultados':
        return <ResultadosView user={EDITOR_USER} onNotify={notify} />;
      case 'dashboard':
        return <DashboardView user={EDITOR_USER} onNavigate={(key) => setActiveTabKey(key)} />;
      case 'diagnostico':
        return <DiagnosticoView user={EDITOR_USER} onNotify={notify} />;
      case 'informes':
        return <InformesView onNotify={notify} />;
      case 'banco':
        return <BancoPreguntasView onNotify={notify} />;
      case 'admin':
      default:
        return (
          <AdminView
            editorUser={EDITOR_USER}
            tabs={tabs}
            onTabsChanged={loadTabs}
            onOpenInterview={handleOpenInterviewFromCompany}
            onNotify={notify}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-[#0F2942] text-white border-r border-slate-800">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/30 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-sky-300" />
            </div>
            <span className="text-sm font-bold leading-tight tracking-tight">
              Sistema de Diagnóstico Empresarial
            </span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleTabs.map((item) => {
            const Icon = resolveTabIcon(item.icono);
            const active = activeTabKey === item.clave;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTabKey(item.clave)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.titulo}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="text-xs">
            <p className="font-semibold text-white">Edición Abierta</p>
            <p className="text-slate-400 text-[11px] mt-0.5">
              Acceso directo a formularios y configuración
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/50" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative w-64 max-w-[80vw] bg-[#0F2942] text-white flex flex-col z-50">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <span className="text-sm font-bold">Diagnóstico Empresarial</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {visibleTabs.map((item) => {
                const Icon = resolveTabIcon(item.icono);
                const active = activeTabKey === item.clave;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTabKey(item.clave);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      active ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.titulo}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline">Sistema de Diagnóstico Empresarial</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <span className="font-semibold text-slate-900 truncate">{currentNavLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 text-xs">
            <span className="text-slate-500 hidden sm:inline">
              Edición directa habilitada
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-[1440px] w-full mx-auto">
          {renderTabContent(activeTabObj)}
        </main>
      </div>

      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
    </div>
  );
}
