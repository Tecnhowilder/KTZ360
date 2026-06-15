import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signIn } from '../../services/auth';
import { AuthLayout, inputStyle, labelStyle, primaryButtonStyle, errorStyle, linkStyle } from './AuthLayout';
import { APP_NAME } from '../../lib/brand';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Bienvenido de nuevo" subtitle={`Ingresa a tu cuenta de ${APP_NAME}`}>
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
        <button type="submit" style={{ ...primaryButtonStyle, opacity: loading ? 0.7 : 1 }} disabled={loading}>
          {loading ? 'Ingresando…' : 'Iniciar sesión'}
        </button>
      </form>
      <p style={{ textAlign: 'center', fontSize: 13, color: '#64748B', marginTop: 20 }}>
        ¿No tienes cuenta?{' '}
        <Link to="/registro" style={linkStyle}>
          Crea una gratis
        </Link>
      </p>
    </AuthLayout>
  );
}
