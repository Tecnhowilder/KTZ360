import { supabase } from '../lib/supabaseClient';
import type { ProfileRow, WorkspaceInvitationRow } from '../lib/database.types';

export interface TeamSeats {
  plan_code: string;
  multiuser_enabled: boolean;
  included_users: number;
  extra_user_price: number;
  additional_licenses: number;
  active_members: number;
  pending_invites: number;
  seats_used: number;
  seats_limit: number;
}

export async function getTeamSeats(workspaceId: string): Promise<TeamSeats> {
  const { data, error } = await supabase.rpc('get_team_seats', { p_workspace_id: workspaceId });
  if (error) throw error;
  return data as unknown as TeamSeats;
}

export async function listTeamMembers(workspaceId: string): Promise<ProfileRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('workspace_id', workspaceId)
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
  workspaceId: string;
  email: string;
  role: 'admin' | 'supervisor' | 'comercial' | 'operario';
  fullName?: string;
  inviterName: string;
  workspaceName: string;
}

export interface InviteResult {
  invitation: WorkspaceInvitationRow;
  emailSent: boolean;
}

export async function inviteTeamMember(input: InviteTeamMemberInput): Promise<InviteResult> {
  const { data, error } = await supabase.rpc('invite_team_member', {
    p_workspace_id: input.workspaceId,
    p_email: input.email,
    p_role: input.role,
    p_full_name: input.fullName ?? null,
  });
  if (error) throw error;
  const invitation = data as unknown as WorkspaceInvitationRow;

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
