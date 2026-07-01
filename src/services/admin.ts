import { supabase } from '../lib/supabaseClient';
import type {
  WorkspaceRow, SubscriptionRow, PlanRow, SystemConfigurationRow, AdminSettingRow,
  ProfileRow, PlanFeaturesRow, PlanLimitsRow, AuditLogRow, Json,
  FounderPromotionRow, AiOperationCostRow, WorkspaceInvitationRow,
} from '../lib/database.types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (supabase as any).rpc.bind(supabase as any);

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

// ─── Sprint 9: funciones admin ────────────────────────────────────────────────

// Planes
export async function updatePlan(planId: string, patch: { price?: number; name?: string; description?: string; active?: boolean }): Promise<void> {
  const { data, error } = await rpc('admin_update_plan', { p_plan_id: planId, p_price: patch.price ?? null, p_name: patch.name ?? null, p_description: patch.description ?? null, p_active: patch.active ?? null });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
}

export async function updatePlanFeature(planCode: string, feature: string, value: boolean): Promise<void> {
  const { data, error } = await rpc('admin_update_plan_feature', { p_plan_code: planCode, p_feature: feature, p_value: value });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
}

export async function updatePlanLimit(planCode: string, field: string, value: number): Promise<void> {
  const { data, error } = await rpc('admin_update_plan_limit', { p_plan_code: planCode, p_field: field, p_value: value });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
}

// Workspaces
export async function suspendWorkspace(workspaceId: string): Promise<void> {
  const { data, error } = await rpc('admin_suspend_workspace', { p_workspace_id: workspaceId });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
}

export async function reactivateWorkspace(workspaceId: string): Promise<void> {
  const { data, error } = await rpc('admin_reactivate_workspace', { p_workspace_id: workspaceId });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
}

// Usuarios
export async function changeUserRole(userId: string, newRole: string): Promise<void> {
  const { data, error } = await rpc('admin_change_user_role', { p_user_id: userId, p_new_role: newRole });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
}

export async function setUserStatus(userId: string, status: 'active' | 'inactive'): Promise<void> {
  const { data, error } = await rpc('admin_set_user_status', { p_user_id: userId, p_status: status });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
}

// Notificaciones
export async function sendAdminNotification(workspaceId: string, title: string, message: string, type: string): Promise<void> {
  const { data, error } = await rpc('admin_send_notification', { p_workspace_id: workspaceId, p_title: title, p_message: message, p_type: type });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
}

// IA
export async function listAiOperationCosts(): Promise<AiOperationCostRow[]> {
  const { data, error } = await supabase.from('ai_operation_costs').select('*').order('operation');
  if (error) throw error;
  return data ?? [];
}

export async function updateAiCost(operation: string, creditsCost: number, active?: boolean): Promise<void> {
  const { data, error } = await rpc('admin_update_ai_cost', { p_operation: operation, p_credits_cost: creditsCost, p_active: active ?? null });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
}

export interface AiUsageGlobalRow {
  workspace_id: string; workspace_name: string;
  total_calls: number; total_credits: number; total_cost_usd: number; last_used: string;
}
export async function getAiUsageGlobal(): Promise<AiUsageGlobalRow[]> {
  const { data, error } = await rpc('admin_get_ai_usage_global', { p_limit: 100 });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
  return data.data ?? [];
}

// Storage
export interface StorageGlobalRow {
  workspace_id: string; workspace_name: string;
  total_bytes: number; total_files: number; total_mb: number;
}
export async function getStorageGlobal(): Promise<StorageGlobalRow[]> {
  const { data, error } = await rpc('admin_get_storage_global', { p_limit: 100 });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
  return data.data ?? [];
}

// Founder
export async function listFounderPromotions(): Promise<FounderPromotionRow[]> {
  const { data, error } = await supabase.from('founder_promotions').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function upsertFounderPromotion(input: {
  id?: string; planCode?: string; name?: string;
  founderPrice?: number; regularPrice?: number;
  durationMonths?: number; maxRedemptions?: number | null;
  active?: boolean; validUntil?: string | null;
}): Promise<string> {
  const { data, error } = await rpc('admin_upsert_founder_promotion', {
    p_id: input.id ?? null, p_plan_code: input.planCode ?? null,
    p_name: input.name ?? null, p_founder_price: input.founderPrice ?? null,
    p_regular_price: input.regularPrice ?? null, p_duration_months: input.durationMonths ?? 12,
    p_max_redemptions: input.maxRedemptions ?? null, p_active: input.active ?? true,
    p_valid_until: input.validUntil ?? null,
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
  return data.id;
}

export async function activateFounderForWorkspace(workspaceId: string, promotionId: string): Promise<void> {
  const { data, error } = await rpc('admin_activate_founder', { p_workspace_id: workspaceId, p_promotion_id: promotionId });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
}

// Auditoría paginada
export interface AuditLogFilters {
  limit?: number; offset?: number; action?: string;
  workspaceId?: string; userId?: string; fromDate?: string; toDate?: string;
}
export interface AuditLogPage { rows: AuditLogRow[]; total: number; }
export async function getAuditLogPaged(filters: AuditLogFilters = {}): Promise<AuditLogPage> {
  const { data, error } = await rpc('admin_get_audit_log', {
    p_limit: filters.limit ?? 100, p_offset: filters.offset ?? 0,
    p_action_filter: filters.action ?? null, p_workspace_id: filters.workspaceId ?? null,
    p_user_id: filters.userId ?? null, p_from_date: filters.fromDate ?? null,
    p_to_date: filters.toDate ?? null,
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
  return { rows: data.rows ?? [], total: data.total ?? 0 };
}

// Invitaciones — visibilidad y gestión cross-workspace (super_admin / support_admin)
export interface InvitationAdminEntry extends WorkspaceInvitationRow {
  workspace_name: string | null;
}
export async function listAllInvitations(): Promise<InvitationAdminEntry[]> {
  const [invRes, wsRes] = await Promise.all([
    supabase.from('workspace_invitations').select('*').order('created_at', { ascending: false }),
    supabase.from('workspaces').select('id, name'),
  ]);
  if (invRes.error) throw invRes.error;
  if (wsRes.error) throw wsRes.error;
  const wsNameById = new Map((wsRes.data ?? []).map((w) => [w.id, w.name]));
  return (invRes.data ?? []).map((inv) => ({ ...inv, workspace_name: wsNameById.get(inv.workspace_id) ?? null }));
}

export async function adminRevokeInvitation(invitationId: string, reason?: string): Promise<void> {
  const { data, error } = await rpc('admin_revoke_invitation', { p_invitation_id: invitationId, p_reason: reason ?? null });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
}
