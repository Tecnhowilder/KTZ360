/**
 * AsistenciaPage — Control de asistencia operarios
 *
 * Roles:
 *   - operario / supervisor: solo ven y registran su propia asistencia del día
 *   - owner / admin: ven todo el equipo + historial
 *
 * Flujo del día:
 *   Ingreso → Inicio almuerzo → Fin almuerzo → Salida
 *   No se permite saltar pasos ni repetir eventos del mismo tipo.
 *
 * Zero Trust: workspace_id del JWT. Toda validación en RPC.
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Coffee, LogIn, LogOut, CheckCircle2, AlertCircle, Users } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useToast } from '../components/ui/Toast';
import { supabase } from '../lib/supabaseClient';
import { useRealtimeSubscription } from '../lib/realtimeManager';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AttendanceRecord {
  id:             string;
  user_id:        string;
  date:           string;
  check_in_at:    string | null;
  lunch_start_at: string | null;
  lunch_end_at:   string | null;
  check_out_at:   string | null;
  hours_worked:   number | null;
  lunch_minutes:  number | null;
  status:         string;
  user_name?:     string;
  user_role?:     string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function fmtHours(h: number | null): string {
  if (h === null) return '—';
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}h ${mm}m`;
}

const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  pending:  { color: '#92400E', bg: '#FEF3C7', label: 'Pendiente' },
  present:  { color: '#166534', bg: '#DCFCE7', label: 'Presente'  },
  partial:  { color: '#1E40AF', bg: '#DBEAFE', label: 'Parcial'   },
  absent:   { color: '#9F1239', bg: '#FFE4E6', label: 'Ausente'   },
  late:     { color: '#D97706', bg: '#FEF3C7', label: 'Tarde'     },
};

// ─── Tarjeta de estado personal ───────────────────────────────────────────────

function MyDayCard({ record, onEvent, loading }: {
  record: AttendanceRecord | null;
  onEvent: (event: string) => void;
  loading: boolean;
}) {
  const now = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

  const canCheckIn    = !record?.check_in_at;
  const canLunchStart = !!record?.check_in_at && !record?.lunch_start_at;
  const canLunchEnd   = !!record?.lunch_start_at && !record?.lunch_end_at;
  const canCheckOut   = !!record?.check_in_at && !record?.check_out_at;

  const events = [
    { id: 'check_in',    icon: LogIn,    label: 'Registrar ingreso',     can: canCheckIn,    color: '#16A34A', bg: '#F0FDF4', value: record?.check_in_at },
    { id: 'lunch_start', icon: Coffee,   label: 'Inicio almuerzo',       can: canLunchStart, color: '#D97706', bg: '#FFFBEB', value: record?.lunch_start_at },
    { id: 'lunch_end',   icon: Coffee,   label: 'Fin almuerzo',          can: canLunchEnd,   color: '#2563EB', bg: '#EFF6FF', value: record?.lunch_end_at },
    { id: 'check_out',   icon: LogOut,   label: 'Registrar salida',      can: canCheckOut,   color: '#DC2626', bg: '#FEF2F2', value: record?.check_out_at },
  ];

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.06)', marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Mi asistencia hoy</div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2, textTransform: 'capitalize' }}>{now}</div>
        </div>
        {record && (
          <span style={{ fontSize: 11, fontWeight: 700, ...STATUS_STYLE[record.status], padding: '3px 10px', borderRadius: 99 }}>
            {STATUS_STYLE[record.status]?.label ?? record.status}
          </span>
        )}
      </div>

      {/* Grid de eventos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {events.map(ev => {
          const Ic = ev.icon;
          const done = !!ev.value;
          return (
            <button
              key={ev.id}
              onClick={() => ev.can && !loading && onEvent(ev.id)}
              disabled={!ev.can || loading}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                padding: '12px 14px', borderRadius: 12, border: 'none', cursor: ev.can ? 'pointer' : 'default',
                background: done ? ev.bg : '#F8FAFC',
                opacity: !ev.can && !done ? 0.45 : 1,
                fontFamily: 'inherit',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Ic size={16} color={done ? ev.color : '#94A3B8'} />
                {done && <CheckCircle2 size={12} color={ev.color} />}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: done ? ev.color : '#64748B' }}>{ev.label}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: done ? ev.color : '#CBD5E1', marginTop: 2 }}>
                {done ? fmtTime(ev.value!) : ev.can ? 'Tocar para registrar' : '—'}
              </div>
            </button>
          );
        })}
      </div>

      {/* Resumen si hay check out */}
      {record?.check_out_at && (
        <div style={{ marginTop: 14, background: '#F0FDF4', borderRadius: 12, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 700 }}>HORAS TRABAJADAS</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#166534' }}>{fmtHours(record.hours_worked)}</div>
          </div>
          {record.lunch_minutes != null && record.lunch_minutes > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#D97706', fontWeight: 700 }}>ALMUERZO</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#92400E' }}>{record.lunch_minutes}min</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Fila de registro de equipo ───────────────────────────────────────────────

function TeamAttendanceRow({ record }: { record: AttendanceRecord }) {
  const initials = (name?: string) => (name ?? '?').trim().charAt(0).toUpperCase();
  const st = STATUS_STYLE[record.status] ?? { color: '#94A3B8', bg: '#F1F5F9', label: record.status };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #F8FAFC' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#7C3AED', flexShrink: 0 }}>
        {initials(record.user_name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {record.user_name ?? 'Usuario'}
        </div>
        <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 1 }}>
          {record.check_in_at ? `Ingreso: ${fmtTime(record.check_in_at)}` : 'Sin ingreso'}
          {record.check_out_at ? ` · Salida: ${fmtTime(record.check_out_at)}` : ''}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: st.color, background: st.bg, padding: '2px 8px', borderRadius: 99 }}>
          {st.label}
        </span>
        {record.hours_worked != null && (
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#374151', marginTop: 3 }}>
            {fmtHours(record.hours_worked)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AsistenciaPage ───────────────────────────────────────────────────────────

type Period = 'today' | 'week' | 'month';

function getPeriodDates(period: Period): { from: string; to: string } {
  const now  = new Date();
  const to   = now.toISOString().split('T')[0];
  if (period === 'today') return { from: to, to };
  if (period === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 6);
    return { from: d.toISOString().split('T')[0], to };
  }
  const d = new Date(now); d.setDate(d.getDate() - 29);
  return { from: d.toISOString().split('T')[0], to };
}

export function AsistenciaPage() {
  const navigate       = useNavigate();
  const { profile }    = useWorkspace();
  const { showToast }  = useToast();
  const qc             = useQueryClient();
  const [period, setPeriod] = useState<Period>('today');

  const isManager = ['owner', 'admin', 'supervisor'].includes(profile.role);

  // Mi asistencia hoy
  const myDayQ = useQuery({
    queryKey: ['my-attendance-today', profile.id],
    queryFn:  async () => {
      const { data, error } = await (supabase as any).rpc('get_today_attendance');
      if (error) throw error;
      return (data?.record ?? null) as AttendanceRecord | null;
    },
    staleTime: 30_000,
  });

  // Asistencia del equipo con período seleccionable
  const { from: dateFrom, to: dateTo } = getPeriodDates(period);
  const teamQ = useQuery({
    queryKey: ['team-attendance', dateFrom, dateTo],
    queryFn:  async () => {
      const { data, error } = await (supabase as any).rpc('get_attendance', {
        p_date_from: dateFrom,
        p_date_to:   dateTo,
        p_user_id:   null,
      });
      if (error) throw error;
      return (data?.records ?? []) as AttendanceRecord[];
    },
    enabled:   isManager,
    staleTime: 60_000,
  });

  // Realtime: mantener datos frescos sin polling
  const onMyAttendanceChange = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['my-attendance-today', profile.id] });
  }, [qc, profile.id]);

  const onTeamAttendanceChange = useCallback(() => {
    if (isManager) qc.invalidateQueries({ queryKey: ['team-attendance'] });
  }, [qc, isManager]);

  useRealtimeSubscription(
    `attendance_records:${profile.id}`,
    { table: 'attendance_records', event: '*', filter: `user_id=eq.${profile.id}` },
    onMyAttendanceChange,
  );

  // Canal workspace-level para cambios del equipo (solo managers)
  useRealtimeSubscription(
    isManager ? `attendance_records_team:${profile.workspace_id}` : null,
    { table: 'attendance_records', event: '*', filter: `workspace_id=eq.${profile.workspace_id}` },
    onTeamAttendanceChange,
    isManager,
  );

  const eventMut = useMutation({
    mutationFn: async (event: string) => {
      const { data, error } = await (supabase as any).rpc('record_attendance', { p_event: event });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? 'Error al registrar');
      return data.record as AttendanceRecord;
    },
    onSuccess: (record) => {
      qc.setQueryData(['my-attendance-today', profile.id], record);
      if (isManager) qc.invalidateQueries({ queryKey: ['team-attendance'] });
      const labels: Record<string, string> = {
        check_in:    'Ingreso registrado ✓',
        lunch_start: 'Inicio de almuerzo ✓',
        lunch_end:   'Fin de almuerzo ✓',
        check_out:   'Salida registrada ✓',
      };
      showToast(labels[eventMut.variables ?? ''] ?? 'Registrado ✓');
    },
    onError: (err: any) => showToast(err.message ?? 'Error al registrar'),
  });

  const teamRecords = teamQ.data ?? [];
  const presentCount = teamRecords.filter(r => r.check_in_at).length;
  const absentCount  = teamRecords.filter(r => !r.check_in_at).length;

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 20 }}>
        <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
          <ArrowLeft size={22} color="#374151" />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A' }}>Control de asistencia</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>
            {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
        <Clock size={20} color="#7C3AED" />
      </div>

      <div style={{ padding: '14px 16px 0' }}>

        {/* Mi tarjeta de hoy */}
        {myDayQ.isLoading ? (
          <div style={{ background: '#fff', borderRadius: 16, padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>Cargando...</div>
        ) : (
          <MyDayCard
            record={myDayQ.data ?? null}
            onEvent={(ev) => eventMut.mutate(ev)}
            loading={eventMut.isPending}
          />
        )}

        {/* Vista del equipo (solo managers) */}
        {isManager && (
          <div>
            {/* Selector de período */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {([
                { key: 'today', label: 'Hoy'  },
                { key: 'week',  label: 'Semana' },
                { key: 'month', label: 'Mes'  },
              ] as const).map(p => (
                <button key={p.key} onClick={() => setPeriod(p.key)}
                  style={{ padding: '6px 14px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: period === p.key ? 700 : 500, fontSize: 13, background: period === p.key ? '#7C3AED' : '#F1F5F9', color: period === p.key ? '#fff' : '#475569' }}>
                  {p.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={16} color="#7C3AED" />
                Equipo — {period === 'today' ? 'hoy' : period === 'week' ? 'últimos 7 días' : 'últimos 30 días'}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#16A34A', background: '#F0FDF4', padding: '3px 8px', borderRadius: 99 }}>
                  {presentCount} registros
                </span>
              </div>
            </div>

            {teamQ.isLoading ? (
              <div style={{ background: '#fff', borderRadius: 14, padding: '20px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Cargando equipo...</div>
            ) : teamRecords.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 14, padding: '28px 20px', textAlign: 'center' }}>
                <AlertCircle size={28} color="#CBD5E1" style={{ marginBottom: 10 }} />
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Sin registros en este período</div>
                <div style={{ fontSize: 13, color: '#94A3B8' }}>Los operarios aún no han registrado su ingreso.</div>
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
                {teamRecords.map(r => <TeamAttendanceRow key={r.id} record={r} />)}
              </div>
            )}

            {/* Resumen del día */}
            {teamRecords.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 14 }}>
                {[
                  { label: 'Presentes',     value: presentCount,                                                         color: '#16A34A', bg: '#F0FDF4' },
                  { label: 'Hrs promedio',  value: teamRecords.filter(r=>r.hours_worked).length > 0 ? fmtHours(teamRecords.filter(r=>r.hours_worked).reduce((a,r)=>a+(r.hours_worked??0),0)/teamRecords.filter(r=>r.hours_worked).length) : '—', color: '#7C3AED', bg: '#F5F3FF' },
                  { label: 'Ausentes',      value: absentCount,                                                          color: '#DC2626', bg: '#FEF2F2' },
                ].map(k => (
                  <div key={k.label} style={{ background: '#fff', borderRadius: 12, padding: '10px 12px', border: `1px solid ${k.bg}` }}>
                    <div style={{ fontSize: 17, fontWeight: 900, color: k.color }}>{k.value}</div>
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{k.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
