/**
 * finance.ts — Servicio de Finanzas Sprint 18
 * Zero Trust: workspace_id siempre del JWT.
 * Reutiliza: calc_snapshot (costos estimados), clients.total_value,
 *            integration_events (Alegra), customer_health_scores.
 * Frontend NUNCA calcula márgenes — solo consume resultados del backend.
 */
import { supabase } from '../lib/supabaseClient';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface FinanceSummary {
  total_revenue:           number;
  total_direct_cost:       number;
  estimated_profit:        number;
  estimated_margin_pct:    number;
  gross_margin_pct:        number;
  has_real_costs:          boolean;
  real_cost_total:         number;
  real_profit:             number | null;
  real_margin_pct:         number | null;
  quotes_approved:         number;
  orders_finalized:        number;
  revenue_prev:            number;
  revenue_change_pct:      number | null;
  profit_prev:             number;
  profit_change_pct:       number | null;
}

export interface MonthlyTrend {
  month:       string;
  label:       string;
  revenue:     number;
  direct_cost: number;
  util_amount: number;
  margin_pct:  number;
}

export interface ClientProfitRow {
  client_id:   string;
  client_name: string;
  revenue:     number;
  util_amount: number;
  margin_pct:  number;
  quote_count: number;
}

export interface ServiceProfitRow {
  service_name:     string;
  quote_count:      number;
  total_revenue:    number;
  total_direct_cost: number;
  margin_pct:       number;
}

export interface OrderProfitRow {
  order_id:     string;
  order_number: string;
  title:        string;
  client_name:  string;
  revenue:      number;
  margin_pct:   number;
}

export interface AlegraFinanceSummary {
  connected:         boolean;
  invoices_total:    number;
  invoices_pending:  number;
  invoices_paid:     number;
  amount_pending:    number;
  amount_paid:       number;
}

export interface FinanceDashboard {
  period_start:       string;
  period_end:         string;
  summary:            FinanceSummary;
  monthly_trend:      MonthlyTrend[];
  top_clients:        ClientProfitRow[];
  low_margin_clients: ClientProfitRow[];
  top_services:       ServiceProfitRow[];
  low_margin_orders:  OrderProfitRow[];
  alegra:             AlegraFinanceSummary;
  financial_health:   'good' | 'warning' | 'critical' | 'no_data';
}

export interface OrderProfit {
  order_id:               string;
  order_number:           string;
  title:                  string;
  client_name:            string;
  status:                 string;
  started_at:             string | null;
  finished_at:            string | null;
  revenue:                number;
  estimated_materials:    number;
  estimated_labor:        number;
  estimated_equipment:    number;
  estimated_direct_cost:  number;
  estimated_aiu:          number;
  estimated_profit_raw:   number;
  iva_amount:             number;
  transport_amount:       number;
  estimated_margin_pct:   number;
  estimated_gross_margin_pct: number;
  has_real_costs:         boolean;
  real_cost_total:        number;
  real_cost_by_type:      Record<string, number>;
  real_profit:            number | null;
  real_margin_pct:        number | null;
  gps_hours_worked:       number;
}

export interface WorkspaceProfitability {
  period_start:          string;
  period_end:            string;
  total_revenue:         number;
  quotes_count:          number;
  orders_finalized:      number;
  avg_quote_value:       number;
  total_materials:       number;
  total_labor:           number;
  total_equipment:       number;
  total_direct_cost:     number;
  total_admin:           number;
  total_contingency:     number;
  total_aiu:             number;
  total_iva:             number;
  total_transport:       number;
  estimated_profit:      number;
  estimated_margin_pct:  number;
  gross_margin_pct:      number;
  has_real_costs:        boolean;
  total_real_cost:       number;
  real_profit:           number | null;
  real_margin_pct:       number | null;
  monthly_trend:         MonthlyTrend[];
  top_clients:           ClientProfitRow[];
  low_margin_clients:    ClientProfitRow[];
}

export interface AdminFinanceSummary {
  saas: {
    mrr:                number;
    arr:                number;
    active_workspaces:  number;
    by_plan:            { free: number; pro: number; premium: number };
  };
  addons: {
    storage_monthly_revenue: number;
    ai_cost_usd_30d:         number;
    total_addon_revenue:     number;
  };
  growth: {
    new_workspaces_30d:     number;
    churned_workspaces_30d: number;
    net_growth_30d:         number;
  };
  monthly_trend: Array<{ month: string; label: string; mrr: number; workspaces: number }>;
}

export interface CostEntry {
  id:          string;
  type:        string;
  description: string;
  amount:      number;
  recorded_at: string;
}

export interface CostEntriesResult {
  entries:       CostEntry[];
  summary:       Record<string, number>;
  total_real_cost: number;
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

// ─── Funciones de servicio ────────────────────────────────────────────────────

export async function getFinanceDashboard(
  workspaceId: string,
  periodStart?: string,
  periodEnd?: string,
): Promise<FinanceDashboard> {
  return rpc<FinanceDashboard>('get_finance_dashboard', {
    p_workspace_id: workspaceId,
    p_period_start: periodStart ?? null,
    p_period_end:   periodEnd   ?? null,
  });
}

export async function getWorkspaceProfitability(
  workspaceId: string,
  periodStart?: string,
  periodEnd?: string,
): Promise<WorkspaceProfitability> {
  return rpc<WorkspaceProfitability>('get_workspace_profitability', {
    p_workspace_id: workspaceId,
    p_period_start: periodStart ?? null,
    p_period_end:   periodEnd   ?? null,
  });
}

export async function getOrderProfit(workspaceId: string, orderId: string): Promise<OrderProfit> {
  return rpc<OrderProfit>('get_order_profit', {
    p_workspace_id: workspaceId,
    p_order_id:     orderId,
  });
}

export async function getClientProfit(
  workspaceId: string,
  clientId: string,
  periodStart?: string,
  periodEnd?: string,
): Promise<Record<string, unknown>> {
  return rpc('get_client_profit', {
    p_workspace_id: workspaceId,
    p_client_id:    clientId,
    p_period_start: periodStart ?? null,
    p_period_end:   periodEnd   ?? null,
  });
}

export async function getServiceProfit(
  workspaceId: string,
  periodStart?: string,
  periodEnd?: string,
): Promise<{ services: ServiceProfitRow[] }> {
  return rpc('get_service_profit', {
    p_workspace_id: workspaceId,
    p_period_start: periodStart ?? null,
    p_period_end:   periodEnd   ?? null,
  });
}

export async function getOrderCostEntries(
  workspaceId: string,
  orderId: string,
): Promise<CostEntriesResult> {
  return rpc<CostEntriesResult>('get_order_cost_entries', {
    p_workspace_id: workspaceId,
    p_order_id:     orderId,
  });
}

export async function addOrderCostEntry(
  workspaceId: string,
  orderId: string,
  type: string,
  description: string,
  amount: number,
): Promise<{ id: string }> {
  return rpc('add_order_cost_entry', {
    p_workspace_id: workspaceId,
    p_order_id:     orderId,
    p_type:         type,
    p_description:  description,
    p_amount:       amount,
  });
}

export async function getAdminFinanceSummary(): Promise<AdminFinanceSummary> {
  return rpc<AdminFinanceSummary>('get_admin_finance_summary', {});
}

// ─── Labels y constantes ──────────────────────────────────────────────────────

export const COST_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  materials:     { label: 'Materiales',     icon: '🧱', color: '#2563EB' },
  labor:         { label: 'Mano de obra',   icon: '👷', color: '#7C3AED' },
  equipment:     { label: 'Equipos',        icon: '🔧', color: '#D97706' },
  overhead:      { label: 'Gastos generales', icon: '📋', color: '#64748B' },
  subcontractor: { label: 'Subcontratista', icon: '🤝', color: '#059669' },
  transport:     { label: 'Transporte',     icon: '🚚', color: '#0891B2' },
};

export function healthColor(health: string): string {
  return health === 'good' ? '#16A34A' : health === 'warning' ? '#D97706' : '#DC2626';
}

export function healthLabel(health: string): string {
  return health === 'good' ? 'Saludable' : health === 'warning' ? 'Atención' : health === 'critical' ? 'Crítico' : 'Sin datos';
}

export function marginColor(pct: number): string {
  if (pct >= 15) return '#16A34A';
  if (pct >= 8)  return '#D97706';
  return '#DC2626';
}
