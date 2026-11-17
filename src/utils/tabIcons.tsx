import {
  Building2,
  ClipboardList,
  FileCheck2,
  ShieldCheck,
  LayoutDashboard,
  Activity,
  FileBarChart,
  HelpCircle,
  FileText,
  FolderOpen,
  Link2,
  BookOpen,
  Layers,
  Briefcase,
  CheckSquare,
  type LucideIcon,
} from 'lucide-react';

export const TAB_ICON_OPTIONS: Array<{ name: string; label: string; icon: LucideIcon }> = [
  { name: 'Building2', label: 'Empresas', icon: Building2 },
  { name: 'ClipboardList', label: 'Formulario / Lista', icon: ClipboardList },
  { name: 'FileCheck2', label: 'Resultados', icon: FileCheck2 },
  { name: 'ShieldCheck', label: 'Administración', icon: ShieldCheck },
  { name: 'LayoutDashboard', label: 'Panel / Dashboard', icon: LayoutDashboard },
  { name: 'Activity', label: 'Diagnóstico', icon: Activity },
  { name: 'FileBarChart', label: 'Informes', icon: FileBarChart },
  { name: 'HelpCircle', label: 'Preguntas', icon: HelpCircle },
  { name: 'FileText', label: 'Documento', icon: FileText },
  { name: 'FolderOpen', label: 'Carpeta / Anexos', icon: FolderOpen },
  { name: 'Link2', label: 'Enlace', icon: Link2 },
  { name: 'BookOpen', label: 'Guía / Manual', icon: BookOpen },
  { name: 'Layers', label: 'Módulos', icon: Layers },
  { name: 'Briefcase', label: 'Gestión', icon: Briefcase },
  { name: 'CheckSquare', label: 'Checklist', icon: CheckSquare },
];

export const SYSTEM_VIEW_OPTIONS: Array<{ value: string; label: string; defaultIcon: string }> = [
  { value: 'empresas', label: 'Empresas', defaultIcon: 'Building2' },
  { value: 'entrevistas', label: 'Entrevistas (Formularios)', defaultIcon: 'ClipboardList' },
  { value: 'resultados', label: 'Resultados', defaultIcon: 'FileCheck2' },
  { value: 'dashboard', label: 'Panel Principal (Estadísticas)', defaultIcon: 'LayoutDashboard' },
  { value: 'diagnostico', label: 'Diagnóstico Logístico', defaultIcon: 'Activity' },
  { value: 'informes', label: 'Informes y Exportación', defaultIcon: 'FileBarChart' },
  { value: 'banco', label: 'Banco de Preguntas', defaultIcon: 'HelpCircle' },
];

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  TAB_ICON_OPTIONS.map((opt) => [opt.name, opt.icon])
);

export function resolveTabIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] || FileText;
}
