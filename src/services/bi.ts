/**
 * bi.ts — Business Intelligence Sprint 19
 * Capa de servicio del KPI Engine.
 * Frontend NUNCA calcula KPIs — solo consume resultados del backend.
 * Zero Trust: workspace_id siempre del JWT en el backend.
 * Reutiliza: todas las RPCs de Sprints 1–18.
 */
import { supabase } from '../lib/supabaseClient';

// ─── Tipos del KPI Engine ────────────────────────────────────────────────────

export interface BIExecutiveKPIs {
  period_start:         string;
  period_end:           string;
  generated_at:         string;
  // Financiero
  revenue:              number;
  profit:               number;
  margin_pct:           number;
  gross_margin_pct:     number;
  revenue_change_pct:   number | null;
  profit_change_pct:    number | null;
  quotes_approved:      number;
  orders_finalized:     number;
  // Pipeline (30d)
  pipeline_value:       number;
  pipeline_count:       number;
  conversion_rate_30d:  number;
  approved_value_30d:   number;
  // Customer Success
  vip_clients:          number;
  at_risk_clients:      number;
  avg_health_score:     number;
  // Tendencia
  monthly_trend:        Array<{ month: string; label: string; revenue: number; util_amount: number; margin_pct: number }>;
  // Alertas
  alerts:               Array<Record<string, unknown>>;
  top_clients:          Array<Record<string, unknown>>;
  low_margin_clients:   Array<Record<string, unknown>>;
  financial_health:     'good' | 'warning' | 'critical' | 'no_data';
}

export interface SalesRep {
  user_id:         string;
  full_name:       string;
  role:            string;
  quotes_created:  number;
  quotes_sent:     number;
  quotes_approved: number;
  quotes_rejected: number;
  quotes_active:   number;
  conversion_rate: number;
  total_value:     number;
  approved_value:  number;
  avg_ticket:      number;
  avg_close_days:  number | null;
}

export interface BISalesKPIs {
  period_start:     string;
  period_end:       string;
  total_quoted:     number;
  total_approved:   number;
  quotes_count:     number;
  approved_count:   number;
  conversion_rate:  number;
  avg_close_days:   number | null;
  prev_total_quoted: number | null;
  prev_conversion:  number | null;
  funnel:           Array<Record<string, unknown>>;
  funnel_summary:   Record<string, unknown>;
  by_rep:           SalesRep[];
  team_summary:     Record<string, unknown>;
}

export interface OpsTeamMember {
  user_id:          string;
  full_name:        string;
  role:             string;
  wos_assigned:     number;
  wos_finished:     number;
  wos_active:       number;
  wos_cancelled:    number;
  completion_rate:  number;
  avg_duration_hours: number;
  delayed_count:    number;
  delay_rate_pct:   number;
  evidences_count:  number;
  gps_hours:        number;
}

export interface BIOperationsKPIs {
  period_start:       string;
  period_end:         string;
  orders_status:      Record<string, number>;
  work_orders_status: Record<string, number>;
  productivity_by_member: OpsTeamMember[];
  productivity_summary: Record<string, unknown>;
  gps_connected:      boolean;
  team_in_field:      number | null;
  checkins_today:     number | null;
  ot_active:          number | null;
}

export interface BIMarketingKPIs {
  period_start:        string;
  period_end:          string;
  new_clients:         number;
  acquisition_by_source: Record<string, number>;
  utm_visits:          number;
  utm_by_source:       Array<Record<string, unknown>>;
  utm_by_campaign:     Array<Record<string, unknown>>;
  referral_active:     boolean;
  referral_conversions: number;
  referral_rewarded:   number;
  revenue_by_channel:  Array<{ source: string; clients: number; revenue_from_clients: number; revenue_per_client: number }>;
  promos_used:         number;
  promos_discount:     number;
}

export interface CohortRow {
  cohort:         string;
  label:          string;
  size:           number;
  retention_pct:  Array<number | null>;
  retention_abs:  number[];
}

export interface BICustomerKPIs {
  period_start:    string;
  period_end:      string;
  health_summary:  Record<string, unknown>;
  vip_clients:     Array<Record<string, unknown>>;
  at_risk_clients: Array<Record<string, unknown>>;
  repurchase_opps: Array<Record<string, unknown>>;
  nps_score:       number | null;
  nps_label:       string;
  avg_rating:      number | null;
  promoters:       number;
  detractors:      number;
  total_reviews:   number;
  cohorts:         CohortRow[];
  avg_retention:   number[];
  retention_months: number;
}

export interface FunnelStage {
  step:  number;
  label: string;
  count: number;
  value: number;
  icon:  string;
}

export interface BIFullFunnel {
  period_start: string;
  period_end:   string;
  stages:       FunnelStage[];
  conversion: {
    client_to_quote:    number | null;
    quote_to_sent:      number | null;
    sent_to_approved:   number | null;
    approved_to_order:  number | null;
    order_to_invoice:   number | null;
    overall_close_rate: number | null;
  };
}

// ─── Helper RPC ──────────────────────────────────────────────────────────────

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  const r = data as { ok?: boolean; error?: string } & T;
  if (r && typeof r === 'object' && 'ok' in r && r.ok === false)
    throw new Error(r.error ?? `Error en ${name}`);
  return r as T;
}

// ─── KPI Engine — funciones de servicio ──────────────────────────────────────

export async function getBIExecutiveKPIs(
  workspaceId: string,
  periodStart?: string,
  periodEnd?:   string,
): Promise<BIExecutiveKPIs> {
  return rpc<BIExecutiveKPIs>('get_bi_executive_kpis', {
    p_workspace_id: workspaceId,
    p_period_start: periodStart ?? null,
    p_period_end:   periodEnd   ?? null,
  });
}

export async function getBISalesKPIs(
  workspaceId: string,
  periodStart?: string,
  periodEnd?:   string,
): Promise<BISalesKPIs> {
  return rpc<BISalesKPIs>('get_bi_sales_kpis', {
    p_workspace_id: workspaceId,
    p_period_start: periodStart ?? null,
    p_period_end:   periodEnd   ?? null,
  });
}

export async function getBIOperationsKPIs(
  workspaceId: string,
  periodStart?: string,
  periodEnd?:   string,
): Promise<BIOperationsKPIs> {
  return rpc<BIOperationsKPIs>('get_bi_operations_kpis', {
    p_workspace_id: workspaceId,
    p_period_start: periodStart ?? null,
    p_period_end:   periodEnd   ?? null,
  });
}

export async function getBIMarketingKPIs(
  workspaceId: string,
  periodStart?: string,
  periodEnd?:   string,
): Promise<BIMarketingKPIs> {
  return rpc<BIMarketingKPIs>('get_bi_marketing_kpis', {
    p_workspace_id: workspaceId,
    p_period_start: periodStart ?? null,
    p_period_end:   periodEnd   ?? null,
  });
}

export async function getBICustomerKPIs(
  workspaceId: string,
  periodStart?: string,
  periodEnd?:   string,
): Promise<BICustomerKPIs> {
  return rpc<BICustomerKPIs>('get_bi_customer_kpis', {
    p_workspace_id: workspaceId,
    p_period_start: periodStart ?? null,
    p_period_end:   periodEnd   ?? null,
  });
}

export async function getFullFunnel(
  workspaceId: string,
  periodStart?: string,
  periodEnd?:   string,
): Promise<BIFullFunnel> {
  return rpc<BIFullFunnel>('get_full_funnel', {
    p_workspace_id: workspaceId,
    p_period_start: periodStart ?? null,
    p_period_end:   periodEnd   ?? null,
  });
}

export async function getClientCohorts(
  workspaceId: string,
  months = 6,
): Promise<{ cohorts: CohortRow[]; avg_retention: number[]; labels: string[]; months_analyzed: number }> {
  return rpc('get_client_cohorts', { p_workspace_id: workspaceId, p_months: months });
}
