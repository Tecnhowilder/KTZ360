// BRIVIA ENGINE V2 — Motor de reglas: evalúa una línea de servicio del
// catálogo maestro (materiales, mano de obra, equipos) y agrega cotizaciones.

import { evalBool, evalNumber, type Expr, type ExprContext } from './expr';

export type { Expr };

// ---------------------------------------------------------------------------
// Tipos de catálogo (forma esperada de getServiceWithRules)
// ---------------------------------------------------------------------------

export type UnitBasis = 'area' | 'point' | 'length' | 'global';

export interface CatalogMaterial {
  id: string;
  name: string;
  unit: string;
  precio_minimo: number;
  precio_sugerido: number;
  precio_maximo: number;
  packaging_unit: string | null;
  packaging_size: number | null;
  unidad_tecnica: string | null;
  precio_empaque: number | null;
  incluye_iva: boolean;
}

export interface MaterialAlternative {
  id: string;
  alternative_material_id: string;
  tier_id: string | null;
  material: CatalogMaterial;
}

export interface MaterialRule {
  id: string;
  variant_id: string | null;
  material_id: string;
  quantity_expr: Expr;
  waste_pct: number;
  condition_expr: Expr | null;
  round_to_package: boolean;
  label_override: string | null;
  is_primary: boolean;
  sort_order: number;
  material: CatalogMaterial;
  alternatives?: MaterialAlternative[];
}

export interface LaborRule {
  id: string;
  variant_id: string | null;
  name: string;
  unit: string;
  precio_minimo: number;
  precio_sugerido: number;
  precio_maximo: number;
  quantity_expr: Expr;
  condition_expr: Expr | null;
  sort_order: number;
}

export type EquipmentRule = LaborRule;

export interface CatalogQuestionOption {
  id: string;
  value: string;
  label: string;
  sort_order: number;
  metadata: Record<string, unknown>;
}

export interface CatalogQuestion {
  id: string;
  variant_id: string | null;
  key: string;
  label: string;
  help_text: string | null;
  type: 'number' | 'boolean' | 'select' | 'multiselect';
  unit: string | null;
  default_value: unknown;
  min: number | null;
  max: number | null;
  visible_if: Expr | null;
  sort_order: number;
  required: boolean;
  options: CatalogQuestionOption[];
}

export interface CatalogVariant {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sort_order: number;
}

export interface ServiceWithRules {
  id: string;
  category_id: string;
  key: string;
  name: string;
  description: string | null;
  image_path: string | null;
  unit_basis: UnitBasis;
  unit_label: string;
  sort_order: number;
  variants: CatalogVariant[];
  questions: CatalogQuestion[];
  materialRules: MaterialRule[];
  laborRules: LaborRule[];
  equipmentRules: EquipmentRule[];
}

// ---------------------------------------------------------------------------
// Línea de servicio calculada
// ---------------------------------------------------------------------------

export type LineItemKind = 'material' | 'labor' | 'equipment';

export interface LineItem {
  ref_id: string;
  kind: LineItemKind;
  name: string;
  unit: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
  /** Solo para materiales: alternativas disponibles para este renglón. */
  alternatives?: { id: string; name: string; unitPrice: number }[];
  selected_material_id?: string;
  /** Solo para materiales: indica si es el "material principal" del renglón (ej. la baldosa, no el pegante). */
  is_primary?: boolean;
  /** Solo para materiales: cantidad antes de aplicar desperdicio/empaque, para el anexo técnico. */
  base_qty?: number;
  /** Solo para materiales: % de desperdicio aplicado, para el anexo técnico. */
  waste_pct?: number;
  /** Solo para materiales: tamaño de empaque si la cantidad se redondeó a empaque completo (en `technical_unit` cuando aplica). */
  packaging_size?: number;
  /** Solo para materiales en modo empaque: unidad técnica original (kg/m²) para el anexo técnico. */
  technical_unit?: string;
  /** Solo para material principal en modo m²: cantidad de empaques (cajas) requeridos. */
  package_qty?: number;
  /** Solo para material principal en modo m²: unidad comercial del empaque (ej. 'Caja'). */
  package_unit?: string;
  /** Solo para material principal en modo m²: precio del empaque (caja), ya sin IVA. */
  package_price?: number;
  /** Solo para material principal en modo m²: cobertura (m²) de cada empaque/caja. */
  coverage_per_package?: number;
}

export interface ServiceLine {
  id: string;
  service_id: string;
  service_name: string;
  variant_id: string | null;
  variant_name: string | null;
  unit_basis: UnitBasis;
  unit_label: string;
  quantity_basis: number;
  answers: Record<string, unknown>;
  materials: LineItem[];
  labor: LineItem[];
  equipment: LineItem[];
  lineTotal: number;
}

/** key = `${entity_type}:${entity_id}` -> precio personalizado del workspace. */
export type PriceOverrideMap = Map<string, number>;

function applies(rule: { variant_id: string | null; condition_expr: Expr | null }, variantId: string | null, ctx: ExprContext): boolean {
  if (rule.variant_id && rule.variant_id !== variantId) return false;
  if (rule.condition_expr && !evalBool(rule.condition_expr, ctx)) return false;
  return true;
}

export function computeServiceLine(
  service: ServiceWithRules,
  variantId: string | null,
  quantityBasis: number,
  answers: Record<string, unknown>,
  priceOverrides: PriceOverrideMap = new Map(),
  taxRate: number = 19,
): ServiceLine {
  const ctx = { area: quantityBasis, qty: quantityBasis, ...answers } as unknown as ExprContext;

  /** Convierte un precio "como lo digita el usuario" a precio base sin IVA. */
  const toBase = (price: number, incluyeIva: boolean) => incluyeIva ? price / (1 + taxRate / 100) : price;

  const materials: LineItem[] = service.materialRules
    .filter(r => applies(r, variantId, ctx))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(r => {
      const baseQty = evalNumber(r.quantity_expr, ctx);
      let qtyAfterWaste = baseQty;
      if (r.waste_pct > 0) qtyAfterWaste *= 1 + r.waste_pct / 100;

      const m = r.material;
      let qty = qtyAfterWaste;
      let unit = m.unit;
      let unitPrice = toBase(priceOverrides.get(`material:${r.material_id}`) ?? m.precio_sugerido, m.incluye_iva);
      let packaging_size: number | undefined;
      let technical_unit: string | undefined;
      let package_qty: number | undefined;
      let package_unit: string | undefined;
      let package_price: number | undefined;
      let coverage_per_package: number | undefined;

      if (m.unidad_tecnica && m.packaging_size && m.precio_empaque != null) {
        const packageBase = toBase(priceOverrides.get(`material:${r.material_id}`) ?? m.precio_empaque, m.incluye_iva);

        if (r.is_primary) {
          // Material principal (ej. baldosa): mostrar por m² (unidad técnica), con
          // cajas/cobertura solo como información de empaque para el anexo técnico.
          qty = Math.round(qtyAfterWaste * 100) / 100;
          unit = m.unidad_tecnica;
          unitPrice = packageBase / m.packaging_size;
          technical_unit = m.unidad_tecnica;
          packaging_size = m.packaging_size;
          package_qty = Math.ceil(qtyAfterWaste / m.packaging_size);
          package_unit = m.unit;
          package_price = packageBase;
          coverage_per_package = m.packaging_size;
        } else {
          // Material auxiliar (ej. pegante/fragua): se cotiza por empaque comercial (caja/bulto).
          packaging_size = m.packaging_size;
          technical_unit = m.unidad_tecnica;
          qty = Math.ceil(qtyAfterWaste / m.packaging_size);
          unit = m.unit;
          unitPrice = packageBase;
        }
      } else if (r.round_to_package && m.packaging_size) {
        qty = Math.ceil(qtyAfterWaste / m.packaging_size) * m.packaging_size;
        packaging_size = m.packaging_size;
      }

      return {
        ref_id: r.id,
        kind: 'material' as const,
        name: r.label_override ?? m.name,
        unit,
        qty,
        unitPrice,
        subtotal: qty * unitPrice,
        selected_material_id: r.material_id,
        alternatives: r.alternatives?.map(a => ({
          id: a.alternative_material_id,
          name: a.material.name,
          unitPrice: toBase(priceOverrides.get(`material:${a.alternative_material_id}`) ?? a.material.precio_sugerido, a.material.incluye_iva),
        })),
        is_primary: r.is_primary,
        base_qty: baseQty,
        waste_pct: r.waste_pct,
        packaging_size,
        technical_unit,
        package_qty,
        package_unit,
        package_price,
        coverage_per_package,
      };
    });

  const labor: LineItem[] = service.laborRules
    .filter(r => applies(r, variantId, ctx))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(r => {
      const qty = evalNumber(r.quantity_expr, ctx);
      const unitPrice = priceOverrides.get(`labor:${r.id}`) ?? r.precio_sugerido;
      return { ref_id: r.id, kind: 'labor' as const, name: r.name, unit: r.unit, qty, unitPrice, subtotal: qty * unitPrice };
    });

  const equipment: LineItem[] = service.equipmentRules
    .filter(r => applies(r, variantId, ctx))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(r => {
      const qty = evalNumber(r.quantity_expr, ctx);
      const unitPrice = priceOverrides.get(`equipment:${r.id}`) ?? r.precio_sugerido;
      return { ref_id: r.id, kind: 'equipment' as const, name: r.name, unit: r.unit, qty, unitPrice, subtotal: qty * unitPrice };
    });

  const lineTotal = [...materials, ...labor, ...equipment].reduce((a, i) => a + i.subtotal, 0);
  const variant = service.variants.find(v => v.id === variantId) ?? null;

  return {
    id: crypto.randomUUID(),
    service_id: service.id,
    service_name: service.name,
    variant_id: variantId,
    variant_name: variant?.name ?? null,
    unit_basis: service.unit_basis,
    unit_label: service.unit_label,
    quantity_basis: quantityBasis,
    answers,
    materials,
    labor,
    equipment,
    lineTotal,
  };
}

// ---------------------------------------------------------------------------
// Cálculo agregado de cotización (AIU + IVA + descuento)
// ---------------------------------------------------------------------------

/** Régimen de IVA aplicado a la cotización. */
export type TaxMode = 'none' | 'materials' | 'materials_labor' | 'custom';

export interface QuoteCalcConfig {
  adminPct: number;
  imprevistosPct: number;
  util: number;
  taxMode: TaxMode;
  taxRate: number;
  discount: number;
  discountOn: boolean;
  transportCost: number;
  transportEnabled: boolean;
}

export interface CalcResultV2 {
  lines: ServiceLine[];
  materials: number;
  labor: number;
  equipment: number;
  subtotal: number;
  adminAmt: number;
  imprevistosAmt: number;
  utilAmt: number;
  afterAiu: number;
  discAmt: number;
  afterDisc: number;
  taxMode: TaxMode;
  taxRate: number;
  taxBase: number;
  ivaAmt: number;
  transportAmt: number;
  materialsIvaAmt: number;
  materialsTotal: number;
  total: number;
}

/** Base sobre la que se calcula el IVA, según el régimen tributario configurado. */
function computeTaxBase(taxMode: TaxMode, materials: number, labor: number, equipment: number): number {
  switch (taxMode) {
    case 'none': return 0;
    case 'materials': return materials;
    case 'materials_labor':
    case 'custom':
    default: return materials + labor + equipment;
  }
}

export function computeQuote(lines: ServiceLine[], cfg: QuoteCalcConfig): CalcResultV2 {
  const materials = lines.reduce((a, l) => a + l.materials.reduce((b, i) => b + i.subtotal, 0), 0);
  const labor = lines.reduce((a, l) => a + l.labor.reduce((b, i) => b + i.subtotal, 0), 0);
  const equipment = lines.reduce((a, l) => a + l.equipment.reduce((b, i) => b + i.subtotal, 0), 0);
  const subtotal = materials + labor + equipment;

  const adminAmt = subtotal * cfg.adminPct / 100;
  const imprevistosAmt = subtotal * cfg.imprevistosPct / 100;
  const utilAmt = subtotal * cfg.util / 100;
  const afterAiu = subtotal + adminAmt + imprevistosAmt + utilAmt;

  const discAmt = cfg.discountOn ? afterAiu * cfg.discount / 100 : 0;
  const afterDisc = afterAiu - discAmt;
  const taxBase = computeTaxBase(cfg.taxMode, materials, labor, equipment);
  const ivaAmt = taxBase * cfg.taxRate / 100;
  const transportAmt = cfg.transportEnabled ? cfg.transportCost : 0;
  const total = afterDisc + ivaAmt + transportAmt;

  const materialsIvaAmt = cfg.taxMode !== 'none' ? materials * cfg.taxRate / 100 : 0;
  const materialsTotal = materials + materialsIvaAmt;

  return {
    lines, materials, labor, equipment, subtotal, adminAmt, imprevistosAmt, utilAmt, afterAiu, discAmt, afterDisc,
    taxMode: cfg.taxMode, taxRate: cfg.taxRate, taxBase, ivaAmt, transportAmt, materialsIvaAmt, materialsTotal, total,
  };
}

/** Clave de agrupación de un material: mismo material del catálogo = misma fila consolidada. */
export function materialGroupKey(item: LineItem): string {
  return item.selected_material_id ?? item.ref_id;
}

export interface ConsolidatedMaterial {
  key: string;
  item: LineItem;
  /** Servicios/variantes que comparten este material. */
  contexts: string[];
}

/**
 * Consolida los materiales de todas las líneas en una sola fila por material del
 * catálogo (ej. un solo "Pegante para cerámica" sumando lo necesario para varios
 * pisos). Para materiales auxiliares empacados (pegante/fragua) suma las
 * cantidades técnicas (kg) antes de redondear a empaques completos, evitando
 * comprar más empaques de los necesarios.
 */
export function consolidateMaterials(lines: ServiceLine[]): ConsolidatedMaterial[] {
  const order: string[] = [];
  const items = new Map<string, LineItem>();
  const contexts = new Map<string, Set<string>>();

  lines.forEach((l) => {
    const context = l.service_name + (l.variant_name ? ' · ' + l.variant_name : '');
    l.materials.forEach((m) => {
      const key = materialGroupKey(m);
      const existing = items.get(key);
      if (!existing) {
        order.push(key);
        items.set(key, { ...m });
        contexts.set(key, new Set([context]));
        return;
      }
      contexts.get(key)!.add(context);
      if (m.technical_unit && m.packaging_size && !m.is_primary) {
        const prevTech = (existing.base_qty ?? 0) * (1 + (existing.waste_pct ?? 0) / 100);
        const curTech = (m.base_qty ?? 0) * (1 + (m.waste_pct ?? 0) / 100);
        const totalTech = prevTech + curTech;
        existing.base_qty = totalTech;
        existing.waste_pct = 0;
        existing.qty = Math.ceil(totalTech / m.packaging_size);
        existing.subtotal = existing.qty * existing.unitPrice;
      } else {
        existing.qty += m.qty;
        existing.subtotal += m.subtotal;
        if (existing.base_qty != null && m.base_qty != null) existing.base_qty += m.base_qty;
      }
    });
  });

  return order.map((key) => ({ key, item: items.get(key)!, contexts: [...contexts.get(key)!] }));
}

/** Agrupa todos los renglones de la cotización en material principal, auxiliares, mano de obra y otros. */
export function groupLineItems(lines: ServiceLine[]): { principal: LineItem[]; auxiliares: LineItem[]; labor: LineItem[]; otros: LineItem[] } {
  const principal: LineItem[] = [];
  const auxiliares: LineItem[] = [];
  const labor: LineItem[] = [];
  const otros: LineItem[] = [];
  lines.forEach(l => {
    l.materials.forEach(m => (m.is_primary ? principal : auxiliares).push(m));
    labor.push(...l.labor);
    otros.push(...l.equipment);
  });
  return { principal, auxiliares, labor, otros };
}

// ---------------------------------------------------------------------------
// Documento / PDF
// ---------------------------------------------------------------------------

export interface DocItem {
  no: string;
  desc: string;
  unit: string;
  qty: number;
  unitPrice: number;
  total: number;
  kind: LineItemKind;
}

/** Nivel de detalle del documento final (PDF). */
export type DocDetailLevel = 'resumen' | 'estandar' | 'detallado' | 'tecnico';

export interface CalcDocResultV2 {
  items: DocItem[];
  materialsAmt: number;
  laborAmt: number;
  equipmentAmt: number;
  subtotal: number;
  adminPct: number;
  adminAmt: number;
  imprevistosPct: number;
  imprevistosAmt: number;
  utilPct: number;
  utilAmt: number;
  afterAiu: number;
  discPct: number;
  discAmt: number;
  afterDisc: number;
  taxMode: TaxMode;
  taxRate: number;
  taxBase: number;
  ivaAmt: number;
  transportAmt: number;
  materialsIvaAmt: number;
  materialsTotal: number;
  total: number;
}

/** Construye las filas de la tabla del documento según el nivel de detalle elegido. */
export function buildDocRows(lines: ServiceLine[], detailLevel: DocDetailLevel): DocItem[] {
  const rows: DocItem[] = [];
  let n = 0;
  const push = (desc: string, unit: string, qty: number, unitPrice: number, total: number, kind: LineItemKind = 'material') => {
    n++;
    rows.push({ no: String(n).padStart(2, '0'), desc, unit, qty, unitPrice, total, kind });
  };

  if (detailLevel === 'resumen') {
    lines.forEach(l => {
      const desc = 'Suministro e instalación de ' + l.service_name + (l.variant_name ? ' · ' + l.variant_name : '');
      const qty = l.quantity_basis;
      const unitPrice = qty > 0 ? l.lineTotal / qty : l.lineTotal;
      push(desc, l.unit_label, qty || 1, unitPrice, l.lineTotal);
    });
    return rows;
  }

  if (detailLevel === 'estandar') {
    lines.forEach(l => {
      const context = l.service_name + (l.variant_name ? ' · ' + l.variant_name : '');
      const principal = l.materials.find(m => m.is_primary);
      if (principal) {
        push(context + ' — ' + principal.name, principal.unit, principal.qty, principal.unitPrice, principal.subtotal, 'material');
      }
      if (l.labor.length > 0) {
        const sub = l.labor.reduce((a, m) => a + m.subtotal, 0);
        push(context + ' — Mano de obra', l.unit_label, l.quantity_basis || 1, sub / (l.quantity_basis || 1), sub, 'labor');
      }
      if (l.equipment.length > 0) {
        const sub = l.equipment.reduce((a, m) => a + m.subtotal, 0);
        push(context + ' — Otros', l.unit_label, l.quantity_basis || 1, sub / (l.quantity_basis || 1), sub, 'equipment');
      }
    });
    const auxiliares = consolidateMaterials(lines).filter(c => !c.item.is_primary);
    if (auxiliares.length > 0) {
      const sub = auxiliares.reduce((a, c) => a + c.item.subtotal, 0);
      push('Materiales auxiliares (pegantes, fraguas, etc.)', '—', 1, sub, sub, 'material');
    }
    return rows;
  }

  // detallado / tecnico: una fila por material consolidado + mano de obra/otros por línea
  consolidateMaterials(lines).forEach(c => {
    const ctx = c.contexts.join(' + ');
    push(ctx + ' — ' + c.item.name, c.item.unit, c.item.qty, c.item.unitPrice, c.item.subtotal, 'material');
  });
  lines.forEach(l => {
    const context = l.service_name + (l.variant_name ? ' · ' + l.variant_name : '');
    [...l.labor, ...l.equipment].forEach(item => {
      push(context + ' — ' + item.name, item.unit, item.qty, item.unitPrice, item.subtotal, item.kind);
    });
  });
  return rows;
}

export function computeDoc(lines: ServiceLine[], cfg: QuoteCalcConfig, detailLevel: DocDetailLevel = 'resumen'): CalcDocResultV2 {
  const items = buildDocRows(lines, detailLevel);

  const materialsAmt = lines.reduce((a, l) => a + l.materials.reduce((b, i) => b + i.subtotal, 0), 0);
  const laborAmt = lines.reduce((a, l) => a + l.labor.reduce((b, i) => b + i.subtotal, 0), 0);
  const equipmentAmt = lines.reduce((a, l) => a + l.equipment.reduce((b, i) => b + i.subtotal, 0), 0);
  const subtotal = materialsAmt + laborAmt + equipmentAmt;

  const adminAmt = subtotal * cfg.adminPct / 100;
  const imprevistosAmt = subtotal * cfg.imprevistosPct / 100;
  const utilAmt = subtotal * cfg.util / 100;
  const afterAiu = subtotal + adminAmt + imprevistosAmt + utilAmt;

  const discPct = cfg.discountOn ? cfg.discount : 0;
  const discAmt = afterAiu * discPct / 100;
  const afterDisc = afterAiu - discAmt;
  const taxBase = computeTaxBase(cfg.taxMode, materialsAmt, laborAmt, equipmentAmt);
  const ivaAmt = taxBase * cfg.taxRate / 100;
  const transportAmt = cfg.transportEnabled ? cfg.transportCost : 0;
  const total = afterDisc + ivaAmt + transportAmt;

  const materialsIvaAmt = cfg.taxMode !== 'none' ? materialsAmt * cfg.taxRate / 100 : 0;
  const materialsTotal = materialsAmt + materialsIvaAmt;

  return {
    items, materialsAmt, laborAmt, equipmentAmt, subtotal,
    adminPct: cfg.adminPct, adminAmt,
    imprevistosPct: cfg.imprevistosPct, imprevistosAmt,
    utilPct: cfg.util, utilAmt,
    afterAiu, discPct, discAmt, afterDisc,
    taxMode: cfg.taxMode, taxRate: cfg.taxRate, taxBase, ivaAmt, transportAmt, materialsIvaAmt, materialsTotal, total,
  };
}

/** Texto del "motor de transparencia" mostrado en el panel de revisión y/o el PDF. */
export const TRANSPARENCY_NOTICE =
  'Los precios de materiales y mano de obra son valores sugeridos de referencia para el mercado colombiano. ' +
  'Puedes editarlos antes de generar la cotización para ajustarlos a tus proveedores y tarifas reales. ' +
  'Brivia no fija precios: tú tienes el control final de cada valor.';

export const DOC_NOTICE =
  'Las cantidades de materiales fueron calculadas automáticamente según parámetros técnicos de referencia para el tipo de trabajo seleccionado. ' +
  'Los valores pueden variar según condiciones reales de obra.';
