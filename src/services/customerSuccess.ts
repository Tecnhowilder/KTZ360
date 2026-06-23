/**
 * customerSuccess.ts — Servicio Customer Success Sprint 15
 * Zero Trust: toda clasificación (VIP, en riesgo, health score) viene del backend.
 * El frontend NUNCA calcula scores — solo consume.
 */
import { supabase } from '../lib/supabaseClient';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type HealthStatus = 'vip' | 'saludable' | 'riesgo' | 'critico' | 'perdido' | 'nuevo';
export type RiskLevel    = 'bajo' | 'medio' | 'alto' | 'critico';
export type RiskCategory = 'amarillo' | 'naranja' | 'rojo';

export interface ClientHealthScore {
  client_id:      string;
  name:           string;
  email:          string | null;
  phone:          string | null;
  score:          number;
  status:         HealthStatus;
  risk_level:     RiskLevel;
  days_inactive:  number;
  total_quotes:   number;
  total_approved: number;
  total_value:    number;
  last_activity:  string | null;
  conversion_rate?: number;
}

export interface ClientAtRisk extends ClientHealthScore {
  risk_category: RiskCategory;
}

export interface RepurchaseOpportunity extends ClientHealthScore {
  avg_days_between: number;
  days_since_last:  number;
  expected_return:  string;
  overdue_days:     number;
}

export interface CustomerSuccessDashboard {
  summary: {
    total_clients: number;
    vip:           number;
    saludable:     number;
    riesgo:        number;
    critico:       number;
    perdido:       number;
    nuevo:         number;
    avg_score:     number;
    last_updated:  string | null;
  };
  top_vip:      Array<{ client_id: string; name: string; score: number; total_value: number }>;
  top_at_risk:  Array<{ client_id: string; name: string; score: number; days_inactive: number; risk_level: RiskLevel }>;
  score_distribution: { '0_20': number; '20_40': number; '40_60': number; '60_80': number; '80_100': number };
}

// ─── Helper RPC ───────────────────────────────────────────────────────────────

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  const result = data as { ok: boolean; error?: string } & T;
  if (!result.ok) throw new Error(result.error ?? `Error en ${name}`);
  return result as T;
}

// ─── API ──────────────────────────────────────────────────────────────────────

export async function getCustomerSuccessDashboard(workspaceId: string): Promise<CustomerSuccessDashboard> {
  return rpc<CustomerSuccessDashboard>('get_customer_success_dashboard', { p_workspace_id: workspaceId });
}

export async function getClientsAtRisk(workspaceId: string): Promise<{
  clients_at_risk: ClientAtRisk[];
  summary: { amarillo: number; naranja: number; rojo: number };
}> {
  return rpc('get_clients_at_risk', { p_workspace_id: workspaceId });
}

export async function getVipClients(workspaceId: string): Promise<{ vip_clients: ClientHealthScore[] }> {
  return rpc('get_vip_clients', { p_workspace_id: workspaceId });
}

export async function getRepurchaseOpportunities(workspaceId: string): Promise<{ opportunities: RepurchaseOpportunity[] }> {
  return rpc('get_repurchase_opportunities', { p_workspace_id: workspaceId });
}

export async function recalculateHealthScores(workspaceId: string): Promise<number> {
  const { data, error } = await supabase.rpc('recalculate_all_health_scores' as never, {
    p_workspace_id: workspaceId,
  } as never);
  if (error) throw error;
  return data as number;
}

// ─── Labels y colores (definidos una sola vez, aquí) ─────────────────────────

export const HEALTH_STATUS_META: Record<HealthStatus, {
  label: string; color: string; bg: string; dotColor: string; icon: string;
}> = {
  vip:      { label: 'VIP',        color: '#7C3AED', bg: '#F5F3FF', dotColor: '#8B5CF6', icon: '⭐' },
  saludable:{ label: 'Saludable',  color: '#16A34A', bg: '#F0FDF4', dotColor: '#22C55E', icon: '✅' },
  riesgo:   { label: 'En riesgo',  color: '#D97706', bg: '#FFFBEB', dotColor: '#F59E0B', icon: '⚠️' },
  critico:  { label: 'Crítico',    color: '#DC2626', bg: '#FEF2F2', dotColor: '#EF4444', icon: '🚨' },
  perdido:  { label: 'Perdido',    color: '#64748B', bg: '#F8FAFC', dotColor: '#94A3B8', icon: '💤' },
  nuevo:    { label: 'Nuevo',      color: '#2563EB', bg: '#EFF6FF', dotColor: '#3B82F6', icon: '🆕' },
};

export const RISK_CATEGORY_META: Record<RiskCategory, { color: string; bg: string; label: string }> = {
  amarillo: { color: '#D97706', bg: '#FFFBEB', label: '⚠️ 1-30 días' },
  naranja:  { color: '#EA580C', bg: '#FFF7ED', label: '🟠 31-60 días' },
  rojo:     { color: '#DC2626', bg: '#FEF2F2', label: '🔴 60+ días' },
};

export function formatCurrencyCompact(n: number): string {
  if (n >= 1_000_000) return '$ ' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return '$ ' + Math.round(n / 1_000) + 'k';
  return '$ ' + n;
}
