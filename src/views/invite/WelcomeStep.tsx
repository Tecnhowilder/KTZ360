/**
 * WelcomeStep — Step 4 (final) del flujo de invitación.
 *
 * Pantalla de bienvenida personalizada por nombre, empresa y rol.
 * Muestra los permisos del rol y CTA "Comenzar".
 */
import { CheckCircle2 } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  admin:      'Administrador',
  supervisor: 'Supervisor',
  operario:   'Operario',
  comercial:  'Comercial',
};

const ROLE_WELCOME: Record<string, { headline: string; permissions: string[] }> = {
  admin: {
    headline: 'Ahora coordinas el equipo',
    permissions: [
      'Gestionar equipo y asignaciones',
      'Aprobar cotizaciones y pedidos',
      'Acceder a reportes y KPIs',
      'Configurar integraciones',
    ],
  },
  supervisor: {
    headline: 'Supervisas las operaciones en campo',
    permissions: [
      'Ver y asignar órdenes de trabajo',
      'Acceder al mapa operativo en tiempo real',
      'Aprobar novedades del equipo',
      'Ver reportes de asistencia',
    ],
  },
  comercial: {
    headline: 'Empiezas a vender más y mejor',
    permissions: [
      'Crear y compartir cotizaciones',
      'Gestionar clientes y contactos',
      'Usar IA para propuestas',
      'Ver tu pipeline de ventas',
    ],
  },
  operario: {
    headline: 'Tu trabajo, todo desde el celular',
    permissions: [
      'Ver tus órdenes de trabajo asignadas',
      'Registrar asistencia y marcaciones',
      'Subir evidencias y fotos del trabajo',
      'Reportar novedades en campo',
    ],
  },
};

const ROLE_COLORS: Record<string, { color: string; bg: string }> = {
  admin:      { color: '#7C3AED', bg: '#F5F3FF' },
  supervisor: { color: '#2563EB', bg: '#EFF6FF' },
  comercial:  { color: '#D97706', bg: '#FFFBEB' },
  operario:   { color: '#16A34A', bg: '#F0FDF4' },
};

interface Props {
  fullName?:      string | null;
  workspaceName:  string;
  role:           string;
  onStart:        () => void;
}

export function WelcomeStep({ fullName, workspaceName, role, onStart }: Props) {
  const firstName  = (fullName ?? '').split(' ')[0] || 'bienvenido';
  const label      = ROLE_LABELS[role]   ?? role;
  const content    = ROLE_WELCOME[role]  ?? { headline: 'Listo para empezar', permissions: [] };
  const colors     = ROLE_COLORS[role]   ?? { color: '#2563EB', bg: '#EFF6FF' };

  return (
    <div style={{ minHeight: '100dvh', background: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>

        {/* Check animado */}
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#F0FDF4', border: '3px solid #22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', animation: 'pop .4s ease' }}>
          <CheckCircle2 size={40} color="#22C55E" />
        </div>

        {/* Saludo */}
        <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0F172A', letterSpacing: '-.5px', marginBottom: 6 }}>
          ¡Hola, {firstName}!
        </h1>
        <p style={{ fontSize: 15, color: '#64748B', marginBottom: 6, lineHeight: 1.5 }}>
          Ahora haces parte de
        </p>
        <p style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginBottom: 24 }}>
          {workspaceName}
        </p>

        {/* Rol */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: colors.bg, padding: '8px 18px', borderRadius: 99, border: `1.5px solid ${colors.color}30`, marginBottom: 24 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: colors.color }}>Tu rol: {label}</span>
        </div>

        {/* Card de permisos */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', boxShadow: '0 4px 20px rgba(15,23,42,.06)', padding: '20px 22px', marginBottom: 28, textAlign: 'left' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em', marginBottom: 12 }}>
            {content.headline.toUpperCase()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {content.permissions.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <CheckCircle2 size={13} color="#22C55E" />
                </div>
                <span style={{ fontSize: 14, color: '#374151', fontWeight: 500 }}>{p}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={onStart}
          style={{
            width: '100%', padding: '15px', borderRadius: 14, border: 'none',
            background: '#2563EB', color: '#fff', fontWeight: 800, fontSize: 16,
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 4px 16px rgba(37,99,235,.35)',
          }}
        >
          Comenzar →
        </button>
      </div>
    </div>
  );
}
