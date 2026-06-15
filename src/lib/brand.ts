/** Identidad de marca — KTZ360. Configurable vía variables de entorno (VITE_*). */
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'KTZ360';
export const APP_SLOGAN = import.meta.env.VITE_APP_SLOGAN || 'Cotiza · Planifica · Construye';
export const APP_URL = import.meta.env.VITE_APP_URL || 'https://ktz360.app';
export const COMPANY_NAME = import.meta.env.VITE_COMPANY_NAME || APP_NAME;

export const BRAND_COLORS = {
  primary: '#2563EB',
  accent: '#06B6D4',
  white: '#FFFFFF',
  dark: '#0F172A',
} as const;
