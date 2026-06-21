/**
 * clientPortal.ts — Servicio del Portal del Cliente Sprint 10
 * Zero Trust: todo acceso validado via token en backend (RPCs security definer).
 * El frontend nunca envía workspace_id ni client_id — los deduce el backend del token.
 */
import { supabase } from '../lib/supabaseClient';
import type {
  ClientPortalData, PortalOrder, PortalWorkOrder, PortalEvidence,
  PortalTimelineEvent, PortalAnalytics,
} from '../lib/database.types';

// ─── Helper RPC (sin auth — portal público) ───────────────────────────────────

async function publicRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  const result = data as { ok: boolean; error?: string; code?: string } & T;
  if (!result.ok) {
    const err = new Error(result.error ?? `Error en ${name}`);
    (err as Error & { code?: string }).code = result.code;
    throw err;
  }
  return result as T;
}

async function authRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  const result = data as { ok: boolean; error?: string } & T;
  if (!result.ok) throw new Error(result.error ?? `Error en ${name}`);
  return result as T;
}

// ─── Portal del cliente (sin auth) ───────────────────────────────────────────

export async function getClientPortal(token: string): Promise<ClientPortalData> {
  return publicRpc<ClientPortalData>('get_client_portal', { p_token: token });
}

export async function getPortalQuotes(token: string): Promise<{ quotes: Array<{
  id: string; quote_number: string; title: string; status: string;
  commercial_status: string; total: number; sent_at: string | null;
  valid_days: number; created_at: string; updated_at: string;
}> }> {
  return publicRpc('get_portal_quotes', { p_token: token });
}

export async function getPortalOrders(token: string): Promise<{ orders: PortalOrder[] }> {
  return publicRpc('get_portal_orders', { p_token: token });
}

export async function getPortalWorkOrders(token: string, orderId: string): Promise<{ work_orders: PortalWorkOrder[] }> {
  return publicRpc('get_portal_work_orders', { p_token: token, p_order_id: orderId });
}

export async function getPortalEvidences(token: string, orderId?: string | null): Promise<{ evidences: PortalEvidence[] }> {
  return publicRpc('get_portal_evidences', { p_token: token, p_order_id: orderId ?? null });
}

export async function getPortalTimeline(token: string): Promise<{ events: PortalTimelineEvent[] }> {
  return publicRpc('get_portal_timeline', { p_token: token });
}

// ─── Gestión de tokens (requiere auth — workspace owner/admin) ────────────────

export async function createClientPortalToken(
  workspaceId: string,
  clientId:    string,
  daysValid:   number = 90
): Promise<{ token: string; expires_at: string; portal_url: string }> {
  return authRpc('create_client_portal_token', {
    p_workspace_id: workspaceId,
    p_client_id:    clientId,
    p_days_valid:   daysValid,
  });
}

export async function revokeClientPortalToken(workspaceId: string, clientId: string): Promise<void> {
  await authRpc('revoke_client_portal_token', {
    p_workspace_id: workspaceId,
    p_client_id:    clientId,
  });
}

export async function getPortalAnalytics(workspaceId: string): Promise<PortalAnalytics> {
  return authRpc<PortalAnalytics>('get_portal_analytics', { p_workspace_id: workspaceId });
}

// ─── URLs firmadas de evidencias (bucket privado) ─────────────────────────────

export async function getPortalEvidenceUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from('evidences')
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) throw new Error('No se pudo obtener URL de la evidencia');
  return data.signedUrl;
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────

export const PORTAL_ORDER_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pendiente:    { label: 'Pendiente',    color: '#92400E', bg: '#FEF3C7' },
  programado:   { label: 'Programado',   color: '#1E40AF', bg: '#DBEAFE' },
  en_ejecucion: { label: 'En ejecución', color: '#166534', bg: '#DCFCE7' },
  pausado:      { label: 'Pausado',      color: '#6B21A8', bg: '#F3E8FF' },
  finalizado:   { label: 'Finalizado',   color: '#065F46', bg: '#D1FAE5' },
  cancelado:    { label: 'Cancelado',    color: '#9F1239', bg: '#FFE4E6' },
};

export const PORTAL_WO_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pendiente:   { label: 'Pendiente',   color: '#92400E', bg: '#FEF3C7' },
  asignada:    { label: 'Asignada',    color: '#1E40AF', bg: '#DBEAFE' },
  en_progreso: { label: 'En progreso', color: '#166534', bg: '#DCFCE7' },
  pausada:     { label: 'Pausada',     color: '#6B21A8', bg: '#F3E8FF' },
  finalizada:  { label: 'Finalizada',  color: '#065F46', bg: '#D1FAE5' },
  cancelada:   { label: 'Cancelada',   color: '#9F1239', bg: '#FFE4E6' },
};

export const PORTAL_QUOTE_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  Borrador:  { label: 'En preparación', color: '#64748B', bg: '#F1F5F9' },
  Enviada:   { label: 'Enviada',        color: '#2563EB', bg: '#EFF6FF' },
  Aprobada:  { label: 'Aprobada',       color: '#16A34A', bg: '#F0FDF4' },
  Rechazada: { label: 'Rechazada',      color: '#DC2626', bg: '#FEF2F2' },
  Vencida:   { label: 'Vencida',        color: '#64748B', bg: '#F8FAFC' },
};

export const TIMELINE_ICONS: Record<string, string> = {
  quote_created:    '📋',
  quote_sent:       '📤',
  quote_approved:   '✅',
  quote_rejected:   '❌',
  order_programado: '📅',
  order_en_ejecucion:'🔧',
  order_finalizado: '🏁',
  evidence_uploaded:'📷',
};
