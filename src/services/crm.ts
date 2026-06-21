/**
 * CRM Service — Sprint 4
 * Zero Trust: todas las validaciones en backend via RPCs security definer.
 * El frontend nunca decide acceso por su cuenta.
 */
import { supabase } from '../lib/supabaseClient';
import type {
  CommercialStatus, SeguimientoType,
  SeguimientoRow, RecordatorioRow, ClientTimelineEventRow,
  QuoteCommercialHistoryRow,
} from '../lib/database.types';

// ─── Tipos de respuesta ───────────────────────────────────────────────────────

export interface PipelineQuote {
  id: string;
  title: string;
  quote_number: string;
  commercial_status: CommercialStatus;
  status: string;
  client_id: string | null;
  client_name: string | null;
  total: number;
  sent_at: string | null;
  updated_at: string;
  created_at: string;
  valid_days: number;
}

export interface PipelineColumn {
  count: number;
  total: number;
}

export interface PipelineResult {
  pipeline: Partial<Record<CommercialStatus, PipelineColumn>>;
  quotes: PipelineQuote[];
}

export interface CrmDashboardResult {
  period_days: number;
  sent: number;
  viewed: number;
  approved: number;
  rejected: number;
  in_negotiation: number;
  conversion_rate: number;
  avg_close_days: number;
  total_value_approved: number;
  without_followup: number;
  expiring_soon: number;
}

export interface ClientTimelineResult {
  events: ClientTimelineEventRow[];
  seguimientos: SeguimientoRow[];
}

export interface QuoteCommercialDetail {
  history: QuoteCommercialHistoryRow[];
  seguimientos: SeguimientoRow[];
  views: Array<{ opened_at: string; device: string | null; browser: string | null; city: string | null }>;
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export async function getPipeline(workspaceId: string): Promise<PipelineResult> {
  const { data, error } = await supabase.rpc('get_pipeline', {
    p_workspace_id: workspaceId,
  });
  if (error) throw error;
  const result = data as { ok: boolean; error?: string; pipeline?: unknown; quotes?: unknown };
  if (!result.ok) throw new Error(result.error ?? 'Error al obtener pipeline');
  return {
    pipeline: (result.pipeline ?? {}) as PipelineResult['pipeline'],
    quotes: (result.quotes ?? []) as PipelineQuote[],
  };
}

export async function updateCommercialStatus(
  quoteId: string,
  newStatus: CommercialStatus,
  observacion?: string
): Promise<void> {
  const { data, error } = await supabase.rpc('update_commercial_status', {
    p_quote_id: quoteId,
    p_new_status: newStatus,
    p_observacion: observacion ?? null,
  });
  if (error) throw error;
  const result = data as { ok: boolean; error?: string };
  if (!result.ok) throw new Error(result.error ?? 'Error al actualizar estado');
}

// ─── Seguimientos ─────────────────────────────────────────────────────────────

export async function createSeguimiento(
  workspaceId: string,
  opts: {
    quoteId?: string | null;
    clientId?: string | null;
    type: SeguimientoType;
    resultado?: string | null;
    comentario?: string | null;
  }
): Promise<string> {
  const { data, error } = await supabase.rpc('create_seguimiento', {
    p_workspace_id: workspaceId,
    p_quote_id: opts.quoteId ?? null,
    p_client_id: opts.clientId ?? null,
    p_type: opts.type,
    p_resultado: opts.resultado ?? null,
    p_comentario: opts.comentario ?? null,
  });
  if (error) throw error;
  const result = data as { ok: boolean; error?: string; seguimiento_id?: string };
  if (!result.ok) throw new Error(result.error ?? 'Error al crear seguimiento');
  return result.seguimiento_id!;
}

export async function listSeguimientos(
  workspaceId: string,
  quoteId?: string,
  clientId?: string
): Promise<SeguimientoRow[]> {
  let query = supabase
    .from('seguimientos' as never)
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (quoteId) query = (query as ReturnType<typeof query.eq>).eq('quote_id', quoteId);
  if (clientId) query = (query as ReturnType<typeof query.eq>).eq('client_id', clientId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SeguimientoRow[];
}

// ─── Recordatorios ────────────────────────────────────────────────────────────

export async function createRecordatorio(
  workspaceId: string,
  opts: {
    scheduledAt: Date;
    type?: SeguimientoType;
    note?: string | null;
    quoteId?: string | null;
    clientId?: string | null;
  }
): Promise<string> {
  const { data, error } = await supabase.rpc('create_recordatorio', {
    p_workspace_id: workspaceId,
    p_scheduled_at: opts.scheduledAt.toISOString(),
    p_type: opts.type ?? 'llamada',
    p_note: opts.note ?? null,
    p_quote_id: opts.quoteId ?? null,
    p_client_id: opts.clientId ?? null,
  });
  if (error) throw error;
  const result = data as { ok: boolean; error?: string; recordatorio_id?: string };
  if (!result.ok) throw new Error(result.error ?? 'Error al crear recordatorio');
  return result.recordatorio_id!;
}

export async function listRecordatorios(workspaceId: string): Promise<RecordatorioRow[]> {
  const { data, error } = await supabase
    .from('recordatorios' as never)
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'pendiente')
    .order('scheduled_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as RecordatorioRow[];
}

export async function completeRecordatorio(recordatorioId: string): Promise<void> {
  const { error } = await supabase
    .from('recordatorios' as never)
    .update({ status: 'completado' } as never)
    .eq('id', recordatorioId);
  if (error) throw error;
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export async function getClientTimeline(
  workspaceId: string,
  clientId: string,
  limit = 50
): Promise<ClientTimelineResult> {
  const { data, error } = await supabase.rpc('get_client_timeline', {
    p_workspace_id: workspaceId,
    p_client_id: clientId,
    p_limit: limit,
  });
  if (error) throw error;
  const result = data as { ok: boolean; error?: string; events?: unknown; seguimientos?: unknown };
  if (!result.ok) throw new Error(result.error ?? 'Error al obtener timeline');
  return {
    events: (result.events ?? []) as ClientTimelineEventRow[],
    seguimientos: (result.seguimientos ?? []) as SeguimientoRow[],
  };
}

// ─── Historial comercial de cotización ────────────────────────────────────────

export async function getQuoteCommercialDetail(quoteId: string): Promise<QuoteCommercialDetail> {
  const { data, error } = await supabase.rpc('get_quote_commercial_history', {
    p_quote_id: quoteId,
  });
  if (error) throw error;
  const result = data as { ok: boolean; error?: string; history?: unknown; seguimientos?: unknown; views?: unknown };
  if (!result.ok) throw new Error(result.error ?? 'Error al obtener historial');
  return {
    history: (result.history ?? []) as QuoteCommercialHistoryRow[],
    seguimientos: (result.seguimientos ?? []) as SeguimientoRow[],
    views: (result.views ?? []) as QuoteCommercialDetail['views'],
  };
}

// ─── Dashboard CRM ────────────────────────────────────────────────────────────

export async function getCrmDashboard(workspaceId: string): Promise<CrmDashboardResult> {
  const { data, error } = await supabase.rpc('get_crm_dashboard', {
    p_workspace_id: workspaceId,
  });
  if (error) throw error;
  const result = data as unknown as { ok: boolean; error?: string } & CrmDashboardResult;
  if (!result.ok) throw new Error(result.error ?? 'Error al obtener métricas CRM');
  return result as CrmDashboardResult;
}
