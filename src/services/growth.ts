/**
 * growth.ts — Servicio de Growth Sprint 17
 * Zero Trust: workspace_id siempre del JWT.
 * Reutiliza: loyalty (Sprint 16), automation_rules (Sprint 13), aiCommercial (Sprint 2).
 */
import { supabase } from '../lib/supabaseClient';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ReferralProgram {
  id: string; workspace_id: string; name: string; description: string | null;
  referrer_points: number; referee_points: number; min_quote_amount: number; active: boolean;
}

export interface ReferralLink {
  id: string; ref_code: string; ref_url: string;
  program: { referrer_points: number; referee_points: number };
}

export interface ReferralDashboard {
  program: ReferralProgram | null;
  summary: { total_links: number; total_visits: number; total_conversions: number; rewarded: number; conversion_rate: number };
  top_referrers: Array<{ client_name: string; visits: number; conversions: number; ref_code: string }>;
  recent_conversions: Array<{ referee_name: string; status: string; points_awarded: number | null; created_at: string }>;
}

export interface CouponValidation {
  valid: boolean; promotion_id?: string; code?: string;
  type?: string; value?: number; discount_amount?: number; description?: string | null; error?: string;
}

export interface UtmAnalytics {
  period_days: number; total_visits: number;
  by_source: Array<{ source: string; visits: number; clients: number; leads: number }>;
  by_campaign: Array<{ campaign: string; source: string; visits: number }>;
}

export interface GrowthDashboard {
  acquisition: { new_clients: number; by_source: Record<string, number> };
  referrals: { total_conversions: number; rewarded: number };
  promotions: { total_used: number; total_discount: number; active_promotions: number };
  health_summary: { avg_score: number; vip: number; at_risk: number };
  growth_automations: number;
}

// ─── Helper RPC ───────────────────────────────────────────────────────────────

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  const r = data as { ok: boolean; error?: string } & T;
  if (r && typeof r === 'object' && 'ok' in r && !r.ok) throw new Error(r.error ?? `Error en ${name}`);
  return r as T;
}

// ─── Referidos ────────────────────────────────────────────────────────────────

export async function createReferralLink(workspaceId: string, clientId?: string): Promise<ReferralLink> {
  return rpc<ReferralLink>('create_referral_link', {
    p_workspace_id: workspaceId,
    p_client_id: clientId ?? null,
  });
}

export async function getReferralDashboard(workspaceId: string): Promise<ReferralDashboard> {
  return rpc<ReferralDashboard>('get_referral_dashboard', { p_workspace_id: workspaceId });
}

export async function upsertReferralProgram(workspaceId: string, program: Partial<ReferralProgram>) {
  const { error } = await supabase
    .from('referral_programs' as never)
    .upsert({ workspace_id: workspaceId, ...program } as never, { onConflict: 'workspace_id' });
  if (error) throw error;
}

// ─── Cupones ──────────────────────────────────────────────────────────────────

export async function validateCoupon(workspaceId: string, code: string, quoteTotal: number): Promise<CouponValidation> {
  const { data, error } = await supabase.rpc('validate_coupon', {
    p_workspace_id: workspaceId, p_code: code, p_quote_total: quoteTotal,
  });
  if (error) throw error;
  return data as unknown as CouponValidation;
}

export async function applyPromotion(workspaceId: string, code: string, quoteId: string): Promise<{ discount_amount: number; message: string }> {
  return rpc('apply_promotion', { p_workspace_id: workspaceId, p_code: code, p_quote_id: quoteId });
}

export async function getActivePromotions(workspaceId: string) {
  const { data, error } = await supabase
    .from('promotions' as never)
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('active', true)
    .or('valid_until.is.null,valid_until.gte.' + new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ─── UTM ──────────────────────────────────────────────────────────────────────

export async function getUtmAnalytics(workspaceId: string, days = 30): Promise<UtmAnalytics> {
  return rpc<UtmAnalytics>('get_utm_analytics', { p_workspace_id: workspaceId, p_days: days });
}

// ─── Dashboard Growth ─────────────────────────────────────────────────────────

export async function getGrowthDashboard(workspaceId: string): Promise<GrowthDashboard> {
  return rpc<GrowthDashboard>('get_growth_dashboard', { p_workspace_id: workspaceId });
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export const UTM_SOURCE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  facebook:   { label: 'Facebook',   icon: '📘', color: '#1877F2' },
  instagram:  { label: 'Instagram',  icon: '📸', color: '#E1306C' },
  google:     { label: 'Google',     icon: '🔍', color: '#4285F4' },
  tiktok:     { label: 'TikTok',     icon: '🎵', color: '#010101' },
  whatsapp:   { label: 'WhatsApp',   icon: '💬', color: '#25D366' },
  referral:   { label: 'Referido',   icon: '🤝', color: '#7C3AED' },
  direct:     { label: 'Directo',    icon: '🔗', color: '#64748B' },
  email:      { label: 'Email',      icon: '✉️', color: '#2563EB' },
};

export const PROMO_TYPE_LABELS: Record<string, string> = {
  percentage:   '% Descuento',
  fixed_amount: 'Monto fijo',
  free_service: 'Servicio gratis',
};
