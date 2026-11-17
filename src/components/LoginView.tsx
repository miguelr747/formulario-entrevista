import { useState, type FormEvent } from 'react';
import { Building2, Lock, User, KeyRound, ArrowRight } from 'lucide-react';
import { apiFetch, setStoredToken } from '../utils/api';
import type { Usuario } from '../types';

interface LoginViewProps {
  onLoginSuccess: (user: Usuario) => void;
  onOpenToken: (token: string) => void;
}

export function LoginView({ onLoginSuccess, onOpenToken }: LoginViewProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [evalTokenInput, setEvalTokenInput] = useState('');
  const [showTokenBox, setShowTokenBox] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch<{ token: string; user: Usuario }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setStoredToken(data.token);
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setError('');
  };

  const handleTokenSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = evalTokenInput.trim();
    if (!cleaned) return;
    // Extract token if full URL was pasted
    const match = cleaned.match(/evaluacion=([a-zA-Z0-9]+)/);
    onOpenToken(match ? match[1] : cleaned);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col lg:flex-row">
      {/* Left Institutional Panel */}
      <div className="lg:w-[44%] bg-[#0F2942] text-white p-8 sm:p-12 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-500/20 border border-sky-400/30 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-sky-300" />
            </div>
            <span className="text-lg font-bold tracking-tight">Sistema de Diagnóstico Empresarial</span>
          </div>

          <div className="mt-14 max-w-md">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-balance leading-tight">
              Levantamiento estructurado de procesos y diagnóstico logístico
            </h1>
            <p className="mt-4 text-sm sm:text-base text-slate-300 leading-relaxed">
              Plataforma corporativa para planificar entrevistas organizacionales, documentar la operación logística, evaluar evidencias y emitir informes ejecutivos.
            </p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs text-slate-300">
          <div>
            <p className="font-semibold text-white">Cuestionario Dinámico</p>
            <p className="mt-1 text-slate-400">10 módulos base con reglas condicionales e historial inmutable.</p>
          </div>
          <div>
            <p className="font-semibold text-white">Diagnóstico con Evidencia</p>
            <p className="mt-1 text-slate-400">Hallazgos trazables y madurez condicionada a criterios reales.</p>
          </div>
          <div>
            <p className="font-semibold text-white">Informes Ejecutivos</p>
            <p className="mt-1 text-slate-400">Exportación directa a PDF y hojas de cálculo Excel.</p>
          </div>
        </div>
      </div>

      {/* Right Authentication Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-7 sm:p-8 shadow-sm">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">Iniciar sesión</h2>
            <p className="text-sm text-slate-500 mt-1">
              Ingrese sus credenciales asignadas para acceder a la plataforma.
            </p>
          </div>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Usuario o correo electrónico
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ej. admin o correo@empresa.com"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingrese su contraseña"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[#0F2942] hover:bg-[#173B5E] text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{loading ? 'Verificando acceso...' : 'Ingresar al sistema'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Demo Accounts Helper */}
          <div className="mt-6 pt-5 border-t border-slate-200">
            <p className="text-xs font-medium text-slate-500 mb-2.5">
              Cuentas de acceso rápido por rol:
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => fillDemo('admin', 'Admin2026*')}
                className="px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors text-center"
              >
                Administrador
              </button>
              <button
                type="button"
                onClick={() => fillDemo('entrevistador', 'Entrevistador2026*')}
                className="px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors text-center"
              >
                Entrevistador
              </button>
              <button
                type="button"
                onClick={() => fillDemo('evaluado', 'Evaluado2026*')}
                className="px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors text-center"
              >
                Evaluado
              </button>
            </div>
          </div>

          {/* Evaluado Secure Link Toggle */}
          <div className="mt-5 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowTokenBox(!showTokenBox)}
              className="flex items-center gap-2 text-xs font-medium text-sky-700 hover:text-sky-800"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>¿Recibió un enlace o código de evaluación directa?</span>
            </button>

            {showTokenBox && (
              <form onSubmit={handleTokenSubmit} className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={evalTokenInput}
                  onChange={(e) => setEvalTokenInput(e.target.value)}
                  placeholder="Pegue el enlace o token de evaluación"
                  className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <button
                  type="submit"
                  className="px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium rounded-lg whitespace-nowrap shrink-0"
                >
                  Abrir
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
