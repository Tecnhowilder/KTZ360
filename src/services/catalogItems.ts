import { supabase } from '../lib/supabaseClient';

export type CatalogItemType = 'PRODUCT' | 'SERVICE' | 'BUNDLE';

export interface CatalogItem {
  id: string;
  workspace_id: string;
  created_by: string | null;
  type: CatalogItemType;
  name: string;
  description: string | null;
  unit: string;
  price: number;
  favorite: boolean;
  use_count: number;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface CreateCatalogItemInput {
  type: CatalogItemType;
  name: string;
  description?: string;
  unit: string;
  price: number;
  favorite?: boolean;
}

const tbl = () => (supabase as any).from('catalog_items');

export async function listCatalogItems(workspaceId: string): Promise<CatalogItem[]> {
  const { data, error } = await tbl()
    .select('*').eq('workspace_id', workspaceId).eq('status', 'active')
    .is('deleted_at', null).order('use_count', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CatalogItem[];
}

export async function searchCatalogItems(workspaceId: string, query: string): Promise<CatalogItem[]> {
  const { data, error } = await tbl()
    .select('*').eq('workspace_id', workspaceId).eq('status', 'active')
    .is('deleted_at', null).ilike('name', `%${query}%`)
    .order('use_count', { ascending: false }).limit(20);
  if (error) throw error;
  return (data ?? []) as CatalogItem[];
}

export async function getFavoriteCatalogItems(workspaceId: string): Promise<CatalogItem[]> {
  const { data, error } = await tbl()
    .select('*').eq('workspace_id', workspaceId).eq('status', 'active')
    .eq('favorite', true).is('deleted_at', null).order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CatalogItem[];
}

export async function getRecentCatalogItems(workspaceId: string): Promise<CatalogItem[]> {
  const { data, error } = await tbl()
    .select('*').eq('workspace_id', workspaceId).eq('status', 'active')
    .is('deleted_at', null).order('updated_at', { ascending: false }).limit(10);
  if (error) throw error;
  return (data ?? []) as CatalogItem[];
}

export async function createCatalogItem(
  workspaceId: string,
  userId: string,
  input: CreateCatalogItemInput
): Promise<CatalogItem> {
  const { data, error } = await tbl()
    .insert({
      workspace_id: workspaceId,
      created_by: userId,
      type: input.type,
      name: input.name,
      description: input.description ?? null,
      unit: input.unit,
      price: input.price,
      favorite: input.favorite ?? false,
    })
    .select('*').single();
  if (error) throw error;
  return data as CatalogItem;
}

export async function updateCatalogItem(
  id: string,
  patch: Partial<Pick<CatalogItem, 'name' | 'description' | 'unit' | 'price' | 'type' | 'status'>>
): Promise<CatalogItem> {
  const { data, error } = await tbl().update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data as CatalogItem;
}

export async function toggleFavoriteCatalogItem(id: string, favorite: boolean): Promise<void> {
  const { error } = await tbl().update({ favorite }).eq('id', id);
  if (error) throw error;
}

export async function deleteCatalogItem(id: string): Promise<void> {
  const { error } = await tbl()
    .update({ deleted_at: new Date().toISOString(), status: 'inactive' }).eq('id', id);
  if (error) throw error;
}
