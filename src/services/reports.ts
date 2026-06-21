/**
 * reports.ts — Shelwi Sprint 5
 * ZERO TRUST: todos los cálculos ocurren en backend vía RPCs.
 * El frontend NUNCA calcula KPIs, conversiones ni rankings.
 * Solo consume y presenta datos ya calculados y validados por Postgres.
 */
import { supabase } from '../lib/supabaseClient';

// ─── Tipos de respuesta ───────────────────────────────────────────────────────

export interface ReportPeriod {
  start: string;
  end: string;
  days: number;
  plan: string;
}

export interface ReportKPIs {
  cotizaciones_creadas:   number;
  valor_cotizado:         number;
  cotizaciones_enviadas:  number;
  cotizaciones_aprobadas: number;
  valor_aprobado:         number;
  cotizaciones_rechazadas:number;
  cotizaciones_vencidas:  number;
  cotizaciones_vistas:    number;
  tasa_conversion:        number;
  tiempo_promedio_cierre_dias: number;
  con_seguimiento:        number;
}

export interface ReportComparativa {
  cotizaciones_creadas_prev: number;
  valor_cotizado_prev:       number;
  aprobadas_prev:            number;
  conversion_prev:           number;
}

export interface ReportMensual {
  month:          string;
  label:          string;
  valor_cotizado: number;
  valor_aprobado: number;
  count:          number;
  aprobadas:      number;
}

export interface ReportsSummary {
  period:               ReportPeriod;
  kpis:                 ReportKPIs;
  vs_periodo_anterior:  ReportComparativa | null;
  serie_mensual:        ReportMensual[];
}

export interface FunnelStage {
  status:                  string;
  order:                   number;
  label:                   string;
  count:                   number;
  valor:                   number;
  conversion_from_total:   number;
}

export interface FunnelResumen {
  total_en_pipeline:  number;
  valor_en_pipeline:  number;
  tasa_vista:         number;
  tasa_cierre:        number;
}

export interface FunnelReport {
  period:  { start: string; end: string };
  stages:  FunnelStage[];
  resumen: FunnelResumen;
}

export interface ServiceStat {
  service_name:     string;
  veces_cotizado:   number;
  valor_cotizado:   number;
  veces_vendido:    number;
  valor_vendido:    number;
  tasa_conversion:  number;
}

export interface ServicesReport {
  period:   { start: string; end: string };
  services: ServiceStat[];
}

export interface ClientStat {
  id:              string;
  name:            string;
  cotizaciones:    number;
  valor_cotizado:  number;
  aprobadas:       number;
  valor_aprobado:  number;
  tasa_conversion: number;
  ultima_actividad: string | null;
}

export interface ClientInactivo {
  id:                   string;
  name:                 string;
  total_aprobado:       number;
  dias_sin_actividad:   number;
  ultima_actividad:     string | null;
}

export interface ClientsResumen {
  total:       number;
  nuevos:      number;
  activos:     number;
  inactivos:   number;
  recurrentes: number;
}

export interface ClientsReport {
  period:            { start: string; end: string };
  resumen:           ClientsResumen;
  top_clientes:      ClientStat[] | null;
  inactivos_detalle: ClientInactivo[] | null;
}

export interface SmartAlert {
  type:       string;
  severity:   'high' | 'medium' | 'low';
  title:      string;
  message:    string;
  action:     string;
  value:      number;
  prev_value?: number;
  created_at: string;
}

export interface SmartAlertsResult {
  generated_at: string;
  alerts:       SmartAlert[];
  totals: {
    sin_seguimiento: number;
    por_vencer:      number;
    clientes_perdidos: number;
  };
}

export interface ExecutiveDashboard {
  plan: string;
  ultimos_30_dias: {
    valor_cotizado:   number;
    valor_aprobado:   number;
    cotizaciones:     number;
    aprobadas:        number;
    rechazadas:       number;
    tasa_conversion:  number;
  };
  mes_anterior: {
    valor_cotizado:  number;
    aprobadas:       number;
    tasa_conversion: number;
  };
  pipeline_activo: {
    total_oportunidades: number;
    valor_en_juego:      number;
    por_estado:          Record<string, { count: number; valor: number }>;
  };
  clientes: {
    total:       number;
    activos_30d: number;
    inactivos:   number;
  };
  ai_credits: {
    usado:    number;
    maximo:   number | null;
    periodo:  string;
  };
  premium_data: {
    tendencia_3m: Array<{ month: string; label: string; cotizado: number; aprobado: number }>;
  } | null;
}

// ─── Tipo para período de filtro ──────────────────────────────────────────────

export type ReportPeriodPreset = 'mes_actual' | 'mes_anterior' | 'ultimos_30' | 'ultimos_90' | 'este_año' | 'personalizado';

export function periodPresetToDates(preset: ReportPeriodPreset): { start: string; end: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  switch (preset) {
    case 'mes_actual': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: fmt(s), end: fmt(e) };
    }
    case 'mes_anterior': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: fmt(s), end: fmt(e) };
    }
    case 'ultimos_30': {
      const s = new Date(now.getTime() - 30 * 86_400_000);
      return { start: fmt(s), end: fmt(now) };
    }
    case 'ultimos_90': {
      const s = new Date(now.getTime() - 90 * 86_400_000);
      return { start: fmt(s), end: fmt(now) };
    }
    case 'este_año': {
      return { start: `${now.getFullYear()}-01-01`, end: fmt(now) };
    }
    default:
      return { start: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), end: fmt(now) };
  }
}

// ─── Funciones de acceso a RPCs ───────────────────────────────────────────────

async function rpcCall<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  const result = data as { ok: boolean; error?: string } & T;
  if (!result.ok) throw new Error(result.error ?? `Error en ${name}`);
  return result as T;
}

export async function getReportsSummary(
  workspaceId: string,
  periodStart?: string,
  periodEnd?: string
): Promise<ReportsSummary> {
  return rpcCall<ReportsSummary>('get_reports_summary', {
    p_workspace_id: workspaceId,
    p_period_start: periodStart ?? null,
    p_period_end:   periodEnd   ?? null,
  });
}

export async function getFunnelReport(
  workspaceId: string,
  periodStart?: string,
  periodEnd?: string
): Promise<FunnelReport> {
  return rpcCall<FunnelReport>('get_funnel_report', {
    p_workspace_id: workspaceId,
    p_period_start: periodStart ?? null,
    p_period_end:   periodEnd   ?? null,
  });
}

export async function getServicesReport(
  workspaceId: string,
  periodStart?: string,
  periodEnd?: string
): Promise<ServicesReport> {
  return rpcCall<ServicesReport>('get_services_report', {
    p_workspace_id: workspaceId,
    p_period_start: periodStart ?? null,
    p_period_end:   periodEnd   ?? null,
  });
}

export async function getClientsReport(
  workspaceId: string,
  periodStart?: string,
  periodEnd?: string
): Promise<ClientsReport> {
  return rpcCall<ClientsReport>('get_clients_report', {
    p_workspace_id: workspaceId,
    p_period_start: periodStart ?? null,
    p_period_end:   periodEnd   ?? null,
  });
}

export async function getExecutiveDashboard(workspaceId: string): Promise<ExecutiveDashboard> {
  return rpcCall<ExecutiveDashboard>('get_executive_dashboard', {
    p_workspace_id: workspaceId,
  });
}

export async function getSmartAlerts(workspaceId: string): Promise<SmartAlertsResult> {
  return rpcCall<SmartAlertsResult>('get_smart_alerts', {
    p_workspace_id: workspaceId,
  });
}

// ─── Exportaciones vía Edge Function ─────────────────────────────────────────

export type ExportFormat     = 'csv' | 'pdf';
export type ExportReportType = 'summary' | 'funnel' | 'services' | 'clients' | 'executive';

export async function exportReport(opts: {
  reportType: ExportReportType;
  format:     ExportFormat;
  periodStart?: string;
  periodEnd?:   string;
}): Promise<Blob> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sin sesión activa');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const functionUrl = `${supabaseUrl}/functions/v1/generate-report`;

  const resp = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      report_type:  opts.reportType,
      format:       opts.format,
      period_start: opts.periodStart ?? null,
      period_end:   opts.periodEnd   ?? null,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Error desconocido' }));
    throw new Error((err as Record<string, string>)['message'] ?? (err as Record<string, string>)['error'] ?? 'Error al generar el reporte');
  }

  return resp.blob();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
