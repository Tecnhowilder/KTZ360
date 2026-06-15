import { supabase } from '../lib/supabaseClient';
import type { WorkspaceRow, SubscriptionRow, PlanRow, SystemConfigurationRow, AdminSettingRow, ProfileRow, PlanFeaturesRow, PlanLimitsRow, AuditLogRow, Json } from '../lib/database.types';

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
  const { data: userData } = await supabase.auth.getUser();
  const { data: before } = await supabase.from('subscriptions').select('plan_id, status').eq('workspace_id', workspaceId).maybeSingle();

  const { error } = await supabase.from('subscriptions').update(patch).eq('workspace_id', workspaceId);
  if (error) throw error;

  const { data: actorProfile } = await supabase.from('profiles').select('workspace_id').eq('id', userData.user?.id ?? '').maybeSingle();
  if (!actorProfile) return;

  await supabase.from('audit_log').insert({
    workspace_id: actorProfile.workspace_id,
    user_id: userData.user?.id ?? null,
    action: 'subscription_changed',
    entity_type: 'subscriptions',
    entity_id: workspaceId,
    metadata: {
      performed_by: userData.user?.id ?? null,
      old_value: before ?? null,
      new_value: patch,
      timestamp: new Date().toISOString(),
    },
  });
}

export async function listSystemConfiguration(): Promise<SystemConfigurationRow[]> {
  const { data, error } = await supabase.from('system_configuration').select('*').order('category');
  if (error) throw error;
  return data ?? [];
}

export async function updateSystemConfiguration(key: string, value: Json): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const { data: before } = await supabase.from('system_configuration').select('value, category').eq('key', key).maybeSingle();

  const { error } = await supabase
    .from('system_configuration')
    .update({ value, updated_at: new Date().toISOString(), updated_by: userData.user?.id ?? null })
    .eq('key', key);
  if (error) throw error;

  const { data: actorProfile } = await supabase.from('profiles').select('workspace_id').eq('id', userData.user?.id ?? '').maybeSingle();
  if (!actorProfile) return;

  const isSensitive = before?.category === 'email' || before?.category === 'payments' || before?.category === 'billing' || before?.category === 'ai';

  await supabase.from('audit_log').insert({
    workspace_id: actorProfile.workspace_id,
    user_id: userData.user?.id ?? null,
    action: 'system_configuration_changed',
    entity_type: 'system_configuration',
    entity_id: null,
    metadata: {
      performed_by: userData.user?.id ?? null,
      key,
      old_value: isSensitive ? '***' : before?.value ?? null,
      new_value: isSensitive ? '***' : value,
      timestamp: new Date().toISOString(),
    },
  });
}

export interface AdminDashboardStats {
  totalUsers: number;
  totalWorkspaces: number;
  activeUsers: number;
  mrr: number;
  planCounts: Record<string, number>;
  statusCounts: Record<string, number>;
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const [profilesRes, workspacesRes, subsRes, plansRes] = await Promise.all([
    supabase.from('profiles').select('id, workspace_id, status, role'),
    supabase.from('workspaces').select('id'),
    supabase.from('subscriptions').select('workspace_id, plan_id, status'),
    supabase.from('plans').select('id, code, price'),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (workspacesRes.error) throw workspacesRes.error;
  if (subsRes.error) throw subsRes.error;
  if (plansRes.error) throw plansRes.error;

  const superAdminWorkspaces = new Set(profilesRes.data!.filter((p) => p.role === 'super_admin').map((p) => p.workspace_id));
  const profiles = profilesRes.data!.filter((p) => !superAdminWorkspaces.has(p.workspace_id));
  const workspaces = workspacesRes.data!.filter((w) => !superAdminWorkspaces.has(w.id));
  const subs = subsRes.data!.filter((s) => !superAdminWorkspaces.has(s.workspace_id));
  const planById = new Map(plansRes.data!.map((p) => [p.id, p]));

  const planCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  let mrr = 0;
  for (const s of subs) {
    const plan = planById.get(s.plan_id);
    const code = plan?.code ?? 'unknown';
    planCounts[code] = (planCounts[code] ?? 0) + 1;
    statusCounts[s.status] = (statusCounts[s.status] ?? 0) + 1;
    if (s.status === 'active' && plan) mrr += plan.price;
  }

  return {
    totalUsers: profiles.length,
    totalWorkspaces: workspaces.length,
    activeUsers: profiles.filter((p) => p.status === 'active').length,
    mrr,
    planCounts,
    statusCounts,
  };
}

export async function listPlanFeatures(): Promise<PlanFeaturesRow[]> {
  const { data, error } = await supabase.from('plan_features').select('*');
  if (error) throw error;
  return data ?? [];
}

export async function listPlanLimits(): Promise<PlanLimitsRow[]> {
  const { data, error } = await supabase.from('plan_limits').select('*');
  if (error) throw error;
  return data ?? [];
}

export interface AdminProfileEntry {
  profile: ProfileRow;
  workspaceName: string;
}

export async function listAllProfiles(): Promise<AdminProfileEntry[]> {
  const [profilesRes, workspacesRes] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    supabase.from('workspaces').select('id, name'),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (workspacesRes.error) throw workspacesRes.error;
  const workspaceNames = new Map(workspacesRes.data!.map((w) => [w.id, w.name]));
  return (profilesRes.data ?? []).map((profile) => ({ profile, workspaceName: workspaceNames.get(profile.workspace_id) ?? '—' }));
}

export async function listAuditLog(limit = 200): Promise<AuditLogRow[]> {
  const { data, error } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listAdminSettings(): Promise<AdminSettingRow[]> {
  const { data, error } = await supabase.from('admin_settings').select('*');
  if (error) throw error;
  return data ?? [];
}

export async function updateAdminSetting(key: string, value: Json): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const { data: before } = await supabase.from('admin_settings').select('value').eq('key', key).maybeSingle();

  const { error } = await supabase.from('admin_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key);
  if (error) throw error;

  const { data: actorProfile } = await supabase.from('profiles').select('workspace_id').eq('id', userData.user?.id ?? '').maybeSingle();
  if (!actorProfile) return;

  await supabase.from('audit_log').insert({
    workspace_id: actorProfile.workspace_id,
    user_id: userData.user?.id ?? null,
    action: 'admin_settings_changed',
    entity_type: 'admin_settings',
    entity_id: null,
    metadata: {
      performed_by: userData.user?.id ?? null,
      key,
      old_value: before?.value ?? null,
      new_value: value,
      timestamp: new Date().toISOString(),
    },
  });
}
