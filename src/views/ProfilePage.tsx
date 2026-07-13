/**
 * ProfilePage — /app/perfil
 *
 * Módulo de perfil reutilizable para todos los roles.
 * Secciones: Información personal · Seguridad · Preferencias.
 *
 * Zero Trust: UPDATE solo para la fila propia (profiles_update_own RLS policy).
 */
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Phone, MapPin, Briefcase, Star, Lock, Eye, EyeOff, Camera } from 'lucide-react';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useToast } from '../components/ui/Toast';
import { supabase } from '../lib/supabaseClient';
import { updatePassword } from '../services/auth';

// ─── Tipos ─────────────────────────────────────────────────────────────────────

interface ProfileFormData {
  full_name:  string;
  phone:      string;
  city:       string;
  profession: string;
  specialty:  string;
}

// ─── Constantes ────────────────────────────────────────────────────────────────

const SPECIALTIES = [
  { value: '',                label: 'Sin especialidad' },
  { value: 'electricista',    label: 'Electricista' },
  { value: 'cctv',            label: 'CCTV / Videovigilancia' },
  { value: 'redes',           label: 'Redes y fibra óptica' },
  { value: 'refrigeracion',   label: 'Refrigeración y HVAC' },
  { value: 'solar',           label: 'Energía solar' },
  { value: 'seguridad',       label: 'Seguridad electrónica' },
  { value: 'automatizacion',  label: 'Automatización' },
  { value: 'it',              label: 'IT y soporte técnico' },
  { value: 'telecomunicaciones', label: 'Telecomunicaciones' },
  { value: 'otro',            label: 'Otro' },
];

const ROLE_LABELS: Record<string, string> = {
  owner:         'Propietario',
  admin:         'Administrador',
  supervisor:    'Supervisor',
  comercial:     'Comercial',
  operario:      'Operario',
  super_admin:   'Super Admin',
  support_admin: 'Soporte',
};

// ─── Estilos compartidos ───────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #E2E8F0',
  fontSize: 14, color: '#0F172A', outline: 'none', background: '#fff', fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 5, letterSpacing: '0.03em',
};

// ─── Sección: Avatar ───────────────────────────────────────────────────────────

function AvatarSection({ fullName, avatarPath }: { fullName: string | null; avatarPath: string | null }) {
  const initials = (fullName ?? '?').trim().charAt(0).toUpperCase();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0 16px' }}>
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 800, color: '#7C3AED', overflow: 'hidden' }}>
          {avatarPath ? (
            <img src={avatarPath} alt={fullName ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : initials}
        </div>
        {/* TODO Sprint siguiente: upload de foto */}
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: '50%', background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', cursor: 'not-allowed', opacity: 0.5 }}>
          <Camera size={13} color="#fff" />
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#94A3B8' }}>Foto de perfil (próximamente)</div>
    </div>
  );
}

// ─── Sección: Información personal ────────────────────────────────────────────

function PersonalInfoSection() {
  const { profile } = useWorkspace();
  const { showToast } = useToast();
  const [form, setForm] = useState<ProfileFormData>({
    full_name:  profile.full_name  ?? '',
    phone:      profile.phone      ?? '',
    city:       profile.city       ?? '',
    profession: profile.profession ?? '',
    specialty:  profile.specialty  ?? '',
  });
  const [saving, setSaving] = useState(false);

  const set = (key: keyof ProfileFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name:  form.full_name.trim(),
          phone:      form.phone      || null,
          city:       form.city       || null,
          profession: form.profession || null,
          specialty:  form.specialty  || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);
      if (error) throw error;
      showToast('Perfil actualizado ✓');
    } catch {
      showToast('Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', marginBottom: 12, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 8 }}>
        <User size={16} color="#2563EB" />
        <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Información personal</span>
      </div>
      <div style={{ padding: '16px 20px' }}>
        <AvatarSection fullName={profile.full_name} avatarPath={profile.avatar_path} />

        {/* Rol (solo lectura) */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>ROL</label>
          <div style={{ padding: '11px 14px', borderRadius: 10, background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: 14, color: '#64748B', fontWeight: 600 }}>
            {ROLE_LABELS[profile.role] ?? profile.role}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>NOMBRE COMPLETO *</label>
            <input style={inputStyle} type="text" required minLength={2} value={form.full_name} onChange={set('full_name')} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>CORREO (no editable)</label>
            <input style={{ ...inputStyle, background: '#F8FAFC', color: '#94A3B8', cursor: 'not-allowed' }} type="email" value={profile.email ?? ''} readOnly />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}><Phone size={11} style={{ display: 'inline', marginRight: 4 }} />TELÉFONO</label>
              <input style={inputStyle} type="tel" value={form.phone} onChange={set('phone')} placeholder="3001234567" />
            </div>
            <div>
              <label style={labelStyle}><MapPin size={11} style={{ display: 'inline', marginRight: 4 }} />CIUDAD</label>
              <input style={inputStyle} type="text" value={form.city} onChange={set('city')} placeholder="Bogotá" />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}><Briefcase size={11} style={{ display: 'inline', marginRight: 4 }} />PROFESIÓN U OFICIO</label>
            <input style={inputStyle} type="text" value={form.profession} onChange={set('profession')} placeholder="Técnico electricista" />
          </div>
          {['operario', 'supervisor', 'admin'].includes(profile.role) && (
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}><Star size={11} style={{ display: 'inline', marginRight: 4 }} />ESPECIALIDAD</label>
              <select style={{ ...inputStyle, appearance: 'none' }} value={form.specialty} onChange={set('specialty')}>
                {SPECIALTIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          )}
          <button
            type="submit"
            disabled={saving || !form.full_name.trim()}
            style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: saving ? '#E2E8F0' : '#2563EB', color: saving ? '#94A3B8' : '#fff', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Sección: Cambiar contraseña ───────────────────────────────────────────────

function PasswordSection() {
  const { showToast } = useToast();
  const [current, setCurrent]   = useState('');
  const [newPwd, setNewPwd]     = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showNew, setShowNew]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const pwdMatch = newPwd.length >= 6 && newPwd === confirm;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!pwdMatch) { setError('Las contraseñas no coinciden'); return; }
    setError(null);
    setLoading(true);
    try {
      // Re-autenticar con contraseña actual primero (seguridad)
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
        if (signInErr) throw new Error('Contraseña actual incorrecta');
      }
      await updatePassword(newPwd);
      showToast('Contraseña actualizada ✓');
      setCurrent(''); setNewPwd(''); setConfirm('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cambiar contraseña');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', marginBottom: 12, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Lock size={16} color="#2563EB" />
        <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Contraseña</span>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 14 }}>{error}</div>
        )}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>CONTRASEÑA ACTUAL</label>
            <input style={inputStyle} type="password" required value={current} onChange={e => setCurrent(e.target.value)} placeholder="••••••••" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>NUEVA CONTRASEÑA</label>
            <div style={{ position: 'relative' }}>
              <input style={{ ...inputStyle, paddingRight: 44 }} type={showNew ? 'text' : 'password'} required minLength={6} value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Mínimo 6 caracteres" />
              <button type="button" onClick={() => setShowNew(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}>
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>CONFIRMAR NUEVA CONTRASEÑA</label>
            <input style={{ ...inputStyle, borderColor: confirm && !pwdMatch ? '#FECACA' : undefined }} type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repite la contraseña" />
          </div>
          <button type="submit" disabled={loading || !pwdMatch || !current}
            style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: (loading || !pwdMatch || !current) ? '#E2E8F0' : '#2563EB', color: (loading || !pwdMatch || !current) ? '#94A3B8' : '#fff', fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {loading ? 'Cambiando…' : 'Cambiar contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── ProfilePage ───────────────────────────────────────────────────────────────

export function ProfilePage() {
  const navigate = useNavigate();
  const { profile } = useWorkspace();

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 20 }}>
        <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
          <ArrowLeft size={22} color="#374151" />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A' }}>Mi perfil</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>{profile.full_name ?? profile.email ?? ''}</div>
        </div>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        <PersonalInfoSection />
        <PasswordSection />
      </div>
    </div>
  );
}
