import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { signUp } from '../../services/auth';
import { AuthLayout, inputStyle, labelStyle, primaryButtonStyle, errorStyle, linkStyle } from './AuthLayout';

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');
  const invitedEmail = searchParams.get('email');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState(invitedEmail ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { session } = await signUp(email, password, fullName, companyName || 'Mi negocio');
      if (session) {
        navigate(redirect || '/app/dashboard', { replace: true });
      } else {
        navigate(`/login?${searchParams.toString()}`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Crea tu cuenta" subtitle="Empieza a cotizar tus proyectos en minutos">
      <form onSubmit={handleSubmit}>
        {error && <div style={errorStyle}>{error}</div>}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Nombre completo</label>
          <input
            style={inputStyle}
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Tu nombre"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Nombre del negocio (opcional)</label>
          <input
            style={inputStyle}
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Mi negocio"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Correo electrónico</label>
          <input
            style={inputStyle}
            type="email"
            required
            readOnly={!!invitedEmail}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Contraseña</label>
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
