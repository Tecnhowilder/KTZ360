// Motor de cálculo universal para cotizaciones basadas en ítems.
// Independiente de industria — no asume materiales, área ni construcción.

export type ItemType = 'PRODUCT' | 'SERVICE' | 'BUNDLE' | 'MANUAL';

// ─── Ítems regulares (aplica IVA) ────────────────────────────────────────────

export interface QuoteItem {
  id?: string;
  type: ItemType;
  item_name: string;
  description?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount: number;       // porcentaje 0-100 por ítem
  subtotal: number;       // qty * unit_price * (1 - discount/100)
  sort_order?: number;
  catalog_item_id?: string | null;
}

// ─── Mano de obra (NO aplica IVA, se suma al final) ──────────────────────────

export interface LaborItem {
  id?: string;
  item_name: string;
  description?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  subtotal: number;       // qty * unit_price (sin descuento ni IVA)
  sort_order?: number;
}

// ─── Configuración de costos ──────────────────────────────────────────────────

export interface CostConfig {
  discount_pct: number;       // descuento global sobre subtotal de ítems (%)
  discount_fixed: number;     // descuento fijo en moneda
  tax_rate: number;           // IVA % — SOLO sobre ítems (no labor ni transporte)
  tax_included: boolean;      // si el IVA ya está incluido en los precios
  overhead_pct: number;       // gastos indirectos / utilidad (%)
  advance_pct: number;        // % de anticipo sobre el total final
  valid_days: number;         // días de vigencia de la cotización
  transport_cost: number;     // costo de transporte (sin IVA)
  include_transport: boolean; // si se incluye transporte en la cotización
}

// ─── Totales ──────────────────────────────────────────────────────────────────

export interface QuoteTotals {
  subtotal: number;               // suma de item.subtotal (sin labor ni transporte)
  discount: number;               // descuento global sobre ítems
  subtotal_after_discount: number;
  overhead: number;               // gastos indirectos / utilidad
  tax: number;                    // IVA SOLO sobre (subtotal_after_discount + overhead)
  labor_total: number;            // suma de labor items (sin IVA)
  transport_cost: number;         // transporte (sin IVA)
  total: number;                  // total final
  advance: number;                // total * advance_pct/100
  balance: number;                // total - advance
}

export interface QuoteSnapshot {
  items: QuoteItem[];
  labor_items: LaborItem[];
  totals: QuoteTotals;
  config: CostConfig;
  generated_at: string;
}

// ─── Funciones de cálculo ─────────────────────────────────────────────────────

export function computeItemSubtotal(
  item: Pick<QuoteItem, 'quantity' | 'unit_price' | 'discount'>
): number {
  const base = item.quantity * item.unit_price;
  const disc = base * (item.discount / 100);
  return Math.round((base - disc) * 100) / 100;
}

export function computeLaborSubtotal(
  item: Pick<LaborItem, 'quantity' | 'unit_price'>
): number {
  return Math.round(item.quantity * item.unit_price * 100) / 100;
}

/**
 * Fórmula oficial KTZ360:
 *   subtotal              = Σ items
 *   discount              = subtotal × discount_pct (o discount_fixed)
 *   subtotal_net          = subtotal - discount
 *   overhead              = subtotal_net × overhead_pct
 *   base_for_tax          = subtotal_net + overhead
 *   tax                   = base_for_tax × tax_rate  ← SOLO productos/servicios
 *   labor_total           = Σ labor_items             ← sin IVA
 *   transport_cost        = config.transport_cost     ← sin IVA (si include_transport)
 *   total                 = base_for_tax + tax + labor_total + transport_cost
 */
export function computeTotals(
  items: QuoteItem[],
  config: CostConfig,
  laborItems: LaborItem[] = []
): QuoteTotals {
  const subtotal = items.reduce((sum, it) => sum + it.subtotal, 0);

  const discountGlobal = config.discount_fixed > 0
    ? config.discount_fixed
    : subtotal * (config.discount_pct / 100);
  const subtotalAfterDiscount = Math.max(0, subtotal - discountGlobal);

  const overhead = subtotalAfterDiscount * (config.overhead_pct / 100);
  const baseForTax = subtotalAfterDiscount + overhead;

  const tax = config.tax_included ? 0 : baseForTax * (config.tax_rate / 100);

  const laborTotal  = laborItems.reduce((sum, it) => sum + it.subtotal, 0);
  const transportCost = config.include_transport ? (config.transport_cost ?? 0) : 0;

  const total   = baseForTax + tax + laborTotal + transportCost;
  const advance = total * (config.advance_pct / 100);
  const balance = total - advance;

  return {
    subtotal:               Math.round(subtotal),
    discount:               Math.round(discountGlobal),
    subtotal_after_discount: Math.round(subtotalAfterDiscount),
    overhead:               Math.round(overhead),
    tax:                    Math.round(tax),
    labor_total:            Math.round(laborTotal),
    transport_cost:         Math.round(transportCost),
    total:                  Math.round(total),
    advance:                Math.round(advance),
    balance:                Math.round(balance),
  };
}

export function buildSnapshot(
  items: QuoteItem[],
  config: CostConfig,
  laborItems: LaborItem[] = []
): QuoteSnapshot {
  return {
    items,
    labor_items: laborItems,
    totals: computeTotals(items, config, laborItems),
    config,
    generated_at: new Date().toISOString(),
  };
}

export function buildQuoteTitle(items: QuoteItem[], projectName?: string): string {
  if (projectName?.trim()) return projectName.trim();
  if (items.length === 0) return 'Nueva cotización';
  if (items.length === 1) return items[0].item_name;
  return items[0].item_name + ` + ${items.length - 1} más`;
}

// Valores por defecto — IVA 19% Colombia, sin descuentos ni anticipos
export const DEFAULT_COST_CONFIG: CostConfig = {
  discount_pct:      0,
  discount_fixed:    0,
  tax_rate:          19,
  tax_included:      false,
  overhead_pct:      0,
  advance_pct:       0,
  valid_days:        15,
  transport_cost:    0,
  include_transport: false,
};
