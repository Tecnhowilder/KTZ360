/** Identidad de marca — Shelwi. Fuente de verdad para todo el proyecto. */
export const APP_NAME          = import.meta.env.VITE_APP_NAME           || 'Shelwi';
export const APP_SHORT_NAME    = import.meta.env.VITE_APP_SHORT_NAME      || 'Shelwi';
export const APP_SLOGAN        = import.meta.env.VITE_APP_SLOGAN          || 'Cotiza · Gestiona · Crece';
export const APP_TAGLINE       = import.meta.env.VITE_APP_TAGLINE         || 'Cotiza. Gestiona. Crece.';
export const APP_URL           = import.meta.env.VITE_APP_URL             || 'https://shelwi.com';
export const APP_SUPPORT_EMAIL = import.meta.env.VITE_APP_SUPPORT_EMAIL   || 'soporte@shelwi.com';
export const APP_COPYRIGHT     = `© ${APP_NAME}`;
export const COMPANY_NAME      = import.meta.env.VITE_COMPANY_NAME        || APP_NAME;

export const BRAND_COLORS = {
  primary: '#2563EB',
  accent:  '#F97316',
  white:   '#FFFFFF',
  dark:    '#0F172A',
} as const;
