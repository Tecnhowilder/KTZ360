/**
 * gps.ts — Servicio GPS Sprint 8
 * Zero Trust: todas las validaciones en backend (RPCs security definer).
 * Sin watchPosition() — one-shot únicamente.
 * Consentimiento GPS obligatorio antes de cualquier operación de localización.
 */
import { supabase } from '../lib/supabaseClient';
import type {
  OperationalStatus, TeamMapMember, OperationalDashboard,
  GpsEventRow,
} from '../lib/database.types';

// ─── Tipos de respuesta ───────────────────────────────────────────────────────

export interface GpsConsentResult {
  consented_at: string;
}

export interface CheckInResult {
  event_type: 'check_in';
  operational_status: OperationalStatus;
  gps_event_id: string;
}

export interface CheckOutResult {
  event_type: 'check_out';
  operational_status: OperationalStatus;
  gps_event_id: string;
}

export interface TeamMapResult {
  can_view_full_team: boolean;
  members: TeamMapMember[];
}

export interface MemberDetailResult {
  member: TeamMapMember & {
    gps_consent_at: string | null;
  };
  recent_gps_events: GpsEventRow[];
  active_work_orders: Array<{
    id: string;
    work_order_number: string;
    title: string;
    status: string;
    priority: string;
    order_number: string;
    order_title: string;
  }>;
}

// ─── Helper RPC ───────────────────────────────────────────────────────────────

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  const result = data as { ok: boolean; error?: string } & T;
  if (!result.ok) throw new Error(result.error ?? `Error en ${name}`);
  return result as T;
}

// ─── Geolocation API — one-shot, sin watchPosition ───────────────────────────

export interface GpsPosition {
  latitude:  number;
  longitude: number;
  accuracy:  number;
}

const GPS_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15_000,
  maximumAge: 30_000,  // aceptar ubicación de hasta 30s de antigüedad
};

// Umbral de precisión: warn si > 100m, rechazar si > 500m
const ACCURACY_WARN_M  = 100;
const ACCURACY_LIMIT_M = 500;

export function getCurrentPosition(): Promise<GpsPosition & { accuracyWarning?: string }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Este dispositivo no soporta GPS'));
      return;
    }
    // ONE-SHOT: getCurrentPosition, nunca watchPosition
    navigator.geolocation.getCurrentPosition(
      pos => {
        const accuracy = pos.coords.accuracy;
        // Rechazar si la precisión es demasiado baja
        if (accuracy > ACCURACY_LIMIT_M) {
          reject(new Error(
            `Señal GPS muy débil (precisión: ${Math.round(accuracy)}m). ` +
            'Ve a un espacio abierto e intenta de nuevo.'
          ));
          return;
        }
        resolve({
          latitude:  pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy,
          // Advertencia si la precisión es entre 100m-500m
          accuracyWarning: accuracy > ACCURACY_WARN_M
            ? `Precisión GPS: ${Math.round(accuracy)}m (señal débil)`
            : undefined,
        });
      },
      err => {
        const messages: Record<number, string> = {
          1: 'Permiso de GPS denegado. Actívalo en la configuración del dispositivo.',
          2: 'No se pudo obtener la ubicación. Comprueba que el GPS esté activo.',
          3: 'GPS tardó demasiado. Intenta en un lugar con mejor señal.',
        };
        reject(new Error(messages[err.code] ?? 'Error al obtener ubicación GPS'));
      },
      GPS_OPTIONS
    );
  });
}

// ─── Consentimiento ───────────────────────────────────────────────────────────

export async function grantGpsConsent(): Promise<GpsConsentResult> {
  return rpc<GpsConsentResult>('grant_gps_consent');
}

// ─── Check In / Check Out ─────────────────────────────────────────────────────

export async function recordCheckIn(opts: {
  orderId?:      string | null;
  workOrderId?:  string | null;
}): Promise<CheckInResult> {
  const pos = await getCurrentPosition();
  return rpc<CheckInResult>('record_check_in', {
    p_latitude:      pos.latitude,
    p_longitude:     pos.longitude,
    p_accuracy:      pos.accuracy,
    p_order_id:      opts.orderId     ?? null,
    p_work_order_id: opts.workOrderId ?? null,
  });
}

export async function recordCheckOut(opts: {
  orderId?:      string | null;
  workOrderId?:  string | null;
}): Promise<CheckOutResult> {
  const pos = await getCurrentPosition();
  return rpc<CheckOutResult>('record_check_out', {
    p_latitude:      pos.latitude,
    p_longitude:     pos.longitude,
    p_accuracy:      pos.accuracy,
    p_order_id:      opts.orderId     ?? null,
    p_work_order_id: opts.workOrderId ?? null,
  });
}

// ─── Estado operativo ─────────────────────────────────────────────────────────

export async function updateOperationalStatus(newStatus: OperationalStatus): Promise<{
  from_status: OperationalStatus;
  to_status:   OperationalStatus;
}> {
  return rpc('update_operational_status', { p_new_status: newStatus });
}

export async function updateLocationManual(): Promise<void> {
  const pos = await getCurrentPosition();
  await rpc('update_location_manual', {
    p_latitude:  pos.latitude,
    p_longitude: pos.longitude,
    p_accuracy:  pos.accuracy,
  });
}

// ─── Mapa y detalle ───────────────────────────────────────────────────────────

export async function getTeamMap(workspaceId: string): Promise<TeamMapResult> {
  return rpc<TeamMapResult>('get_team_map', { p_workspace_id: workspaceId });
}

export async function getMemberDetail(
  userId: string,
  workspaceId: string
): Promise<MemberDetailResult> {
  return rpc<MemberDetailResult>('get_member_detail', {
    p_user_id:      userId,
    p_workspace_id: workspaceId,
  });
}

// ─── Dashboard operativo ──────────────────────────────────────────────────────

export async function getOperationalDashboard(workspaceId: string): Promise<OperationalDashboard> {
  return rpc<OperationalDashboard>('get_operational_dashboard', { p_workspace_id: workspaceId });
}

// ─── Labels y colores por rol/estado ─────────────────────────────────────────

export const ROLE_META: Record<string, { label: string; bg: string; color: string }> = {
  owner:        { label: 'Propietario',   bg: '#1E40AF', color: '#fff' },
  admin:        { label: 'Administrador', bg: '#7C3AED', color: '#fff' },
  supervisor:   { label: 'Supervisor',    bg: '#0891B2', color: '#fff' },
  comercial:    { label: 'Comercial',     bg: '#D97706', color: '#fff' },
  operario:     { label: 'Operario',      bg: '#16A34A', color: '#fff' },
  super_admin:  { label: 'Super admin',   bg: '#0F172A', color: '#fff' },
  support_admin:{ label: 'Soporte',       bg: '#64748B', color: '#fff' },
};

export const OPERATIONAL_STATUS_META: Record<OperationalStatus, {
  label: string; color: string; bg: string; dotColor: string; emoji: string;
}> = {
  off:        { label: 'Desconectado', color: '#64748B', bg: '#F8FAFC', dotColor: '#94A3B8', emoji: '⚫' },
  disponible: { label: 'Disponible',   color: '#16A34A', bg: '#F0FDF4', dotColor: '#22C55E', emoji: '🟢' },
  en_ruta:    { label: 'En ruta',      color: '#2563EB', bg: '#EFF6FF', dotColor: '#3B82F6', emoji: '🔵' },
  en_sitio:   { label: 'En sitio',     color: '#D97706', bg: '#FFFBEB', dotColor: '#F59E0B', emoji: '🟡' },
  finalizado: { label: 'Finalizado',   color: '#7C3AED', bg: '#F5F3FF', dotColor: '#8B5CF6', emoji: '✅' },
};

export function canViewFullTeam(role: string): boolean {
  return ['owner','admin','supervisor','super_admin','support_admin'].includes(role);
}

export function formatLastSeen(dateStr: string | null): string {
  if (!dateStr) return 'Sin ubicación';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (diff < 1)   return 'Ahora mismo';
  if (diff < 60)  return `Hace ${diff} min`;
  if (diff < 1440) return `Hace ${Math.floor(diff / 60)}h`;
  return `Hace ${Math.floor(diff / 1440)}d`;
}
