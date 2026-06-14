import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { resetPassword, updatePassword } from '../../services/auth';
import { useAuth } from './AuthProvider';
import { AuthLayout, inputStyle, labelStyle, primaryButtonStyle, errorStyle, linkStyle } from './AuthLayout';

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  // Si el usuario llegó aquí desde el enlace de recuperación, ya tiene sesión: pedimos la nueva contraseña.
  const isRecoverySession = !!session;

  async function handleRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el correo');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await updatePassword(password);
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la contraseña');
    } finally {
      setLoading(false);
    }
  }

  if (isRecoverySession) {
    return (
      <AuthLayout title="Nueva contraseña" subtitle="Elige una nueva contraseña para tu cuenta">
        <form onSubmit={handleUpdate}>
          {error && <div style={errorStyle}>{error}</div>}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Nueva contraseña</label>
            <input
              style={inputStyle}
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <button type="submit" style={{ ...primaryButtonStyle, opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Recuperar contraseña" subtitle="Te enviaremos un enlace para restablecerla">
      {sent ? (
        <div>
          <p style={{ fontSize: 14, color: '#334155', textAlign: 'center', marginBottom: 20 }}>
            Revisa tu correo <strong>{email}</strong> y sigue el enlace para crear una nueva contraseña.
          </p>
          <Link to="/login" style={{ ...primaryButtonStyle, display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            Volver a iniciar sesión
          </Link>
        </div>
      ) : (
        <form onSubmit={handleRequest}>
          {error && <div style={errorStyle}>{error}</div>}
          <div style={{ marginBottom: 20 }}>
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
          <button type="submit" style={{ ...primaryButtonStyle, opacity: loading ? 0.7 : 1 }} disabled={loading}>
            {loading ? 'Enviando…' : 'Enviar enlace'}
          </button>
        </form>
      )}
      <p style={{ textAlign: 'center', fontSize: 13, color: '#64748B', marginTop: 20 }}>
        <Link to="/login" style={linkStyle}>
          Volver a iniciar sesión
        </Link>
      </p>
    </AuthLayout>
  );
}
