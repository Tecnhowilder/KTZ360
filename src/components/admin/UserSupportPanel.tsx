/**
 * UserSupportPanel — Panel de soporte expandible por usuario (Paso 1 Enterprise)
 *
 * Provee al Super Admin / Support Admin:
 *   - Ver y revocar sesiones activas
 *   - Ver y revocar push tokens
 *   - Historial de actividad (audit log)
 *   - Reset Password (magic link enviado)
 *   - Reset MFA (solo super_admin)
 *   - Impersonation controlada (solo super_admin)
 *
 * Toda acción queda registrada en audit_log via backend.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminGetUserSessions,
  adminRevokeUserSession,
  adminRevokeAllUserSessions,
  adminGetUserPushTokens,
  adminRevokePushToken,
  adminGetUserActivity,
  adminResetPassword,
  adminResetMFA,
  adminImpersonate,
  type AdminUserSession,
  type AdminPushToken,
  type AdminUserActivityRow,
} from '../../services/adminSupport';
import { useToast } from '../ui/Toast';
import { BRAND_COLORS } from '../../lib/brand';

// ─── Estilos compartidos ──────────────────────────────────────────────────────

const card: React.CSSProperties = { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16 };
const btnSm: React.CSSProperties = { border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 700, padding: '4px 10px', cursor: 'pointer' };
const btnDanger: React.CSSProperties = { ...btnSm, background: '#FEE2E2', color: '#DC2626' };
const btnWarning: React.CSSProperties = { ...btnSm, background: '#FEF3C7', color: '#92400E' };
const btnPrimary: React.CSSProperties = { ...btnSm, background: BRAND_COLORS.primary, color: '#fff' };
const btnGhost: React.CSSProperties = { ...btnSm, background: 'transparent', border: '1.5px solid #E2E8F0', color: '#64748B' };
const chip = (color: string): React.CSSProperties => ({
  display: 'inline-block', background: color + '18', color, borderRadius: 5,
  fontSize: 10, fontWeight: 700, padding: '1px 7px',
});

type SupportTab = 'sessions' | 'tokens' | 'activity' | 'actions';

interface UserSupportPanelProps {
  userId:    string;
  email:     string;
  userName:  string;
  isSuperAdmin: boolean;
}

export function UserSupportPanel({ userId, email, userName, isSuperAdmin }: UserSupportPanelProps) {
  const [tab, setTab] = useState<SupportTab>('sessions');
  const [confirmAction, setConfirmAction] = useState<null | { label: string; onConfirm: () => void }>(null);
  const qc = useQueryClient();
  const { showToast } = useToast();

  const sessQ = useQuery({
    queryKey: ['adminUserSessions', userId],
    queryFn: () => adminGetUserSessions(userId),
    staleTime: 30_000,
    enabled: tab === 'sessions',
  });

  const tokensQ = useQuery({
    queryKey: ['adminUserTokens', userId],
    queryFn: () => adminGetUserPushTokens(userId),
    staleTime: 60_000,
    enabled: tab === 'tokens',
  });

  const activityQ = useQuery({
    queryKey: ['adminUserActivity', userId],
    queryFn: () => adminGetUserActivity(userId, 50),
    staleTime: 60_000,
    enabled: tab === 'activity',
  });

  const revokeSessionMut = useMutation({
    mutationFn: (sessionId: string) => adminRevokeUserSession(sessionId),
    onSuccess: (msg) => { qc.invalidateQueries({ queryKey: ['adminUserSessions', userId] }); showToast(msg); },
    onError: (e: Error) => showToast(e.message),
  });

  const revokeAllMut = useMutation({
    mutationFn: () => adminRevokeAllUserSessions(userId),
    onSuccess: (n) => { qc.invalidateQueries({ queryKey: ['adminUserSessions', userId] }); showToast(`${n} sesión(es) revocada(s)`); },
    onError: (e: Error) => showToast(e.message),
  });

  const revokeTokenMut = useMutation({
    mutationFn: (tokenId: string) => adminRevokePushToken(tokenId),
    onSuccess: (msg) => { qc.invalidateQueries({ queryKey: ['adminUserTokens', userId] }); showToast(msg); },
    onError: (e: Error) => showToast(e.message),
  });

  const resetPwMut = useMutation({
    mutationFn: () => adminResetPassword(userId, email),
    onSuccess: (r) => showToast(r.message),
    onError: (e: Error) => showToast(e.message),
  });

  const resetMfaMut = useMutation({
    mutationFn: () => adminResetMFA(userId),
    onSuccess: (r) => showToast(r.message),
    onError: (e: Error) => showToast(e.message),
  });

  const impersonateMut = useMutation({
    mutationFn: () => adminImpersonate(userId, email),
    onSuccess: (r) => {
      if (r.link) {
        navigator.clipboard.writeText(r.link).catch(() => {});
        showToast('Enlace copiado al portapapeles. Ábrelo en modo incógnito.');
      } else {
        showToast(r.message);
      }
    },
    onError: (e: Error) => showToast(e.message),
  });

  const TABS: { key: SupportTab; label: string }[] = [
    { key: 'sessions',  label: 'Sesiones' },
    { key: 'tokens',    label: 'Push Tokens' },
    { key: 'activity',  label: 'Actividad' },
    { key: 'actions',   label: 'Acciones' },
  ];

  return (
    <div style={{ background: '#EFF6FF', borderRadius: 14, padding: 16, margin: '4px 0', border: '1px solid #BFDBFE' }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: '#1E40AF' }}>🛠 Soporte: {userName}</span>
        <span style={{ fontSize: 11, color: '#60A5FA' }}>{email}</span>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            ...btnSm, background: tab === t.key ? BRAND_COLORS.primary : '#fff',
            color: tab === t.key ? '#fff' : '#64748B',
            border: tab === t.key ? 'none' : '1.5px solid #E2E8F0',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Sesiones ─────────────────────────────────────────────────────── */}
      {tab === 'sessions' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
              Sesiones activas: {(sessQ.data ?? []).filter(s => s.is_active).length}
            </span>
            {(sessQ.data ?? []).some(s => s.is_active) && (
              <button style={btnDanger} onClick={() => setConfirmAction({
                label: `¿Cerrar TODAS las sesiones de ${userName}?`,
                onConfirm: () => revokeAllMut.mutate(),
              })}>
                Cerrar todas
              </button>
            )}
          </div>
          {sessQ.isLoading ? <Spinner /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(sessQ.data ?? []).length === 0 && <Empty text="Sin sesiones registradas" />}
              {(sessQ.data ?? []).map((s: AdminUserSession) => (
                <SessionRow key={s.id} session={s} onRevoke={() => setConfirmAction({
                  label: `¿Revocar sesión "${s.device_name ?? s.device_id}"?`,
                  onConfirm: () => revokeSessionMut.mutate(s.id),
                })} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Push Tokens ───────────────────────────────────────────────────── */}
      {tab === 'tokens' && (
        <div>
          {tokensQ.isLoading ? <Spinner /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(tokensQ.data ?? []).length === 0 && <Empty text="Sin push tokens registrados" />}
              {(tokensQ.data ?? []).map((t: AdminPushToken) => (
                <TokenRow key={t.id} token={t} onRevoke={() => setConfirmAction({
                  label: `¿Revocar token ${t.platform} (${t.device_id.slice(0, 8)}…)?`,
                  onConfirm: () => revokeTokenMut.mutate(t.id),
                })} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Actividad ─────────────────────────────────────────────────────── */}
      {tab === 'activity' && (
        <div>
          {activityQ.isLoading ? <Spinner /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 320, overflowY: 'auto' }}>
              {(activityQ.data ?? []).length === 0 && <Empty text="Sin actividad registrada" />}
              {(activityQ.data ?? []).map((a: AdminUserActivityRow) => (
                <ActivityRow key={a.id} row={a} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Acciones ──────────────────────────────────────────────────────── */}
      {tab === 'actions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ActionCard
            icon="🔑"
            title="Reset Password"
            description="Genera un enlace de recuperación de contraseña y lo muestra aquí. El admin debe enviárselo al usuario."
            buttonLabel="Generar enlace"
            buttonStyle={btnPrimary}
            loading={resetPwMut.isPending}
            onClick={() => setConfirmAction({
              label: `¿Generar enlace de reset de contraseña para ${email}?`,
              onConfirm: () => resetPwMut.mutate(),
            })}
          />
          {isSuperAdmin && (
            <ActionCard
              icon="🔐"
              title="Reset MFA"
              description="Elimina todos los factores MFA del usuario. El usuario deberá configurar MFA nuevamente al iniciar sesión."
              buttonLabel="Reset MFA"
              buttonStyle={btnWarning}
              loading={resetMfaMut.isPending}
              onClick={() => setConfirmAction({
                label: `¿Eliminar TODOS los factores MFA de ${userName}? Esta acción no se puede deshacer.`,
                onConfirm: () => resetMfaMut.mutate(),
              })}
            />
          )}
          {isSuperAdmin && (
            <ActionCard
              icon="👁"
              title="Impersonation"
              description="Genera un magic link one-time para acceder como este usuario. Copia el enlace y ábrelo en modo incógnito. Toda acción queda en el audit log."
              buttonLabel="Generar enlace"
              buttonStyle={{ ...btnSm, background: '#7C3AED', color: '#fff' }}
              loading={impersonateMut.isPending}
              onClick={() => setConfirmAction({
                label: `⚠️ ¿Iniciar impersonation de ${email}? Esta acción queda registrada en el audit log.`,
                onConfirm: () => impersonateMut.mutate(),
              })}
              warning
            />
          )}
        </div>
      )}

      {/* ── Confirm Dialog ────────────────────────────────────────────────── */}
      {confirmAction && (
        <ConfirmDialog
          label={confirmAction.label}
          onConfirm={() => { confirmAction.onConfirm(); setConfirmAction(null); }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SessionRow({ session, onRevoke }: { session: AdminUserSession; onRevoke: () => void }) {
  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={chip(session.is_active ? '#10B981' : '#94A3B8')}>{session.is_active ? 'ACTIVA' : 'REVOCADA'}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', flex: 1, minWidth: 120 }}>
        {session.device_name ?? session.device_id.slice(0, 16) + '…'}
      </span>
      <span style={{ fontSize: 11, color: '#64748B' }}>{session.workspace_name ?? '—'}</span>
      <span style={{ fontSize: 11, color: '#94A3B8' }}>
        {new Date(session.last_seen_at).toLocaleString('es-CO', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
      </span>
      {session.ip && <span style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'monospace' }}>{String(session.ip)}</span>}
      {session.is_active && (
        <button style={btnDanger} onClick={onRevoke}>Revocar</button>
      )}
    </div>
  );
}

function TokenRow({ token, onRevoke }: { token: AdminPushToken; onRevoke: () => void }) {
  const PLATFORM_ICON: Record<string, string> = { ios: '🍎', android: '🤖', web: '🌐' };
  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={chip(token.is_active ? '#3B82F6' : '#94A3B8')}>
        {PLATFORM_ICON[token.platform] ?? '📱'} {token.platform.toUpperCase()}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', flex: 1, fontFamily: 'monospace' }}>
        {token.device_id.slice(0, 20)}…
      </span>
      <span style={{ fontSize: 11, color: '#64748B' }}>{token.workspace_name ?? '—'}</span>
      {token.app_version && <span style={{ fontSize: 11, color: '#94A3B8' }}>v{token.app_version}</span>}
      {token.last_used_at && (
        <span style={{ fontSize: 11, color: '#94A3B8' }}>
          Último uso: {new Date(token.last_used_at).toLocaleDateString('es-CO')}
        </span>
      )}
      {token.is_active && (
        <button style={btnDanger} onClick={onRevoke}>Revocar</button>
      )}
    </div>
  );
}

function ActivityRow({ row }: { row: AdminUserActivityRow }) {
  return (
    <div style={{ ...card, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ fontSize: 11, color: '#94A3B8', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {new Date(row.created_at).toLocaleString('es-CO', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
      </span>
      <span style={{ fontSize: 11.5, fontFamily: 'monospace', color: '#334155', flex: 1 }}>{row.action}</span>
      {row.entity_type && <span style={{ fontSize: 11, color: '#94A3B8' }}>{row.entity_type}</span>}
      {row.workspace_name && <span style={{ fontSize: 11, color: '#60A5FA' }}>{row.workspace_name}</span>}
    </div>
  );
}

function ActionCard({
  icon, title, description, buttonLabel, buttonStyle, loading, onClick, warning,
}: {
  icon: string; title: string; description: string; buttonLabel: string;
  buttonStyle: React.CSSProperties; loading: boolean; onClick: () => void; warning?: boolean;
}) {
  return (
    <div style={{ ...card, border: warning ? '1px solid #EDE9FE' : undefined, background: warning ? '#F5F3FF' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>{icon} {title}</div>
          <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>{description}</div>
        </div>
        <button style={{ ...buttonStyle, flexShrink: 0 }} onClick={onClick} disabled={loading}>
          {loading ? '…' : buttonLabel}
        </button>
      </div>
    </div>
  );
}

function ConfirmDialog({ label, onConfirm, onCancel }: { label: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 400, width: '100%' }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 20, lineHeight: 1.6 }}>{label}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button style={btnGhost} onClick={onCancel}>Cancelar</button>
          <button style={btnDanger} onClick={onConfirm}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Cargando…</div>;
}

function Empty({ text }: { text: string }) {
  return <div style={{ padding: 16, textAlign: 'center', color: '#94A3B8', fontSize: 12.5 }}>{text}</div>;
}
