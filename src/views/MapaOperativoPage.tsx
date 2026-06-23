/**
 * MapaOperativoPage — Mapa Operativo GPS Sprint 16.2
 * /app/mapa-operativo — Integra componentes GPS creados en Sprint 8.
 *
 * IMPORTANTE: Esta vista NO es una nueva funcionalidad.
 * Es la exposición en UI de funcionalidades GPS completadas en Sprint 8
 * (identificado como hallazgo crítico P3 en auditoría Sprint 16.1).
 *
 * Feature gated: gps_enabled (PREMIUM only).
 * Mobile-first. Desktop responsive.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Map } from 'lucide-react';
import { useWindowWidth, navModeFor } from '../hooks/useWindowWidth';
import { useFeatureAccess } from '../hooks/usePermissions';
import { useOperationalDashboard } from '../hooks/useGPS';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useUI } from '../features/app/UIProvider';
import { OperationalMap } from '../components/gps/OperationalMap';
import { MemberDetailSheet } from '../components/gps/MemberDetailSheet';
import { OperationalStatusSelector } from '../components/gps/OperationalStatusSelector';
import { CheckInOutButton } from '../components/gps/CheckInOutButton';
import { OPERATIONAL_STATUS_META, canViewFullTeam } from '../services/gps';
import type { TeamMapMember } from '../lib/database.types';

// ─── Sin acceso (FREE/PRO) ────────────────────────────────────────────────────

function NoAccess() {
  const { openUpgradeModal } = useUI();
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <Map size={28} color="#2563EB" />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: '0 0 8px' }}>Mapa Operativo</h2>
      <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 24px', lineHeight: 1.6 }}>
        Visualiza en tiempo real dónde está tu equipo, gestiona Check In/Out y monitorea el estado de operarios. Disponible en PREMIUM.
      </p>
      <button onClick={() => openUpgradeModal({ title: 'Mapa Operativo GPS', message: 'Rastrea tu equipo en campo en tiempo real.', targetPlan: 'premium', ctaLabel: 'Activar PREMIUM' })}
        style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 14, padding: '13px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
        Ver plan PREMIUM
      </button>
    </div>
  );
}

// ─── Vista operaria propia (Check In/Out + estado) ────────────────────────────

function MyStatusView() {
  const { profile } = useWorkspace();
  const [showSelector, setShowSelector] = useState(false);

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.06)', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Mi estado operativo</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', background: OPERATIONAL_STATUS_META[profile.operational_status]?.bg ?? '#F8FAFC',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>
            {'⚙️'}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{profile.full_name ?? 'Yo'}</div>
            <div style={{ fontSize: 13, color: OPERATIONAL_STATUS_META[profile.operational_status]?.color ?? '#64748B', fontWeight: 600 }}>
              {OPERATIONAL_STATUS_META[profile.operational_status]?.label ?? 'Desconectado'}
            </div>
          </div>
          <button onClick={() => setShowSelector(v => !v)}
            style={{ marginLeft: 'auto', border: '1px solid #E2E8F0', background: '#fff', borderRadius: 10, padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
            Cambiar
          </button>
        </div>
        {showSelector && (
          <OperationalStatusSelector
            current={profile.operational_status}
            onClose={() => setShowSelector(false)}
          />
        )}
        <CheckInOutButton
          operationalStatus={profile.operational_status}
          gpsConsent={!!profile.gps_consent_at}
        />
      </div>
    </div>
  );
}

// ─── Vista de manager (mapa + dashboard) ─────────────────────────────────────

function ManagerMapView() {
  const [selectedMember, setSelectedMember] = useState<TeamMapMember | null>(null);
  const dashQ = useOperationalDashboard();
  const d = dashQ.data;

  return (
    <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPIs */}
      {d && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          <div style={{ background: '#EFF6FF', borderRadius: 14, padding: '10px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB' }}>{d.en_campo}</div>
            <div style={{ fontSize: 10.5, color: '#64748B' }}>En campo</div>
          </div>
          <div style={{ background: '#F0FDF4', borderRadius: 14, padding: '10px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A' }}>{d.checkins_hoy}</div>
            <div style={{ fontSize: 10.5, color: '#64748B' }}>Check Ins hoy</div>
          </div>
          <div style={{ background: '#F5F3FF', borderRadius: 14, padding: '10px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#7C3AED' }}>{d.ot_activas}</div>
            <div style={{ fontSize: 10.5, color: '#64748B' }}>OTs activas</div>
          </div>
        </div>
      )}

      {/* Mapa */}
      <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
        <div style={{ padding: '12px 14px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Map size={16} color="#2563EB" />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>Equipo en campo</span>
        </div>
        <OperationalMap onMemberClick={(m) => setSelectedMember(m)} />
      </div>

      {/* Lista de miembros en campo */}
      {(d?.miembros_en_campo?.length ?? 0) > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>En campo ahora</div>
          {d!.miembros_en_campo.map(m => {
            const meta = OPERATIONAL_STATUS_META[m.operational_status];
            return (
              <button key={m.user_id}
                onClick={() => setSelectedMember(m)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: meta.bg, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                  {(m.full_name ?? '?').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>{m.full_name ?? 'Sin nombre'}</div>
                  <div style={{ fontSize: 12, color: meta.color, fontWeight: 600 }}>{meta.label}</div>
                  {m.work_order_title && <div style={{ fontSize: 11.5, color: '#94A3B8' }}>{m.work_order_number} — {m.work_order_title}</div>}
                </div>
                <div style={{ flexShrink: 0, fontSize: 11, color: '#94A3B8' }}>
                  {m.location_updated ? `${Math.floor((Date.now() - new Date(m.location_updated).getTime()) / 60_000)}min` : '—'}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detalle de miembro seleccionado */}
      {selectedMember && (
        <MemberDetailSheet member={selectedMember} onClose={() => setSelectedMember(null)} />
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function MapaOperativoPage() {
  const navigate = useNavigate();
  const { profile } = useWorkspace();
  void useWindowWidth();
  void navModeFor;
  const featureQ = useFeatureAccess('gps_enabled');
  const isManager = canViewFullTeam(profile.role);

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 20 }}>
        <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#0F172A' }}>
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Map size={18} color="#2563EB" /> Mapa Operativo
          </div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 1 }}>
            {isManager ? 'Ubicación del equipo en tiempo real' : 'Tu estado operativo'}
          </div>
        </div>
      </div>

      {/* Sin acceso */}
      {featureQ.data === false && <NoAccess />}

      {/* Con acceso */}
      {featureQ.data !== false && (
        <>
          {isManager ? <ManagerMapView /> : <MyStatusView />}
        </>
      )}
    </div>
  );
}
