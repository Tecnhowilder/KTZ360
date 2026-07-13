/**
 * InviteWizard — Flujo empresarial de aceptación de invitaciones.
 *
 * Reemplaza AcceptInvite.tsx con un wizard de 4 pasos:
 *   1. InviteCard      — ver empresa, rol, permisos
 *   2. CreatePassword  — solo usuarios nuevos (email bloqueado)
 *   3. ProfileCompletion — nombre, teléfono, ciudad, especialidad
 *   4. WelcomeStep     — bienvenida personalizada + CTA → home
 *
 * Máquina de estados:
 *   loading → invite_card → create_password → [await_confirm]
 *                        ↘ accepting → profile_completion → welcome → home
 *
 * Zero Trust: toda validación en DB (accept_invitation RPC).
 * El wizard detecta cuando el trigger handle_new_user ya aceptó la invitación.
 */
import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthProvider';
import { getInvitationPreview, acceptInvitation } from '../../services/team';
import { supabase } from '../../lib/supabaseClient';
import { APP_URL } from '../../lib/brand';
import { getHomeForRole } from '../../lib/navigation';
import { InviteCard, type InvitePreview } from './InviteCard';
import { CreatePasswordStep } from './CreatePasswordStep';
import { ProfileCompletionStep } from './ProfileCompletionStep';
import { WelcomeStep } from './WelcomeStep';

// ─── Estado del wizard ────────────────────────────────────────────────────────

type WizardStep =
  | 'loading'
  | 'invite_card'         // Step 1: mostrar invitación
  | 'create_password'     // Step 2: nuevo usuario crea contraseña
  | 'await_confirm'       // Esperando confirmación de email
  | 'accepting'           // Llamando acceptInvitation RPC
  | 'profile_completion'  // Step 3: completar perfil
  | 'welcome'             // Step 4: bienvenida
  | 'email_mismatch'      // Error: sesión con email incorrecto
  | 'error';              // Error: expirado, inválido, etc.

interface ErrorInfo {
  icon:    string;
  title:   string;
  body:    string;
  action?: 'logout' | 'dashboard';
}

type WizardState = {
  step:    WizardStep;
  preview: InvitePreview | null;
  error:   ErrorInfo | null;
  // Estado del perfil tras aceptar
  savedFullName: string | null;
  acceptedRole:  string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildErrorInfo(type: string, preview?: InvitePreview | null): ErrorInfo {
  switch (type) {
    case 'expired':
      return { icon: '⏰', title: 'Invitación vencida', body: 'Esta invitación expiró (72 h de vigencia). Pide al administrador que te envíe una nueva.' };
    case 'already_used':
      return { icon: '✅', title: 'Invitación ya aceptada', body: 'Esta invitación ya fue procesada. Si ya tienes cuenta, inicia sesión normalmente.', action: 'dashboard' };
    case 'seat_limit':
      return { icon: '👥', title: 'Sin cupos disponibles', body: 'El equipo alcanzó el límite de usuarios de su plan. El administrador debe ampliar el plan.' };
    case 'revoked':
      return { icon: '🚫', title: 'Invitación revocada', body: 'Esta invitación fue cancelada. Contacta al administrador para una nueva.' };
    case 'email_mismatch':
      return { icon: '📧', title: 'Sesión incorrecta', body: `Esta invitación es para ${preview?.email ?? 'otro correo'}. Cierra sesión e inicia con esa cuenta.`, action: 'logout' };
    default:
      return { icon: '🔗', title: 'Enlace no válido', body: 'Este enlace no corresponde a ninguna invitación activa o fue revocado.' };
  }
}

function classifyError(err: unknown, status?: string): string {
  if (status === 'expired')  return 'expired';
  if (status === 'accepted') return 'already_used';
  if (status === 'revoked')  return 'revoked';
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes('seat_limit'))       return 'seat_limit';
  if (msg.includes('expired'))          return 'expired';
  if (msg.includes('accepted'))         return 'already_used';
  return 'invalid';
}

// ─── Pantalla de error ────────────────────────────────────────────────────────

function ErrorScreen({ info, onLogout }: { info: ErrorInfo; onLogout: () => void }) {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100dvh', background: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{info.icon}</div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>{info.title}</h2>
      <p style={{ fontSize: 14, color: '#64748B', maxWidth: 320, lineHeight: 1.6, marginBottom: 24 }}>{info.body}</p>
      {info.action === 'logout' && (
        <button onClick={onLogout}
          style={{ padding: '12px 24px', border: 'none', borderRadius: 12, background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit' }}>
          Cambiar de cuenta
        </button>
      )}
      {info.action === 'dashboard' && (
        <button onClick={() => navigate('/app/dashboard', { replace: true })}
          style={{ padding: '12px 24px', border: 'none', borderRadius: 12, background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit' }}>
          Ir a mi panel
        </button>
      )}
      <a href="/" style={{ fontSize: 13, color: '#2563EB', textDecoration: 'none', marginTop: 8 }}>Volver al inicio</a>
    </div>
  );
}

// ─── Pantalla de espera de confirmación ──────────────────────────────────────

function AwaitConfirmScreen({ email }: { email: string }) {
  return (
    <div style={{ minHeight: '100dvh', background: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 20 }}>✉️</div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>Revisa tu correo</h2>
      <p style={{ fontSize: 14, color: '#64748B', maxWidth: 340, lineHeight: 1.6, marginBottom: 20 }}>
        Enviamos un enlace de verificación a
      </p>
      <div style={{ background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: 12, padding: '10px 20px', fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 20 }}>
        {email}
      </div>
      <p style={{ fontSize: 13, color: '#94A3B8', maxWidth: 300, lineHeight: 1.5 }}>
        Al hacer clic en el enlace del correo, tu cuenta se activará y podrás unirte al equipo.
        <br /><br />
        ¿No lo ves? Revisa tu carpeta de spam.
      </p>
    </div>
  );
}

// ─── Pantalla de aceptando ────────────────────────────────────────────────────

function AcceptingScreen({ workspaceName }: { workspaceName: string }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#64748B' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #E2E8F0', borderTopColor: '#2563EB', animation: 'spin .8s linear infinite' }} />
      <div style={{ fontSize: 14, fontWeight: 600 }}>Uniéndote a <strong style={{ color: '#0F172A' }}>{workspaceName}</strong>…</div>
    </div>
  );
}

// ─── InviteWizard (orquestador) ───────────────────────────────────────────────

export function InviteWizard() {
  const { token }  = useParams<{ token: string }>();
  const navigate   = useNavigate();
  const { session, loading: authLoading } = useAuth();

  const [state, setState] = useState<WizardState>({
    step:          'loading',
    preview:       null,
    error:         null,
    savedFullName: null,
    acceptedRole:  null,
  });

  const [pwdLoading,    setPwdLoading]    = useState(false);
  const [pwdError,      setPwdError]      = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError,   setProfileError]   = useState<string | null>(null);

  // ── Helpers de estado ───────────────────────────────────────────────────────

  const setStep = useCallback((step: WizardStep, extra?: Partial<WizardState>) => {
    setState(s => ({ ...s, step, ...extra }));
  }, []);

  // ── Logout (para mismatch) ──────────────────────────────────────────────────

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    const inviteEmail = state.preview?.email ?? '';
    navigate(`/login?redirect=${encodeURIComponent(`/invite/${token}`)}&email=${encodeURIComponent(inviteEmail)}`, { replace: true });
  }, [navigate, token, state.preview?.email]);

  // ── Cargar preview + decidir paso inicial ───────────────────────────────────

  useEffect(() => {
    if (!token || authLoading) return;

    (async () => {
      let preview: InvitePreview | null = null;
      try {
        preview = await getInvitationPreview(token);
      } catch {
        setStep('error', { error: buildErrorInfo('invalid') });
        return;
      }

      if (!preview) {
        setStep('error', { error: buildErrorInfo('invalid') });
        return;
      }

      // Estado de la invitación
      if (preview.status === 'expired') {
        setStep('error', { preview, error: buildErrorInfo('expired') });
        return;
      }
      if (preview.status === 'revoked') {
        setStep('error', { preview, error: buildErrorInfo('revoked') });
        return;
      }

      const sessionEmail = session?.user?.email?.toLowerCase().trim() ?? '';
      const inviteEmail  = preview.email.toLowerCase().trim();

      // Sin sesión → mostrar InviteCard
      if (!session) {
        setStep('invite_card', { preview });
        return;
      }

      // Sesión con email incorrecto
      if (sessionEmail !== inviteEmail) {
        setStep('email_mismatch', { preview, error: buildErrorInfo('email_mismatch', preview) });
        return;
      }

      // Sesión con email correcto
      if (preview.status === 'accepted') {
        // El trigger handle_new_user ya aceptó la invitación en el signup.
        // Verificar si el usuario ya completó el flujo de bienvenida.
        const { data: prof } = await supabase.from('profiles').select('onboarding_seen, full_name, phone, city, profession, specialty').eq('id', session.user.id).maybeSingle();
        if (prof?.onboarding_seen) {
          // Ya completó — ir a home
          navigate(getHomeForRole(preview.role), { replace: true });
          return;
        }
        // No completó — continuar con profile completion
        setStep('profile_completion', {
          preview,
          acceptedRole: preview.role,
          savedFullName: prof?.full_name ?? null,
        });
        return;
      }

      // Invitación pending con sesión correcta → aceptar
      setState(s => ({ ...s, step: 'accepting', preview }));
      try {
        const result = await acceptInvitation(token);
        // Cargar perfil actual para pre-llenar campos
        const { data: prof } = await supabase.from('profiles').select('full_name, phone, city, profession, specialty').eq('id', session.user.id).maybeSingle();
        setState(s => ({
          ...s,
          step:          'profile_completion',
          acceptedRole:  result.role,
          savedFullName: prof?.full_name ?? null,
          preview:       { ...s.preview!, workspace_name: result.workspace_name },
        }));
      } catch (err) {
        const errType = classifyError(err, preview.status);
        if (errType === 'already_used') {
          // Puede que ya se haya aceptado vía trigger — ir a profile completion
          const { data: prof } = await supabase.from('profiles').select('onboarding_seen, full_name').eq('id', session.user.id).maybeSingle();
          if (prof?.onboarding_seen) {
            navigate(getHomeForRole(preview.role), { replace: true });
          } else {
            setStep('profile_completion', { preview, acceptedRole: preview.role, savedFullName: prof?.full_name ?? null });
          }
        } else {
          setStep('error', { preview, error: buildErrorInfo(errType, preview) });
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, authLoading, session]);

  // ── Step 2: crear contraseña (nuevo usuario) ────────────────────────────────

  const handleCreatePassword = useCallback(async (fullName: string, password: string) => {
    if (!state.preview) return;
    setPwdError(null);
    setPwdLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email:    state.preview.email,
        password,
        options: {
          data:            { full_name: fullName },
          emailRedirectTo: `${APP_URL}/invite/${token}`,
        },
      });
      if (error) throw error;

      if (data.session) {
        // Autoconfirm activo: el trigger se disparó y aceptó la invitación.
        // Cargar perfil para pre-llenar campos.
        const { data: prof } = await supabase.from('profiles').select('full_name, phone, city, profession, specialty').eq('id', data.session.user.id).maybeSingle();
        setState(s => ({
          ...s,
          step:          'profile_completion',
          acceptedRole:  s.preview?.role ?? null,
          savedFullName: prof?.full_name ?? fullName,
        }));
      } else {
        // Email de confirmación enviado
        setStep('await_confirm');
      }
    } catch (e) {
      setPwdError(e instanceof Error ? e.message : 'No se pudo crear la cuenta');
    } finally {
      setPwdLoading(false);
    }
  }, [state.preview, token, setStep]);

  // ── Step 3: guardar perfil ──────────────────────────────────────────────────

  const handleProfileSave = useCallback(async (data: { full_name: string; phone: string; city: string; profession: string; specialty: string }) => {
    setProfileError(null);
    setProfileLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name:  data.full_name,
          phone:      data.phone    || null,
          city:       data.city     || null,
          profession: data.profession || null,
          specialty:  data.specialty  || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '');
      if (error) throw error;

      // audit log (fire-and-forget)

      setState(s => ({ ...s, step: 'welcome', savedFullName: data.full_name }));
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'No se pudo guardar el perfil');
    } finally {
      setProfileLoading(false);
    }
  }, []);

  // ── Step 3: saltar perfil ───────────────────────────────────────────────────

  const handleProfileSkip = useCallback(() => {
    setState(s => ({ ...s, step: 'welcome' }));
  }, []);

  // ── Step 4: ir al home ──────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    const role = state.acceptedRole ?? state.preview?.role ?? 'operario';
    navigate(getHomeForRole(role), { replace: true });
  }, [navigate, state.acceptedRole, state.preview?.role]);

  // ── Ir a login ──────────────────────────────────────────────────────────────

  const handleGoLogin = useCallback(() => {
    const inviteEmail = state.preview?.email ?? '';
    navigate(
      `/login?redirect=${encodeURIComponent(`/invite/${token}`)}&email=${encodeURIComponent(inviteEmail)}`,
      { replace: true },
    );
  }, [navigate, token, state.preview?.email]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!token) return null;

  // Loading inicial
  if (state.step === 'loading') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #E2E8F0', borderTopColor: '#2563EB', animation: 'spin .8s linear infinite' }} />
      </div>
    );
  }

  // Errores
  if (state.step === 'error' && state.error) {
    return <ErrorScreen info={state.error} onLogout={handleLogout} />;
  }

  if (state.step === 'email_mismatch' && state.error) {
    return <ErrorScreen info={state.error} onLogout={handleLogout} />;
  }

  // Step 1: InviteCard
  if (state.step === 'invite_card' && state.preview) {
    return (
      <InviteCard
        preview={state.preview}
        onCreateAccount={() => setStep('create_password')}
        onLogin={handleGoLogin}
      />
    );
  }

  // Step 2: Crear contraseña
  if (state.step === 'create_password' && state.preview) {
    return (
      <CreatePasswordStep
        email={state.preview.email}
        onBack={() => setStep('invite_card')}
        onSubmit={handleCreatePassword}
        loading={pwdLoading}
        error={pwdError}
      />
    );
  }

  // Espera de confirmación de email
  if (state.step === 'await_confirm' && state.preview) {
    return <AwaitConfirmScreen email={state.preview.email} />;
  }

  // Aceptando (spinner)
  if (state.step === 'accepting' && state.preview) {
    return <AcceptingScreen workspaceName={state.preview.workspace_name} />;
  }

  // Step 3: Completar perfil
  if (state.step === 'profile_completion' && state.preview) {
    const role = state.acceptedRole ?? state.preview.role;
    return (
      <ProfileCompletionStep
        role={role}
        initialData={{
          full_name:  state.savedFullName ?? state.preview.full_name ?? '',
          phone:      '',
          city:       '',
          profession: '',
          specialty:  '',
        }}
        onSubmit={handleProfileSave}
        onSkip={handleProfileSkip}
        loading={profileLoading}
        error={profileError}
      />
    );
  }

  // Step 4: Bienvenida
  if (state.step === 'welcome' && state.preview) {
    return (
      <WelcomeStep
        fullName={state.savedFullName}
        workspaceName={state.preview.workspace_name}
        role={state.acceptedRole ?? state.preview.role}
        onStart={handleStart}
      />
    );
  }

  return null;
}
