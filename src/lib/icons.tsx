import type { CSSProperties } from 'react';

interface IconProps {
  path: string;
  size?: number | string;
  style?: CSSProperties;
}

/** Renderiza un set de paths SVG dentro del wrapper estándar (24x24, stroke currentColor). */
export function Icon({ path, size = '100%', style }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      style={style}
      dangerouslySetInnerHTML={{ __html: path }}
    />
  );
}

export const NAV_ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  cotizaciones: '<rect x="5" y="3" width="14" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/>',
  clientes: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20v-1a5.5 5.5 0 0 1 11 0v1"/><path d="M16 5.5a3 3 0 0 1 0 5.6"/><path d="M17 14.5a5 5 0 0 1 3.5 4.5"/>',
  plantillas: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  materiales: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 8l3-5h12l3 5"/><line x1="12" y1="8" x2="12" y2="21"/>',
  reportes: '<line x1="6" y1="20" x2="6" y2="13"/><line x1="12" y1="20" x2="12" y2="7"/><line x1="18" y1="20" x2="18" y2="10"/>',
  ia: '<rect x="6" y="6" width="12" height="12" rx="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="9.5" cy="11" r="1"/><circle cx="14.5" cy="11" r="1"/>',
  empresa: '<rect x="4" y="8" width="16" height="13" rx="2"/><path d="M9 8V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3"/>',
  team: '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20v-1a6.5 6.5 0 0 1 13 0v1"/><circle cx="17" cy="7" r="2.5"/><path d="M16 12.2a5 5 0 0 1 5.5 5.8"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  admin: '<path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/>',
} as const;

export type NavId = keyof typeof NAV_ICONS;

export const NAV_ITEMS: { id: NavId; label: string; badge?: boolean }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'cotizaciones', label: 'Cotizaciones' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'plantillas', label: 'Plantillas' },
  { id: 'materiales', label: 'Materiales' },
  { id: 'reportes', label: 'Reportes' },
  { id: 'ia', label: 'Shelwi IA', badge: true },
  { id: 'empresa', label: 'Mi Empresa' },
  { id: 'team', label: 'Equipo y usuarios' },
  { id: 'config', label: 'Configuración' },
];

export const BOTTOM_NAV_ITEMS: { id: NavId; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'cotizaciones', label: 'Cotiz.' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'reportes', label: 'Reportes' },
];

export const COPY_ICON_PATH = '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>';

export const KPI_ICONS = {
  doc: '<rect x="5" y="3" width="14" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/>',
  users: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20v-1a7 7 0 0 1 14 0v1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
} as const;

export const EMPTY_ICONS = {
  proyectos: '<path d="M3 21V8l9-5 9 5v13"/><rect x="9.5" y="13" width="5" height="8"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
} as const;
