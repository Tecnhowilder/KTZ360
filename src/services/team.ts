import { supabase } from '../lib/supabaseClient';
import type { ProfileRow, WorkspaceInvitationRow } from '../lib/database.types';

export interface TeamSeats {
  plan_code:           string;
  multiuser_enabled:   boolean;
  /** NULL en Enterprise (ilimitado). Número en PRO/PREMIUM. */
  included_users:      number | null;
  extra_user_price:    number;
  additional_licenses: number;
  active_members:      number;
  pending_invites:     number;
  seats_used:          number;
  /** NULL = ilimitado (Enterprise). El frontend muestra ∞. */
  seats_limit:         number | null;
}

// ─── SINGLE SOURCE OF TRUTH ──────────────────────────────────────────────────
// get_team_state retorna seats + members + pending en UNA SOLA llamada.
// Todos los contadores de TeamMobile deben derivar ÚNICAMENTE de este objeto.
// Nunca mantener contadores independientes derivados de queries paralelas.

export interface TeamState {
  seats:   TeamSeats;
  members: ProfileRow[];       // status IN ('active','inactive'), NO removed
  pending: WorkspaceInvitationRow[];
}

export async function getTeamState(): Promise<TeamState> {
  const { data, error } = await (supabase as any).rpc('get_team_state');
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'Error al cargar estado del equipo');
  return {
    seats:   data.seats   as TeamSeats,
    members: data.members as ProfileRow[],
    pending: data.pending as WorkspaceInvitationRow[],
  };
}

export async function getTeamSeats(workspaceId: string): Promise<TeamSeats> {
  const { data, error } = await supabase.rpc('get_team_seats', { p_workspace_id: workspaceId });
  if (error) throw error;
  return data as unknown as TeamSeats;
}

// ─── Historial de invitaciones (todas: pendientes, aceptadas, revocadas, expiradas) ──

export interface InvitationHistoryItem {
  id:               string;
  email:            string;
  full_name:        string | null;
  role:             string;
  status:           string;
  created_at:       string;
  accepted_at:      string | null;
  accepted_by:      string | null;
  expires_at:       string | null;
  invited_by:       string | null;
  inviter_name:     string | null;
  city:             string | null;
  specialty:        string | null;
  delivery_channel: string;
}

export async function getInvitationHistory(workspaceId: string): Promise<InvitationHistoryItem[]> {
  const { data, error } = await (supabase as any).rpc('get_invitation_history', {
    p_workspace_id: workspaceId,
    p_limit:        50,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'Error al cargar historial');
  return (data.invitations ?? []) as InvitationHistoryItem[];
}

// ─── Verificar si Resend está configurado (antes de intentar enviar) ──────────

export async function isResendConfigured(): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('system_configuration')
      .select('value')
      .eq('key', 'resend')
      .maybeSingle();
    const val = data?.value as Record<string, unknown> | undefined;
    return !!(val?.api_key);
  } catch {
    return false;
  }
}

export async function listTeamMembers(workspaceId: string): Promise<ProfileRow[]> {
  // FIX: Filtrar explícitamente por status IN ('active','inactive')
  // Antes no había filtro y devolvía 'removed' también.
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('workspace_id', workspaceId)
    .in('status', ['active', 'inactive'])
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listPendingInvitations(workspaceId: string): Promise<WorkspaceInvitationRow[]> {
  const { data, error } = await supabase
    .from('workspace_invitations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listInvitationHistory(workspaceId: string): Promise<WorkspaceInvitationRow[]> {
  const { data, error } = await supabase
    .from('workspace_invitations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .in('status', ['accepted', 'revoked', 'expired'])
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

export interface InviteTeamMemberInput {
  workspaceId:  string;
  email:        string;
  role:         'admin' | 'supervisor' | 'comercial' | 'operario';
  fullName?:    string;
  phone?:       string;
  city?:        string;
  profession?:  string;
  specialty?:   string;
  inviterName:  string;
  workspaceName: string;
}

export interface InviteResult {
  invitation: WorkspaceInvitationRow;
  emailSent: boolean;
}

export async function inviteTeamMember(input: InviteTeamMemberInput): Promise<InviteResult> {
  let rpcData: unknown;

  // Intentar primero con los 8 parámetros extendidos (migration 0108+)
  const ext = await supabase.rpc('invite_team_member', {
    p_workspace_id: input.workspaceId,
    p_email:        input.email,
    p_role:         input.role,
    p_full_name:    input.fullName   ?? null,
    p_phone:        input.phone      ?? null,
    p_city:         input.city       ?? null,
    p_profession:   input.profession ?? null,
    p_specialty:    input.specialty  ?? null,
  });

  if (ext.error) {
    // Si el RPC extendido no existe (migración no aplicada aún) → fallback 4 params
    const msg = ext.error.message?.toLowerCase() ?? '';
    const isNotFound =
      msg.includes('could not find') ||
      msg.includes('no function') ||
      msg.includes('overloaded') ||
      msg.includes('get_random_bytes') ||   // error 42883 — typo en DB
      msg.includes('does not exist') ||     // cualquier función faltante
      (ext.error as any).status === 404 ||
      (ext.error as any).code === 'PGRST202' ||
      (ext.error as any).code === '42883';  // undefined_function

    if (isNotFound) {
      const base = await supabase.rpc('invite_team_member', {
        p_workspace_id: input.workspaceId,
        p_email:        input.email,
        p_role:         input.role,
        p_full_name:    input.fullName ?? null,
      });
      if (base.error) throw base.error;
      rpcData = base.data;
    } else {
      throw ext.error;
    }
  } else {
    rpcData = ext.data;
  }

  // Normalizar respuesta — maneja dos formatos posibles:
  //   A) { ok: true, invitation_id, token, email, role, full_name }  ← 0107/0113
  //   B) jsonb row completo { id, token, email, role, ... }          ← 0108 sin corregir
  const d = rpcData as any;

  let invitation: WorkspaceInvitationRow;

  if (d?.ok !== undefined) {
    // Formato A (esperado)
    if (!d.ok) throw new Error(d.error ?? 'Error al crear invitación');
    invitation = {
      id:           d.invitation_id,
      token:        d.token,
      email:        d.email,
      role:         d.role,
      full_name:    d.full_name ?? null,
      workspace_id: input.workspaceId,
      status:       'pending',
      created_at:   new Date().toISOString(),
    } as unknown as WorkspaceInvitationRow;
  } else if (d?.id) {
    // Formato B (fila completa — migration 0108 sin fix)
    invitation = d as unknown as WorkspaceInvitationRow;
  } else {
    throw new Error('Error al crear invitación: respuesta inesperada del servidor');
  }

  const emailResult = await sendInvitationEmail(invitation, input.inviterName, input.workspaceName);
  return { invitation, emailSent: emailResult.ok };
}

export async function resendInvitation(invitationId: string, inviterName: string, workspaceName: string): Promise<InviteResult> {
  const { data, error } = await supabase.rpc('resend_invitation', { p_invitation_id: invitationId });
  if (error) throw error;
  const invitation = data as unknown as WorkspaceInvitationRow;

  const emailResult = await sendInvitationEmail(invitation, inviterName, workspaceName);

  return { invitation, emailSent: emailResult.ok };
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_invitation', { p_invitation_id: invitationId });
  if (error) throw error;
}

export async function updateMemberRole(profileId: string, role: 'admin' | 'supervisor' | 'comercial' | 'operario'): Promise<void> {
  const { error } = await supabase.rpc('update_team_member_role', { p_profile_id: profileId, p_role: role });
  if (error) throw error;
}

export async function setMemberStatus(profileId: string, status: 'active' | 'inactive' | 'removed', reason?: string): Promise<void> {
  const { error } = await supabase.rpc('set_team_member_status', { p_profile_id: profileId, p_status: status, p_reason: reason ?? null });
  if (error) throw error;
}

export async function transferOwnership(profileId: string): Promise<void> {
  const { error } = await supabase.rpc('transfer_ownership', { p_new_owner_profile_id: profileId });
  if (error) throw error;
}

export async function getInvitationPreview(token: string): Promise<{ email: string; role: string; workspace_name: string; status: string; expires_at: string }> {
  const { data, error } = await supabase.rpc('get_invitation_preview', { p_token: token });
  if (error) throw error;
  return data as unknown as { email: string; role: string; workspace_name: string; status: string; expires_at: string };
}

export async function acceptInvitation(token: string): Promise<{ workspace_name: string; role: string }> {
  const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });
  if (error) throw error;
  return data as unknown as { workspace_name: string; role: string };
}

/**
 * Invoca la Edge Function send-email con el template `team_invite`. Si Resend
 * no está configurado (501) o falla, no rompe el flujo: la invitación ya
 * quedó creada y el enlace /invite/{token} sirve como respaldo manual.
 */
async function sendInvitationEmail(invitation: WorkspaceInvitationRow, inviterName: string, workspaceName: string): Promise<{ ok: boolean }> {
  try {
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: {
        template: 'team_invite',
        to: invitation.email,
        data: {
          inviterName,
          workspaceName,
          role: invitation.role,
          token: invitation.token,
          appUrl: window.location.origin,
        },
      },
    });
    if (error) return { ok: false };
    return (data as { ok?: boolean })?.ok ? { ok: true } : { ok: false };
  } catch {
    return { ok: false };
  }
}
