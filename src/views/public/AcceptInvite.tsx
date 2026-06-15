import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../features/auth/AuthProvider';
import { getInvitationPreview, acceptInvitation } from '../../services/team';
import { APP_NAME } from '../../lib/brand';
import { AuthLayout, primaryButtonStyle, linkStyle, errorStyle } from '../../features/auth/AuthLayout';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  employee: 'Empleado',
};

export function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const previewQuery = useQuery({
    queryKey: ['invitationPreview', token],
    queryFn: () => getInvitationPreview(token!),
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (!token || authLoading || !session || !previewQuery.data || accepting) return;
    setAccepting(true);
    acceptInvitation(token)
      .then(() => navigate('/app/dashboard', { replace: true }))
      .catch((err) => {
        setAcceptError(err instanceof Error ? err.message : 'No se pudo aceptar la invitación');
        setAccepting(false);
      });
  }, [token, authLoading, session, previewQuery.data, accepting, navigate]);

  if (!token) return null;

  if (previewQuery.isLoading || authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: 14 }}>
        Cargando invitación…
      </div>
    );
  }

  if (previewQuery.isError || !previewQuery.data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: '#64748B' }}>
        <div style={{ fontSize: 32 }}>🔗</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Invitación no válida</div>
        <div style={{ fontSize: 13 }}>Esta invitación ya no está disponible, fue revocada o venció.</div>
      </div>
    );
  }

  const preview = previewQuery.data;
  const roleLabel = ROLE_LABELS[preview.role] ?? preview.role;

  if (session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: '#64748B' }}>
        {acceptError ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>No se pudo aceptar la invitación</div>
            <div style={{ fontSize: 13 }}>{acceptError}</div>
          </>
        ) : (
          <div style={{ fontSize: 14 }}>Aceptando invitación a {preview.workspace_name}…</div>
        )}
      </div>
    );
  }

  const redirect = `/invite/${token}`;
  const query = `redirect=${encodeURIComponent(redirect)}&email=${encodeURIComponent(preview.email)}`;

  return (
    <AuthLayout title="Te invitaron a un equipo" subtitle={`${preview.workspace_name} en ${APP_NAME}`}>
      {acceptError && <div style={errorStyle}>{acceptError}</div>}
      <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, marginBottom: 8 }}>
        <strong>{preview.email}</strong> fue invitado a <strong>{preview.workspace_name}</strong> como <strong>{roleLabel}</strong>.
      </p>
      <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 24 }}>
        Inicia sesión o crea una cuenta con este correo para aceptar la invitación.
      </p>
      <button onClick={() => navigate(`/registro?${query}`)} style={{ ...primaryButtonStyle, marginBottom: 12 }}>
        Crear cuenta
      </button>
      <button
        onClick={() => navigate(`/login?${query}`)}
        style={{ ...primaryButtonStyle, background: '#fff', color: '#2563EB', border: '1.5px solid #E2E8F0' }}
      >
        Iniciar sesión
      </button>
      <p style={{ textAlign: 'center', fontSize: 12, marginTop: 18 }}>
        <a href="/" style={linkStyle}>
          Volver al inicio
        </a>
      </p>
    </AuthLayout>
  );
}
