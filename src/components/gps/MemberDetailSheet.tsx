/**
 * MemberDetailSheet — Detalle de un miembro con ubicación y OTs activas.
 * Owner/admin/supervisor: cualquier miembro.
 * Comercial/operario: solo sí mismo.
 */
import { Phone, MapPin, Briefcase, Clock, ChevronRight } from 'lucide-react';
import { useMemberDetail } from '../../hooks/useGPS';
import { OPERATIONAL_STATUS_META, ROLE_META, formatLastSeen } from '../../services/gps';
import type { TeamMapMember } from '../../lib/database.types';

interface Props {
  member:   TeamMapMember;
  onClose:  () => void;
}

export function MemberDetailSheet({ member, onClose }: Props) {
  const detailQ = useMemberDetail(member.user_id);
  const meta    = OPERATIONAL_STATUS_META[member.operational_status];
  const roleMeta = ROLE_META[member.role] ?? ROLE_META['operario'];
  const initials = (member.full_name ?? member.email ?? '?').charAt(0).toUpperCase();

  const detail = detailQ.data;
  const activeWOs = detail?.active_work_orders ?? [];
  const recentGps = detail?.recent_gps_events  ?? [];

  const GPS_EVENT_LABELS: Record<string, string> = {
    check_in:     '📍 Check In',
    check_out:    '🏁 Check Out',
    status_change:'🔄 Cambio de estado',
    manual_update:'📌 Ubicación manual',
  };

  function fmtTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString('es-CO', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(15,23,42,.45)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 75,
        background: '#fff', borderRadius: '20px 20px 0 0',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
        boxShadow: '0 -8px 40px rgba(15,23,42,.15)',
        maxHeight: '82dvh', display: 'flex', flexDirection: 'column',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#E2E8F0' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '4px 20px 16px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: '1px solid #F1F5F9' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
            background: meta.color, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 20, border: '3px solid #fff',
            boxShadow: `0 0 0 3px ${meta.dotColor}`,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>{member.full_name ?? 'Sin nombre'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: roleMeta.bg, color: roleMeta.color }}>
                {roleMeta.label}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: meta.bg, color: meta.color }}>
                {meta.label}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#F1F5F9', borderRadius: 10, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748B', fontSize: 18 }}>
            ✕
          </button>
        </div>

        {/* Contenido scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>

          {/* Contacto */}
          {(member.phone || member.email) && (
            <div style={{ background: '#F8FAFC', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
              {member.phone && (
                <a href={`tel:${member.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: member.email ? 8 : 0 }}>
                  <Phone size={15} color="#2563EB" />
                  <span style={{ fontSize: 13.5, color: '#2563EB', fontWeight: 600 }}>{member.phone}</span>
                </a>
              )}
              {member.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 14 }}>✉️</span>
                  <span style={{ fontSize: 13, color: '#64748B' }}>{member.email}</span>
                </div>
              )}
            </div>
          )}

          {/* Última ubicación */}
          <div style={{ background: '#F8FAFC', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <MapPin size={15} color={member.latitude ? '#16A34A' : '#94A3B8'} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#374151' }}>Última ubicación</span>
            </div>
            {member.latitude ? (
              <div>
                <div style={{ fontSize: 12, color: '#64748B' }}>
                  {member.latitude.toFixed(5)}, {member.longitude?.toFixed(5)}
                </div>
                <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 2 }}>
                  {formatLastSeen(member.location_updated)}
                  {member.accuracy_meters && ` · ±${Math.round(member.accuracy_meters)}m`}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: '#94A3B8' }}>Sin ubicación registrada</div>
            )}
          </div>

          {/* OTs activas */}
          {activeWOs.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 8, textTransform: 'uppercase', letterSpacing: .4 }}>
                OTs asignadas
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeWOs.map(wo => (
                  <div key={wo.id} style={{ background: '#F8FAFC', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Briefcase size={16} color="#2563EB" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {wo.title}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#64748B' }}>
                        {wo.work_order_number} · {wo.order_number}
                      </div>
                    </div>
                    <ChevronRight size={14} color="#CBD5E1" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Historial GPS */}
          {recentGps.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 8, textTransform: 'uppercase', letterSpacing: .4 }}>
                Actividad GPS reciente
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {recentGps.slice(0, 8).map((e, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < Math.min(recentGps.length, 8) - 1 ? '1px solid #F1F5F9' : 'none' }}>
                    <Clock size={13} color="#94A3B8" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#374151' }}>
                        {GPS_EVENT_LABELS[e.event_type] ?? e.event_type}
                      </span>
                      {e.operational_status && (
                        <span style={{ marginLeft: 6, fontSize: 11, color: '#94A3B8' }}>
                          → {OPERATIONAL_STATUS_META[e.operational_status as keyof typeof OPERATIONAL_STATUS_META]?.label ?? e.operational_status}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: '#94A3B8', flexShrink: 0 }}>
                      {fmtTime(e.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {detailQ.isLoading && (
            <div style={{ textAlign: 'center', padding: 20, color: '#94A3B8', fontSize: 13 }}>Cargando...</div>
          )}
        </div>
      </div>
    </>
  );
}
