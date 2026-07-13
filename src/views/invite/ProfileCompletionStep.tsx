/**
 * ProfileCompletionStep — Step 3 del flujo de invitación.
 *
 * Datos pre-llenados desde la invitación (teléfono, ciudad, profesión, especialidad).
 * Solo nombre es obligatorio. El resto es opcional.
 * Nunca bloquea el flujo — hay botón "Completar después".
 */
import { useState, type FormEvent } from 'react';
import { ArrowLeft, User, Phone, MapPin, Briefcase, Star } from 'lucide-react';

const SPECIALTIES = [
  'electricista',
  'cctv',
  'redes',
  'refrigeracion',
  'solar',
  'seguridad',
  'automatizacion',
  'it',
  'telecomunicaciones',
  'otro',
] as const;

const SPECIALTY_LABELS: Record<string, string> = {
  electricista:    'Electricista',
  cctv:            'CCTV / Videovigilancia',
  redes:           'Redes y fibra óptica',
  refrigeracion:   'Refrigeración y HVAC',
  solar:           'Energía solar',
  seguridad:       'Seguridad electrónica',
  automatizacion:  'Automatización',
  it:              'IT y soporte técnico',
  telecomunicaciones: 'Telecomunicaciones',
  otro:            'Otro',
};

interface ProfileData {
  full_name:  string;
  phone:      string;
  city:       string;
  profession: string;
  specialty:  string;
}

interface Props {
  initialData: ProfileData;
  role:        string;
  onBack?:     () => void;
  onSubmit:    (data: ProfileData) => Promise<void>;
  onSkip:      () => void;
  loading:     boolean;
  error:       string | null;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #E2E8F0',
  fontSize: 14, color: '#0F172A', outline: 'none', background: '#fff', fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 5,
};

function FieldRow({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <Icon size={13} color="#64748B" />
          {label}
        </span>
      </label>
      {children}
    </div>
  );
}

export function ProfileCompletionStep({ initialData, role, onBack, onSubmit, onSkip, loading, error }: Props) {
  const [data, setData] = useState<ProfileData>(initialData);

  const set = (key: keyof ProfileData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setData(d => ({ ...d, [key]: e.target.value }));

  const canSubmit = data.full_name.trim().length >= 2 && !loading;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    await onSubmit({ ...data, full_name: data.full_name.trim() });
  }

  const showSpecialty = ['operario', 'supervisor', 'admin'].includes(role);

  return (
    <div style={{ minHeight: '100dvh', background: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/icons/logo-horizontal-white-bg.png" alt="Shelwi" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
        </div>

        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #E2E8F0', boxShadow: '0 4px 24px rgba(15,23,42,.07)', padding: '28px 24px' }}>

          {/* Nav superior */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            {onBack ? (
              <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer', color: '#64748B', fontSize: 13, fontWeight: 600, padding: 0, fontFamily: 'inherit' }}>
                <ArrowLeft size={16} /> Volver
              </button>
            ) : <div />}
            <button onClick={onSkip} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 13, fontWeight: 600, padding: 0, fontFamily: 'inherit' }}>
              Completar después
            </button>
          </div>

          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Completa tu perfil</h1>
          <p style={{ fontSize: 13.5, color: '#64748B', marginBottom: 22, lineHeight: 1.5 }}>
            Esta información ayuda a tu equipo a identificarte. Puedes editarla en cualquier momento.
          </p>

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Nombre */}
            <FieldRow icon={User} label="Nombre completo *">
              <input
                style={inputStyle}
                type="text"
                required
                autoFocus
                minLength={2}
                value={data.full_name}
                onChange={set('full_name')}
                placeholder="Tu nombre completo"
              />
            </FieldRow>

            {/* Teléfono */}
            <FieldRow icon={Phone} label="Teléfono">
              <input
                style={inputStyle}
                type="tel"
                value={data.phone}
                onChange={set('phone')}
                placeholder="Ej. 3001234567"
              />
            </FieldRow>

            {/* Ciudad */}
            <FieldRow icon={MapPin} label="Ciudad">
              <input
                style={inputStyle}
                type="text"
                value={data.city}
                onChange={set('city')}
                placeholder="Ej. Bogotá"
              />
            </FieldRow>

            {/* Profesión */}
            <FieldRow icon={Briefcase} label="Profesión u oficio">
              <input
                style={inputStyle}
                type="text"
                value={data.profession}
                onChange={set('profession')}
                placeholder="Ej. Técnico electricista"
              />
            </FieldRow>

            {/* Especialidad (solo roles de campo) */}
            {showSpecialty && (
              <FieldRow icon={Star} label="Especialidad">
                <select
                  style={{ ...inputStyle, appearance: 'none' }}
                  value={data.specialty}
                  onChange={set('specialty')}
                >
                  <option value="">Sin especialidad especificada</option>
                  {SPECIALTIES.map(s => (
                    <option key={s} value={s}>{SPECIALTY_LABELS[s]}</option>
                  ))}
                </select>
              </FieldRow>
            )}

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
              {loading ? 'Guardando…' : 'Guardar y continuar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
