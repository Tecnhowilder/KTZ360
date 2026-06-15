import { supabase } from '../lib/supabaseClient';
import type { WorkspaceRow, SubscriptionRow, PlanRow, SystemConfigurationRow, AdminSettingRow, Json } from '../lib/database.types';

export interface WorkspaceSubscriptionEntry {
  workspace: WorkspaceRow;
  subscription: SubscriptionRow | null;
  plan: PlanRow | null;
}

export async function listWorkspaceSubscriptions(): Promise<WorkspaceSubscriptionEntry[]> {
  const [workspacesRes, subsRes, plansRes] = await Promise.all([
    supabase.from('workspaces').select('*').order('created_at', { ascending: false }),
    supabase.from('subscriptions').select('*'),
    supabase.from('plans').select('*'),
  ]);
  if (workspacesRes.error) throw workspacesRes.error;
  if (subsRes.error) throw subsRes.error;
  if (plansRes.error) throw plansRes.error;
  return (workspacesRes.data ?? []).map((workspace) => {
    const subscription = subsRes.data!.find((s) => s.workspace_id === workspace.id) ?? null;
    const plan = subscription ? plansRes.data!.find((p) => p.id === subscription.plan_id) ?? null : null;
    return { workspace, subscription, plan };
  });
}

export async function listPlans(): Promise<PlanRow[]> {
  const { data, error } = await supabase.from('plans').select('*').order('price', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function updateSubscription(workspaceId: string, patch: Partial<SubscriptionRow>): Promise<void> {
  const { error } = await supabase.from('subscriptions').update(patch).eq('workspace_id', workspaceId);
  if (error) throw error;
}

export async function listSystemConfiguration(): Promise<SystemConfigurationRow[]> {
  const { data, error } = await supabase.from('system_configuration').select('*').order('category');
  if (error) throw error;
  return data ?? [];
}

export async function updateSystemConfiguration(key: string, value: Json): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('system_configuration')
    .update({ value, updated_at: new Date().toISOString(), updated_by: userData.user?.id ?? null })
    .eq('key', key);
  if (error) throw error;
}

export async function listAdminSettings(): Promise<AdminSettingRow[]> {
  const { data, error } = await supabase.from('admin_settings').select('*');
  if (error) throw error;
  return data ?? [];
}

export async function updateAdminSetting(key: string, value: Json): Promise<void> {
  const { error } = await supabase.from('admin_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key);
  if (error) throw error;
}
