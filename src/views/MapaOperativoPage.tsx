/**
 * MapaOperativoPage — Mapa Operativo GPS
 * Rutas: /app/mapa-operativo y /app/operaciones/mapa (alias)
 *
 * IMPORTANTE: El backend GPS está 100% implementado (Sprint 8).
 * Esta vista expone las funcionalidades existentes.
 *
 * Feature gated: gps_enabled (PREMIUM only).
 * Mobile-first. Desktop responsive.
 * Zero Trust: workspace_id desde JWT en todos los RPCs.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Map, Navigation, Users, ClipboardList, CheckCircle2, MapPin, RefreshCw } from 'lucide-react';
import { useFeatureAccess } from '../hooks/usePermissions';
import { useOperationalDashboard } from '../hooks/useGPS';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useUI } from '../features/app/UIProvider';
import { OperationalMap } from '../components/gps/OperationalMap';
import { MemberDetailSheet } from '../components/gps/MemberDetailSheet';
import { OperationalStatusSelector } from '../components/gps/OperationalStatusSelector';
import { CheckInOutButton } from '../components/gps/CheckInOutButton';
import { OPERATIONAL_STATUS_META, canViewFullTeam } from '../services/gps';
import type { TeamMapMember, OperationalStatus } from '../lib/database.types';

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
        Visualiza dónde está tu equipo, gestiona Check In/Out y monitorea el estado de operarios. Disponible en Plan PRO.
      </p>
      <button
        onClick={() => openUpgradeModal({ title: 'Mapa Operativo GPS', message: 'Rastrea tu equipo en campo en tiempo real con el plan PRO.', targetPlan: 'pro', ctaLabel: 'Actualizar a PRO' })}
        style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 14, padding: '13px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
      >
        Ver plan PRO
      </button>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ value, label, color, bg, icon }: {
  value: number; label: string; color: string; bg: string;
  icon: React.ReactNode;
}) {
  return (
    <div style={{ background: bg, borderRadius: 14, padding: '10px 10px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 1 }}>{label}</div>
    </div>
  );
}

// ─── Vista operaria propia (Check In/Out + estado) ────────────────────────────

function MyStatusView() {
  const { profile } = useWorkspace();
  const [showSelector, setShowSelector] = useState(false);

  const statusMeta = OPERATIONAL_STATUS_META[profile.operational_status as OperationalStatus]
    ?? OPERATIONAL_STATUS_META['off'];

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.06)', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Mi estado operativo</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          {/* FIX #2: emoji dinámico desde OPERATIONAL_STATUS_META */}
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: statusMeta.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          }}>
            {statusMeta.emoji ?? '⚙️'}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{profile.full_name ?? 'Yo'}</div>
            <div style={{ fontSize: 13, color: statusMeta.color, fontWeight: 600 }}>
              {statusMeta.label}
            </div>
          </div>
          <button
            onClick={() => setShowSelector(v => !v)}
            style={{ marginLeft: 'auto', border: '1px solid #E2E8F0', background: '#fff', borderRadius: 10, padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}
          >
            Cambiar
          </button>
        </div>
        {showSelector && (
          <OperationalStatusSelector
            current={profile.operational_status as OperationalStatus}
            onClose={() => setShowSelector(false)}
          />
        )}
        <CheckInOutButton
          operationalStatus={profile.operational_status as OperationalStatus}
          gpsConsent={!!profile.gps_consent_at}
        />
      </div>

      {/* Info de GPS para el operario */}
      <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 14, padding: '12px 14px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#166534', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <MapPin size={14} /> ¿Cómo funciona el GPS?
        </div>
        <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 12, color: '#166534', lineHeight: 1.7 }}>
          <li>Haz <strong>Check In</strong> cuando llegues a tu lugar de trabajo.</li>
          <li>Tu ubicación se registra en ese momento (no se rastrea continuamente).</li>
          <li>Haz <strong>Check Out</strong> al finalizar tu jornada.</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Vista de manager (mapa + dashboard completo) ─────────────────────────────

function ManagerMapView() {
  const [selectedMember, setSelectedMember] = useState<TeamMapMember | null>(null);
  const dashQ = useOperationalDashboard();
  const d = dashQ.data;

  if (dashQ.isError) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#EF4444', fontWeight: 600, marginBottom: 16 }}>
          Error al cargar el mapa operativo
        </div>
        <button onClick={() => dashQ.refetch()}
          style={{ border: 'none', background: '#7C3AED', color: '#fff', padding: '10px 20px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* FIX #3: KPIs completos — los 5 estados operativos + métricas del día */}
      {d && (
        <>
          {/* Fila 1: estados en campo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            <KpiCard
              value={d.en_campo}
              label="En campo"
              color="#2563EB" bg="#EFF6FF"
              icon={<Navigation size={14} />}
            />
            <KpiCard
              value={d.team_status?.disponible ?? 0}
              label="Disponibles"
              color="#16A34A" bg="#F0FDF4"
              icon={<CheckCircle2 size={14} />}
            />
            <KpiCard
              value={d.team_status?.off ?? 0}
              label="Desconectados"
              color="#64748B" bg="#F8FAFC"
              icon={<Users size={14} />}
            />
          </div>
          {/* Fila 2: métricas del día */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            <KpiCard
              value={d.checkins_hoy}
              label="Check Ins hoy"
              color="#0891B2" bg="#ECFEFF"
              icon={<MapPin size={14} />}
            />
            <KpiCard
              value={d.ot_activas}
              label="OTs activas"
              color="#7C3AED" bg="#F5F3FF"
              icon={<ClipboardList size={14} />}
            />
            <KpiCard
              value={d.ot_finalizadas_hoy}
              label="OTs hoy"
              color="#D97706" bg="#FFFBEB"
              icon={<CheckCircle2 size={14} />}
            />
          </div>
        </>
      )}

      {/* Mapa */}
      <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
        <div style={{ padding: '12px 14px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Map size={16} color="#2563EB" />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>Equipo en campo</span>
          </div>
          <button
            onClick={() => dashQ.refetch()}
            disabled={dashQ.isFetching}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', padding: 4 }}
          >
            <RefreshCw size={14} style={{ animation: dashQ.isFetching ? 'spin .8s linear infinite' : 'none' }} />
          </button>
        </div>
        <OperationalMap onMemberClick={(m) => setSelectedMember(m)} />
      </div>

      {/* Lista de miembros en campo */}
      {(d?.miembros_en_campo?.length ?? 0) > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>
            En campo ahora ({d!.miembros_en_campo.length})
          </div>
          {d!.miembros_en_campo.map(m => {
            const meta = OPERATIONAL_STATUS_META[m.operational_status as OperationalStatus] ?? OPERATIONAL_STATUS_META['off'];
            const minsAgo = m.location_updated
              ? Math.floor((Date.now() - new Date(m.location_updated).getTime()) / 60_000)
              : null;
            return (
              <button
                key={m.user_id}
                onClick={() => setSelectedMember(m)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #F1F5F9' }}
              >
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: meta.bg, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                  {(m.full_name ?? '?').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>{m.full_name ?? 'Sin nombre'}</div>
                  <div style={{ fontSize: 12, color: meta.color, fontWeight: 600 }}>{meta.label}</div>
                  {m.work_order_title && (
                    <div style={{ fontSize: 11.5, color: '#94A3B8' }}>{m.work_order_number} — {m.work_order_title}</div>
                  )}
                </div>
                <div style={{ flexShrink: 0, fontSize: 11, color: '#94A3B8', textAlign: 'right' }}>
                  {minsAgo !== null ? (minsAgo < 1 ? 'Ahora' : `${minsAgo}min`) : '—'}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Sin miembros en campo */}
      {(d?.miembros_en_campo?.length ?? 0) === 0 && !dashQ.isLoading && (
        <div style={{ background: '#fff', borderRadius: 16, padding: '24px 16px', boxShadow: '0 2px 8px rgba(0,0,0,.06)', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🗺️</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>Sin equipo en campo</div>
          <div style={{ fontSize: 12.5, color: '#94A3B8' }}>Los operarios con check-in activo aparecerán aquí.</div>
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
  const navigate     = useNavigate();
  const { profile }  = useWorkspace();
  const featureQ     = useFeatureAccess('gps_enabled');
  const isManager    = canViewFullTeam(profile.role);

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 80 }}>
      {/* Header sticky */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #F1F5F9',
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10,
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#0F172A' }}>
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Map size={18} color="#2563EB" /> Mapa Operativo
          </div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 1 }}>
            {isManager ? 'Ubicación del equipo en tiempo real' : 'Tu estado operativo y check-in'}
          </div>
        </div>
      </div>

      {/* Sin acceso */}
      {featureQ.data === false && <NoAccess />}

      {/* Con acceso */}
      {featureQ.data !== false && (
        isManager ? <ManagerMapView /> : <MyStatusView />
      )}
    </div>
  );
}
