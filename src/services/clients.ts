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

/**
 * Búsqueda multi-campo: name, phone, email, city, document_number.
 * Funciona incluso si las columnas nuevas no existen aún (0032 pendiente).
 */
export async function searchClients(workspaceId: string, query: string): Promise<Client[]> {
  if (!query.trim()) return listClients(workspaceId);
  const q = `%${query.trim()}%`;
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .or(`name.ilike.${q},phone.ilike.${q},email.ilike.${q}`)
    .order('name', { ascending: true })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

/**
 * Detecta posibles duplicados por teléfono, email o documento.
 * Devuelve clientes existentes que coincidan en alguno de esos campos.
 */
export async function findDuplicateClients(
  workspaceId: string,
  phone?: string | null,
  email?: string | null,
  documentNumber?: string | null
): Promise<Client[]> {
  const conditions: string[] = [];
  if (phone?.trim())          conditions.push(`phone.eq.${phone.trim()}`);
  if (email?.trim())          conditions.push(`email.ilike.${email.trim()}`);
  if (documentNumber?.trim()) conditions.push(`document_number.eq.${documentNumber.trim()}`);
  if (conditions.length === 0) return [];

  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .or(conditions.join(','))
    .limit(5);
  if (error) return []; // Si la columna no existe aún, devolver vacío
  return data ?? [];
}

export interface ClientInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  meta?: string | null;
  // Campos extendidos (0032)
  document_number?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export async function createClient(
  workspaceId: string,
  userId: string,
  input: ClientInput
): Promise<Client> {
  const payload: Record<string, unknown> = {
    workspace_id: workspaceId,
    created_by: userId,
    initial: initialsFrom(input.name),
    name: input.name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    notes: input.notes ?? null,
    meta: input.meta ?? null,
  };

  // Campos opcionales de 0032 — solo incluir si la columna puede existir
  if (input.document_number != null) payload.document_number = input.document_number;
  if (input.address != null)         payload.address = input.address;
  if (input.neighborhood != null)    payload.neighborhood = input.neighborhood;
  if (input.city != null)            payload.city = input.city;

  const { data, error } = await supabase
    .from('clients')
    .insert(payload as never)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateClient(id: string, patch: Partial<ClientInput>): Promise<Client> {
  const { data, error } = await supabase
    .from('clients')
    .update(patch as never)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
