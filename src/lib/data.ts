import type { Company } from './types';

export const STEP_TITLES = ['Cliente', 'Proyecto', 'Servicio', 'Medidas', 'Materiales', 'Costos', 'Resumen', 'Compartir'];
export const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const DEFAULT_COMPANY: Company = { name: 'Mi Empresa', nit: '', phone: '', city: '', email: '' };
