import { supabase } from '../lib/supabaseClient';
import type { QuoteItem } from '../lib/itemEngine';

export interface QuoteItemRow {
  id: string;
  quote_id: string;
  workspace_id: string;
  type: string;
  item_name: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  discount: number;
  subtotal: number;
  sort_order: number;
  catalog_item_id: string | null;
  created_at: string;
  updated_at: string;
}

const tbl = () => (supabase as any).from('quote_items');

export async function listQuoteItems(quoteId: string): Promise<QuoteItemRow[]> {
  const { data, error } = await tbl().select('*').eq('quote_id', quoteId).order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createQuoteItem(
  quoteId: string,
  workspaceId: string,
  item: Omit<QuoteItem, 'id'>
): Promise<QuoteItemRow> {
  const { data, error } = await tbl()
    .insert({
      quote_id: quoteId,
      workspace_id: workspaceId,
      type: item.type,
      item_name: item.item_name,
      description: item.description ?? null,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      discount: item.discount,
      subtotal: item.subtotal,
      sort_order: item.sort_order ?? 0,
      catalog_item_id: item.catalog_item_id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateQuoteItem(
  id: string,
  patch: Partial<Pick<QuoteItem, 'item_name' | 'description' | 'quantity' | 'unit' | 'unit_price' | 'discount' | 'subtotal' | 'sort_order'>>
): Promise<QuoteItemRow> {
  const { data, error } = await tbl().update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function deleteQuoteItem(id: string): Promise<void> {
  const { error } = await tbl().delete().eq('id', id);
  if (error) throw error;
}

export async function bulkInsertQuoteItems(
  quoteId: string,
  workspaceId: string,
  items: Omit<QuoteItem, 'id'>[]
): Promise<QuoteItemRow[]> {
  if (items.length === 0) return [];
  const rows = items.map((item, idx) => ({
    quote_id: quoteId,
    workspace_id: workspaceId,
    type: item.type,
    item_name: item.item_name,
    description: item.description ?? null,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    discount: item.discount,
    subtotal: item.subtotal,
    sort_order: item.sort_order ?? idx,
    catalog_item_id: item.catalog_item_id ?? null,
  }));
  const { data, error } = await tbl().insert(rows).select('*');
  if (error) throw error;
  return data ?? [];
}

export async function reorderQuoteItems(updates: { id: string; sort_order: number }[]): Promise<void> {
  await Promise.all(updates.map(({ id, sort_order }) => tbl().update({ sort_order }).eq('id', id)));
}

export function rowToQuoteItem(row: QuoteItemRow): QuoteItem {
  return {
    id: row.id,
    type: row.type as QuoteItem['type'],
    item_name: row.item_name,
    description: row.description ?? undefined,
    quantity: row.quantity,
    unit: row.unit,
    unit_price: row.unit_price,
    discount: row.discount,
    subtotal: row.subtotal,
    sort_order: row.sort_order,
    catalog_item_id: row.catalog_item_id ?? undefined,
  };
}
