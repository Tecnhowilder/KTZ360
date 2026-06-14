import { supabase } from '../lib/supabaseClient';
import type { Material } from '../lib/types';

export async function listMaterials(workspaceId: string): Promise<Material[]> {
  const { data, error } = await supabase
    .from('materials')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('category', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return data;
}

export interface MaterialInput {
  name: string;
  unit: string;
  category?: string | null;
  price: number;
}

export async function createMaterial(workspaceId: string, userId: string, input: MaterialInput): Promise<Material> {
  const { data, error } = await supabase
    .from('materials')
    .insert({ workspace_id: workspaceId, created_by: userId, ...input })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateMaterial(id: string, patch: Partial<MaterialInput>): Promise<Material> {
  const { data, error } = await supabase.from('materials').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function deleteMaterial(id: string): Promise<void> {
  const { error } = await supabase.from('materials').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
