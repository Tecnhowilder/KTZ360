/**
 * Formato de moneda oficial para KTZ360.
 * SIEMPRE muestra el número completo — nunca abreviado.
 *
 * Correcto:  $ 1.741.927   $ 125.000.000   $ 450.000
 * Incorrecto: $1.7M         $125M            $450k
 *
 * Usar esta función en TODA la aplicación:
 *   PDF, Vista previa, Dashboard, Detalle, Portal, WhatsApp, Correo, Listas
 */
export function formatCurrencyCOP(amount: number): string {
  return '$ ' + Math.round(amount).toLocaleString('es-CO');
}

/** Versión compacta SOLO para espacios muy reducidos (badges, chips).
 *  PROHIBIDA en PDF, vista previa, portal y mensajes de share. */
export function formatCurrencyCOPCompact(amount: number): string {
  if (amount >= 1_000_000_000) return '$ ' + (amount / 1_000_000_000).toFixed(1).replace('.0', '') + 'B';
  if (amount >= 1_000_000)     return '$ ' + (amount / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (amount >= 1_000)         return '$ ' + (amount / 1_000).toFixed(0) + 'k';
  return '$ ' + amount;
}
