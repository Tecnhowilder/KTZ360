import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { signUp, resendConfirmationEmail, getResendCooldownRemaining, markResendSent } from '../../services/auth';
import { AuthLayout, inputStyle, labelStyle, primaryButtonStyle, errorStyle, linkStyle } from './AuthLayout';
import { APP_NAME } from '../../lib/brand';

// ─── Pantalla: Confirmación de email pendiente ────────────────────────────────

function ConfirmEmailScreen({
  email,
  onChangeEmail,
  onBackToLogin,
}: {
  email: string;
  onChangeEmail: () => void;
  onBackToLogin: () => void;
}) {
  const [resending, setResending]   = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendOk, setResendOk]     = useState(false);
  const [cooldown, setCooldown]     = useState(() => Math.ceil(getResendCooldownRemaining() / 1000));

  // Countdown del cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => {
      const rem = Math.ceil(getResendCooldownRemaining() / 1000);
      setCooldown(rem);
      if (rem <= 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const handleResend = useCallback(async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setResendError(null);
    setResendOk(false);
    try {
      await resendConfirmationEmail(email);
      markResendSent();
      setCooldown(60);
      setResendOk(true);
    } catch (e) {
      setResendError(e instanceof Error ? e.message : 'No se pudo reenviar el correo');
    } finally {
      setResending(false);
    }
  }, [email, cooldown, resending]);

  return (
    <div style={{
      minHeight: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, background: '#F8FAFC',
    }}>
      <div style={{
        width: '100%', maxWidth: 440,
        background: '#fff', borderRadius: 20,
        border: '1px solid #E2E8F0',
        boxShadow: '0 4px 24px rgba(15,23,42,.06)',
        padding: '40px 32px',
        textAlign: 'center',
      }}>
        {/* Ícono */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: '#EFF6FF', margin: '0 auto 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32,
        }}>
          ✉️
        </div>

        {/* Título */}
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginBottom: 10 }}>
          Revisa tu correo
        </h1>

        {/* Descripción */}
        <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.6, marginBottom: 20 }}>
          Hemos enviado un enlace de verificación a tu correo electrónico.
          Debes confirmar tu cuenta antes de ingresar a {APP_NAME}.
        </p>

        {/* Email usado */}
        <div style={{
          background: '#F8FAFC', border: '1px solid #E2E8F0',
          borderRadius: 10, padding: '10px 16px',
          fontSize: 14, fontWeight: 700, color: '#0F172A',
          marginBottom: 24, wordBreak: 'break-all',
        }}>
          {email}
        </div>

        {/* Estado de reenvío */}
        {resendOk && (
          <div style={{
            background: '#F0FDF4', border: '1px solid #BBF7D0',
            borderRadius: 10, padding: '10px 16px',
            fontSize: 13, color: '#166534', marginBottom: 16,
          }}>
            ✓ Correo reenviado. Revisa tu bandeja de entrada o spam.
          </div>
        )}
        {resendError && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA',
            borderRadius: 10, padding: '10px 16px',
            fontSize: 13, color: '#DC2626', marginBottom: 16,
          }}>
            {resendError}
          </div>
        )}

        {/* Reenviar correo */}
        <button
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
          style={{
            ...primaryButtonStyle,
            opacity: (cooldown > 0 || resending) ? 0.55 : 1,
            marginBottom: 12, cursor: (cooldown > 0 || resending) ? 'not-allowed' : 'pointer',
          }}
        >
          {resending
            ? 'Reenviando…'
            : cooldown > 0
              ? `Reenviar en ${cooldown}s`
              : 'Reenviar correo de confirmación'
          }
        </button>

        {/* Acciones secundarias */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={onChangeEmail}
            style={{
              border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer',
              borderRadius: 10, padding: '11px', fontWeight: 600, fontSize: 13.5,
              color: '#374151',
            }}
          >
            Usar otro correo
          </button>
          <button
            onClick={onBackToLogin}
            style={{
              border: 'none', background: 'none', cursor: 'pointer',
              padding: '8px', fontSize: 13, color: '#2563EB', fontWeight: 600,
            }}
          >
            Ya confirmé mi cuenta → Iniciar sesión
          </button>
        </div>

        <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 20, lineHeight: 1.5 }}>
          ¿No ves el correo? Revisa la carpeta de spam o correo no deseado.
        </p>
      </div>
    </div>
  );
}

// ─── RegisterPage ─────────────────────────────────────────────────────────────

export function RegisterPage() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect       = searchParams.get('redirect');
  const invitedEmail   = searchParams.get('email');

  const [fullName,    setFullName]    = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email,       setEmail]       = useState(invitedEmail ?? '');
  const [password,    setPassword]    = useState('');
  const [error,       setError]       = useState<string | null>(null);
  const [loading,     setLoading]     = useState(false);

  // Estado post-registro: mostrar pantalla de confirmación
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [confirmedEmail,      setConfirmedEmail]      = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { session } = await signUp(email, password, fullName, companyName || 'Mi negocio');
      if (session) {
        // autoconfirm activo o email ya confirmado: ir directo al dashboard
        navigate(redirect || '/app/dashboard', { replace: true });
      } else {
        // Email de confirmación enviado: mostrar pantalla dedicada
        setConfirmedEmail(email);
        setPendingConfirmation(true);
        // Iniciar cooldown desde ya
        markResendSent();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta');
    } finally {
      setLoading(false);
    }
  }

  // Usuario quiere usar otro correo → volver al formulario
  function handleChangeEmail() {
    setPendingConfirmation(false);
    setPassword('');
    setError(null);
  }

  // Pantalla de confirmación
  if (pendingConfirmation) {
    return (
      <ConfirmEmailScreen
        email={confirmedEmail}
        onChangeEmail={handleChangeEmail}
        onBackToLogin={() => navigate('/login', { replace: true })}
      />
    );
  }

  // Formulario de registro
  return (
    <AuthLayout title="Crea tu cuenta" subtitle="Empieza a cotizar tus proyectos en minutos">
      <form onSubmit={handleSubmit}>
        {error && <div style={errorStyle}>{error}</div>}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Nombre completo</label>
          <input
            style={inputStyle} type="text" required
            value={fullName} onChange={(e) => setFullName(e.target.value)}
            placeholder="Tu nombre"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Nombre del negocio (opcional)</label>
          <input
            style={inputStyle} type="text"
            value={companyName} onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Mi negocio"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Correo electrónico</label>
          <input
            style={inputStyle} type="email" required
            readOnly={!!invitedEmail}
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Contraseña</label>
          <input
            style={inputStyle} type="password" required minLength={6}
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
          />
        </div>
        <button type="submit" style={{ ...primaryButtonStyle, opacity: loading ? 0.7 : 1 }} disabled={loading}>
          {loading ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>
      <p style={{ textAlign: 'center', fontSize: 13, color: '#64748B', marginTop: 20 }}>
        ¿Ya tienes cuenta?{' '}
        <Link to={`/login?${searchParams.toString()}`} style={linkStyle}>
          Inicia sesión
        </Link>
      </p>
    </AuthLayout>
  );
}
