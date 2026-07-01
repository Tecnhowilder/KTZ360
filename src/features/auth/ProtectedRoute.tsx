import { type ReactNode, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { WorkspaceProvider, useWorkspaceMaybe } from './WorkspaceProvider';
import { hasSeenOnboarding } from '../../lib/onboarding';
import { shouldSkipOnboarding } from '../../lib/roleOnboarding';
import { supabase } from '../../lib/supabaseClient';

function FullScreenSpinner() {
  return (
    <div data-testid="startup-spinner" style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: 36, height: 36, borderRadius: '50%',
          border: '3px solid #E2E8F0', borderTopColor: '#2563EB',
          animation: 'spin .8s linear infinite',
        }}
      />
    </div>
  );
}

// Botones comunes a las pantallas de bloqueo de startup.
function StartupActions({ onRetry, onSignOut, signingOut }: { onRetry: () => void; onSignOut: () => void; signingOut: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 280 }}>
      <button
        onClick={onRetry}
        style={{ padding: '12px 0', border: 'none', borderRadius: 12, background: '#7C3AED', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
      >
        Intentar de nuevo
      </button>
      <button
        onClick={onSignOut}
        disabled={signingOut}
        style={{ padding: '12px 0', border: '1.5px solid #E2E8F0', borderRadius: 12, background: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
      >
        {signingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
      </button>
    </div>
  );
}

function useSignOut() {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }
  return { signingOut, handleSignOut };
}

// Pantalla de error real (red, excepción inesperada) — nunca spinner infinito.
function StartupErrorScreen({ error }: { error: Error }) {
  const { signingOut, handleSignOut } = useSignOut();
  const isTimeout = error.message?.includes('tardó demasiado');

  return (
    <div data-testid="startup-error" style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 16 }}>
        ⚠️
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>
        {isTimeout ? 'La conexión tardó demasiado' : 'No se pudo cargar tu cuenta'}
      </h2>
      <p style={{ fontSize: 14, color: '#64748B', maxWidth: 320, lineHeight: 1.6, marginBottom: 24 }}>
        {isTimeout
          ? 'Verifica tu conexión a internet e intenta de nuevo.'
          : 'Ocurrió un error inesperado al cargar tu cuenta.'}
      </p>
      <StartupActions onRetry={() => window.location.reload()} onSignOut={handleSignOut} signingOut={signingOut} />
      {import.meta.env.DEV && (
        <details style={{ marginTop: 20, textAlign: 'left', maxWidth: 380 }}>
          <summary style={{ fontSize: 11, color: '#94A3B8', cursor: 'pointer' }}>Detalle técnico</summary>
          <pre style={{ fontSize: 10, color: '#EF4444', background: '#FEF2F2', padding: 8, borderRadius: 6, overflow: 'auto', marginTop: 6 }}>
            {error.message}
          </pre>
        </details>
      )}
    </div>
  );
}

// Pantalla cuando el recurso resolvió correctamente pero no existe
// (ausencia esperada, no excepción): perfil/workspace/company_settings.
function NotFoundScreen({ reason }: { reason: 'profile' | 'workspace' | 'company' }) {
  const { signingOut, handleSignOut } = useSignOut();

  const MESSAGES: Record<typeof reason, { title: string; body: string }> = {
    profile: {
      title: 'No encontramos tu perfil',
      body: 'Tu cuenta no tiene un perfil asociado. Esto puede ocurrir si tu cuenta fue creada hace un momento — espera unos segundos e inténtalo de nuevo, o contacta a soporte.',
    },
    workspace: {
      title: 'No encontramos tu empresa',
      body: 'Tu perfil existe pero no está vinculado a ningún workspace activo. Contacta a soporte para resolverlo.',
    },
    company: {
      title: 'Configuración incompleta',
      body: 'Tu empresa aún no tiene su configuración inicial. Contacta a soporte para completarla.',
    },
  };
  const m = MESSAGES[reason];

  return (
    <div data-testid="startup-notfound" style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 16 }}>
        🔍
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>{m.title}</h2>
      <p style={{ fontSize: 14, color: '#64748B', maxWidth: 320, lineHeight: 1.6, marginBottom: 24 }}>{m.body}</p>
      <StartupActions onRetry={() => window.location.reload()} onSignOut={handleSignOut} signingOut={signingOut} />
    </div>
  );
}

// Pantalla cuando el perfil existe pero status !== 'active' (invited/inactive/removed).
// Zero Trust: profiles_select_own permite LEER la fila propia siempre, pero
// el acceso a la aplicación se concede únicamente a miembros activos.
function ForbiddenScreen({ profileStatus }: { profileStatus: string }) {
  const { signingOut, handleSignOut } = useSignOut();

  const MESSAGES: Record<string, { title: string; body: string }> = {
    removed: {
      title: 'Tu acceso fue eliminado',
      body: 'Un administrador eliminó tu cuenta del equipo. Si crees que es un error, contacta al propietario del workspace.',
    },
    inactive: {
      title: 'Tu cuenta está desactivada',
      body: 'Un administrador desactivó tu cuenta temporalmente. Contacta al propietario del workspace para reactivarla.',
    },
    invited: {
      title: 'Invitación pendiente',
      body: 'Aún no has aceptado tu invitación al equipo. Revisa el correo de invitación para activar tu cuenta.',
    },
  };
  const m = MESSAGES[profileStatus] ?? {
    title: 'Acceso no disponible',
    body: `Tu cuenta tiene un estado que no permite el acceso (${profileStatus}). Contacta a soporte.`,
  };

  return (
    <div data-testid="startup-forbidden" style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 16 }}>
        🔒
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>{m.title}</h2>
      <p style={{ fontSize: 14, color: '#64748B', maxWidth: 320, lineHeight: 1.6, marginBottom: 24 }}>{m.body}</p>
      <div style={{ width: '100%', maxWidth: 280 }}>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          style={{ width: '100%', padding: '12px 0', border: 'none', borderRadius: 12, background: '#7C3AED', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          {signingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
        </button>
      </div>
    </div>
  );
}

function WorkspaceGate({ children }: { children: ReactNode }) {
  const ws = useWorkspaceMaybe();

  // ─ Loading: mostrar spinner (temporal, máximo 15 segundos por timeout interno)
  if (ws.loading) return <FullScreenSpinner />;

  // ─ Error real (red, excepción inesperada) — NUNCA spinner infinito
  if (ws.error) return <StartupErrorScreen error={ws.error} />;

  // ─ Ausencia esperada de un recurso (perfil/workspace/company == null)
  if (ws.notFound) return <NotFoundScreen reason={ws.notFound} />;

  // ─ Perfil existe pero status !== 'active' — Zero Trust gating de aplicación.
  //   profiles_select_own permite LEER la fila propia siempre; el acceso a
  //   la app se concede únicamente a miembros activos.
  if (ws.forbidden) return <ForbiddenScreen profileStatus={ws.profileStatus} />;

  // ─ Roles del sistema (super_admin, support_admin) saltan el onboarding
  if (shouldSkipOnboarding(ws.profile.role)) {
    return <>{children}</>;
  }

  // Zero Trust: la fuente de verdad es DB (onboarding_seen).
  if (!ws.profile.onboarding_seen && !hasSeenOnboarding()) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) return <FullScreenSpinner />;
  if (!session) return <Navigate to="/login" replace />;

  return (
    <WorkspaceProvider>
      <WorkspaceGate>{children}</WorkspaceGate>
    </WorkspaceProvider>
  );
}
