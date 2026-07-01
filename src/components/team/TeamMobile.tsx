/**
 * TeamMobile — Equipo y Usuarios (Single Source of Truth)
 *
 * ARQUITECTURA:
 *   Un solo hook: useTeamState() → llama get_team_state() RPC
 *   Un solo query key: ['teamState']
 *   Todos los contadores derivan del MISMO objeto: { seats, members, pending }
 *
 *   seats.seats_used     = active_members + pending_invites (DB authoritative)
 *   seats.seats_limit    = plan limit + additional licenses (DB authoritative)
 *   members              = profiles WHERE status IN ('active','inactive')  ← del RPC
 *   pending              = workspace_invitations WHERE status='pending'    ← del RPC
 *
 *   Derivados en el frontend (computados del mismo dato):
 *   - admins  = members.filter(role IN admin|owner)
 *   - ops     = members.filter(role IN operario|supervisor|comercial|employee)
 *   - seatsFull = seats.seats_used >= seats.seats_limit
 *
 *   Invalidar ['teamState'] → refetch único → todos los contadores se actualizan.
 *   NUNCA hay race condition entre queries paralelas.
 *
 * Zero Trust: toda acción valida permisos server-side.
 * Sin datos mock. Sin hardcodes.
 */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, UserPlus, MoreVertical, Crown, X,
  ChevronRight, Copy, AlertTriangle, Check,
  Users, Clock, Shield, Briefcase, Mail,
  RefreshCw, Trash2, UserX, Edit3,
  Phone, MapPin, Wrench,
} from 'lucide-react';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useUI } from '../../features/app/UIProvider';
import { useToast } from '../ui/Toast';
import { useTeamState, useInvitationHistory, useFullInvitationHistory } from '../../hooks/usePermissions';
import type { InvitationHistoryItem } from '../../services/team';
import {
  inviteTeamMember, revokeInvitation, updateMemberRole,
  setMemberStatus, resendInvitation,
} from '../../services/team';
import { isValidEmail, isValidPhone } from '../../lib/validation';
import { usePresence, resolvePresenceStatus } from '../../hooks/usePresence';
import type { ProfileRow, WorkspaceInvitationRow } from '../../lib/database.types';

// ─── Constantes ───────────────────────────────────────────────────────────────

const P = '#7C3AED';

const ROLE_META: Record<string, { label: string; desc: string; color: string; bg: string }> = {
  owner:         { label: 'Owner',         desc: 'Control total del Workspace',           color: '#fff', bg: '#0F172A' },
  admin:         { label: 'Administrador', desc: 'Acceso completo al Workspace',          color: '#fff', bg: '#7C3AED' },
  supervisor:    { label: 'Supervisor',    desc: 'Gestiona órdenes y técnicos',           color: '#fff', bg: '#0891B2' },
  comercial:     { label: 'Comercial',     desc: 'Gestiona clientes y cotizaciones',      color: '#fff', bg: '#D97706' },
  operario:      { label: 'Operario',      desc: 'Gestiona únicamente sus trabajos',      color: '#fff', bg: '#16A34A' },
  employee:      { label: 'Operario',      desc: 'Gestiona únicamente sus trabajos',      color: '#fff', bg: '#16A34A' },
  super_admin:   { label: 'Super Admin',   desc: 'Acceso global a todos los workspaces',  color: '#fff', bg: '#0F172A' },
  support_admin: { label: 'Soporte',       desc: 'Acceso de soporte Shelwi',              color: '#fff', bg: '#64748B' },
};

const SPECIALTIES = [
  { value: 'electricista',         label: 'Electricista' },
  { value: 'cctv',                 label: 'CCTV' },
  { value: 'redes',                label: 'Redes' },
  { value: 'fibra_optica',         label: 'Fibra óptica' },
  { value: 'paneles_solares',      label: 'Paneles solares' },
  { value: 'aires_acondicionados', label: 'Aires acondicionados' },
  { value: 'plomeria',             label: 'Plomería' },
  { value: 'soldadura',            label: 'Soldadura' },
  { value: 'mantenimiento',        label: 'Mantenimiento' },
  { value: 'otro',                 label: 'Otro' },
];

const AV = ['#6366F1','#F97316','#8B5CF6','#22C55E','#EF4444','#0EA5E9','#F59E0B','#EC4899'];
const avatarBg = (s: string) => AV[(s||'?').charCodeAt(0) % AV.length];
const initials = (name: string | null, email: string | null) => {
  const n = name?.trim() || email?.split('@')[0] || '?';
  return n.charAt(0).toUpperCase();
};
const fmtCOP      = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');
const fmtDate     = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
// seats_limit = null → Enterprise (ilimitado real). Número → límite explícito.
const fmtLimit    = (n: number | null) => n === null ? '∞' : String(n);
const isUnlimited = (n: number | null): n is null => n === null;

const ERR: Record<string, string> = {
  feature_not_available:         'Funcionalidad exclusiva de PREMIUM.',
  seat_limit_exceeded:           'Has alcanzado el límite de cupos. Compra cupos adicionales.',
  forbidden:                     'Sin permisos para esta acción.',
  cannot_modify_owner:           'No puedes modificar al propietario.',
  invalid_or_expired_invitation: 'Invitación ya no válida.',
  invitation_already_pending:    'Ya existe una invitación pendiente para ese correo. Usa "Reenviar" en la pestaña Invitados.',
  user_already_in_workspace:     'Este usuario ya pertenece al equipo.',
  rate_limit_exceeded:           'Límite de invitaciones alcanzado. Espera unos minutos.',
  invalid_email:                 'El correo electrónico no tiene un formato válido.',
};
const txErr = (err: unknown, fallback: string) => {
  const msg = err instanceof Error ? err.message : String(err);
  for (const k of Object.keys(ERR)) if (msg.includes(k)) return ERR[k];
  return fallback;
};

// ─── UpgradeLocked ────────────────────────────────────────────────────────────

function UpgradeLocked({ openUpgradeModal }: { openUpgradeModal: (i: any) => void }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <Crown size={28} color={P} />
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>Equipo y Usuarios — PREMIUM</h2>
      <p style={{ fontSize: 14, color: '#64748B', marginBottom: 24 }}>Invita colaboradores, gestiona roles y controla quién accede a tu workspace.</p>
      <button onClick={() => openUpgradeModal({ title: 'Equipo en PREMIUM', message: 'Gestiona tu equipo con roles, invitaciones y permisos avanzados.', targetPlan: 'premium', ctaLabel: 'Actualizar a PREMIUM' })}
        style={{ border: 'none', background: P, color: '#fff', fontWeight: 700, fontSize: 14, padding: '13px 28px', borderRadius: 12, cursor: 'pointer' }}>
        Actualizar a PREMIUM
      </button>
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, email, size = 44, dot }: { name: string | null; email: string | null; size?: number; dot?: string }) {
  const bg = avatarBg(name ?? email ?? '');
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: size * 0.36 }}>
        {initials(name, email)}
      </div>
      {dot && (
        <span style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: '50%', background: dot, border: '2px solid #fff' }} />
      )}
    </div>
  );
}

// ─── RoleBadge ────────────────────────────────────────────────────────────────

function RoleBadge({ role, size = 'sm' }: { role: string; size?: 'sm' | 'xs' }) {
  const m = ROLE_META[role] ?? ROLE_META.employee;
  const fs = size === 'xs' ? 9.5 : 10.5;
  return (
    <span style={{ fontSize: fs, fontWeight: 700, background: m.bg, color: m.color, padding: size === 'xs' ? '1px 6px' : '2px 8px', borderRadius: 99, flexShrink: 0 }}>
      {m.label}
    </span>
  );
}

// ─── StatusBadge: estado real del usuario ─────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'inactive') {
    return (
      <span style={{ fontSize: 9.5, fontWeight: 700, background: '#FEF3C7', color: '#92400E', padding: '1px 6px', borderRadius: 99 }}>
        Suspendido
      </span>
    );
  }
  return null;
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────

function ConfirmModal({ open, title, message, onConfirm, onCancel, confirmLabel = 'Confirmar', confirmColor = '#DC2626' }: {
  open: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void; confirmLabel?: string; confirmColor?: string;
}) {
  if (!open) return null;
  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,.55)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 71, background: '#fff', borderRadius: 18,
        padding: '28px 24px', width: 'calc(100% - 48px)', maxWidth: 360,
        boxShadow: '0 20px 60px rgba(0,0,0,.25)',
      }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: confirmColor === '#D97706' ? '#FFF7ED' : '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <AlertTriangle size={24} color={confirmColor} />
        </div>
        <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', textAlign: 'center', marginBottom: 10 }}>{title}</h3>
        <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.6, textAlign: 'center', marginBottom: 24 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: 13, border: '1.5px solid #E2E8F0', borderRadius: 12, background: '#fff', fontWeight: 700, fontSize: 14, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: 13, border: 'none', borderRadius: 12, background: confirmColor, fontWeight: 700, fontSize: 14, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>{confirmLabel}</button>
        </div>
      </div>
    </>
  );
}

// ─── MemberRow ────────────────────────────────────────────────────────────────

function MemberRow({ member, canManage, presenceDot, presenceLabel, presenceColor, onAction }: {
  member: ProfileRow;
  canManage: boolean;
  presenceDot: string;
  presenceLabel: string;
  presenceColor: string;
  onAction: (m: ProfileRow) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: '1px solid #F8FAFC' }}>
      <Avatar name={member.full_name} email={member.email} size={44} dot={presenceDot} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>
            {member.full_name || member.email?.split('@')[0] || 'Usuario'}
          </span>
          <RoleBadge role={member.role} />
          <StatusBadge status={member.status} />
        </div>
        <div style={{ fontSize: 11.5, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.email}</div>
        <div style={{ fontSize: 11, color: presenceColor, marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: presenceDot, flexShrink: 0 }} />
          {presenceLabel}
        </div>
      </div>
      {canManage && member.role !== 'owner' && (
        <button onClick={() => onAction(member)}
          style={{ border: 'none', background: '#F8FAFC', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <MoreVertical size={15} color="#64748B" />
        </button>
      )}
    </div>
  );
}

// ─── PendingRow ───────────────────────────────────────────────────────────────
// Muestra nombre, email, rol, fecha y acciones (reenviar / cancelar).
// "Cancelar invitación" libera el cupo inmediatamente.

function PendingRow({ inv, onRevoke, onResend }: {
  inv: WorkspaceInvitationRow; onRevoke: () => void; onResend: () => void;
}) {
  const name = (inv as any).full_name?.trim() || '';
  const initials = name ? name.charAt(0).toUpperCase() : inv.email.charAt(0).toUpperCase();

  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid #F8FAFC' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Avatar con inicial */}
        <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#D97706', flexShrink: 0 }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Nombre (si existe) */}
          {name && (
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </div>
          )}
          {/* Email */}
          <div style={{ fontSize: name ? 11.5 : 13.5, fontWeight: name ? 400 : 600, color: name ? '#64748B' : '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {inv.email}
          </div>
          {/* Rol + estado + fecha */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
            <RoleBadge role={inv.role} size="xs" />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#D97706', background: '#FEF3C7', padding: '1px 6px', borderRadius: 99 }}>
              ⏳ Pendiente
            </span>
            <span style={{ fontSize: 10.5, color: '#94A3B8' }}>Enviada {fmtDate(inv.created_at)}</span>
          </div>
        </div>
      </div>

      {/* Acciones en fila — más visibles */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={onResend}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 0', border: '1.5px solid #BFDBFE', borderRadius: 9, background: '#EFF6FF', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#2563EB', fontFamily: 'inherit' }}>
          <RefreshCw size={12} /> Reenviar
        </button>
        <button onClick={onRevoke}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 0', border: '1.5px solid #FECACA', borderRadius: 9, background: '#FEF2F2', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#DC2626', fontFamily: 'inherit' }}>
          <X size={12} /> Cancelar invitación
        </button>
      </div>
    </div>
  );
}

// ─── InviteSheet ──────────────────────────────────────────────────────────────

function InviteSheet({ open, loading, onClose, onSubmit }: {
  open: boolean; loading: boolean; onClose: () => void;
  onSubmit: (fields: {
    email: string; name: string; phone: string; city: string;
    profession: string; specialty: string;
    role: 'admin' | 'supervisor' | 'comercial' | 'operario';
  }) => void;
}) {
  const [email,      setEmail]      = useState('');
  const [name,       setName]       = useState('');
  const [phone,      setPhone]      = useState('');
  const [city,       setCity]       = useState('');
  const [profession, setProfession] = useState('');
  const [specialty,  setSpecialty]  = useState('');
  const [role,       setRole]       = useState<'admin' | 'supervisor' | 'comercial' | 'operario'>('operario');

  const phoneErr = phone.trim() && !isValidPhone(phone) ? 'Teléfono inválido' : null;
  const canSubmit = isValidEmail(email) && !!name.trim() && !!phone.trim() && !!city.trim() && !phoneErr;

  function reset() { setEmail(''); setName(''); setPhone(''); setCity(''); setProfession(''); setSpecialty(''); setRole('operario'); }

  function submit() {
    if (!canSubmit || loading) return;
    onSubmit({ email: email.trim(), name: name.trim(), phone: phone.trim(), city: city.trim(), profession: profession.trim(), specialty, role });
    reset();
  }

  const IS: React.CSSProperties = { width: '100%', padding: '11px 14px', border: '1.5px solid #E2E8F0', borderRadius: 12, fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: '#0F172A' };

  return (
    <>
      <div onClick={() => { onClose(); reset(); }} style={{ position: 'fixed', inset: 0, zIndex: 58, background: 'rgba(0,0,0,.4)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity .25s' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 59,
        background: '#fff', borderRadius: '20px 20px 0 0',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
        boxShadow: '0 -8px 32px rgba(0,0,0,.12)',
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform .3s cubic-bezier(.4,0,.2,1)',
        maxHeight: '95vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#E2E8F0' }} />
        </div>
        <div style={{ padding: '0 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A' }}>Invitar miembro</div>
              <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>Recibirá un correo con el enlace de acceso</div>
            </div>
            <button onClick={() => { onClose(); reset(); }} style={{ border: 'none', background: '#F1F5F9', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={15} color="#374151" />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Nombre completo *</label>
              <input style={IS} type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Juan García" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Correo electrónico *</label>
              <input style={IS} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="juan@empresa.com" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Teléfono *</label>
              <div style={{ position: 'relative' }}>
                <Phone size={14} color="#94A3B8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input style={{ ...IS, paddingLeft: 34, borderColor: phoneErr ? '#FCA5A5' : '#E2E8F0' }} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+57 300 000 0000" />
              </div>
              {phoneErr && <div style={{ fontSize: 11, color: '#DC2626', marginTop: 4 }}>{phoneErr}</div>}
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Ciudad *</label>
              <div style={{ position: 'relative' }}>
                <MapPin size={14} color="#94A3B8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input style={{ ...IS, paddingLeft: 34 }} type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="Bogotá, Medellín, Cali..." />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Profesión</label>
              <input style={IS} type="text" value={profession} onChange={e => setProfession(e.target.value)} placeholder="Ej: Técnico electricista" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 8 }}>
                Especialidad <span style={{ color: '#94A3B8', fontWeight: 400 }}>(para asignación automática)</span>
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SPECIALTIES.map(s => {
                  const sel = specialty === s.value;
                  return (
                    <button key={s.value} onClick={() => setSpecialty(sel ? '' : s.value)}
                      style={{ padding: '6px 12px', borderRadius: 99, border: `1.5px solid ${sel ? P : '#E2E8F0'}`, background: sel ? '#F5F3FF' : '#fff', color: sel ? P : '#64748B', fontWeight: sel ? 700 : 500, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 8 }}>Rol *</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(['admin','supervisor','comercial','operario'] as const).map(r => {
                  const m = ROLE_META[r];
                  const sel = role === r;
                  return (
                    <button key={r} onClick={() => setRole(r)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 12, border: `1.5px solid ${sel ? P : '#E2E8F0'}`, background: sel ? '#F5F3FF' : '#fff', cursor: 'pointer', textAlign: 'left' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: sel ? P : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: sel ? '#fff' : '#64748B' }}>{m.label.charAt(0)}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: sel ? P : '#0F172A' }}>{m.label}</div>
                        <div style={{ fontSize: 11, color: '#94A3B8' }}>{m.desc}</div>
                      </div>
                      {sel && <Check size={16} color={P} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <button onClick={submit} disabled={!canSubmit || loading}
            style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: canSubmit ? P : '#E2E8F0', color: canSubmit ? '#fff' : '#94A3B8', fontWeight: 800, fontSize: 15, cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: 'inherit', marginBottom: 8 }}>
            {loading ? 'Enviando invitación...' : 'Enviar invitación'}
          </button>
          <p style={{ fontSize: 11.5, color: '#94A3B8', textAlign: 'center', margin: 0, paddingBottom: 8 }}>
            El usuario recibirá un enlace para crear su contraseña y acceder a Shelwi.
          </p>
        </div>
      </div>
    </>
  );
}

// ─── LimitReachedModal ────────────────────────────────────────────────────────

function LimitReachedModal({ open, seatsUsed, seatsLimit, activeMembers, pendingInvites, extraPrice, onClose, onBuy, onManage }: {
  open: boolean; seatsUsed: number; seatsLimit: number;
  activeMembers: number; pendingInvites: number; extraPrice: number;
  onClose: () => void; onBuy: () => void; onManage: () => void;
}) {
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.45)' }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 61, background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px calc(24px + env(safe-area-inset-bottom))' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <AlertTriangle size={26} color="#DC2626" />
        </div>
        <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', textAlign: 'center', marginBottom: 8 }}>Cupos de usuario agotados</h3>

        {/* Desglose claro de cupos */}
        <div style={{ background: '#F8FAFC', borderRadius: 12, padding: '12px 16px', marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #F1F5F9' }}>
            <span style={{ fontSize: 13, color: '#64748B' }}>Cupos del plan</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{seatsLimit}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #F1F5F9' }}>
            <span style={{ fontSize: 13, color: '#64748B' }}>Usuarios activos</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#16A34A' }}>{activeMembers}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #F1F5F9' }}>
            <span style={{ fontSize: 13, color: '#64748B' }}>Invitaciones pendientes</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#D97706' }}>{pendingInvites}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0 2px' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Cupos usados</span>
            <span style={{ fontSize: 14, fontWeight: 900, color: '#DC2626' }}>{seatsUsed}/{seatsLimit}</span>
          </div>
        </div>

        <p style={{ fontSize: 12.5, color: '#94A3B8', textAlign: 'center', marginBottom: 16, lineHeight: 1.5 }}>
          Las invitaciones pendientes también reservan cupo. Cancela las que no vayas a usar o compra cupos adicionales.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={onBuy} style={{ width: '100%', padding: '13px 0', borderRadius: 12, border: 'none', background: P, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            Comprar cupos adicionales (+{fmtCOP(extraPrice)}/usuario/mes)
          </button>
          <button onClick={onManage} style={{ width: '100%', padding: '13px 0', borderRadius: 12, border: '1.5px solid #E2E8F0', background: '#fff', color: '#374151', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            Cancelar invitaciones pendientes
          </button>
          <button onClick={onClose} style={{ width: '100%', padding: '11px 0', borderRadius: 12, border: 'none', background: '#F1F5F9', color: '#94A3B8', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Cerrar
          </button>
        </div>
      </div>
    </>
  );
}

// ─── ActionSheet ──────────────────────────────────────────────────────────────

function ActionSheet({ member, open, onClose, onRole, onStatus }: {
  member: ProfileRow | null; open: boolean; onClose: () => void;
  onRole:   (id: string, role: 'admin'|'supervisor'|'comercial'|'operario') => void;
  onStatus: (id: string, status: 'inactive'|'removed') => void;
}) {
  const [showRoles, setShowRoles] = useState(false);
  const [confirm,   setConfirm]   = useState<null | 'deactivate' | 'remove'>(null);

  function handleClose() { setShowRoles(false); setConfirm(null); onClose(); }

  if (!member || !open) return null;

  const isInactive = member.status === 'inactive';

  return (
    <>
      <div onClick={handleClose} style={{ position: 'fixed', inset: 0, zIndex: 64, background: 'rgba(0,0,0,.4)' }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 65, background: '#fff', borderRadius: '20px 20px 0 0', padding: '16px 0 calc(16px + env(safe-area-inset-bottom))' }}>
        <div style={{ padding: '0 20px 14px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar name={member.full_name} email={member.email} size={42} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{member.full_name || member.email?.split('@')[0]}</div>
            <div style={{ display: 'flex', gap: 5, marginTop: 3 }}>
              <RoleBadge role={member.role} size="xs" />
              <StatusBadge status={member.status} />
            </div>
          </div>
          <button onClick={handleClose} style={{ border: 'none', background: '#F1F5F9', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} color="#374151" />
          </button>
        </div>

        {!showRoles ? (
          <div>
            <button onClick={() => setShowRoles(true)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Edit3 size={17} color="#374151" /></div>
              <span style={{ fontSize: 15, fontWeight: 500, color: '#0F172A' }}>Cambiar rol</span>
            </button>
            {!isInactive ? (
              <button onClick={() => setConfirm('deactivate')} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><UserX size={17} color="#D97706" /></div>
                <span style={{ fontSize: 15, fontWeight: 500, color: '#D97706' }}>Suspender usuario</span>
              </button>
            ) : (
              <button onClick={() => onStatus(member.id, 'inactive' as any)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Check size={17} color="#16A34A" /></div>
                <span style={{ fontSize: 15, fontWeight: 500, color: '#16A34A' }}>Reactivar usuario</span>
              </button>
            )}
            <button onClick={() => setConfirm('remove')} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Trash2 size={17} color="#DC2626" /></div>
              <span style={{ fontSize: 15, fontWeight: 500, color: '#DC2626' }}>Eliminar del equipo</span>
            </button>
          </div>
        ) : (
          <div>
            <div style={{ padding: '10px 20px 6px', fontSize: 12, fontWeight: 700, color: '#94A3B8' }}>NUEVO ROL</div>
            {(['admin','supervisor','comercial','operario'] as const).map(r => {
              const m = ROLE_META[r];
              const current = member.role === r;
              return (
                <button key={r} onClick={() => { if (!current) onRole(member.id, r); handleClose(); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ color: m.color, fontWeight: 800, fontSize: 14 }}>{m.label.charAt(0)}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{m.label}</div>
                    <div style={{ fontSize: 11.5, color: '#94A3B8' }}>{m.desc}</div>
                  </div>
                  {current && <Check size={16} color={P} />}
                </button>
              );
            })}
            <button onClick={() => setShowRoles(false)} style={{ width: '100%', padding: '12px 20px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 14, color: '#94A3B8', fontFamily: 'inherit' }}>← Volver</button>
          </div>
        )}
      </div>

      <ConfirmModal open={confirm === 'deactivate'} title="Suspender usuario"
        message={`${member.full_name || member.email} no podrá iniciar sesión. El cupo quedará disponible de inmediato.`}
        onConfirm={() => { onStatus(member.id, 'inactive'); setConfirm(null); handleClose(); }}
        onCancel={() => setConfirm(null)} confirmLabel="Suspender" confirmColor="#D97706" />

      <ConfirmModal open={confirm === 'remove'} title="Eliminar usuario"
        message={`¿Eliminar a ${member.full_name || member.email}? Perderá acceso permanentemente y se liberará el cupo.`}
        onConfirm={() => { onStatus(member.id, 'removed'); setConfirm(null); handleClose(); }}
        onCancel={() => setConfirm(null)} confirmLabel="Eliminar" />
    </>
  );
}

// ─── KpiSheet ─────────────────────────────────────────────────────────────────

function KpiSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 62, background: 'rgba(0,0,0,.4)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity .25s' }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 63, background: '#fff', borderRadius: '20px 20px 0 0', maxHeight: '75vh', overflowY: 'auto', padding: '20px 0 calc(16px + env(safe-area-inset-bottom))', transform: open ? 'translateY(0)' : 'translateY(100%)', transition: 'transform .3s cubic-bezier(.4,0,.2,1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px 14px', borderBottom: '1px solid #F1F5F9' }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>{title}</span>
          <button onClick={onClose} style={{ border: 'none', background: '#F1F5F9', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} color="#374151" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

// ─── HistorialTab ────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending:  { label: 'Pendiente', color: '#D97706', bg: '#FEF3C7', icon: '⏳' },
  accepted: { label: 'Aceptada',  color: '#16A34A', bg: '#F0FDF4', icon: '✅' },
  revoked:  { label: 'Cancelada', color: '#DC2626', bg: '#FEF2F2', icon: '❌' },
  expired:  { label: 'Expirada',  color: '#94A3B8', bg: '#F1F5F9', icon: '⌛' },
};

function HistorialTab({ items, loading }: { items: InvitationHistoryItem[]; loading: boolean }) {
  if (loading) {
    return <div style={{ padding: '24px 20px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Cargando historial...</div>;
  }
  if (items.length === 0) {
    return (
      <div style={{ padding: '32px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Sin historial</div>
        <div style={{ fontSize: 13, color: '#94A3B8' }}>Las invitaciones aparecerán aquí una vez enviadas.</div>
      </div>
    );
  }
  return (
    <>
      {items.map(inv => {
        const st = STATUS_STYLE[inv.status] ?? STATUS_STYLE.expired;
        const name = inv.full_name?.trim() || '';
        return (
          <div key={inv.id} style={{ padding: '12px 16px', borderBottom: '1px solid #F8FAFC' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              {/* Avatar */}
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: st.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                {st.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Nombre + email */}
                {name && <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>}
                <div style={{ fontSize: name ? 12 : 13.5, fontWeight: name ? 400 : 600, color: name ? '#64748B' : '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.email}</div>
                {/* Badges */}
                <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                  <RoleBadge role={inv.role} size="xs" />
                  <span style={{ fontSize: 10, fontWeight: 700, color: st.color, background: st.bg, padding: '1px 6px', borderRadius: 99 }}>
                    {st.label}
                  </span>
                  <span style={{ fontSize: 10.5, color: '#94A3B8' }}>
                    {inv.accepted_at
                      ? `Aceptada ${fmtDate(inv.accepted_at)}`
                      : `Enviada ${fmtDate(inv.created_at)}`}
                  </span>
                </div>
                {/* Quién invitó */}
                {inv.inviter_name && (
                  <div style={{ fontSize: 10.5, color: '#CBD5E1', marginTop: 2 }}>
                    Invitó: {inv.inviter_name}
                  </div>
                )}
              </div>
              {/* Ciudad / especialidad */}
              {(inv.city || inv.specialty) && (
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {inv.city && <div style={{ fontSize: 10.5, color: '#94A3B8' }}>{inv.city}</div>}
                  {inv.specialty && <div style={{ fontSize: 10, color: '#7C3AED', fontWeight: 600 }}>{inv.specialty}</div>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

// ─── TeamMobile ───────────────────────────────────────────────────────────────

export function TeamMobile() {
  const navigate  = useNavigate();
  const { profile, workspace, planName } = useWorkspace();
  const { openUpgradeModal } = useUI();
  const { showToast } = useToast();
  const qc = useQueryClient();

  // ── ÚNICA FUENTE DE VERDAD ────────────────────────────────────────────────
  const teamQ   = useTeamState();
  useInvitationHistory();
  const historyQ = useFullInvitationHistory(); // historial completo (lazy)

  // Presencia en tiempo real
  const presenceMap = usePresence({
    workspaceId: workspace.id,
    userId:      profile.id,
    enabled:     !!workspace.id,
  });

  const [tab,           setTab]          = useState<'all'|'admin'|'operativo'|'invited'|'historial'>('all');
  const [search,        setSearch]       = useState('');
  const [inviteOpen,    setInviteOpen]   = useState(false);
  const [limitOpen,     setLimitOpen]    = useState(false);
  const [actionMember,  setActionMember] = useState<ProfileRow | null>(null);
  const [actionOpen,    setActionOpen]   = useState(false);
  const [linkFallback,  setLinkFallback] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading]= useState(false);
  const [kpiSheet,      setKpiSheet]     = useState<null|'users'|'invites'|'admins'|'ops'>(null);

  const isOwner   = profile.role === 'owner';
  const isAdmin   = profile.role === 'admin';
  const canManage = isOwner || isAdmin;
  const inviterName = profile.full_name || profile.email || 'El administrador';

  // ── TODOS LOS DERIVADOS del MISMO objeto ─────────────────────────────────
  // Si teamQ.data cambia, TODOS los derivados se actualizan juntos.
  // Nunca hay inconsistencia entre tarjeta, lista, filtros y modal.

  const seats    = teamQ.data?.seats;
  const members  = teamQ.data?.members ?? [];    // status IN ('active','inactive')
  const pending  = teamQ.data?.pending  ?? [];   // status='pending'

  // Derivados computados del mismo array
  const admins   = useMemo(() => members.filter(m => ['admin','owner'].includes(m.role)), [members]);
  const ops      = useMemo(() => members.filter(m => ['operario','supervisor','comercial','employee'].includes(m.role)), [members]);

  // seats_used y seats_limit vienen del RPC — fuente autoritativa
  // seats_limit = null → Enterprise ilimitado (NULL semántico)
  const seatsUsed  = seats?.seats_used  ?? 0;
  const seatsLimit = seats?.seats_limit ?? null;  // null = ilimitado
  const unlimited  = isUnlimited(seatsLimit);
  const seatsFull  = !unlimited && seatsUsed >= (seatsLimit ?? 1);

  const filtered = useMemo(() => {
    let base: ProfileRow[];
    if (tab === 'admin')          base = admins;
    else if (tab === 'operativo') base = ops;
    else                          base = members;
    if (!search) return base;
    const s = search.toLowerCase();
    return base.filter(m =>
      m.full_name?.toLowerCase().includes(s) ||
      m.email?.toLowerCase().includes(s) ||
      ROLE_META[m.role]?.label.toLowerCase().includes(s) ||
      (m as any).city?.toLowerCase().includes(s)
    );
  }, [members, admins, ops, tab, search]);

  // ── Invalidar TODO con una sola llamada ───────────────────────────────────
  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ['teamState'] });
    qc.invalidateQueries({ queryKey: ['invitationHistory', workspace.id] });
  }

  async function handleInvite(fields: {
    email: string; name: string; phone: string; city: string;
    profession: string; specialty: string;
    role: 'admin' | 'supervisor' | 'comercial' | 'operario';
  }) {
    setInviteLoading(true);
    try {
      const result = await inviteTeamMember({
        workspaceId:   workspace.id,
        email:         fields.email,
        role:          fields.role,
        fullName:      fields.name       || undefined,
        phone:         fields.phone      || undefined,
        city:          fields.city       || undefined,
        profession:    fields.profession || undefined,
        specialty:     fields.specialty  || undefined,
        inviterName,
        workspaceName: workspace.name,
      });
      invalidateAll();
      if (result.emailSent) {
        showToast('Invitación enviada ✓');
        setInviteOpen(false);
      } else {
        setLinkFallback(`${window.location.origin}/invite/${result.invitation.token}`);
        setInviteOpen(false);
      }
    } catch (err) {
      showToast(txErr(err, 'No se pudo enviar la invitación'));
    } finally {
      setInviteLoading(false);
    }
  }

  const roleMut = useMutation({
    mutationFn: ({ profileId, role }: { profileId: string; role: 'admin'|'supervisor'|'comercial'|'operario' }) => updateMemberRole(profileId, role),
    onSuccess:  () => { invalidateAll(); showToast('Rol actualizado'); },
    onError:    (err) => showToast(txErr(err, 'Error al actualizar rol')),
  });

  const statusMut = useMutation({
    mutationFn: ({ profileId, status }: { profileId: string; status: 'active'|'inactive'|'removed' }) => setMemberStatus(profileId, status),
    onSuccess: (_d, v) => {
      invalidateAll();
      const msg = { removed: 'Usuario eliminado', inactive: 'Usuario suspendido', active: 'Usuario reactivado' };
      showToast(msg[v.status] ?? 'Actualizado');
      setActionOpen(false);
    },
    onError: (err) => showToast(txErr(err, 'Error al actualizar')),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeInvitation(id),
    onSuccess:  () => { invalidateAll(); showToast('Invitación cancelada'); },
    onError:    (err) => showToast(txErr(err, 'Error')),
  });

  const resendMut = useMutation({
    mutationFn: (inv: WorkspaceInvitationRow) => resendInvitation(inv.id, inviterName, workspace.name),
    onSuccess:  () => { invalidateAll(); showToast('Invitación reenviada ✓'); },
    onError:    (err) => showToast(txErr(err, 'Error al reenviar')),
  });

  // ── Early returns DESPUÉS de todos los hooks ──────────────────────────────

  if (teamQ.isLoading) {
    return <div style={{ padding: '60px 0', textAlign: 'center', color: '#94A3B8' }}>Cargando equipo…</div>;
  }

  if (teamQ.error || !seats) {
    const isNoMultiuser = !seats?.multiuser_enabled;
    if (isNoMultiuser) return <UpgradeLocked openUpgradeModal={openUpgradeModal} />;
    return <div style={{ padding: '60px 0', textAlign: 'center', color: '#EF4444', fontSize: 14 }}>Error al cargar el equipo. Intenta de nuevo.</div>;
  }

  if (!seats.multiuser_enabled) return <UpgradeLocked openUpgradeModal={openUpgradeModal} />;

  function handleInviteBtn() {
    // Validar contra la fuente de verdad actual (ya refrescada en useTeamState)
    if (seatsFull) { setLimitOpen(true); }
    else { setInviteOpen(true); }
  }

  const planLabel = planName.toUpperCase();

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 100 }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: 0, flex: 1 }}>Equipo y usuarios</h1>
          <span style={{ fontSize: 10, fontWeight: 800, background: `linear-gradient(135deg,${P},#A855F7)`, color: '#fff', padding: '3px 9px', borderRadius: 99 }}>{planLabel}</span>
        </div>
        <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>Gestiona usuarios, roles e invitaciones</p>
      </div>

      <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── Plan card — TODO desde seats (fuente única) ─────────────────── */}
        <div style={{ background: 'linear-gradient(135deg,#F5F3FF,#EFF6FF)', borderRadius: 16, border: '1px solid #DDD6FE', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg,${P},#A855F7)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Crown size={20} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Plan {planLabel}</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 1 }}>
              {seatsUsed}/{fmtLimit(seatsLimit)} cupos
              {seats.active_members > 0 && ` · ${seats.active_members} activo${seats.active_members !== 1 ? 's' : ''}`}
              {(seats.pending_invites ?? 0) > 0 && (
                <span style={{ color: '#D97706' }}> · {seats.pending_invites} pendiente{(seats.pending_invites ?? 0) !== 1 ? 's' : ''}</span>
              )}
              {unlimited && <span style={{ color: '#16A34A', fontWeight: 700 }}> · Ilimitado</span>}
            </div>
            {/* Barra de progreso — solo si no es ilimitado */}
            {!unlimited && (
              <div style={{ marginTop: 6, height: 4, background: '#DDD6FE', borderRadius: 99 }}>
                <div style={{ width: `${Math.min(100, (seatsUsed / Math.max(seatsLimit, 1)) * 100)}%`, height: '100%', background: seatsFull ? '#DC2626' : P, borderRadius: 99, transition: 'width .3s' }} />
              </div>
            )}
            {/* Advertencia si hay invitaciones pendientes ocupando cupo */}
            {seatsFull && (seats.pending_invites ?? 0) > 0 && (
              <div style={{ fontSize: 10.5, color: '#D97706', marginTop: 4 }}>
                ⚠️ {seats.pending_invites} invitación{(seats.pending_invites ?? 0) !== 1 ? 'es' : ''} pendiente{(seats.pending_invites ?? 0) !== 1 ? 's' : ''} reservan cupo
              </div>
            )}
          </div>
          <button onClick={() => navigate('/app/planes')}
            style={{ border: '1.5px solid #DDD6FE', background: '#fff', color: P, fontWeight: 700, fontSize: 12, padding: '7px 11px', borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            Mi plan <ChevronRight size={12} />
          </button>
        </div>

        {/* ── Botón Invitar SIEMPRE visible ──────────────────────────────────── */}
        {canManage && (
          <button onClick={handleInviteBtn}
            style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: P, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: `0 4px 16px ${P}40` }}>
            <UserPlus size={18} />
            Invitar usuario
            {seatsFull && <span style={{ background: 'rgba(255,255,255,.25)', fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>Límite alcanzado</span>}
          </button>
        )}

        {/* ── Buscador ───────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 12, border: '1.5px solid #E2E8F0', padding: '9px 14px' }}>
          <Search size={16} color="#94A3B8" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, correo, rol o ciudad..."
            style={{ border: 'none', background: 'none', flex: 1, fontSize: 14, outline: 'none', color: '#0F172A' }} />
          {search && <button onClick={() => setSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}><X size={14} color="#94A3B8" /></button>}
        </div>

        {/* ── Tabs — contadores del mismo dato ───────────────────────────────── */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {([
            { key: 'all',       label: 'Todos',      count: members.length },
            { key: 'admin',     label: 'Admins',     count: admins.length },
            { key: 'operativo', label: 'Operativos', count: ops.length },
            { key: 'invited',   label: 'Invitados',  count: pending.length },
            ...(canManage ? [{ key: 'historial' as const, label: 'Historial', count: 0 }] : []),
          ] as const).map(t => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ flexShrink: 0, padding: '7px 13px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: active ? 700 : 500, fontSize: 13, background: active ? P : '#F1F5F9', color: active ? '#fff' : '#475569', display: 'flex', alignItems: 'center', gap: 5 }}>
                {t.label}
                {t.count > 0 && <span style={{ fontSize: 10, fontWeight: 800, background: active ? 'rgba(255,255,255,.3)' : '#E2E8F0', color: active ? '#fff' : '#64748B', borderRadius: 99, padding: '1px 5px' }}>{t.count}</span>}
              </button>
            );
          })}
        </div>

        {/* ── Lista ─────────────────────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          {tab === 'invited' ? (
            pending.length === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 12 }}>Sin invitaciones pendientes</div>
                {canManage && (
                  <button onClick={handleInviteBtn} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', border: 'none', borderRadius: 12, background: P, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    <UserPlus size={14} /> Invitar primer miembro
                  </button>
                )}
              </div>
            ) : pending.map(inv => (
              <PendingRow key={inv.id} inv={inv}
                onRevoke={() => revokeMut.mutate(inv.id)}
                onResend={() => resendMut.mutate(inv)}
              />
            ))
          ) : tab === 'historial' ? (
            <HistorialTab items={historyQ.data ?? []} loading={historyQ.isLoading} />
          ) : filtered.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
              {search ? 'Sin resultados' : 'Sin usuarios en esta categoría'}
            </div>
          ) : filtered.map(m => {
            const ps = resolvePresenceStatus(m.id, presenceMap, (m as any).last_seen_at, m.updated_at);
            return (
              <MemberRow key={m.id} member={m} canManage={canManage}
                presenceDot={ps.dot} presenceLabel={ps.label} presenceColor={ps.color}
                onAction={(member) => { setActionMember(member); setActionOpen(true); }}
              />
            );
          })}
        </div>

        {/* ── KPI Cards — TODOS derivados del mismo dato ─────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { key: 'users',   icon: <Users size={18} color={P} />,          value: unlimited ? `${seatsUsed}/∞` : `${seatsUsed}/${seatsLimit}`, label: 'Cupos usados', bg: '#F5F3FF', sub: unlimited ? '∞ Ilimitados' : `${(seatsLimit ?? 1) - seatsUsed} disponibles` },
            { key: 'invites', icon: <Clock size={18} color='#D97706' />,     value: String(pending.length),       label: 'Invitaciones', bg: '#FFFBEB', sub: 'pendientes' },
            { key: 'admins',  icon: <Shield size={18} color='#2563EB' />,    value: String(admins.length),        label: 'Admins',       bg: '#EFF6FF', sub: 'activos' },
            { key: 'ops',     icon: <Briefcase size={18} color='#16A34A' />, value: String(ops.length),           label: 'Operativos',   bg: '#F0FDF4', sub: 'activos' },
          ].map(k => (
            <button key={k.key} onClick={() => setKpiSheet(k.key as any)}
              style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', border: 'none', cursor: 'pointer', textAlign: 'left', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>{k.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#0F172A' }}>{k.value}</div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>{k.label}</div>
              <div style={{ fontSize: 10.5, color: '#94A3B8' }}>{k.sub}</div>
            </button>
          ))}
        </div>

        {/* ── Control de asistencia ──────────────────────────────────────────── */}
        {canManage && (
          <button onClick={() => navigate('/app/asistencia')}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, border: '1.5px solid #E2E8F0', background: '#fff', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Wrench size={18} color="#16A34A" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Control de asistencia</div>
              <div style={{ fontSize: 12, color: '#94A3B8' }}>Ingreso, almuerzo y salida del equipo</div>
            </div>
            <ChevronRight size={16} color="#CBD5E1" />
          </button>
        )}
      </div>

      {/* ── Link fallback ────────────────────────────────────────────────────── */}
      {linkFallback && (
        <>
          <div onClick={() => setLinkFallback(null)} style={{ position: 'fixed', inset: 0, zIndex: 66, background: 'rgba(0,0,0,.45)' }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 67, background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px calc(24px + env(safe-area-inset-bottom))' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>Comparte este enlace</h3>
            <p style={{ fontSize: 13, color: '#64748B', marginBottom: 14 }}>No se envió el correo (Resend no configurado). Comparte este enlace directamente.</p>
            <div style={{ background: '#F8FAFC', borderRadius: 12, padding: '10px 14px', fontSize: 12, color: '#374151', wordBreak: 'break-all', marginBottom: 14 }}>{linkFallback}</div>
            <button onClick={() => { navigator.clipboard.writeText(linkFallback); showToast('Enlace copiado'); }}
              style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: P, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Copy size={16} /> Copiar enlace
            </button>
          </div>
        </>
      )}

      {/* ── KPI Sheets ──────────────────────────────────────────────────────── */}
      <KpiSheet open={kpiSheet === 'users'} title="Cupos del plan" onClose={() => setKpiSheet(null)}>
        <div style={{ padding: '12px 20px' }}>
          {[
            { label: 'Cupos usados (activos + invitaciones)', value: seatsUsed },
            { label: 'Miembros activos',                      value: seats.active_members },
            { label: 'Invitaciones pendientes',               value: seats.pending_invites },
            { label: 'Cupos disponibles',                     value: unlimited ? '∞' : Math.max(0, (seatsLimit ?? 1) - seatsUsed) },
            { label: 'Incluidos en el plan',                  value: seats.included_users === null ? '∞ Ilimitados' : seats.included_users },
            { label: 'Licencias adicionales',                 value: seats.additional_licenses },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F8FAFC' }}>
              <span style={{ fontSize: 13, color: '#374151' }}>{r.label}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>{r.value}</span>
            </div>
          ))}
        </div>
        {canManage && (
          <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => { setKpiSheet(null); handleInviteBtn(); }}
              style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: P, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              Invitar usuario
            </button>
            {/* "Comprar cupos" solo para planes con límite (no Enterprise) */}
            {!unlimited && (
              <button onClick={() => { setKpiSheet(null); navigate('/app/team/adicionales'); }}
                style={{ width: '100%', padding: '11px 0', borderRadius: 12, border: `1.5px solid ${P}`, background: '#fff', color: P, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                + Comprar cupos adicionales
              </button>
            )}
            {unlimited && (
              <div style={{ textAlign: 'center', fontSize: 13, color: '#16A34A', fontWeight: 600, padding: '4px 0' }}>
                ∞ Usuarios ilimitados — Enterprise
              </div>
            )}
          </div>
        )}
      </KpiSheet>

      <KpiSheet
        open={kpiSheet === 'invites'}
        title={`Invitaciones pendientes (${pending.length})`}
        onClose={() => setKpiSheet(null)}
      >
        {/* Info: cada invitación reserva cupo */}
        {pending.length > 0 && (
          <div style={{ margin: '8px 16px 4px', background: '#FFF7ED', borderRadius: 10, padding: '8px 12px', display: 'flex', gap: 8 }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
            <span style={{ fontSize: 11.5, color: '#92400E', lineHeight: 1.5 }}>
              Cada invitación pendiente reserva un cupo. Cancela las que no vayas a usar para liberar espacio.
            </span>
          </div>
        )}
        {pending.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <Mail size={32} color="#CBD5E1" style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Sin invitaciones pendientes</div>
            <div style={{ fontSize: 13, color: '#94A3B8' }}>Invita a nuevos miembros para que se unan a tu equipo.</div>
          </div>
        ) : (
          pending.map(inv => (
            <PendingRow key={inv.id} inv={inv}
              onRevoke={() => { revokeMut.mutate(inv.id); /* no cierra el sheet — permite cancelar varias */ }}
              onResend={() => { resendMut.mutate(inv); }}
            />
          ))
        )}
        {canManage && (
          <div style={{ padding: '12px 20px' }}>
            <button onClick={() => { setKpiSheet(null); handleInviteBtn(); }}
              style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: P, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <UserPlus size={16} /> Nueva invitación
            </button>
          </div>
        )}
      </KpiSheet>

      <KpiSheet open={kpiSheet === 'admins'} title={`Administradores (${admins.length})`} onClose={() => setKpiSheet(null)}>
        {admins.map(m => {
          const ps = resolvePresenceStatus(m.id, presenceMap, (m as any).last_seen_at, m.updated_at);
          return <MemberRow key={m.id} member={m} canManage={canManage} presenceDot={ps.dot} presenceLabel={ps.label} presenceColor={ps.color} onAction={(mb) => { setKpiSheet(null); setActionMember(mb); setActionOpen(true); }} />;
        })}
        {admins.length === 0 && <div style={{ padding: '24px 20px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Sin administradores</div>}
      </KpiSheet>

      <KpiSheet open={kpiSheet === 'ops'} title={`Equipo operativo (${ops.length})`} onClose={() => setKpiSheet(null)}>
        {ops.map(m => {
          const ps = resolvePresenceStatus(m.id, presenceMap, (m as any).last_seen_at, m.updated_at);
          return <MemberRow key={m.id} member={m} canManage={canManage} presenceDot={ps.dot} presenceLabel={ps.label} presenceColor={ps.color} onAction={(mb) => { setKpiSheet(null); setActionMember(mb); setActionOpen(true); }} />;
        })}
        {ops.length === 0 && <div style={{ padding: '24px 20px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Sin operarios asignados</div>}
      </KpiSheet>

      {/* ── Invite sheet ────────────────────────────────────────────────────── */}
      <InviteSheet open={inviteOpen && !linkFallback} loading={inviteLoading}
        onClose={() => setInviteOpen(false)} onSubmit={handleInvite} />

      {/* ── Limit modal ─────────────────────────────────────────────────────── */}
      <LimitReachedModal open={limitOpen}
        seatsUsed={seatsUsed} seatsLimit={seatsLimit ?? 1}
        activeMembers={seats.active_members ?? 0}
        pendingInvites={seats.pending_invites ?? 0}
        extraPrice={seats.extra_user_price}
        onClose={() => setLimitOpen(false)}
        onBuy={() => { setLimitOpen(false); navigate('/app/team/adicionales'); }}
        onManage={() => { setLimitOpen(false); setTab('invited'); }} />

      {/* ── Action sheet ────────────────────────────────────────────────────── */}
      <ActionSheet member={actionMember} open={actionOpen}
        onClose={() => { setActionOpen(false); setActionMember(null); }}
        onRole={(id, role) => roleMut.mutate({ profileId: id, role })}
        onStatus={(id, status) => statusMut.mutate({ profileId: id, status })}
      />
    </div>
  );
}
