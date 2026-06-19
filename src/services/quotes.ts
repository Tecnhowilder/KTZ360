import { supabase } from '../lib/supabaseClient';
import { computeQuote, computeDoc, type ServiceLine } from '../lib/engine';
import type { Quote, QuoteStatus, TaxMode, DocDetailLevel } from '../lib/types';
import { buildSnapshot as buildItemSnapshot, buildQuoteTitle, type QuoteItem, type LaborItem, type CostConfig } from '../lib/itemEngine';
import { bulkInsertQuoteItems } from './quoteItems';

// ─── V2: Cotizaciones basadas en ítems universales ────────────────────────────

export interface QuoteWithItemsInput {
  client_id?: string | null;
  title?: string;
  notes?: string | null;
  valid_days?: number;
  items: QuoteItem[];
  laborItems?: LaborItem[];
  costConfig: CostConfig;
  /** Términos y condiciones de la empresa — se copian a la cotización */
  termsConditions?: string[];
}

export async function createQuoteWithItems(
  workspaceId: string,
  userId: string,
  input: QuoteWithItemsInput
): Promise<Quote> {
  const laborItems = input.laborItems ?? [];
  const snapshot = buildItemSnapshot(input.items, input.costConfig, laborItems);
  const title = input.title?.trim() || buildQuoteTitle(input.items);

  // Payload base — siempre compatible con el schema actual (sin columnas nuevas)
  const basePayload: Record<string, unknown> = {
    workspace_id: workspaceId,
    created_by: userId,
    client_id: input.client_id ?? null,
    title,
    notes: input.notes ?? null,
    valid_days: input.valid_days ?? input.costConfig.valid_days ?? 15,
    // Campos legacy requeridos por la tabla (cotización v1 engine)
    service_lines: [],
    admin_pct: input.costConfig.overhead_pct,
    imprevistos_pct: 0,
    util: 0,
    // 'none' es siempre válido; el IVA lo maneja itemEngine
    tax_mode: 'none' as TaxMode,
    tax_rate: input.costConfig.tax_rate,
    advance_pct: input.costConfig.advance_pct,
    doc_detail_level: 'estandar' as DocDetailLevel,
    include_technical_annex: false,
    terms_conditions: input.termsConditions ?? [],
    discount: input.costConfig.discount_pct,
    discount_on: input.costConfig.discount_pct > 0,
    transport_cost: 0,
    transport_enabled: false,
    // calc_snapshot guarda los totales para compatibilidad con vistas legacy
    calc_snapshot: {
      total: snapshot.totals.total,
      subtotal: snapshot.totals.subtotal,
      tax: snapshot.totals.tax,
      discount: snapshot.totals.discount,
      advance: snapshot.totals.advance,
      balance: snapshot.totals.balance,
    },
    doc_items: [],
  };

  // Intentar insertar con snapshot_items (requiere migración 0029 aplicada).
  // Si la columna no existe, la BD rechazará con un error descriptivo.
  // Para mayor robustez hacemos el intento con y sin la columna.
  let quote: Quote | null = null;

  try {
    const { data, error } = await supabase
      .from('quotes')
      .insert({ ...basePayload, snapshot_items: snapshot } as never)
      .select('*')
      .single();
    if (error) throw error;
    quote = data;
  } catch (firstErr: unknown) {
    // Si falló porque la columna no existe (migración 0029 pendiente), reintentar sin ella
    const msg = (firstErr as Error)?.message ?? '';
    if (msg.includes('snapshot_items') || msg.includes('column')) {
      const { data, error } = await supabase
        .from('quotes')
        .insert(basePayload as never)
        .select('*')
        .single();
      if (error) throw error;
      quote = data;
    } else {
      throw firstErr;
    }
  }

  if (!quote) throw new Error('No se pudo crear la cotización');

  // Insertar ítems relacionales (requiere migración 0029)
  if (input.items.length > 0) {
    try {
      await bulkInsertQuoteItems(quote.id, workspaceId, input.items);
    } catch {
      // Si quote_items aún no existe (migración pendiente), la cotización se guarda
      // sin ítems relacionales — se usan los snapshot_items del JSON.
    }
  }

  return quote;
}

export async function updateQuoteWithItems(
  quoteId: string,
  workspaceId: string,
  userId: string,
  input: QuoteWithItemsInput
): Promise<Quote> {
  const laborItems = input.laborItems ?? [];
  const snapshot   = buildItemSnapshot(input.items, input.costConfig, laborItems);
  const title      = input.title?.trim() || buildQuoteTitle(input.items);

  // Guardar revisión antes de actualizar
  const current = await getQuote(quoteId);
  try {
    await (supabase as any)
      .from('quote_revisions')
      .insert({
        quote_id: quoteId,
        workspace_id: workspaceId,
        edited_by: userId,
        previous_snapshot: { ...(current as any).snapshot_items ?? {}, title: current.title },
        changes_summary: { title, items_count: input.items.length, labor_count: laborItems.length },
      });
  } catch { /* revisiones son opcionales — no bloquear si tabla no existe */ }

  // Actualizar quote principal
  const updatePayload: Record<string, unknown> = {
    title,
    notes: input.notes ?? null,
    valid_days: input.valid_days ?? input.costConfig.valid_days ?? 15,
    tax_mode: 'none' as TaxMode,
    tax_rate: input.costConfig.tax_rate,
    advance_pct: input.costConfig.advance_pct,
    discount: input.costConfig.discount_pct,
    discount_on: input.costConfig.discount_pct > 0,
    calc_snapshot: {
      total: snapshot.totals.total,
      subtotal: snapshot.totals.subtotal,
      tax: snapshot.totals.tax,
      discount: snapshot.totals.discount,
      advance: snapshot.totals.advance,
      balance: snapshot.totals.balance,
      transport_cost: snapshot.totals.transport_cost,
    },
    doc_items: [],
  };
  try {
    updatePayload.snapshot_items = snapshot;
  } catch { /* ignorar si columna no existe */ }

  const { data: quote, error } = await supabase
    .from('quotes')
    .update(updatePayload as never)
    .eq('id', quoteId)
    .select('*')
    .single();
  if (error) throw error;

  // Reemplazar quote_items: borrar todos + reinsertar
  try {
    await (supabase as any).from('quote_items').delete().eq('quote_id', quoteId);
    if (input.items.length > 0) {
      await bulkInsertQuoteItems(quoteId, workspaceId, input.items);
    }
  } catch { /* si quote_items no existe, continuar */ }

  return quote;
}

export async function listQuotes(workspaceId: string): Promise<Quote[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getQuote(id: string): Promise<Quote> {
  const { data, error } = await supabase.from('quotes').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export interface QuoteInput {
  client_id?: string | null;
  project_id?: string | null;
  title: string;
  location?: string | null;
  project_type?: string | null;
  notes?: string | null;
  service_lines: ServiceLine[];
  admin_pct: number;
  imprevistos_pct: number;
  util: number;
  tax_mode: TaxMode;
  tax_rate: number;
  advance_pct: number;
  doc_detail_level: DocDetailLevel;
  include_technical_annex: boolean;
  terms_conditions: string[];
  discount: number;
  discount_on: boolean;
  transport_cost: number;
  transport_enabled: boolean;
  valid_days: number;
}

function buildSnapshot(input: QuoteInput) {
  const cfg = {
    adminPct: input.admin_pct,
    imprevistosPct: input.imprevistos_pct,
    util: input.util,
    taxMode: input.tax_mode,
    taxRate: input.tax_rate,
    discount: input.discount,
    discountOn: input.discount_on,
    transportCost: input.transport_cost,
    transportEnabled: input.transport_enabled,
  };
  const calcSnapshot = computeQuote(input.service_lines, cfg);
  const doc = computeDoc(input.service_lines, cfg, input.doc_detail_level);
  return { calc_snapshot: calcSnapshot, doc_items: doc.items };
}

export async function createQuote(workspaceId: string, userId: string, input: QuoteInput): Promise<Quote> {
  const { calc_snapshot, doc_items } = buildSnapshot(input);
  const { data, error } = await supabase
    .from('quotes')
    .insert({
      workspace_id: workspaceId,
      created_by: userId,
      ...input,
      service_lines: input.service_lines as never,
      calc_snapshot: calc_snapshot as never,
      doc_items: doc_items as never,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateQuote(id: string, input: QuoteInput): Promise<Quote> {
  const { calc_snapshot, doc_items } = buildSnapshot(input);
  const { data, error } = await supabase
    .from('quotes')
    .update({
      ...input,
      service_lines: input.service_lines as never,
      calc_snapshot: calc_snapshot as never,
      doc_items: doc_items as never,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateQuoteStatus(id: string, status: QuoteStatus): Promise<Quote> {
  const patch: Partial<Quote> = { status };
  if (status === 'Enviada') patch.sent_at = new Date().toISOString();
  const { data, error } = await supabase.from('quotes').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function duplicateQuote(id: string): Promise<Quote> {
  const original = await getQuote(id);
  const { data, error } = await supabase
    .from('quotes')
    .insert({
      workspace_id: original.workspace_id,
      created_by: original.created_by,
      client_id: original.client_id,
      project_id: original.project_id,
      title: original.title + ' (copia)',
      location: original.location,
      project_type: original.project_type,
      notes: original.notes,
      service_lines: original.service_lines as never,
      admin_pct: original.admin_pct,
      imprevistos_pct: original.imprevistos_pct,
      util: original.util,
      tax_mode: original.tax_mode,
      tax_rate: original.tax_rate,
      advance_pct: original.advance_pct,
      doc_detail_level: original.doc_detail_level,
      include_technical_annex: original.include_technical_annex,
      terms_conditions: original.terms_conditions as never,
      discount: original.discount,
      discount_on: original.discount_on,
      transport_cost: original.transport_cost,
      transport_enabled: original.transport_enabled,
      valid_days: original.valid_days,
      currency_code: original.currency_code,
      status: 'Borrador',
      calc_snapshot: original.calc_snapshot as never,
      doc_items: original.doc_items as never,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteQuote(id: string): Promise<void> {
  const { error } = await supabase.from('quotes').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
