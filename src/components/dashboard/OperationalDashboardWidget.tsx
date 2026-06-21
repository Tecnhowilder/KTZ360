/**
 * OperationalDashboardWidget — Widget operativo GPS en Dashboard.
 * Owner/admin/supervisor: estadísticas del equipo.
 * Comercial/operario: solo su propio estado + botón Check In/Out.
 * PREMIUM only.
 */
import { useNavigate } from 'react-router-dom';
import { Users, MapPin, Lock } from 'lucide-react';
import { useOperationalDashboard } from '../../hooks/useGPS';
import { useFeatureAccess } from '../../hooks/usePermissions';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useUI } from '../../features/app/UIProvider';
import { OPERATIONAL_STATUS_META, canViewFullTeam } from '../../services/gps';

const CARD: React.CSSProperties = {
  background: '#fff',
  borderRadius: 18,
  padding: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,.06)',
};

export function OperationalDashboardWidget() {
  const navigate = useNavigate();
  const { profile } = useWorkspace();
  const { openUpgradeModal } = useUI();
  const featureQ  = useFeatureAccess('gps_enabled');
  const dashQ     = useOperationalDashboard();
  const isManager = canViewFullTeam(profile.role);

  if (featureQ.data === false) {
    return (
      <div
        style={{ ...CARD, margin: '0 16px', cursor: 'pointer',
          background: 'linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)',
          border: '1px solid #BAE6FD',
        }}
        onClick={() => openUpgradeModal({
          title: 'Equipo + GPS',
          message: 'Rastrea el estado operativo de tu equipo y registra check-ins.',
          targetPlan: 'premium',
          ctaLabel: 'Activar PREMIUM',
          bullets: ['Mapa operativo en tiempo real','Check In / Check Out GPS','5 roles operativos','Dashboard de equipo'],
        })}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Users size={18} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0C4A6E' }}>Equipo + GPS — PREMIUM</div>
            <div style={{ fontSize: 11.5, color: '#0284C7' }}>Mapa operativo y check-ins →</div>
          </div>
          <Lock size={16} color="#0284C7" />
        </div>
      </div>
    );
  }

  if (!isManager) return null; // Comercial/operario no ven el widget de equipo

  if (dashQ.isLoading || dashQ.isError || !dashQ.data) return null;

  const d   = dashQ.data;
  const enCampo = d.en_campo;
  const total   = d.total_miembros;

  const statusOrder = ['disponible', 'en_ruta', 'en_sitio', 'finalizado', 'off'] as const;

  return (
    <div style={{ ...CARD, margin: '0 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={15} color="#2563EB" />
          </div>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Equipo Operativo</span>
        </div>
        <button
          onClick={() => navigate('/app/team')}
          style={{ border: 'none', background: '#F1F5F9', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: '#2563EB' }}
        >
          Ver mapa
        </button>
      </div>

      {/* En campo highlight */}
      <div style={{ background: '#EFF6FF', borderRadius: 12, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <MapPin size={16} color="#2563EB" />
        <div>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#2563EB' }}>{enCampo}</span>
          <span style={{ fontSize: 13, color: '#64748B', marginLeft: 6 }}>de {total} en campo ahora</span>
        </div>
      </div>

      {/* Status breakdown */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {statusOrder.map(status => {
          const cnt  = d.team_status?.[status] ?? 0;
          if (cnt === 0) return null;
          const meta = OPERATIONAL_STATUS_META[status];
          return (
            <div key={status} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: meta.bg, borderRadius: 8, padding: '5px 10px',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.dotColor }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>{cnt}</span>
              <span style={{ fontSize: 11, color: '#64748B' }}>{meta.label}</span>
            </div>
          );
        })}
      </div>

      {/* Hoy */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div style={{ textAlign: 'center', background: '#F8FAFC', borderRadius: 10, padding: '8px 0' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#16A34A' }}>{d.checkins_hoy}</div>
          <div style={{ fontSize: 10, color: '#94A3B8' }}>Check In hoy</div>
        </div>
        <div style={{ textAlign: 'center', background: '#F8FAFC', borderRadius: 10, padding: '8px 0' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#DC2626' }}>{d.checkouts_hoy}</div>
          <div style={{ fontSize: 10, color: '#94A3B8' }}>Check Out hoy</div>
        </div>
        <div style={{ textAlign: 'center', background: '#F8FAFC', borderRadius: 10, padding: '8px 0' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#7C3AED' }}>{d.ot_activas}</div>
          <div style={{ fontSize: 10, color: '#94A3B8' }}>OTs activas</div>
        </div>
      </div>
    </div>
  );
}
