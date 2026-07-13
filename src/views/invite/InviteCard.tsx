/**
 * InviteCard — Step 1 del flujo de invitación.
 *
 * Muestra: empresa, rol, permisos, invitador, expiración.
 * CTA: Crear cuenta nueva | Ya tengo cuenta
 */
import { Building2, ShieldCheck, Clock, User } from 'lucide-react';

export interface InvitePreview {
  email:          string;
  role:           string;
  workspace_name: string;
  status:         string;
  expires_at:     string;
  full_name?:     string | null;
  inviter_name?:  string | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin:      'Administrador',
  supervisor: 'Supervisor',
  operario:   'Operario',
  comercial:  'Comercial',
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin:      'Coordina el equipo, gestiona pedidos y tiene acceso a reportes y configuración.',
  supervisor: 'Supervisa operaciones en campo, asigna técnicos y controla avances en tiempo real.',
  operario:   'Recibe y ejecuta órdenes de trabajo, registra asistencia y sube evidencias.',
  comercial:  'Crea cotizaciones, gestiona clientes y da seguimiento al pipeline de ventas.',
};

const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    'Gestionar equipo y asignaciones',
    'Ver y aprobar cotizaciones y pedidos',
    'Acceder a reportes y KPIs',
    'Configurar integraciones',
    'Gestionar clientes',
  ],
  supervisor: [
    'Ver órdenes de trabajo del equipo',
    'Asignar técnicos a OTs',
    'Aprobar novedades en campo',
    'Acceder al mapa operativo',
    'Ver reportes de asistencia',
  ],
  comercial: [
    'Crear y enviar cotizaciones',
    'Gestionar clientes y contactos',
    'Usar IA para propuestas',
    'Ver pipeline de ventas',
    'Dar seguimiento a oportunidades',
  ],
  operario: [
    'Ver mis órdenes de trabajo',
    'Registrar asistencia y marcaciones',
    'Subir evidencias y fotos',
    'Reportar novedades en campo',
    'Consultar pedidos asignados',
  ],
};

const ROLE_COLORS: Record<string, { color: string; bg: string }> = {
  admin:      { color: '#7C3AED', bg: '#F5F3FF' },
  supervisor: { color: '#2563EB', bg: '#EFF6FF' },
  comercial:  { color: '#D97706', bg: '#FFFBEB' },
  operario:   { color: '#16A34A', bg: '#F0FDF4' },
};

interface Props {
  preview:       InvitePreview;
  onCreateAccount: () => void;
  onLogin:         () => void;
}

export function InviteCard({ preview, onCreateAccount, onLogin }: Props) {
  const label       = ROLE_LABELS[preview.role]      ?? preview.role;
  const description = ROLE_DESCRIPTIONS[preview.role] ?? '';
  const permissions = ROLE_PERMISSIONS[preview.role]  ?? [];
  const colors      = ROLE_COLORS[preview.role]       ?? { color: '#2563EB', bg: '#EFF6FF' };

  const expiresDate = new Date(preview.expires_at).toLocaleDateString('es-CO', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div style={{ minHeight: '100dvh', background: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/icons/logo-horizontal-white-bg.png" alt="Shelwi" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
        </div>

        {/* Card principal */}
        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #E2E8F0', boxShadow: '0 4px 24px rgba(15,23,42,.07)', overflow: 'hidden' }}>

          {/* Header empresa */}
          <div style={{ background: colors.bg, padding: '22px 24px', borderBottom: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: colors.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${colors.color}30`, flexShrink: 0 }}>
                <Building2 size={24} color={colors.color} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.color, letterSpacing: '0.05em', marginBottom: 2 }}>INVITACIÓN DE EQUIPO</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>{preview.workspace_name}</div>
              </div>
            </div>
          </div>

          {/* Cuerpo */}
          <div style={{ padding: '20px 24px' }}>

            {/* Invitado por */}
            {preview.inviter_name && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '8px 12px', background: '#F8FAFC', borderRadius: 10 }}>
                <User size={14} color="#94A3B8" />
                <span style={{ fontSize: 13, color: '#64748B' }}>
                  Invitado por <strong style={{ color: '#0F172A' }}>{preview.inviter_name}</strong>
                </span>
              </div>
            )}

            {/* Para (email) */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.05em', marginBottom: 4 }}>PARA</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{preview.email}</div>
            </div>

            {/* Rol */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.05em', marginBottom: 6 }}>TU ROL</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: colors.color, background: colors.bg, padding: '4px 12px', borderRadius: 99, border: `1px solid ${colors.color}30` }}>
                  {label}
                </span>
              </div>
              {description && (
                <p style={{ fontSize: 13, color: '#64748B', marginTop: 6, lineHeight: 1.5 }}>{description}</p>
              )}
            </div>

            {/* Permisos */}
            {permissions.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <ShieldCheck size={14} color="#16A34A" />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.05em' }}>PODRÁS</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {permissions.map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: colors.color, flexShrink: 0 }} />
                      {p}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Expiración */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, padding: '8px 12px', background: '#FFFBEB', borderRadius: 10, border: '1px solid #FEF3C7' }}>
              <Clock size={13} color="#D97706" />
              <span style={{ fontSize: 12, color: '#92400E' }}>Vigente hasta el {expiresDate}</span>
            </div>

            {/* CTAs */}
            <button
              onClick={onCreateAccount}
              style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 10, fontFamily: 'inherit' }}
            >
              Aceptar y crear cuenta
            </button>
            <button
              onClick={onLogin}
              style={{ width: '100%', padding: '13px', borderRadius: 12, border: '1.5px solid #E2E8F0', background: '#fff', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Ya tengo cuenta — Iniciar sesión
            </button>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#94A3B8', marginTop: 16 }}>
          Al aceptar, accederás únicamente a los datos de <strong>{preview.workspace_name}</strong>.
        </p>
      </div>
    </div>
  );
}
