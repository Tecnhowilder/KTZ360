/**
 * CreatePasswordStep — Step 2 del flujo de invitación.
 *
 * Solo para usuarios nuevos. Email pre-llenado desde invitación, no editable.
 * NO pide empresa, NIT ni nombre de negocio — el usuario ya tiene una.
 */
import { useState, useCallback, type FormEvent } from 'react';
import { Eye, EyeOff, ArrowLeft, Check, X } from 'lucide-react';

interface Props {
  email:    string;
  onBack:   () => void;
  onSubmit: (fullName: string, password: string) => Promise<void>;
  loading:  boolean;
  error:    string | null;
}

interface PasswordStrength {
  score:  number;  // 0-4
  label:  string;
  color:  string;
}

function getPasswordStrength(pwd: string): PasswordStrength {
  if (pwd.length === 0) return { score: 0, label: '', color: '#E2E8F0' };
  let score = 0;
  if (pwd.length >= 8)  score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;

  const levels: PasswordStrength[] = [
    { score: 0, label: '',          color: '#E2E8F0' },
    { score: 1, label: 'Débil',     color: '#EF4444' },
    { score: 2, label: 'Regular',   color: '#F59E0B' },
    { score: 3, label: 'Buena',     color: '#3B82F6' },
    { score: 4, label: 'Excelente', color: '#22C55E' },
  ];
  return { ...levels[score], score };
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #E2E8F0',
  fontSize: 14, color: '#0F172A', outline: 'none', background: '#fff', fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6,
};

export function CreatePasswordStep({ email, onBack, onSubmit, loading, error }: Props) {
  const [fullName,  setFullName]  = useState('');
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPwd,   setShowPwd]   = useState(false);
  const [showConf,  setShowConf]  = useState(false);

  const strength    = getPasswordStrength(password);
  const pwdMatch    = password.length > 0 && confirm.length > 0 && password === confirm;
  const pwdMismatch = confirm.length > 0 && password !== confirm;
  const canSubmit   = fullName.trim().length >= 2 && password.length >= 6 && pwdMatch && !loading;

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    await onSubmit(fullName.trim(), password);
  }, [canSubmit, fullName, password, onSubmit]);

  return (
    <div style={{ minHeight: '100dvh', background: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/icons/logo-horizontal-white-bg.png" alt="Shelwi" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
        </div>

        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #E2E8F0', boxShadow: '0 4px 24px rgba(15,23,42,.07)', padding: '32px 28px' }}>

          {/* Back */}
          <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 20, fontFamily: 'inherit' }}>
            <ArrowLeft size={16} /> Volver
          </button>

          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Crear tu cuenta</h1>
          <p style={{ fontSize: 14, color: '#64748B', marginBottom: 24, lineHeight: 1.5 }}>
            Ya tienes equipo asignado. Solo necesitas crear tu contraseña.
          </p>

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Email — solo lectura */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Correo electrónico</label>
              <input
                style={{ ...inputStyle, background: '#F8FAFC', color: '#64748B', cursor: 'not-allowed' }}
                type="email"
                value={email}
                readOnly
              />
            </div>

            {/* Nombre */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Tu nombre completo</label>
              <input
                style={inputStyle}
                type="text"
                required
                autoFocus
                minLength={2}
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Juan García"
              />
            </div>

            {/* Contraseña */}
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Contraseña</label>
              <div style={{ position: 'relative' }}>
                <input
                  style={{ ...inputStyle, paddingRight: 44 }}
                  type={showPwd ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Indicador de fortaleza */}
              {password.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} style={{ flex: 1, height: 4, borderRadius: 99, background: i <= strength.score ? strength.color : '#E2E8F0', transition: 'background .2s' }} />
                    ))}
                  </div>
                  {strength.label && (
                    <div style={{ fontSize: 11, color: strength.color, fontWeight: 600 }}>
                      Contraseña {strength.label}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Confirmar contraseña */}
            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Confirmar contraseña</label>
              <div style={{ position: 'relative' }}>
                <input
                  style={{ ...inputStyle, paddingRight: 44, borderColor: pwdMismatch ? '#FECACA' : undefined }}
                  type={showConf ? 'text' : 'password'}
                  required
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repite tu contraseña"
                />
                <button
                  type="button"
                  onClick={() => setShowConf(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}
                >
                  {showConf ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                {confirm.length > 0 && (
                  <div style={{ position: 'absolute', right: 40, top: '50%', transform: 'translateY(-50%)' }}>
                    {pwdMatch
                      ? <Check size={14} color="#22C55E" />
                      : <X size={14} color="#EF4444" />}
                  </div>
                )}
              </div>
              {pwdMismatch && (
                <div style={{ fontSize: 12, color: '#EF4444', marginTop: 4 }}>Las contraseñas no coinciden</div>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                width: '100%', padding: '13px', borderRadius: 12, border: 'none',
                background: canSubmit ? '#2563EB' : '#E2E8F0',
                color: canSubmit ? '#fff' : '#94A3B8',
                fontWeight: 700, fontSize: 14, cursor: canSubmit ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit', transition: 'background .15s',
              }}
            >
              {loading ? 'Creando cuenta…' : 'Crear cuenta y unirme al equipo'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#94A3B8', marginTop: 16, lineHeight: 1.5 }}>
          Al crear tu cuenta aceptas los <a href="/terminos" style={{ color: '#2563EB', textDecoration: 'none' }}>Términos de uso</a> y{' '}
          <a href="/politica-privacidad" style={{ color: '#2563EB', textDecoration: 'none' }}>Política de privacidad</a>.
        </p>
      </div>
    </div>
  );
}
