import { supabase } from './supabaseClient';

/**
 * Servicio centralizado de permisos (Zero Trust).
 *
 * Toda decisión de acceso (features del plan, límites cuantitativos y estado
 * de la suscripción) se resuelve SIEMPRE en la base de datos a partir de
 * `subscriptions` (fuente de verdad). Esta capa solo expone wrappers
 * tipados de los RPC `security definer`; el frontend nunca decide acceso por
 * sí mismo (localStorage/sessionStorage/payloads no son confiables).
 */

export type PlanFeature =
  | 'ai_enabled'
  | 'photo_quote_enabled'
  | 'templates_enabled'
  | 'branding_enabled'
  | 'custom_qr_enabled'
  | 'advanced_reports_enabled'
  | 'multiuser_enabled'
  | 'quote_editing_enabled'
  | 'pipeline_enabled'
  | 'orders_enabled'
  | 'work_orders_enabled'
  | 'gps_enabled'
  | 'ai_credits_enabled'
  | 'founder_eligible'
  | 'storage_enabled';

export type PlanLimitKey = 'quotes_month' | 'clients' | 'users';

export interface PlanLimitResult {
  allowed: boolean;
  current: number;
  max: number | null;
  included_users?: number;
  extra_users?: number;
  extra_user_price?: number;
}

export type SubscriptionStatus =
  | 'trial_active'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'expired'
  | 'suspended'
  | 'free';

export interface SubscriptionStatusResult {
  status: SubscriptionStatus;
  plan_code: 'free' | 'pro' | 'premium';
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  email_verified: boolean;
  in_grace: boolean;
}

export async function getEffectivePlanCode(workspaceId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_effective_plan_code', { p_workspace_id: workspaceId });
  if (error) throw error;
  return data as unknown as string;
}

/** Nivel de PDF del plan efectivo: 'free' (con branding Shelwi) o 'pro' (PDF limpio con marca propia). */
export async function getPdfTier(workspaceId: string): Promise<'free' | 'pro'> {
  const planCode = await getEffectivePlanCode(workspaceId);
  const { data, error } = await supabase.from('plan_features').select('pdf_tier').eq('plan_code', planCode).single();
  if (error) throw error;
  return data.pdf_tier;
}

export async function checkFeatureAccess(workspaceId: string, feature: PlanFeature): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_feature_access', {
    p_workspace_id: workspaceId,
    p_feature: feature,
  });
  if (error) throw error;
  return data as unknown as boolean;
}

export async function checkPlanLimit(workspaceId: string, limit: PlanLimitKey): Promise<PlanLimitResult> {
  const { data, error } = await supabase.rpc('check_plan_limit', {
    p_workspace_id: workspaceId,
    p_limit: limit,
  });
  if (error) throw error;
  return data as unknown as PlanLimitResult;
}

export async function checkSubscriptionStatus(workspaceId: string): Promise<SubscriptionStatusResult> {
  const { data, error } = await supabase.rpc('check_subscription_status', { p_workspace_id: workspaceId });
  if (error) throw error;
  return data as unknown as SubscriptionStatusResult;
}

export async function isSuperAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_super_admin');
  if (error) throw error;
  return data as unknown as boolean;
}

export async function isSupportAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_support_admin');
  if (error) throw error;
  return data as unknown as boolean;
}
