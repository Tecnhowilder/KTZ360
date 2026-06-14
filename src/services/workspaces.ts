import { supabase } from '../lib/supabaseClient';
import type { Profile, Workspace, CompanySettings } from '../lib/types';
import type { WorkspaceFeaturesRow } from '../lib/database.types';

export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}

export async function getWorkspace(workspaceId: string): Promise<Workspace> {
  const { data, error } = await supabase.from('workspaces').select('*').eq('id', workspaceId).single();
  if (error) throw error;
  return data;
}

export async function getWorkspaceFeatures(workspaceId: string): Promise<WorkspaceFeaturesRow> {
  const { data, error } = await supabase.from('workspace_features').select('*').eq('workspace_id', workspaceId).single();
  if (error) throw error;
  return data;
}

export async function getCurrentPlanName(workspaceId: string): Promise<string> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan:plans(name)')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .single();
  if (error) throw error;
  const plan = (data as unknown as { plan: { name: string } | null }).plan;
  return plan?.name ?? 'Free';
}

export async function updateWorkspace(workspaceId: string, patch: Partial<Workspace>): Promise<Workspace> {
  const { data, error } = await supabase.from('workspaces').update(patch).eq('id', workspaceId).select('*').single();
  if (error) throw error;
  return data;
}

export async function getCompanySettings(workspaceId: string): Promise<CompanySettings> {
  const { data, error } = await supabase.from('company_settings').select('*').eq('workspace_id', workspaceId).single();
  if (error) throw error;
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
