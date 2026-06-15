/**
 * Capa centralizada de validaciones — toda la aplicación debe reutilizar
 * estas funciones para email, teléfono, porcentajes, precios y cantidades.
 * No crear validaciones dispersas en componentes.
 */

/**
 * Extrae el mensaje de error de un `unknown` lanzado por una mutación.
 * Los `PostgrestError` de Supabase no siempre son `instanceof Error` en el
 * bundle de producción, pero siempre exponen `.message` como string —
 * por eso se prioriza esa propiedad antes de caer a `instanceof Error`.
 */
export function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Filtra una entrada de texto dejando solo dígitos (y `.`/`,` si decimals=true). */
export function sanitizeNumeric(value: string, opts: { decimals?: boolean } = {}): string {
  const pattern = opts.decimals ? /[^0-9.,]/g : /[^0-9]/g;
  return value.replace(pattern, '');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

const PHONE_RE = /^[0-9+\- ]{7,}$/;

export function isValidPhone(value: string): boolean {
  return PHONE_RE.test(value.trim());
}

/** Restringe un porcentaje al rango 0-100. */
export function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function isValidPrice(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function isValidQuantity(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
