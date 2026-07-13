/**
 * OperarioDashboard — Dashboard dedicado para el rol Operario
 *
 * Muestra exclusivamente lo que el operario necesita:
 *   1. Registro rápido de asistencia del día
 *   2. OTs asignadas para hoy
 *   3. Estado GPS / ubicación
 *   4. Acceso rápido a evidencias
 *
 * Todo usa datos reales de Supabase vía React Query.
 * Sin mock data, sin hardcodes.
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRealtimeSubscription } from '../../lib/realtimeManager';
import {
  LogIn, LogOut, Coffee, Clock, Wrench, MapPin,
  ChevronRight, Camera, AlertCircle, CheckCircle2,
  Package,
} from 'lucide-react';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useToast } from '../ui/Toast';
import { useWorkOrders } from '../../hooks/useWorkOrders';
import { supabase } from '../../lib/supabaseClient';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

const WO_STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  pendiente:   { label: 'Pendiente',   color: '#92400E', bg: '#FEF3C7' },
  asignada:    { label: 'Asignada',    color: '#1E40AF', bg: '#DBEAFE' },
  en_progreso: { label: 'En progreso', color: '#166534', bg: '#DCFCE7' },
  pausada:     { label: 'Pausada',     color: '#6B21A8', bg: '#F3E8FF' },
  finalizada:  { label: 'Finalizada',  color: '#065F46', bg: '#D1FAE5' },
  cancelada:   { label: 'Cancelada',   color: '#9F1239', bg: '#FFE4E6' },
};

// ─── AttendanceCard (mini) ────────────────────────────────────────────────────

function AttendanceCard() {
  const { showToast } = useToast();
  const { profile }   = useWorkspace();
  const qc            = useQueryClient();
  const [loading, setLoading] = useState(false);

  const todayQ = useQuery({
    queryKey: ['my-attendance-today', profile.id],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc('get_today_attendance');
      return (data?.record ?? null) as null | {
        check_in_at:    string | null;
        lunch_start_at: string | null;
        lunch_end_at:   string | null;
        check_out_at:   string | null;
        hours_worked:   number | null;
        status:         string;
      };
    },
    staleTime: 30_000,
  });

  // Realtime: invalidar asistencia propia cuando otro dispositivo actualice el registro
  const onAttendanceChange = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['my-attendance-today', profile.id] });
  }, [qc, profile.id]);

  useRealtimeSubscription(
    `attendance_records:${profile.id}`,
    { table: 'attendance_records', event: '*', filter: `user_id=eq.${profile.id}` },
    onAttendanceChange,
  );

  const rec = todayQ.data;

  const EVENT_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
    check_in:    { label: 'Registrar ingreso',   icon: LogIn,    color: '#16A34A', bg: '#F0FDF4' },
    lunch_start: { label: 'Inicio almuerzo',     icon: Coffee,   color: '#D97706', bg: '#FFFBEB' },
    lunch_end:   { label: 'Fin almuerzo',        icon: Coffee,   color: '#2563EB', bg: '#EFF6FF' },
    check_out:   { label: 'Registrar salida',    icon: LogOut,   color: '#DC2626', bg: '#FEF2F2' },
  };

  // Acción primaria: check_in → (si hay almuerzo abierto: lunch_end) → check_out.
  // Almuerzo es opcional: si no se inició, el usuario puede ir directo a check_out.
  const primaryEvent = !rec?.check_in_at                              ? 'check_in'
    : rec.lunch_start_at && !rec.lunch_end_at                        ? 'lunch_end'
    : !rec.check_out_at                                              ? 'check_out'
    : null;

  // Acción secundaria: ofrecer "Inicio almuerzo" si ya hizo check_in
  // y todavía no inició almuerzo ni registró salida.
  const secondaryEvent = rec?.check_in_at && !rec.lunch_start_at && !rec.check_out_at
    ? 'lunch_start'
    : null;

  async function handleEvent(event: string) {
    if (loading) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('record_attendance', { p_event: event });
      if (error || !data?.ok) throw new Error(data?.error ?? 'Error al registrar');
      const labels: Record<string, string> = {
        check_in: 'Ingreso registrado ✓', lunch_start: 'Almuerzo iniciado ✓',
        lunch_end: 'Regreso del almuerzo ✓', check_out: 'Salida registrada ✓',
      };
      showToast(labels[event] ?? 'Registrado ✓');
      todayQ.refetch();
    } catch (e: any) { showToast(e.message ?? 'Error'); }
    finally { setLoading(false); }
  }

  const meta = primaryEvent ? EVENT_META[primaryEvent] : null;
  const secondaryMeta = secondaryEvent ? EVENT_META[secondaryEvent] : null;

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,.06)', marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={16} color="#7C3AED" />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Asistencia hoy</span>
        </div>
        {rec?.check_out_at && rec.hours_worked != null && (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#16A34A', background: '#F0FDF4', padding: '3px 10px', borderRadius: 99 }}>
            {Math.floor(rec.hours_worked)}h {Math.round((rec.hours_worked - Math.floor(rec.hours_worked)) * 60)}m
          </span>
        )}
      </div>

      {/* Timeline de eventos */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['check_in', 'lunch_start', 'lunch_end', 'check_out'] as const).map((ev, i) => {
          const done = ev === 'check_in'    ? !!rec?.check_in_at
                     : ev === 'lunch_start' ? !!rec?.lunch_start_at
                     : ev === 'lunch_end'   ? !!rec?.lunch_end_at
                     :                        !!rec?.check_out_at;
          const Ic = EVENT_META[ev].icon;
          return (
            <div key={ev} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: done ? EVENT_META[ev].bg : '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${done ? EVENT_META[ev].color : '#E2E8F0'}` }}>
                {done ? <CheckCircle2 size={14} color={EVENT_META[ev].color} /> : <Ic size={14} color="#CBD5E1" />}
              </div>
              <div style={{ fontSize: 9, color: done ? EVENT_META[ev].color : '#CBD5E1', textAlign: 'center', lineHeight: 1.2 }}>
                {done ? fmtTime(
                  i === 0 ? rec?.check_in_at ?? null
                  : i === 1 ? rec?.lunch_start_at ?? null
                  : i === 2 ? rec?.lunch_end_at ?? null
                  : rec?.check_out_at ?? null
                ) : '—'}
              </div>
              {i < 3 && <div style={{ position: 'absolute', width: 0 }} />}
            </div>
          );
        })}
      </div>

      {/* Botón primario */}
      {meta && (
        <button onClick={() => handleEvent(primaryEvent!)} disabled={loading}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 0', borderRadius: 12, border: 'none', background: meta.bg, color: meta.color, fontWeight: 700, fontSize: 14, cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit', marginBottom: secondaryMeta ? 6 : 0 }}>
          <meta.icon size={16} />
          {loading ? 'Registrando...' : meta.label}
        </button>
      )}
      {/* Botón secundario: inicio de almuerzo (opcional) */}
      {secondaryMeta && !loading && (
        <button onClick={() => handleEvent(secondaryEvent!)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '9px 0', borderRadius: 12, border: `1.5px solid ${secondaryMeta.bg}`, background: '#fff', color: secondaryMeta.color, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          <secondaryMeta.icon size={14} />
          {secondaryMeta.label}
        </button>
      )}
      {!meta && rec?.check_out_at && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0', color: '#16A34A', fontSize: 13, fontWeight: 600 }}>
          <CheckCircle2 size={16} /> Jornada completa
        </div>
      )}
    </div>
  );
}

// ─── OT Card ─────────────────────────────────────────────────────────────────

function OTCard({ wo, onPress }: { wo: any; onPress: () => void }) {
  const st = WO_STATUS_LABEL[wo.status] ?? { label: wo.status, color: '#64748B', bg: '#F1F5F9' };
  return (
    <button onClick={onPress} style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', background: '#fff', borderRadius: 14, padding: '13px 14px', boxShadow: '0 1px 4px rgba(0,0,0,.06)', display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: st.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Wrench size={18} color={st.color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wo.title}</div>
        <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 2 }}>{wo.work_order_number}</div>
        <div style={{ marginTop: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.bg, padding: '2px 8px', borderRadius: 99 }}>{st.label}</span>
        </div>
      </div>
      <ChevronRight size={16} color="#CBD5E1" />
    </button>
  );
}

// ─── OperarioDashboard ────────────────────────────────────────────────────────

export function OperarioDashboard() {
  const navigate = useNavigate();
  const { profile } = useWorkspace();

  const h = new Date().getHours();
  const greet = h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
  const firstName = (profile.full_name || '').split(' ')[0] || 'Técnico';

  // OTs asignadas al operario — activas (no finalizadas ni canceladas)
  const wosQ = useWorkOrders({});
  const myWOs = (wosQ.data ?? [])
    .filter(wo => !['finalizada', 'cancelada'].includes(wo.status))
    .slice(0, 5);

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 100 }}>

      {/* Header */}
      <div style={{ background: '#fff', padding: '16px 16px 14px', borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 2 }}>{greet},</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-.5px' }}>{firstName} 👷</div>
        <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 3 }}>
          {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>

      <div style={{ padding: '14px 16px 0' }}>

        {/* Asistencia rápida */}
        <AttendanceCard />

        {/* Acciones rápidas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <button onClick={() => navigate('/app/mapa-operativo')}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 8px', borderRadius: 14, border: 'none', background: '#fff', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MapPin size={20} color="#16A34A" />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Check In / GPS</span>
          </button>
          <button onClick={() => navigate('/app/ordenes-trabajo')}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 8px', borderRadius: 14, border: 'none', background: '#fff', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wrench size={20} color="#7C3AED" />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Mis OTs</span>
          </button>
        </div>

        {/* OTs asignadas */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>
            Trabajo pendiente
          </span>
          {myWOs.length > 0 && (
            <button onClick={() => navigate('/app/ordenes-trabajo')}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: '#7C3AED', fontWeight: 600 }}>
              Ver todas →
            </button>
          )}
        </div>

        {wosQ.isLoading ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Cargando...</div>
        ) : myWOs.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: '28px 20px', textAlign: 'center' }}>
            <CheckCircle2 size={36} color="#22C55E" style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Sin trabajo pendiente</div>
            <div style={{ fontSize: 13, color: '#94A3B8' }}>No tienes órdenes de trabajo activas por ahora.</div>
          </div>
        ) : (
          myWOs.map(wo => (
            <OTCard key={wo.id} wo={wo} onPress={() => navigate(`/app/ordenes-trabajo/${wo.id}`)} />
          ))
        )}

        {/* Pedidos asignados (si tienen feature) */}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={() => navigate('/app/pedidos')}
            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, border: '1.5px solid #E2E8F0', background: '#fff', cursor: 'pointer' }}>
            <Package size={18} color="#64748B" />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Ver mis pedidos</span>
            <ChevronRight size={14} color="#CBD5E1" style={{ marginLeft: 'auto' }} />
          </button>
        </div>

        {/* Evidencia rápida */}
        <button onClick={() => navigate('/app/ordenes-trabajo')}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, border: '1.5px solid #E2E8F0', background: '#fff', cursor: 'pointer', marginTop: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: '#FFF7ED', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Camera size={18} color="#D97706" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Subir evidencias</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>Fotos, videos y firmas del trabajo</div>
          </div>
          <ChevronRight size={16} color="#CBD5E1" />
        </button>

        {/* Reportar novedad */}
        <button onClick={() => navigate('/app/ordenes-trabajo')}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, border: '1.5px solid #E2E8F0', background: '#fff', cursor: 'pointer', marginTop: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertCircle size={18} color="#DC2626" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Reportar novedad</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>Incidentes, retrasos o cambios</div>
          </div>
          <ChevronRight size={16} color="#CBD5E1" />
        </button>

      </div>
    </div>
  );
}
