import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../features/auth/AuthProvider';
import { getInvitationPreview, acceptInvitation } from '../../services/team';
import { APP_NAME } from '../../lib/brand';
import { AuthLayout, primaryButtonStyle, linkStyle, errorStyle } from '../../features/auth/AuthLayout';

const ROLE_LABELS: Record<string, string> = {
  admin:      'Administrador',
  supervisor: 'Supervisor',
  operario:   'Operario',
  comercial:  'Comercial',
  employee:   'Empleado',
};

// ─── Tipos y mensajes de error ────────────────────────────────────────────────

type InviteErrorType = 'email_mismatch' | 'expired' | 'already_used' | 'invalid' | 'seat_limit' | 'unknown';

function getErrorInfo(type: InviteErrorType, inviteEmail?: string) {
  switch (type) {
    case 'email_mismatch':
      return {
        icon:   '📧',
        title:  'Sesión incorrecta',
        body:   `Esta invitación es para ${inviteEmail ?? 'otro correo'}. Cierra sesión e inicia con esa cuenta para aceptarla.`,
        action: 'logout' as const,
      };
    case 'expired':
      return {
        icon:  '⏰',
        title: 'Invitación vencida',
        body:  'Esta invitación ya expiró (7 días de vigencia). Pide al administrador que te envíe una nueva.',
      };
    case 'already_used':
      return {
        icon:  '✅',
        title: 'Invitación ya aceptada',
        body:  'Esta invitación ya fue procesada anteriormente. Si ya tienes cuenta, inicia sesión normalmente.',
      };
    case 'seat_limit':
      return {
        icon:  '👥',
        title: 'Sin cupos disponibles',
        body:  'El equipo alcanzó el límite de usuarios de su plan. El administrador debe ampliar el plan.',
      };
    case 'invalid':
      return {
        icon:  '🔗',
        title: 'Enlace no válido',
        body:  'Este enlace no corresponde a ninguna invitación activa. Puede haber sido revocado.',
      };
    default:
      return {
        icon:  '⚠️',
        title: 'No se pudo aceptar',
        body:  'Ocurrió un error inesperado. Intenta de nuevo o contacta al administrador.',
      };
  }
}

function classifyRpcError(err: unknown, inviteStatus?: string): InviteErrorType {
  if (inviteStatus === 'expired')  return 'expired';
  if (inviteStatus === 'accepted') return 'already_used';
  if (inviteStatus === 'revoked')  return 'invalid';
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes('seat_limit'))         return 'seat_limit';
  if (msg.includes('expired'))            return 'expired';
  if (msg.includes('accepted'))           return 'already_used';
  if (msg.includes('invalid_or_expired')) return 'invalid';
  return 'unknown';
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function AcceptInvite() {
  const { token }  = useParams<{ token: string }>();
  const navigate   = useNavigate();
  const { session, loading: authLoading } = useAuth();

  const [accepting,   setAccepting]  = useState(false);
  const [errorType,   setErrorType]  = useState<InviteErrorType | null>(null);
  const [loggingOut,  setLoggingOut] = useState(false);

  const previewQuery = useQuery({
    queryKey:  ['invitationPreview', token],
    queryFn:   () => getInvitationPreview(token!),
    enabled:   !!token,
    retry:     false,
    staleTime: 30_000,
  });

  const preview = previewQuery.data;

  // Detectar mismatch de email ANTES de llamar al RPC (Zero Trust frontend)
  const sessionEmail    = session?.user?.email?.toLowerCase().trim() ?? '';
  const inviteEmail     = preview?.email?.toLowerCase().trim()       ?? '';
  const isEmailMismatch = !!session && !!inviteEmail && sessionEmail !== inviteEmail;
  const isNotPending    = !!preview?.status && preview.status !== 'pending';

  useEffect(() => {
    if (!token || authLoading || !session || !preview || accepting || errorType) return;

    if (isEmailMismatch) { setErrorType('email_mismatch'); return; }
    if (isNotPending)    { setErrorType(classifyRpcError(null, preview.status)); return; }

    setAccepting(true);
    acceptInvitation(token)
      .then(() => navigate('/app/dashboard', { replace: true }))
      .catch((err) => {
        setErrorType(classifyRpcError(err, preview.status));
        setAccepting(false);
      });
  }, [token, authLoading, session, preview, accepting, errorType, isEmailMismatch, isNotPending, navigate]);

  async function handleLogout() {
    setLoggingOut(true);
    const { supabase } = await import('../../lib/supabaseClient');
    await supabase.auth.signOut();
    const redirect = `/invite/${token}`;
    navigate(`/login?redirect=${encodeURIComponent(redirect)}&email=${encodeURIComponent(preview?.email ?? '')}`, { replace: true });
  }

  if (!token) return null;

  // ── Loading ───────────────────────────────────────────────────────────────
  if (previewQuery.isLoading || authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: 14 }}>
        Cargando invitación…
      </div>
    );
  }

  // ── Token inválido / no encontrado ────────────────────────────────────────
  if (previewQuery.isError || !preview) {
    const info = getErrorInfo('invalid');
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>{info.icon}</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>{info.title}</div>
        <div style={{ fontSize: 13, color: '#64748B', maxWidth: 320, lineHeight: 1.6 }}>{info.body}</div>
        <a href="/" style={{ marginTop: 12, fontSize: 13, color: '#2563EB', textDecoration: 'none' }}>Volver al inicio</a>
      </div>
    );
  }

  const roleLabel = ROLE_LABELS[preview.role] ?? preview.role;

  // ── Error detectado ───────────────────────────────────────────────────────
  if (errorType) {
    const info = getErrorInfo(errorType, preview.email);
    return (
      <AuthLayout title={info.title} subtitle={`Invitación — ${preview.workspace_name}`}>
        <div style={{ textAlign: 'center', fontSize: 32, marginBottom: 12 }}>{info.icon}</div>
        <div style={{ ...errorStyle, marginBottom: 20 }}>{info.body}</div>

        {errorType === 'email_mismatch' && (
          <button onClick={handleLogout} disabled={loggingOut} style={{ ...primaryButtonStyle, marginBottom: 10 }}>
            {loggingOut ? 'Cerrando sesión…' : `Cambiar cuenta → ${preview.email}`}
          </button>
        )}

        {errorType === 'already_used' && (
          <button onClick={() => navigate('/app/dashboard')} style={primaryButtonStyle}>
            Ir a mi panel
          </button>
        )}

        <p style={{ textAlign: 'center', fontSize: 12, marginTop: 16 }}>
          <a href="/" style={linkStyle}>Volver al inicio</a>
        </p>
      </AuthLayout>
    );
  }

  // ── Aceptando (usuario logueado con el email correcto) ─────────────────────
  if (session && accepting) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: '#64748B' }}>
        <div style={{ fontSize: 32 }}>⏳</div>
        <div style={{ fontSize: 14 }}>Uniéndote a <strong>{preview.workspace_name}</strong>…</div>
      </div>
    );
  }

  // ── Sin sesión — opciones de registro / login ─────────────────────────────
  const redirect = `/invite/${token}`;
  const query    = `redirect=${encodeURIComponent(redirect)}&email=${encodeURIComponent(preview.email)}`;

  return (
    <AuthLayout title="Te invitaron a un equipo" subtitle={`${preview.workspace_name} en ${APP_NAME}`}>
      {/* Resumen de la invitación */}
      <div style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 4 }}>INVITACIÓN PARA</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>{preview.email}</div>
        <div style={{ fontSize: 12, color: '#64748B', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span>Rol: <strong>{roleLabel}</strong></span>
          <span>·</span>
          <span>{preview.workspace_name}</span>
        </div>
        {preview.expires_at && (
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
            Vigente hasta: {new Date(preview.expires_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        )}
      </div>

      <p style={{ fontSize: 13, color: '#64748B', marginBottom: 20, lineHeight: 1.6 }}>
        Usa <strong>{preview.email}</strong> para crear tu cuenta o iniciar sesión y unirte al equipo.
      </p>

      <button onClick={() => navigate(`/registro?${query}`)} style={{ ...primaryButtonStyle, marginBottom: 10 }}>
        Crear cuenta nueva
      </button>
      <button onClick={() => navigate(`/login?${query}`)}
        style={{ ...primaryButtonStyle, background: '#fff', color: '#2563EB', border: '1.5px solid #DBEAFE' }}>
        Ya tengo cuenta — Iniciar sesión
      </button>

      <p style={{ textAlign: 'center', fontSize: 12, marginTop: 18 }}>
        <a href="/" style={linkStyle}>Volver al inicio</a>
      </p>
    </AuthLayout>
  );
}
