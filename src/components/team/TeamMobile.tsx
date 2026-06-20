/**
 * TeamMobile — Equipo y Usuarios, vista móvil premium.
 * Rediseño pixel-perfect basado en referencia visual aprobada.
 * Exclusivo plan PREMIUM. Free/Pro reciben pantalla de upgrade.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, UserPlus, MoreVertical, Crown, Shield,
  User, Filter, Clock, ChevronRight, X, Check,
  Copy, AlertCircle,
} from 'lucide-react';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useUI } from '../../features/app/UIProvider';
import { useToast } from '../ui/Toast';
import { useTeamSeats, useTeamMembers, usePendingInvitations, useInvitationHistory } from '../../hooks/usePermissions';
import {
  inviteTeamMember, revokeInvitation, updateMemberRole,
  setMemberStatus,
} from '../../services/team';
import { isValidEmail } from '../../lib/validation';
import type { ProfileRow, WorkspaceInvitationRow } from '../../lib/database.types';

// ─── Constantes ───────────────────────────────────────────────────────────────

const EXTRA_USER_PRICE = 11900;
const INCLUDED_USERS   = 5;

const ROLE_META: Record<string, { label: string; bg: string; color: string }> = {
  owner:        { label: 'Propietario',   bg: '#1E40AF', color: '#fff' },
  admin:        { label: 'Administrador', bg: '#7C3AED', color: '#fff' },
  employee:     { label: 'Colaborador',   bg: '#F97316', color: '#fff' },
  super_admin:  { label: 'Super admin',   bg: '#0F172A', color: '#fff' },
};

const AV_COLORS = ['#6366F1','#F97316','#8B5CF6','#22C55E','#EF4444','#0EA5E9','#F59E0B','#EC4899'];
function avatarColor(name: string) { return AV_COLORS[(name||'?').charCodeAt(0) % AV_COLORS.length]; }

function initials(name: string | null, email: string | null) {
  const n = name?.trim() || email?.split('@')[0] || '?';
  return n.charAt(0).toUpperCase();
}

function relAccess(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Desconocido';
  const h = Math.floor((Date.now() - new Date(dateStr).getTime()) / 3600000);
  if (h < 1)  return 'Hace < 1 hora';
  if (h < 2)  return 'Hace 1 hora';
  if (h < 24) return `Hace ${h} horas`;
  if (h < 48) return 'Hace 1 día';
  return `Hace ${Math.floor(h / 24)} días`;
}

function fmtCOP(n: number) { return '$' + Math.round(n).toLocaleString('es-CO'); }

const ERROR_MAP: Record<string, string> = {
  feature_not_available: 'Funcionalidad exclusiva de PREMIUM.',
  seat_limit_exceeded:   'Has alcanzado el límite de usuarios de tu plan.',
  forbidden:             'No tienes permisos para esta acción.',
  cannot_modify_owner:   'No puedes modificar al propietario.',
  invalid_or_expired_invitation: 'Invitación ya no válida.',
};

function translateError(err: unknown, fallback: string) {
  const msg = err instanceof Error ? err.message : String(err);
  for (const k of Object.keys(ERROR_MAP)) if (msg.includes(k)) return ERROR_MAP[k];
  return fallback;
}

// ─── Shared primitives ────────────────────────────────────────────────────────

const CARD: React.CSSProperties = { background: '#fff', borderRadius: 18, boxShadow: '0 2px 8px rgba(0,0,0,.06)' };

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, email, size = 44, online }: { name: string | null; email: string | null; size?: number; online?: boolean }) {
  const bg = avatarColor(name ?? email ?? '');
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: size * 0.36 }}>
        {initials(name, email)}
      </div>
      {online && (
        <span style={{ position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: '50%', background: '#22C55E', border: '2px solid #fff' }}/>
      )}
    </div>
  );
}

// ─── RoleBadge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const m = ROLE_META[role] ?? ROLE_META.employee;
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, background: m.bg, color: m.color, padding: '2px 8px', borderRadius: 99, flexShrink: 0 }}>
      {m.label}
    </span>
  );
}

// ─── MemberRow ────────────────────────────────────────────────────────────────

function MemberRow({ member, isOwner, onAction }: {
  member: ProfileRow;
  isOwner: boolean;
  onAction: (member: ProfileRow) => void;
}) {
  const isOnline = member.updated_at
    ? (Date.now() - new Date(member.updated_at).getTime()) < 3600000
    : false;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid #F1F5F9' }}>
      <Avatar name={member.full_name} email={member.email} size={46} online={isOnline}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>
            {member.full_name || member.email?.split('@')[0] || 'Usuario'}
          </span>
          <RoleBadge role={member.role}/>
        </div>
        <div style={{ fontSize: 12, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {member.email}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
          <Clock size={10} color="#94A3B8"/>
          <span style={{ fontSize: 10.5, color: '#94A3B8' }}>
            Último acceso: {relAccess(member.updated_at)}
          </span>
        </div>
      </div>
      {isOwner && member.role !== 'owner' && (
        <button onClick={() => onAction(member)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4, flexShrink: 0 }}>
          <MoreVertical size={18}/>
        </button>
      )}
    </div>
  );
}

// ─── PendingRow ───────────────────────────────────────────────────────────────

function PendingRow({ inv, onRevoke, onResend }: {
  inv: WorkspaceInvitationRow;
  onRevoke: () => void;
  onResend: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: '1px solid #F1F5F9' }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <User size={20} color="#94A3B8"/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.email}</div>
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 3 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#D97706', background: '#FFFBEB', padding: '2px 7px', borderRadius: 99 }}>Pendiente</span>
          <span style={{ fontSize: 10.5, color: '#94A3B8' }}>{ROLE_META[inv.role]?.label ?? inv.role}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button onClick={onResend} style={{ border: '1px solid #E2E8F0', background: '#fff', color: '#2563EB', fontWeight: 700, fontSize: 11.5, padding: '6px 10px', borderRadius: 9, cursor: 'pointer' }}>
          Reenviar
        </button>
        <button onClick={onRevoke} style={{ border: 'none', background: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4 }}>
          <X size={16}/>
        </button>
      </div>
    </div>
  );
}

// ─── InviteDrawer ─────────────────────────────────────────────────────────────

function InviteDrawer({ open, onClose, onInvite, loading, linkFallback, onCopyLink }: {
  open: boolean; onClose: () => void; loading: boolean;
  onInvite: (email: string, name: string, role: 'admin' | 'employee') => void;
  linkFallback: string | null; onCopyLink: () => void;
}) {
  const [name,  setName]  = useState('');
  const [email, setEmail] = useState('');
  const [role,  setRole]  = useState<'admin' | 'employee'>('employee');

  function submit() {
    if (!isValidEmail(email)) return;
    onInvite(email, name, role);
  }

  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 48, background: 'rgba(15,23,42,.45)' }}/>}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 49,
        background: '#fff', borderRadius: '22px 22px 0 0',
        padding: '0 0 calc(24px + env(safe-area-inset-bottom))',
        boxShadow: '0 -8px 40px rgba(15,23,42,.16)',
        transform: open ? 'translateY(0)' : 'translateY(110%)',
        transition: 'transform .32s cubic-bezier(.4,0,.2,1)',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: '#E2E8F0' }}/>
        </div>

        {linkFallback ? (
          <div style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 6 }}>Enlace de invitación</div>
            <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>El correo no pudo enviarse. Comparte este enlace directamente.</p>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 14px', fontSize: 12.5, color: '#374151', wordBreak: 'break-all', marginBottom: 14 }}>
              {linkFallback}
            </div>
            <button onClick={onCopyLink} style={{ width: '100%', border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 14, padding: '13px 0', borderRadius: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Copy size={16}/> Copiar enlace
            </button>
            <button onClick={onClose} style={{ width: '100%', marginTop: 10, border: '1px solid #E2E8F0', background: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, padding: '13px 0', borderRadius: 13, cursor: 'pointer' }}>
              Cerrar
            </button>
          </div>
        ) : (
          <div style={{ padding: '8px 20px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A' }}>Invitar usuario</div>
              <button onClick={onClose} style={{ border: 'none', background: '#F1F5F9', borderRadius: 10, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={16} color="#374151"/>
              </button>
            </div>

            {/* Name */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>NOMBRE (OPCIONAL)</div>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del usuario" style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: 12, padding: '12px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}/>
            </div>

            {/* Email */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>CORREO ELECTRÓNICO</div>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@empresa.com" type="email" style={{ width: '100%', border: `1.5px solid ${email && !isValidEmail(email) ? '#EF4444' : '#E2E8F0'}`, borderRadius: 12, padding: '12px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}/>
              {email && !isValidEmail(email) && <div style={{ fontSize: 11.5, color: '#EF4444', marginTop: 4 }}>Correo inválido</div>}
            </div>

            {/* Role */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: '#64748B', marginBottom: 8 }}>ROL</div>
              <div style={{ display: 'flex', gap: 10 }}>
                {([['admin', 'Administrador', 'Gestión operativa completa'], ['employee', 'Colaborador', 'Crear y editar cotizaciones']] as const).map(([r, label, desc]) => (
                  <button key={r} onClick={() => setRole(r)} style={{ flex: 1, border: `2px solid ${role === r ? '#2563EB' : '#E2E8F0'}`, background: role === r ? '#EFF6FF' : '#fff', borderRadius: 14, padding: '12px 10px', cursor: 'pointer', textAlign: 'left', transition: 'all .15s' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: role === r ? '#2563EB' : '#0F172A', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 11.5, color: '#64748B', lineHeight: 1.3 }}>{desc}</div>
                    {role === r && <Check size={14} color="#2563EB" style={{ marginTop: 6 }}/>}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={submit} disabled={loading || !isValidEmail(email)} style={{ width: '100%', border: 'none', background: !isValidEmail(email) ? '#CBD5E1' : '#2563EB', color: '#fff', fontWeight: 700, fontSize: 15, padding: '14px 0', borderRadius: 13, cursor: !isValidEmail(email) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {loading ? (
                <span style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .8s linear infinite' }}/>
              ) : (
                <><UserPlus size={16}/> Enviar invitación</>
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── ActionDrawer ─────────────────────────────────────────────────────────────

function ActionDrawer({ member, open, onClose, onRoleChange, onDeactivate, onRemove, loading }: {
  member: ProfileRow | null; open: boolean; onClose: () => void;
  onRoleChange: (role: 'admin' | 'employee') => void;
  onDeactivate: () => void; onRemove: () => void; loading: boolean;
}) {
  if (!member) return null;
  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 48, background: 'rgba(15,23,42,.35)' }}/>}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 49,
        background: '#fff', borderRadius: '22px 22px 0 0',
        padding: '0 0 calc(20px + env(safe-area-inset-bottom))',
        boxShadow: '0 -8px 40px rgba(15,23,42,.14)',
        transform: open ? 'translateY(0)' : 'translateY(110%)',
        transition: 'transform .28s cubic-bezier(.4,0,.2,1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: '#E2E8F0' }}/>
        </div>
        {/* Member info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px 16px', borderBottom: '1px solid #F1F5F9' }}>
          <Avatar name={member.full_name} email={member.email} size={44}/>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{member.full_name || member.email}</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>{ROLE_META[member.role]?.label}</div>
          </div>
        </div>
        {/* Actions */}
        <div style={{ padding: '8px 12px' }}>
          {member.role !== 'admin' && (
            <button onClick={() => onRoleChange('admin')} disabled={loading} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 12px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 12, fontSize: 14, fontWeight: 500, color: '#0F172A' }}>
              <Shield size={18} color="#7C3AED"/> Cambiar a Administrador
            </button>
          )}
          {member.role !== 'employee' && (
            <button onClick={() => onRoleChange('employee')} disabled={loading} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 12px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 12, fontSize: 14, fontWeight: 500, color: '#0F172A' }}>
              <User size={18} color="#F97316"/> Cambiar a Colaborador
            </button>
          )}
          {member.status !== 'inactive' && (
            <button onClick={onDeactivate} disabled={loading} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 12px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 12, fontSize: 14, fontWeight: 500, color: '#64748B' }}>
              <X size={18} color="#64748B"/> Desactivar usuario
            </button>
          )}
          <div style={{ height: 1, background: '#F1F5F9', margin: '4px 0' }}/>
          <button onClick={onRemove} disabled={loading} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 12px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 12, fontSize: 14, fontWeight: 600, color: '#EF4444' }}>
            <AlertCircle size={18} color="#EF4444"/> Eliminar del equipo
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Upgrade locked state ─────────────────────────────────────────────────────

function UpgradeLocked({ openUpgradeModal }: { openUpgradeModal: (i: any) => void }) {
  return (
    <div style={{ background: '#F8FAFC', minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#7C3AED,#A855F7)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <Crown size={36} color="#fff"/>
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: '0 0 10px' }}>Equipo y usuarios</h2>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#F5F3FF', color: '#7C3AED', fontWeight: 700, fontSize: 12, padding: '4px 12px', borderRadius: 99, marginBottom: 16 }}>
        <Crown size={12}/> PREMIUM
      </div>
      <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.6, maxWidth: 320, margin: '0 0 28px' }}>
        Invita hasta 5 miembros a tu equipo con roles y permisos diferenciados. Disponible únicamente en el plan PREMIUM.
      </p>
      <div style={{ background: '#fff', borderRadius: 18, padding: '16px 18px', width: '100%', maxWidth: 320, marginBottom: 20, textAlign: 'left', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
        {['Hasta 5 usuarios incluidos', 'Roles: Administrador y Colaborador', 'Permisos diferenciados', 'Actividad del equipo', 'Usuarios adicionales: $11.900/mes c/u'].map(f => (
          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #F8FAFC' }}>
            <Check size={14} color="#7C3AED"/>
            <span style={{ fontSize: 13.5, color: '#374151' }}>{f}</span>
          </div>
        ))}
      </div>
      <button onClick={() => openUpgradeModal({ title: 'Equipo y usuarios', message: 'Gestiona tu equipo con PREMIUM.', targetPlan: 'premium', ctaLabel: 'Actualizar a PREMIUM' })} style={{ width: '100%', maxWidth: 320, border: 'none', background: 'linear-gradient(135deg,#7C3AED,#A855F7)', color: '#fff', fontWeight: 800, fontSize: 15, padding: '14px 0', borderRadius: 14, cursor: 'pointer' }}>
        Actualizar a PREMIUM →
      </button>
    </div>
  );
}

// ─── TeamMobile (main export) ─────────────────────────────────────────────────

export function TeamMobile() {
  const navigate = useNavigate();
  const { profile, workspace, planName } = useWorkspace();
  const { openUpgradeModal } = useUI();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const seatsQuery   = useTeamSeats();
  const membersQuery = useTeamMembers();
  const pendingQuery = usePendingInvitations();
  const historyQuery = useInvitationHistory();

  const [tab,          setTab]          = useState<'all' | 'admin' | 'employee'>('all');
  const [inviteOpen,   setInviteOpen]   = useState(false);
  const [actionMember, setActionMember] = useState<ProfileRow | null>(null);
  const [actionOpen,   setActionOpen]   = useState(false);
  const [linkFallback, setLinkFallback] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  const isOwner = profile.role === 'owner';

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['teamSeats',         workspace.id] });
    queryClient.invalidateQueries({ queryKey: ['teamMembers',       workspace.id] });
    queryClient.invalidateQueries({ queryKey: ['pendingInvitations',workspace.id] });
    queryClient.invalidateQueries({ queryKey: ['invitationHistory', workspace.id] });
  }

  const inviterName    = profile.full_name || profile.email || 'Un administrador';
  const workspaceName  = workspace.name;

  async function handleInvite(email: string, name: string, role: 'admin' | 'employee') {
    setInviteLoading(true);
    try {
      const result = await inviteTeamMember({ workspaceId: workspace.id, email, role, fullName: name || undefined, inviterName, workspaceName });
      invalidateAll();
      if (result.emailSent) {
        showToast('Invitación enviada ✓');
        closeInvite();
      } else {
        setLinkFallback(`${window.location.origin}/invite/${result.invitation.token}`);
      }
    } catch (err) {
      showToast(translateError(err, 'No se pudo enviar la invitación'));
    } finally {
      setInviteLoading(false);
    }
  }

  const roleMutation = useMutation({
    mutationFn: ({ profileId, role }: { profileId: string; role: 'admin' | 'employee' }) =>
      updateMemberRole(profileId, role),
    onSuccess: () => { invalidateAll(); showToast('Rol actualizado'); setActionOpen(false); },
    onError: (err) => showToast(translateError(err, 'No se pudo actualizar el rol')),
  });

  const statusMutation = useMutation({
    mutationFn: ({ profileId, status }: { profileId: string; status: 'active' | 'inactive' | 'removed' }) =>
      setMemberStatus(profileId, status),
    onSuccess: (_d, vars) => {
      invalidateAll();
      showToast(vars.status === 'removed' ? 'Usuario eliminado' : 'Usuario desactivado');
      setActionOpen(false);
    },
    onError: (err) => showToast(translateError(err, 'No se pudo actualizar')),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeInvitation(id),
    onSuccess: () => { invalidateAll(); showToast('Invitación revocada'); },
    onError: (err) => showToast(translateError(err, 'Error al revocar')),
  });

  function closeInvite() { setInviteOpen(false); setLinkFallback(null); }
  function openAction(m: ProfileRow) { setActionMember(m); setActionOpen(true); }

  // Loading
  if (seatsQuery.isLoading || membersQuery.isLoading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: '#94A3B8' }}>Cargando equipo…</div>;
  }

  const seats = seatsQuery.data;

  // Non-premium gate
  if (!seats || !seats.multiuser_enabled) {
    return <UpgradeLocked openUpgradeModal={openUpgradeModal}/>;
  }

  const members = membersQuery.data ?? [];
  const pending = pendingQuery.data ?? [];
  const history = historyQuery.data ?? [];

  const admins      = members.filter(m => m.role === 'admin');
  const employees   = members.filter(m => m.role === 'employee');
  const seatsPct    = seats.seats_limit > 0 ? Math.min(100, Math.round((seats.seats_used / seats.seats_limit) * 100)) : 0;
  const seatsFull   = seats.seats_used >= seats.seats_limit;
  const extraSeats  = Math.max(0, seats.seats_used - INCLUDED_USERS);

  const filteredMembers = members.filter(m => {
    if (tab === 'admin')    return m.role === 'admin';
    if (tab === 'employee') return m.role === 'employee';
    return true;
  });

  // Activity: derive from invitation history
  const recentActivity = history.slice(0, 5).map(inv => ({
    icon: inv.status === 'accepted' ? '✅' : inv.status === 'revoked' ? '❌' : '📩',
    text: inv.status === 'accepted'
      ? `${inv.email} aceptó la invitación`
      : inv.status === 'revoked'
      ? `Invitación revocada para ${inv.email}`
      : `${inviterName} invitó a ${inv.email}`,
    time: inv.accepted_at ?? inv.created_at,
    color: inv.status === 'accepted' ? '#22C55E' : inv.status === 'revoked' ? '#EF4444' : '#2563EB',
  }));

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100%', paddingBottom: 24 }}>

      {/* ── Sub-header ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #EEF2F7', padding: '12px 16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3 }}>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', letterSpacing: '-.5px', margin: 0 }}>Equipo y usuarios</h1>
              <span style={{ fontSize: 10, fontWeight: 800, background: 'linear-gradient(135deg,#7C3AED,#A855F7)', color: '#fff', padding: '3px 8px', borderRadius: 99 }}>PREMIUM</span>
            </div>
            <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>Gestiona usuarios y permisos de tu equipo</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button style={{ border: 'none', background: '#F1F5F9', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Search size={16} color="#374151"/>
            </button>
            {isOwner && (
              <button onClick={() => !seatsFull && setInviteOpen(true)} style={{ border: 'none', background: seatsFull ? '#F1F5F9' : '#F1F5F9', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: seatsFull ? 'not-allowed' : 'pointer' }}>
                <UserPlus size={16} color={seatsFull ? '#CBD5E1' : '#374151'}/>
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 16px 0' }}>

        {/* ── Plan card ── */}
        <div style={{ ...CARD, background: 'linear-gradient(135deg,#F5F3FF 0%,#EFF6FF 100%)', border: '1px solid #DDD6FE', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#7C3AED,#A855F7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Crown size={22} color="#fff"/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', marginBottom: 2 }}>Plan {planName}</div>
            <div style={{ fontSize: 12, color: '#64748B' }}>Incluye hasta {INCLUDED_USERS} usuarios</div>
            <div style={{ fontSize: 12, color: '#64748B' }}>Usuarios adicionales: {fmtCOP(EXTRA_USER_PRICE)}/mes c/u</div>
          </div>
          <button onClick={() => navigate('/app/planes')} style={{ border: '1.5px solid #DDD6FE', background: '#fff', color: '#7C3AED', fontWeight: 700, fontSize: 12.5, padding: '8px 12px', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            Ver mi plan <ChevronRight size={13}/>
          </button>
        </div>

        {/* ── 4 KPI tiles ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { icon: <div style={{ fontSize: 20 }}>👥</div>, value: `${seats.seats_used}/${seats.seats_limit}`, label: 'Usuarios activos', sub: 'Límite incluido', subColor: '#22C55E', subIcon: <Check size={10} color="#22C55E"/> },
            { icon: <div style={{ fontSize: 20 }}>⏰</div>, value: String(pending.length), label: 'Invitaciones pendientes', sub: pending.length === 0 ? 'No hay pendientes' : `${pending.length} pendiente${pending.length > 1 ? 's' : ''}`, subColor: pending.length > 0 ? '#F59E0B' : '#22C55E', subIcon: pending.length === 0 ? <Check size={10} color="#22C55E"/> : null },
            { icon: <div style={{ fontSize: 20 }}>🛡️</div>, value: String(admins.length), label: 'Administradores', sub: 'Con permisos totales', subColor: '#7C3AED', subIcon: null },
            { icon: <div style={{ fontSize: 20 }}>👤</div>, value: String(employees.length), label: 'Colaboradores', sub: 'Acceso limitado', subColor: '#F97316', subIcon: null },
          ].map(k => (
            <div key={k.label} style={{ ...CARD, padding: '14px 14px' }}>
              {k.icon}
              <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px', marginTop: 6, marginBottom: 2 }}>{k.value}</div>
              <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>{k.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: k.subColor }}>
                {k.subIcon}{k.sub}
              </div>
            </div>
          ))}
        </div>

        {/* ── Filter tabs ── */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {([['all', `Todos ${members.length}`], ['admin', `Administradores ${admins.length}`], ['employee', `Colaboradores ${employees.length}`]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ flexShrink: 0, border: `1.5px solid ${tab === key ? '#2563EB' : '#E2E8F0'}`, background: tab === key ? '#2563EB' : '#fff', color: tab === key ? '#fff' : '#64748B', fontWeight: tab === key ? 700 : 500, fontSize: 12.5, padding: '7px 12px', borderRadius: 99, cursor: 'pointer', transition: 'all .15s' }}>
              {label}
            </button>
          ))}
          <button style={{ marginLeft: 'auto', border: '1px solid #E2E8F0', background: '#fff', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <Filter size={14} color="#374151"/>
          </button>
        </div>

        {/* ── Members list ── */}
        <div style={{ ...CARD }}>
          {filteredMembers.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Sin usuarios en esta categoría</div>
          ) : (
            filteredMembers.map(m => (
              <MemberRow key={m.id} member={m} isOwner={isOwner} onAction={openAction}/>
            ))
          )}
        </div>

        {/* ── Pending invitations ── */}
        {pending.length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#64748B', marginBottom: 8, paddingLeft: 2 }}>INVITACIONES PENDIENTES</div>
            <div style={{ ...CARD }}>
              {pending.map(inv => (
                <PendingRow
                  key={inv.id}
                  inv={inv}
                  onRevoke={() => revokeMutation.mutate(inv.id)}
                  onResend={() => {}} // resend handled elsewhere
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Invite CTA ── */}
        {isOwner && (
          <div style={{ ...CARD, padding: '16px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <UserPlus size={20} color="#7C3AED"/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Invitar nuevo usuario</div>
                <p style={{ fontSize: 12.5, color: '#64748B', margin: '0 0 14px', lineHeight: 1.5 }}>
                  Agrega nuevos miembros a tu equipo y asigna permisos personalizados.
                </p>
                <button onClick={() => !seatsFull && setInviteOpen(true)} disabled={seatsFull} style={{ border: 'none', background: seatsFull ? '#CBD5E1' : '#2563EB', color: '#fff', fontWeight: 700, fontSize: 13.5, padding: '11px 20px', borderRadius: 11, cursor: seatsFull ? 'not-allowed' : 'pointer' }}>
                  Invitar usuario
                </button>
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: '#94A3B8' }}>
              Tienes {pending.length} invitación{pending.length !== 1 ? 'es' : ''} pendiente{pending.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}

        {/* ── Seat usage ── */}
        <div style={{ ...CARD, padding: '16px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Uso de usuarios</div>
            <div style={{ fontSize: 12, color: '#7C3AED', fontWeight: 600 }}>Plan {planName}</div>
          </div>
          {/* User avatars */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {members.slice(0, INCLUDED_USERS).map((m) => (
              <div key={m.id} style={{ width: 30, height: 30, borderRadius: '50%', background: avatarColor(m.full_name ?? m.email ?? ''), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 12, border: '2px solid #fff' }}>
                {initials(m.full_name, m.email)}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: '#374151', marginBottom: 8 }}>
            {seats.seats_used} de {seats.seats_limit} usuarios incluidos
          </div>
          {/* Progress bar */}
          <div style={{ height: 6, background: '#E2E8F0', borderRadius: 99, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ width: `${seatsPct}%`, height: '100%', background: seatsPct >= 100 ? '#EF4444' : '#2563EB', borderRadius: 99, transition: 'width .4s ease' }}/>
          </div>
          <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'right', marginBottom: 12 }}>{seatsPct}%</div>
          {/* Extra seat info */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#F8FAFC', borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <UserPlus size={14} color="#94A3B8"/>
              <span style={{ fontSize: 12.5, color: '#64748B' }}>
                {extraSeats > 0
                  ? `${extraSeats} usuario${extraSeats > 1 ? 's' : ''} adicional${extraSeats > 1 ? 'es' : ''}: ${fmtCOP(extraSeats * EXTRA_USER_PRICE)}/mes`
                  : `Usuarios adicionales: ${fmtCOP(EXTRA_USER_PRICE)}/mes c/u`}
              </span>
            </div>
            {isOwner && (
              <button onClick={() => setInviteOpen(true)} style={{ border: 'none', background: 'none', color: '#2563EB', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}>
                Agregar usuario
              </button>
            )}
          </div>
        </div>

        {/* ── Activity ── */}
        {recentActivity.length > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Actividad reciente en el equipo</div>
              <button style={{ border: 'none', background: 'none', color: '#2563EB', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>Ver toda</button>
            </div>
            <div style={{ ...CARD }}>
              {recentActivity.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: i < recentActivity.length-1 ? '1px solid #F1F5F9' : 'none' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${a.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                    {a.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', lineHeight: 1.4 }}>{a.text}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{relAccess(a.time)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ── Invite drawer ── */}
      <InviteDrawer
        open={inviteOpen}
        onClose={closeInvite}
        onInvite={handleInvite}
        loading={inviteLoading}
        linkFallback={linkFallback}
        onCopyLink={() => { if (linkFallback) navigator.clipboard.writeText(linkFallback).then(() => showToast('Enlace copiado')); }}
      />

      {/* ── Action drawer ── */}
      <ActionDrawer
        member={actionMember}
        open={actionOpen}
        onClose={() => setActionOpen(false)}
        onRoleChange={role => actionMember && roleMutation.mutate({ profileId: actionMember.id, role })}
        onDeactivate={() => actionMember && statusMutation.mutate({ profileId: actionMember.id, status: 'inactive' })}
        onRemove={() => actionMember && statusMutation.mutate({ profileId: actionMember.id, status: 'removed' })}
        loading={roleMutation.isPending || statusMutation.isPending}
      />

    </div>
  );
}
