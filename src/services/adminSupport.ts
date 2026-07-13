/**
 * adminSupport.ts — Servicio de soporte técnico cross-workspace (Paso 1 Enterprise)
 *
 * Provee funciones para el módulo de soporte del backoffice:
 *   - Gestión de sesiones activas del usuario
 *   - Gestión de push tokens
 *   - Historial de actividad
 *   - Reset password / MFA (via Edge Function admin-support)
 *   - Impersonation segura (via Edge Function admin-support)
 *
 * Zero Trust:
 *   - Todas las RPCs verifican is_support_admin() en backend (SECURITY DEFINER)
 *   - Edge Function valida JWT + rol antes de ejecutar acciones privilegiadas
 *   - Service Role key NUNCA llega al frontend
 */
import { supabase } from '../lib/supabaseClient';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (supabase as any).rpc.bind(supabase as any);

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AdminUserSession {
  id:           string;
  workspace_id: string;
  workspace_name: string | null;
  device_id:    string;
  device_name:  string | null;
  user_agent:   string | null;
  ip:           string | null;
  last_seen_at: string;
  created_at:   string;
  revoked_at:   string | null;
  revoke_reason:string | null;
  is_active:    boolean;
}

export interface AdminPushToken {
  id:             string;
  workspace_id:   string;
  workspace_name: string | null;
  platform:       'ios' | 'android' | 'web';
  device_id:      string;
  app_version:    string | null;
  is_active:      boolean;
  registered_at:  string;
  last_used_at:   string | null;
}

export interface AdminUserActivityRow {
  id:             string;
  workspace_id:   string;
  workspace_name: string | null;
  action:         string;
  entity_type:    string | null;
  entity_id:      string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata:       Record<string, any> | null;
  created_at:     string;
}

export interface SupportActionResult {
  ok:      boolean;
  message: string;
  link?:   string | null;
  warning?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// ─── Sesiones ─────────────────────────────────────────────────────────────────

export async function adminGetUserSessions(userId: string): Promise<AdminUserSession[]> {
  const { data, error } = await rpc('admin_get_user_sessions', { p_user_id: userId });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'Error obteniendo sesiones');
  return (data.sessions ?? []) as AdminUserSession[];
}

export async function adminRevokeUserSession(sessionId: string, reason = 'admin_action'): Promise<string> {
  const { data, error } = await rpc('admin_revoke_user_session', { p_session_id: sessionId, p_reason: reason });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'Error revocando sesión');
  return data.message as string;
}

export async function adminRevokeAllUserSessions(userId: string): Promise<number> {
  const { data, error } = await rpc('admin_revoke_all_user_sessions', { p_user_id: userId, p_reason: 'admin_force_logout' });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'Error revocando sesiones');
  return (data.revoked ?? 0) as number;
}

// ─── Push Tokens ──────────────────────────────────────────────────────────────

export async function adminGetUserPushTokens(userId: string): Promise<AdminPushToken[]> {
  const { data, error } = await rpc('admin_get_user_push_tokens', { p_user_id: userId });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'Error obteniendo tokens');
  return (data.tokens ?? []) as AdminPushToken[];
}

export async function adminRevokePushToken(tokenId: string): Promise<string> {
  const { data, error } = await rpc('admin_revoke_push_token', { p_token_id: tokenId });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'Error revocando token');
  return data.message as string;
}

// ─── Actividad ────────────────────────────────────────────────────────────────

export async function adminGetUserActivity(userId: string, limit = 50): Promise<AdminUserActivityRow[]> {
  const { data, error } = await rpc('admin_get_user_activity', { p_user_id: userId, p_limit: limit });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'Error obteniendo actividad');
  return (data.activity ?? []) as AdminUserActivityRow[];
}

// ─── Acciones privilegiadas (Edge Function) ───────────────────────────────────

async function callAdminSupportEF(
  action: 'reset_password' | 'reset_mfa' | 'impersonate',
  userId: string,
  email?: string,
): Promise<SupportActionResult> {
  const { data, error } = await supabase.functions.invoke('admin-support', {
    body: { action, user_id: userId, email },
  });
  if (error) throw new Error(error.message ?? 'Error en admin-support');
  if (!data?.ok) throw new Error(data?.error ?? `Error en acción ${action}`);
  return data as SupportActionResult;
}

export async function adminResetPassword(userId: string, email: string): Promise<SupportActionResult> {
  return callAdminSupportEF('reset_password', userId, email);
}

export async function adminResetMFA(userId: string): Promise<SupportActionResult> {
  return callAdminSupportEF('reset_mfa', userId);
}

export async function adminImpersonate(userId: string, email: string): Promise<SupportActionResult> {
  return callAdminSupportEF('impersonate', userId, email);
}
