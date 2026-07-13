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
  | 'storage_enabled'
  | 'automation_enabled'
  | 'webhook_enabled'
  // Legacy flags (devuelven false si columna no existe en plan_features)
  | 'ai_credits_enabled'
  | 'founder_eligible';

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

// ─── Utilidad: plan mínimo requerido para cada feature ───────────────────────
// Usado por los modales de upgrade para mostrar el CTA correcto.
// "Actualizar a PRO" si la feature es PRO, "Actualizar a PREMIUM" si es PREMIUM.

export type PlanCode = 'free' | 'pro' | 'premium' | 'enterprise';

const FEATURE_TO_MIN_PLAN: Record<string, PlanCode> = {
  // PRO features
  orders_enabled:          'pro',
  work_orders_enabled:     'pro',
  gps_enabled:             'premium',
  storage_enabled:         'pro',
  pipeline_enabled:        'pro',
  templates_enabled:       'pro',
  branding_enabled:        'pro',
  custom_qr_enabled:       'pro',
  advanced_reports_enabled:'pro',
  ai_enabled:              'pro',
  // PREMIUM features
  multiuser_enabled:       'premium',
  automation_enabled:      'premium',
  webhook_enabled:         'premium',
  photo_quote_enabled:     'premium',
};

/**
 * Devuelve el plan mínimo requerido para acceder a un feature.
 * Úsalo en openUpgradeModal para mostrar el CTA correcto:
 *   FREE  → "Actualizar a PRO"   (si el feature es PRO)
 *   FREE/PRO → "Actualizar a PREMIUM" (si el feature es PREMIUM)
 */
export function getRequiredPlan(feature: PlanFeature): PlanCode {
  return FEATURE_TO_MIN_PLAN[feature] ?? 'premium';
}

/**
 * Genera el label del CTA de upgrade según el plan actual del usuario.
 * Un usuario PREMIUM nunca ve "Actualizar a PREMIUM".
 */
export function getUpgradeCta(
  currentPlan: PlanCode,
  requiredPlan: PlanCode
): { ctaLabel: string; targetPlan: PlanCode } | null {
  const order: PlanCode[] = ['free', 'pro', 'premium', 'enterprise'];
  const currentIdx  = order.indexOf(currentPlan);
  const requiredIdx = order.indexOf(requiredPlan);
  if (currentIdx >= requiredIdx) return null; // ya tiene el plan necesario
  return {
    targetPlan: requiredPlan,
    ctaLabel:   `Actualizar a ${requiredPlan.toUpperCase()}`,
  };
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
