import { supabase } from '../lib/supabaseClient';
import type { Client } from '../lib/types';

export async function listClients(workspaceId: string): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getClient(id: string): Promise<Client> {
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export interface ClientInput {
  name: string;
  meta?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export async function createClient(workspaceId: string, userId: string, input: ClientInput): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .insert({ workspace_id: workspaceId, created_by: userId, initial: initialsFrom(input.name), ...input })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateClient(id: string, patch: Partial<ClientInput>): Promise<Client> {
  const { data, error } = await supabase.from('clients').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from('clients').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
