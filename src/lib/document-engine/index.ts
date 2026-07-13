/**
 * Document Engine — Shelwi
 *
 * Infraestructura reutilizable para cualquier documento comercial:
 * Cotizaciones, Pedidos, Remisiones, Facturas Proforma, OTs, etc.
 *
 * Módulos:
 *   calc/    → motor de cálculo (re-export de itemEngine)
 *   draft/   → borrador genérico con localStorage
 *   share/   → capacidades de compartir (PDF, WhatsApp, Email, Link)
 *   types    → tipos base del wizard
 *
 * Escalabilidad: diseñado para 5000+ usuarios.
 *   - Funciones puras sin efectos en DOM (calc)
 *   - Draft con key configurable por tipo de documento
 *   - Share desacoplado de la fuente de datos
 */

// ─── Motor de cálculo (re-exportado de itemEngine) ───────────────────────────
export {
  computeTotals,
  computeItemSubtotal,
  computeLaborSubtotal,
  buildSnapshot,
  buildQuoteTitle,
  DEFAULT_COST_CONFIG,
  type QuoteItem,
  type LaborItem,
  type CostConfig,
  type QuoteSnapshot,
  type ItemType,
} from '../itemEngine';

// ─── Tipos base del wizard ────────────────────────────────────────────────────

/** Tipo de documento que puede generar el wizard */
export type DocumentType = 'quote' | 'order' | 'remission' | 'proforma';

/** Configuración de un paso del wizard */
export interface WizardStepConfig {
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}

/** Estado genérico compartido por cualquier wizard de documento */
export interface WizardDocumentState<TItems = unknown, TCosts = unknown, TClient = unknown> {
  step: number;
  client: TClient;
  items: TItems;
  costs: TCosts;
  name: string;
}

// ─── Capacidades de compartir ─────────────────────────────────────────────────

export interface ShareCapabilities {
  pdf:       boolean;
  whatsapp:  boolean;
  email:     boolean;
  copyLink:  boolean;
}

export const FULL_SHARE_CAPABILITIES: ShareCapabilities = {
  pdf: true, whatsapp: true, email: true, copyLink: true,
};

// ─── Draft genérico ───────────────────────────────────────────────────────────
export { createDraftHooks } from './draft';
export type { BaseDraft } from './draft';
