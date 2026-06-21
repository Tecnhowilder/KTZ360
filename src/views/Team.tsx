import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useUI } from '../features/app/UIProvider';
import { useToast } from '../components/ui/Toast';
import { useTeamSeats, useTeamMembers, usePendingInvitations, useInvitationHistory } from '../hooks/usePermissions';
import { useWindowWidth, navModeFor } from '../hooks/useWindowWidth';
import { TeamMobile } from '../components/team/TeamMobile';
import {
  inviteTeamMember,
  resendInvitation,
  revokeInvitation,
  updateMemberRole,
  setMemberStatus,
  transferOwnership,
} from '../services/team';
import { BRAND_COLORS } from '../lib/brand';
import { isValidEmail } from '../lib/validation';
import type { ProfileRow, WorkspaceInvitationRow } from '../lib/database.types';

const ROLE_LABELS: Record<string, string> = {
  owner:         'Propietario',
  admin:         'Administrador',
  supervisor:    'Supervisor',
  comercial:     'Comercial',
  operario:      'Operario',
  employee:      'Operario',      // legacy alias
  super_admin:   'Super admin',
  support_admin: 'Soporte',
};

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'Activo', color: '#16A34A', bg: '#F0FDF4' },
  inactive: { label: 'Inactivo', color: '#64748B', bg: '#F1F5F9' },
  invited: { label: 'Invitado', color: '#2563EB', bg: '#EFF6FF' },
  removed: { label: 'Eliminado', color: '#DC2626', bg: '#FEF2F2' },
  pending: { label: 'Pendiente', color: '#D97706', bg: '#FFFBEB' },
  accepted: { label: 'Aceptada', color: '#16A34A', bg: '#F0FDF4' },
  revoked: { label: 'Revocada', color: '#DC2626', bg: '#FEF2F2' },
  expired: { label: 'Vencida', color: '#64748B', bg: '#F1F5F9' },
};

const ERROR_MESSAGES: Record<string, string> = {
  feature_not_available: 'El módulo de equipo solo está disponible en el plan PREMIUM.',
  'feature_not_available: multiuser_enabled': 'El módulo de equipo solo está disponible en el plan PREMIUM.',
  seat_limit_exceeded: 'Has alcanzado el límite de usuarios incluidos en tu plan.',
  forbidden: 'No tienes permisos para realizar esta acción.',
  cannot_modify_owner: 'No puedes desactivar ni eliminar al propietario. Transfiere la propiedad primero.',
  'cannot_modify_owner: use transfer_ownership first': 'No puedes desactivar ni eliminar al propietario. Transfiere la propiedad primero.',
  invalid_or_expired_invitation: 'Esta invitación ya no es válida o venció.',
};

function translateError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  for (const key of Object.keys(ERROR_MESSAGES)) {
    if (msg.includes(key)) return ERROR_MESSAGES[key];
  }
  return fallback;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtMoney(n: number): string {
  return '$ ' + Math.round(n).toLocaleString('es-CO');
}

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, padding: 18 };
const sectionTitleStyle: React.CSSProperties = { fontSize: 14, fontWeight: 800, marginBottom: 4 };

export function Team() {
  const width   = useWindowWidth();
  const navMode = navModeFor(width);
  if (navMode === 'bottom') return <TeamMobile />;
  return <TeamDesktop />;
}

function TeamDesktop() {
  const { profile, workspace } = useWorkspace();
  const { openUpgradeModal } = useUI();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const seatsQuery = useTeamSeats();
  const membersQuery = useTeamMembers();
  const pendingQuery = usePendingInvitations();
  const historyQuery = useInvitationHistory();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'owner' | 'admin' | 'supervisor' | 'comercial' | 'operario'>('all');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'supervisor' | 'comercial' | 'operario'>('operario');
  const [inviteLinkFallback, setInviteLinkFallback] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const isOwner = profile.role === 'owner';

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['teamSeats', workspace.id] });
    queryClient.invalidateQueries({ queryKey: ['teamMembers', workspace.id] });
    queryClient.invalidateQueries({ queryKey: ['pendingInvitations', workspace.id] });
    queryClient.invalidateQueries({ queryKey: ['invitationHistory', workspace.id] });
  }

  const inviterName = profile.full_name || profile.email || 'Un administrador';

  const inviteMutation = useMutation({
    mutationFn: () =>
      inviteTeamMember({
        workspaceId: workspace.id,
        email: inviteEmail.trim(),
        role: inviteRole,
        fullName: inviteName.trim() || undefined,
        inviterName,
        workspaceName: workspace.name,
      }),
    onSuccess: (result) => {
      invalidateAll();
      if (result.emailSent) {
        showToast('Invitación enviada por correo');
        closeInviteModal();
      } else {
        setInviteLinkFallback(`${window.location.origin}/invite/${result.invitation.token}`);
      }
    },
    onError: (err) => showToast(translateError(err, 'No se pudo enviar la invitación')),
  });

  const resendMutation = useMutation({
    mutationFn: (invitation: WorkspaceInvitationRow) => resendInvitation(invitation.id, inviterName, workspace.name),
    onSuccess: (result) => {
      invalidateAll();
      if (result.emailSent) showToast('Invitación reenviada');
      else showToast('No se pudo enviar el correo. Comparte el enlace manualmente.');
    },
    onError: (err) => showToast(translateError(err, 'No se pudo reenviar la invitación')),
  });

  const revokeMutation = useMutation({
    mutationFn: (invitationId: string) => revokeInvitation(invitationId),
    onSuccess: () => {
      invalidateAll();
      showToast('Invitación revocada');
    },
    onError: (err) => showToast(translateError(err, 'No se pudo revocar la invitación')),
  });

  const roleMutation = useMutation({
    mutationFn: ({ profileId, role }: { profileId: string; role: 'admin' | 'supervisor' | 'comercial' | 'operario' }) => updateMemberRole(profileId, role),
    onSuccess: () => {
      invalidateAll();
      showToast('Rol actualizado');
    },
    onError: (err) => showToast(translateError(err, 'No se pudo actualizar el rol')),
  });

  const statusMutation = useMutation({
    mutationFn: ({ profileId, status }: { profileId: string; status: 'active' | 'inactive' | 'removed' }) =>
      setMemberStatus(profileId, status),
    onSuccess: (_data, vars) => {
      invalidateAll();
      showToast(vars.status === 'removed' ? 'Usuario eliminado' : vars.status === 'inactive' ? 'Usuario desactivado' : 'Usuario reactivado');
    },
    onError: (err) => showToast(translateError(err, 'No se pudo actualizar el estado')),
  });

  const transferMutation = useMutation({
    mutationFn: (profileId: string) => transferOwnership(profileId),
    onSuccess: () => {
      invalidateAll();
      showToast('Propiedad transferida');
    },
    onError: (err) => showToast(translateError(err, 'No se pudo transferir la propiedad')),
  });

  function closeInviteModal() {
    setInviteOpen(false);
    setInviteName('');
    setInviteEmail('');
    setInviteRole('operario');
    setInviteLinkFallback(null);
  }

  function copyInviteLink() {
    if (!inviteLinkFallback) return;
    navigator.clipboard.writeText(inviteLinkFallback).then(() => showToast('Enlace copiado'));
  }

  if (seatsQuery.isLoading || membersQuery.isLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#64748B', fontSize: 14 }}>Cargando equipo…</div>;
  }

  const seats = seatsQuery.data;

  if (!seats || !seats.multiuser_enabled) {
    return (
      <div style={{ maxWidth: 720 }}>
        <h1 style={{ fontSize: 'clamp(22px,4vw,30px)', fontWeight: 800, letterSpacing: '-1px', marginBottom: 6 }}>Equipo y usuarios</h1>
        <p style={{ fontSize: 13.5, color: '#64748B', marginBottom: 18 }}>
          Invita a tu equipo, asigna roles y gestiona el acceso a tu cuenta de Shelwi.
        </p>
        <div style={{ ...cardStyle, textAlign: 'center', padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 40 }}>👥</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: BRAND_COLORS.dark }}>Disponible en el plan PREMIUM</div>
          <p style={{ fontSize: 13.5, color: '#64748B', lineHeight: 1.6, maxWidth: 460 }}>
            Con PREMIUM puedes invitar hasta 5 usuarios a tu cuenta (administradores y empleados) con roles y permisos
            diferenciados, y agregar usuarios adicionales por $11.999/mes cada uno.
          </p>
          <button
            onClick={() =>
              openUpgradeModal({
                title: 'Invita a tu equipo a Shelwi',
                message: 'Gestiona roles, permisos y accede a hasta 5 usuarios incluidos con el plan PREMIUM.',
                targetPlan: 'premium',
                ctaLabel: 'Actualizar a PREMIUM',
              })
            }
            style={{ border: 'none', background: BRAND_COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 14, padding: '12px 24px', borderRadius: 12, cursor: 'pointer' }}
          >
            Actualizar a PREMIUM
          </button>
        </div>
      </div>
    );
  }

  const members = membersQuery.data ?? [];
  const pending = pendingQuery.data ?? [];
  const history = historyQuery.data ?? [];

  const filteredMembers = members.filter((m) => {
    if (roleFilter !== 'all' && m.role !== roleFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (m.full_name ?? '').toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const seatsPct = seats.seats_limit > 0 ? Math.min(100, Math.round((seats.seats_used / seats.seats_limit) * 100)) : 0;
  const seatsFull = seats.seats_used >= seats.seats_limit;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(22px,4vw,30px)', fontWeight: 800, letterSpacing: '-1px', marginBottom: 6 }}>Equipo y usuarios</h1>
          <p style={{ fontSize: 13.5, color: '#64748B' }}>Invita, asigna roles y gestiona el acceso de tu equipo.</p>
        </div>
        {isOwner && (
          <button
            onClick={() => (seatsFull ? null : setInviteOpen(true))}
            disabled={seatsFull}
            title={seatsFull ? 'Has alcanzado el límite de usuarios de tu plan' : undefined}
            style={{
              border: 'none',
              background: seatsFull ? '#CBD5E1' : BRAND_COLORS.primary,
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
              padding: '12px 20px',
              borderRadius: 12,
              cursor: seatsFull ? 'not-allowed' : 'pointer',
            }}
          >
            + Invitar usuario
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 18 }}>
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Usuarios utilizados</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
            {seats.seats_used} / {seats.seats_limit}
          </div>
          <div style={{ height: 8, background: '#F1F5F9', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${seatsPct}%`, background: seatsFull ? '#DC2626' : BRAND_COLORS.primary, borderRadius: 6 }} />
          </div>
        </div>
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Licencias disponibles</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{Math.max(0, seats.seats_limit - seats.seats_used)}</div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>{seats.pending_invites} invitación(es) pendiente(s)</div>
        </div>
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Plan actual</div>
          <span style={{ display: 'inline-block', marginTop: 4, fontSize: 12, fontWeight: 800, color: '#fff', background: BRAND_COLORS.primary, padding: '4px 10px', borderRadius: 8, letterSpacing: '.5px' }}>
            PREMIUM
          </span>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 8 }}>Incluye {seats.included_users} usuarios</div>
        </div>
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Usuarios adicionales</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{seats.additional_licenses}</div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>{fmtMoney(seats.extra_user_price)}/usuario/mes</div>
          <button
            onClick={() => showToast('Próximamente')}
            style={{ marginTop: 8, border: '1.5px solid #E2E8F0', background: '#fff', color: BRAND_COLORS.primary, fontWeight: 700, fontSize: 11.5, padding: '6px 10px', borderRadius: 9, cursor: 'pointer' }}
          >
            Ver planes adicionales
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(260px,1fr)', gap: 18, alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o correo…"
              style={{ flex: 1, minWidth: 200, border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '10px 13px', fontSize: 13.5, outline: 'none' }}
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
              style={{ border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '10px 13px', fontSize: 13.5, outline: 'none' }}
            >
              <option value="all">Todos los roles</option>
              <option value="owner">Propietario</option>
              <option value="admin">Administrador</option>
              <option value="employee">Empleado</option>
            </select>
          </div>

          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', textAlign: 'left' }}>
                    <th style={thStyle}>Usuario</th>
                    <th style={thStyle}>Correo</th>
                    <th style={thStyle}>Rol</th>
                    <th style={thStyle}>Estado</th>
                    <th style={thStyle}>Desde</th>
                    {isOwner && <th style={thStyle}>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((m) => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      isSelf={m.id === profile.id}
                      isOwner={isOwner}
                      onRoleChange={(role) => roleMutation.mutate({ profileId: m.id, role })}
                      onStatusChange={(status) => statusMutation.mutate({ profileId: m.id, status })}
                      onTransfer={() => transferMutation.mutate(m.id)}
                    />
                  ))}
                  {filteredMembers.length === 0 && (
                    <tr>
                      <td colSpan={isOwner ? 6 : 5} style={{ ...tdStyle, textAlign: 'center', color: '#94A3B8' }}>
                        Sin resultados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={cardStyle}>
            <div style={sectionTitleStyle}>Sobre tu plan PREMIUM</div>
            <ul style={{ fontSize: 12.5, color: '#64748B', lineHeight: 1.8, paddingLeft: 18, margin: '8px 0 0' }}>
              <li>Hasta {seats.included_users} usuarios incluidos (el propietario cuenta como 1).</li>
              <li>Roles diferenciados: administrador y empleado.</li>
              <li>Usuarios adicionales por {fmtMoney(seats.extra_user_price)}/mes cada uno.</li>
            </ul>
          </div>

          <div style={cardStyle}>
            <div style={sectionTitleStyle}>Invitaciones pendientes</div>
            {pending.length === 0 && <p style={{ fontSize: 12.5, color: '#94A3B8', marginTop: 8 }}>No hay invitaciones pendientes.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {pending.map((inv) => (
                <div key={inv.id} style={{ border: '1px solid #F1F5F9', borderRadius: 12, padding: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.email}</div>
                  <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 2 }}>
                    {ROLE_LABELS[inv.role] ?? inv.role} · vence {fmtDate(inv.expires_at)}
                  </div>
                  {isOwner && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button onClick={() => resendMutation.mutate(inv)} style={pillButtonStyle}>
                        Reenviar
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`¿Revocar la invitación a ${inv.email}?`)) revokeMutation.mutate(inv.id);
                        }}
                        style={{ ...pillButtonStyle, color: '#DC2626', borderColor: '#FECACA' }}
                      >
                        Revocar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={cardStyle}>
            <button
              onClick={() => setShowHistory((v) => !v)}
              style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}
            >
              <span style={sectionTitleStyle}>Historial de invitaciones</span>
              <span style={{ fontSize: 12, color: '#94A3B8' }}>{showHistory ? '▲' : '▼'}</span>
            </button>
            {showHistory && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {history.length === 0 && <p style={{ fontSize: 12.5, color: '#94A3B8' }}>Sin historial.</p>}
                {history.map((inv) => {
                  const st = STATUS_LABELS[inv.status];
                  return (
                    <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <div style={{ fontWeight: 700 }}>{inv.email}</div>
                        <div style={{ color: '#94A3B8', fontSize: 11 }}>{fmtDate(inv.created_at)}</div>
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: st.color, background: st.bg, padding: '2px 8px', borderRadius: 8, whiteSpace: 'nowrap' }}>
                        {st.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {inviteOpen && (
        <div style={overlayStyle} onClick={closeInviteModal}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>Invitar usuario</div>
            {!inviteLinkFallback ? (
              <>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Nombre (opcional)</label>
                  <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} style={inputFieldStyle} placeholder="Nombre completo" />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Correo electrónico</label>
                  <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} type="email" style={inputFieldStyle} placeholder="correo@empresa.com" />
                  {inviteEmail.trim() && !isValidEmail(inviteEmail) && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 4 }}>Correo inválido</div>}
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Rol</label>
                  <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'admin' | 'supervisor' | 'comercial' | 'operario')} style={inputFieldStyle}>
                    <option value="operario">Operario</option>
                    <option value="comercial">Comercial</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={closeInviteModal} style={{ ...secondaryButtonStyle, flex: 1 }}>
                    Cancelar
                  </button>
                  <button
                    onClick={() => isValidEmail(inviteEmail) && inviteMutation.mutate()}
                    disabled={!isValidEmail(inviteEmail) || inviteMutation.isPending}
                    style={{ ...primaryButtonStyle, flex: 1, opacity: inviteMutation.isPending ? 0.7 : 1 }}
                  >
                    {inviteMutation.isPending ? 'Enviando…' : 'Enviar invitación'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6, marginBottom: 12 }}>
                  La invitación quedó creada, pero no pudimos enviar el correo automáticamente. Comparte este enlace con{' '}
                  <strong>{inviteEmail}</strong>:
                </p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <input readOnly value={inviteLinkFallback} style={{ ...inputFieldStyle, flex: 1, fontSize: 12 }} />
                  <button onClick={copyInviteLink} style={secondaryButtonStyle}>
                    Copiar
                  </button>
                </div>
                <button onClick={closeInviteModal} style={{ ...primaryButtonStyle, width: '100%' }}>
                  Listo
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MemberRow({
  member,
  isSelf,
  isOwner,
  onRoleChange,
  onStatusChange,
  onTransfer,
}: {
  member: ProfileRow;
  isSelf: boolean;
  isOwner: boolean;
  onRoleChange: (role: 'admin' | 'supervisor' | 'comercial' | 'operario') => void;
  onStatusChange: (status: 'active' | 'inactive' | 'removed') => void;
  onTransfer: () => void;
}) {
  const initial = (member.full_name || member.email || '?').trim().charAt(0).toUpperCase();
  const status = STATUS_LABELS[member.status] ?? STATUS_LABELS.active;
  const canEditRole = isOwner && member.role !== 'owner' && !isSelf;
  const canChangeStatus = isOwner && member.role !== 'owner' && !isSelf;

  return (
    <tr style={{ borderTop: '1px solid #F1F5F9' }}>
      <td style={tdStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: 'linear-gradient(150deg,#2563EB,#1D4ED8)',
              color: '#fff',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: 12,
            }}
          >
            {initial}
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>
              {member.full_name || '—'} {isSelf && <span style={{ fontSize: 10, fontWeight: 800, color: BRAND_COLORS.primary, background: '#EFF6FF', padding: '2px 6px', borderRadius: 6, marginLeft: 4 }}>Tú</span>}
            </div>
          </div>
        </div>
      </td>
      <td style={tdStyle}>{member.email}</td>
      <td style={tdStyle}>
        {canEditRole ? (
          <select value={member.role} onChange={(e) => onRoleChange(e.target.value as 'admin' | 'supervisor' | 'comercial' | 'operario')} style={{ border: '1.5px solid #E2E8F0', borderRadius: 9, padding: '5px 8px', fontSize: 12.5, outline: 'none' }}>
            <option value="operario">Operario</option>
            <option value="comercial">Comercial</option>
            <option value="supervisor">Supervisor</option>
            <option value="admin">Administrador</option>
          </select>
        ) : (
          ROLE_LABELS[member.role] ?? member.role
        )}
      </td>
      <td style={tdStyle}>
        <span style={{ fontSize: 11, fontWeight: 800, color: status.color, background: status.bg, padding: '3px 9px', borderRadius: 8 }}>{status.label}</span>
      </td>
      <td style={tdStyle}>{fmtDate(member.created_at)}</td>
      {isOwner && (
        <td style={tdStyle}>
          {canChangeStatus ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {member.status === 'active' ? (
                <button onClick={() => onStatusChange('inactive')} style={pillButtonStyle}>
                  Desactivar
                </button>
              ) : member.status === 'inactive' ? (
                <button onClick={() => onStatusChange('active')} style={pillButtonStyle}>
                  Reactivar
                </button>
              ) : null}
              {member.status !== 'removed' && (
                <button
                  onClick={() => {
                    if (window.confirm(`¿Eliminar a ${member.full_name || member.email} del equipo?`)) onStatusChange('removed');
                  }}
                  style={{ ...pillButtonStyle, color: '#DC2626', borderColor: '#FECACA' }}
                >
                  Eliminar
                </button>
              )}
              {member.role === 'admin' && member.status === 'active' && (
                <button
                  onClick={() => {
                    if (window.confirm(`¿Transferir la propiedad de la cuenta a ${member.full_name || member.email}? Pasarás a ser administrador.`)) onTransfer();
                  }}
                  style={pillButtonStyle}
                >
                  Transferir propiedad
                </button>
              )}
            </div>
          ) : (
            <span style={{ color: '#CBD5E1' }}>—</span>
          )}
        </td>
      )}
    </tr>
  );
}

const thStyle: React.CSSProperties = { padding: '11px 14px', fontSize: 11, fontWeight: 800, color: '#94A3B8', letterSpacing: '.5px', borderBottom: '1px solid #EEF2F7', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '11px 14px', verticalAlign: 'middle' };

const pillButtonStyle: React.CSSProperties = {
  border: '1.5px solid #E2E8F0',
  background: '#fff',
  color: '#475569',
  fontWeight: 700,
  fontSize: 11.5,
  padding: '5px 10px',
  borderRadius: 9,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15,23,42,.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
  padding: 16,
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 18,
  padding: 22,
  width: '100%',
  maxWidth: 420,
};

const inputFieldStyle: React.CSSProperties = { width: '100%', border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '11px 13px', fontSize: 14, outline: 'none' };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 };

const primaryButtonStyle: React.CSSProperties = {
  border: 'none',
  background: BRAND_COLORS.primary,
  color: '#fff',
  fontWeight: 700,
  fontSize: 14,
  padding: '11px 16px',
  borderRadius: 11,
  cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
  border: '1.5px solid #E2E8F0',
  background: '#fff',
  color: '#475569',
  fontWeight: 700,
  fontSize: 14,
  padding: '11px 16px',
  borderRadius: 11,
  cursor: 'pointer',
};
