import { supabase } from '../lib/supabaseClient';
import type { Profile, Workspace, CompanySettings } from '../lib/types';
import type { WorkspaceFeaturesRow } from '../lib/database.types';

/**
 * getProfile — la ausencia de perfil es un ESTADO ESPERADO, no una excepción.
 * Causas legítimas: trigger de signup aún no terminó (race condition), perfil
 * eliminado, o el usuario nunca tuvo perfil. Usamos maybeSingle() para que
 * "0 filas" se modele como `null`, no como un throw/406 de PostgREST.
 * El llamador (WorkspaceProvider) decide cómo tratar el `null`.
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * getWorkspace — defensa en profundidad: si el workspace fue eliminado o RLS
 * lo oculta (cross-tenant), debe resolver a `null` en vez de lanzar 406.
 */
export async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
  const { data, error } = await supabase.from('workspaces').select('*').eq('id', workspaceId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getWorkspaceFeatures(workspaceId: string): Promise<WorkspaceFeaturesRow> {
  const { data, error } = await supabase.from('workspace_features').select('*').eq('workspace_id', workspaceId).single();
  if (error) throw error;
  return data;
}

const PLAN_DISPLAY_NAMES: Record<string, string> = { free: 'Free', pro: 'Pro', premium: 'Premium' };

export async function getCurrentPlanName(workspaceId: string): Promise<string> {
  // Fuente de verdad: subscriptions, resuelto vía get_effective_plan_code (RPC).
  const { data, error } = await supabase.rpc('get_effective_plan_code', { p_workspace_id: workspaceId });
  if (error) throw error;
  const code = data as unknown as string;
  return PLAN_DISPLAY_NAMES[code] ?? 'Free';
}

export async function updateWorkspace(workspaceId: string, patch: Partial<Workspace>): Promise<Workspace> {
  const { data, error } = await supabase.from('workspaces').update(patch).eq('id', workspaceId).select('*').single();
  if (error) throw error;
  return data;
}

/**
 * getCompanySettings — la fila se crea por trigger al mismo tiempo que el
 * workspace, pero si ese trigger falló parcialmente la ausencia es un estado
 * real que debe poder representarse sin lanzar una excepción.
 */
export async function getCompanySettings(workspaceId: string): Promise<CompanySettings | null> {
  const { data, error } = await supabase.from('company_settings').select('*').eq('workspace_id', workspaceId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, terms_conditions: Array.isArray(data.terms_conditions) ? (data.terms_conditions as unknown as string[]) : [] };
}

export async function updateCompanySettings(workspaceId: string, patch: Partial<CompanySettings>): Promise<CompanySettings> {
  const { data, error } = await supabase
    .from('company_settings')
    .update(patch as never)
    .eq('workspace_id', workspaceId)
    .select('*')
    .single();
  if (error) throw error;
  return { ...data, terms_conditions: Array.isArray(data.terms_conditions) ? (data.terms_conditions as unknown as string[]) : [] };
}

export async function uploadLogo(workspaceId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop();
  const path = `${workspaceId}/logo.${ext}`;
  const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true });
  if (error) throw error;
  await updateWorkspace(workspaceId, { logo_path: path });
  await updateCompanySettings(workspaceId, { logo_path: path });
  return path;
}

export function logoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from('logos').getPublicUrl(path);
  return data.publicUrl;
}
