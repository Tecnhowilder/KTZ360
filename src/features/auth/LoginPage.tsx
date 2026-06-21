import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { signIn } from '../../services/auth';
import { supabase } from '../../lib/supabaseClient';
import { AuthLayout, inputStyle, labelStyle, primaryButtonStyle, errorStyle, linkStyle } from './AuthLayout';
import { APP_NAME } from '../../lib/brand';

// ─── Ícono SVG de Google ──────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" style={{ display: 'block', flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      <path fill="none" d="M0 0h48v48H0z"/>
    </svg>
  );
}

// ─── Separador "o" ────────────────────────────────────────────────────────────

function Divider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
      <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
      <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap' }}>o continúa con</span>
      <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
    </div>
  );
}

// ─── LoginPage ────────────────────────────────────────────────────────────────

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');
  const [email, setEmail]       = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // ─── Login con email/password ───────────────────────────────────────────────

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      navigate(redirect || '/app/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
      supabase.rpc('log_login_failed', { p_email: email }).then(() => {}, () => {});
    } finally {
      setLoading(false);
    }
  }

  // ─── Login con Google ───────────────────────────────────────────────────────

  async function handleGoogleLogin() {
    setError(null);
    setGoogleLoading(true);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${redirect || '/app/dashboard'}`,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });
      if (oauthError) throw oauthError;
      // Supabase redirige automáticamente al proveedor — no hay acción adicional aquí
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión con Google');
      setGoogleLoading(false);
    }
  }

  return (
    <AuthLayout title="Bienvenido de nuevo" subtitle={`Ingresa a tu cuenta de ${APP_NAME}`}>

      {/* ─── Botón Google ─────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={googleLoading || loading}
        style={{
          width:          '100%',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            10,
          padding:        '12px 16px',
          border:         '1.5px solid #E2E8F0',
          borderRadius:   10,
          background:     '#fff',
          color:          '#0F172A',
          fontWeight:     600,
          fontSize:       14,
          cursor:         googleLoading || loading ? 'not-allowed' : 'pointer',
          opacity:        googleLoading || loading ? 0.7 : 1,
          transition:     'background .15s, border-color .15s',
        }}
        onMouseEnter={e => { if (!googleLoading && !loading) e.currentTarget.style.background = '#F8FAFC'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
      >
        <GoogleIcon />
        {googleLoading ? 'Redirigiendo…' : 'Continuar con Google'}
      </button>

      <Divider />

      {/* ─── Formulario email/password ────────────────────────────────────── */}
      <form onSubmit={handleSubmit}>
        {error && <div style={errorStyle}>{error}</div>}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Correo electrónico</label>
          <input
            style={inputStyle}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>Contraseña</label>
          <input
            style={inputStyle}
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <div style={{ textAlign: 'right', marginBottom: 20 }}>
          <Link to="/recuperar-contrasena" style={{ ...linkStyle, fontSize: 13 }}>
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <button
          type="submit"
          style={{ ...primaryButtonStyle, opacity: loading || googleLoading ? 0.7 : 1 }}
          disabled={loading || googleLoading}
        >
          {loading ? 'Ingresando…' : 'Iniciar sesión'}
        </button>
      </form>

      <p style={{ textAlign: 'center', fontSize: 13, color: '#64748B', marginTop: 20 }}>
        ¿No tienes cuenta?{' '}
        <Link to={`/registro?${searchParams.toString()}`} style={linkStyle}>
          Crea una gratis
        </Link>
      </p>
    </AuthLayout>
  );
}
