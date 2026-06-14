import { supabase } from '../lib/supabaseClient';
import { computeQuote, computeDoc, type ServiceLine } from '../lib/engine';
import type { Quote, QuoteStatus, TaxMode, DocDetailLevel } from '../lib/types';

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
