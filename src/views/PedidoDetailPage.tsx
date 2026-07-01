/**
 * PedidoDetailPage — Flujo operativo completo de un pedido.
 *
 * Incluye:
 * - Detección de pedido directo (quote_id null) → no muestra snapshot
 * - Técnico asignado con sheet de asignación
 * - Línea de tiempo visual del flujo operativo
 * - Estados extendidos: pendiente→asignado→programado→en_ruta→en_sitio→en_ejecucion→pausado→finalizado→facturado
 * - Novedades (texto + foto) integradas a la bitácora
 * - Evidencias clasificadas por fase (Antes / Durante / Después)
 * - GPS: link al mapa operativo del técnico asignado
 *
 * Zero Trust: workspace_id del JWT. Toda validación en backend.
 */
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Package, ChevronDown, MessageSquare,
  User, FileText, CheckCircle2, MapPin, UserCheck, Camera,
  Clock, Truck, Home, Wrench, CircleDot, X, UserPlus, Users,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOrderDetail, useUpdateOrderStatus } from '../hooks/useOrders';
import { useCreateWorkOrder, useAddWorkLogComment } from '../hooks/useWorkOrders';
import { EvidenceGallery } from '../components/evidences/EvidenceGallery';
import { EvidenceUploader } from '../components/evidences/EvidenceUploader';
import { SyncedDocsList } from '../components/evidences/SyncedDocsList';
import { useToast } from '../components/ui/Toast';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useUI } from '../features/app/UIProvider';
import { formatCurrencyCOP } from '../lib/currency';
import { supabase } from '../lib/supabaseClient';
import { inviteTeamMember } from '../services/team';
import { isValidEmail, isValidPhone } from '../lib/validation';
import {
  ORDER_STATUS_LABELS, ORDER_STATUS_COLORS,
  WO_STATUS_LABELS, WO_STATUS_COLORS, PRIORITY_COLORS, PRIORITY_LABELS,
} from '../services/workOrders';

// ─── Flujo operativo extendido ────────────────────────────────────────────────

const ORDER_TRANSITIONS: Record<string, string[]> = {
  pendiente:    ['asignado', 'programado', 'cancelado'],
  asignado:     ['programado', 'cancelado'],
  programado:   ['en_ruta', 'en_ejecucion', 'cancelado'],
  en_ruta:      ['en_sitio', 'cancelado'],
  en_sitio:     ['en_ejecucion', 'cancelado'],
  en_ejecucion: ['pausado', 'finalizado', 'cancelado'],
  pausado:      ['en_ejecucion', 'cancelado'],
  finalizado:   ['facturado'],
  facturado:    [],
  cancelado:    [],
};

// Íconos para cada estado del flujo
const FLOW_ICONS: Record<string, React.ElementType> = {
  pendiente:    Clock,
  asignado:     UserCheck,
  programado:   Clock,
  en_ruta:      Truck,
  en_sitio:     Home,
  en_ejecucion: Wrench,
  pausado:      CircleDot,
  finalizado:   CheckCircle2,
  facturado:    CheckCircle2,
};

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function WOCard({ wo, onPress }: { wo: any; onPress: () => void }) {
  const sc = WO_STATUS_COLORS[wo.status] ?? { color: '#64748B', bg: '#F1F5F9' };
  const pc = PRIORITY_COLORS[wo.priority] ?? { color: '#64748B', bg: '#F1F5F9' };
  return (
    <button onClick={onPress} style={{
      width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
      background: '#F8FAFC', borderRadius: 12, padding: '12px 14px',
      display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: sc.bg, color: sc.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Package size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0F172A', marginBottom: 3 }}>{wo.title}</div>
        <div style={{ fontSize: 11.5, color: '#94A3B8', marginBottom: 5 }}>
          {wo.work_order_number}
          {wo.assigned_name ? ` · ${wo.assigned_name}` : ' · Sin asignar'}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: sc.bg, color: sc.color }}>
            {WO_STATUS_LABELS[wo.status]}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: pc.bg, color: pc.color }}>
            {PRIORITY_LABELS[wo.priority]}
          </span>
        </div>
      </div>
      <ChevronDown size={14} color="#CBD5E1" style={{ marginTop: 4 }} />
    </button>
  );
}

function LogEntry({ log }: { log: any }) {
  const icons: Record<string, string> = {
    order_created:              '📦',
    order_status_changed:       '🔄',
    order_assigned:             '👤',
    work_order_created:         '🔧',
    work_order_status_changed:  '🔄',
    work_order_assigned:        '👤',
    comment:                    '💬',
    novedad:                    '📋',
    completed:                  '✅',
    evidence_uploaded:          '📷',
  };
  const isNovedad = log.event_type === 'novedad';
  return (
    <div style={{ display: 'flex', gap: 10, paddingBottom: 12, borderBottom: '1px solid #F1F5F9' }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0, fontSize: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isNovedad ? '#FFF7ED' : '#F1F5F9',
        border: isNovedad ? '1.5px solid #FED7AA' : 'none',
      }}>
        {icons[log.event_type] ?? '📋'}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, color: '#0F172A', fontWeight: 600 }}>
          {isNovedad ? '⚠️ Novedad' : (log.user_name ?? 'Sistema')}
          {!isNovedad && log.from_status && log.to_status && (
            <span style={{ fontWeight: 400, color: '#64748B' }}>
              {' '}{ORDER_STATUS_LABELS[log.from_status] ?? log.from_status} → {ORDER_STATUS_LABELS[log.to_status] ?? log.to_status}
            </span>
          )}
        </div>
        {isNovedad && (
          <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 2 }}>{log.user_name ?? ''}</div>
        )}
        {log.note && (
          <div style={{ fontSize: 12, color: isNovedad ? '#92400E' : '#64748B', marginTop: 2, background: isNovedad ? '#FFF7ED' : 'transparent', padding: isNovedad ? '6px 8px' : 0, borderRadius: isNovedad ? 8 : 0 }}>
            {log.note}
          </div>
        )}
        <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 3 }}>
          {new Date(log.created_at).toLocaleString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

// ─── Línea de tiempo ──────────────────────────────────────────────────────────

function OrderTimeline({ currentStatus }: { currentStatus: string }) {
  const mainFlow = ['pendiente', 'asignado', 'programado', 'en_ruta', 'en_sitio', 'en_ejecucion', 'finalizado', 'facturado'];
  const currentIdx = mainFlow.indexOf(currentStatus);
  const isCanceled = currentStatus === 'cancelado';

  if (isCanceled) {
    return (
      <div style={{ margin: '0 16px 14px', background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <X size={16} color="#E11D48" />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#E11D48' }}>Pedido cancelado</span>
      </div>
    );
  }

  return (
    <div style={{ margin: '0 16px 14px', background: '#fff', border: '1px solid #F1F5F9', borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '.5px', marginBottom: 12 }}>PROGRESO</div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 4 }}>
        {mainFlow.map((status, i) => {
          const isDone   = i < currentIdx;
          const isActive = i === currentIdx;
          const Ic       = FLOW_ICONS[status] ?? CircleDot;
          const clr      = ORDER_STATUS_COLORS[status] ?? { color: '#94A3B8', bg: '#F1F5F9' };
          return (
            <div key={status} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 52 }}>
              {/* Dot + line */}
              <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                {i > 0 && (
                  <div style={{ flex: 1, height: 2, background: isDone || isActive ? clr.color : '#E2E8F0', marginRight: -1 }} />
                )}
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isActive ? clr.color : isDone ? '#22C55E' : '#F1F5F9',
                  border: isActive ? `2px solid ${clr.color}` : isDone ? '2px solid #22C55E' : '2px solid #E2E8F0',
                  boxShadow: isActive ? `0 0 0 3px ${clr.bg}` : 'none',
                  zIndex: 1,
                }}>
                  {isDone
                    ? <CheckCircle2 size={14} color="#fff" />
                    : <Ic size={12} color={isActive ? '#fff' : '#94A3B8'} />}
                </div>
                {i < mainFlow.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: isDone ? '#22C55E' : '#E2E8F0', marginLeft: -1 }} />
                )}
              </div>
              {/* Label */}
              <div style={{ fontSize: 9, fontWeight: isActive ? 700 : 500, color: isActive ? clr.color : isDone ? '#22C55E' : '#94A3B8', marginTop: 5, textAlign: 'center', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                {ORDER_STATUS_LABELS[status]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Roles y labels ──────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador', supervisor: 'Supervisor',
  comercial: 'Comercial', operario: 'Operario',
};

// ─── Mini-modal: invitar nuevo miembro del equipo ────────────────────────────

const SPECIALTIES_MINI = [
  { value: 'electricista',         label: 'Electricista' },
  { value: 'cctv',                 label: 'CCTV' },
  { value: 'redes',                label: 'Redes' },
  { value: 'fibra_optica',         label: 'Fibra óptica' },
  { value: 'paneles_solares',      label: 'Paneles solares' },
  { value: 'aires_acondicionados', label: 'Aires AC' },
  { value: 'plomeria',             label: 'Plomería' },
  { value: 'soldadura',            label: 'Soldadura' },
  { value: 'mantenimiento',        label: 'Mantenimiento' },
  { value: 'otro',                 label: 'Otro' },
];

function InviteMemberMiniSheet({
  open, workspaceId, inviterName, onClose, onInvited,
}: {
  open: boolean;
  workspaceId: string;
  inviterName: string;
  onClose: () => void;
  onInvited: (name: string) => void;
}) {
  const navigate             = useNavigate();
  const { showToast }        = useToast();
  const { openUpgradeModal } = useUI();
  const [fullName,   setFullName]   = useState('');
  const [email,      setEmail]      = useState('');
  const [phone,      setPhone]      = useState('');
  const [city,       setCity]       = useState('');
  const [profession, setProfession] = useState('');
  const [specialty,  setSpecialty]  = useState('');
  const [role,       setRole]       = useState<'operario' | 'supervisor' | 'admin' | 'comercial'>('operario');
  const [loading,    setLoading]    = useState(false);

  function reset() {
    setFullName(''); setEmail(''); setPhone(''); setCity('');
    setProfession(''); setSpecialty(''); setRole('operario');
  }

  const phoneErr = phone.trim() && !isValidPhone(phone) ? 'Teléfono inválido' : null;
  const canSubmit = fullName.trim().length >= 2
    && isValidEmail(email)
    && phone.trim().length >= 7
    && city.trim().length >= 2
    && !phoneErr;

  async function handleInvite() {
    if (!canSubmit || loading) return;
    setLoading(true);
    try {
      const result = await inviteTeamMember({
        workspaceId,
        email:       email.trim().toLowerCase(),
        role,
        fullName:    fullName.trim(),
        phone:       phone.trim()      || undefined,
        city:        city.trim()       || undefined,
        profession:  profession.trim() || undefined,
        specialty:   specialty         || undefined,
        inviterName,
        workspaceName: 'tu equipo',
      });

      if (result.emailSent) {
        showToast(`Invitación enviada a ${email.trim()} ✓`);
      } else {
        // Invitación creada en DB pero email no pudo enviarse
        // El usuario puede compartir el link manualmente desde la sección Equipo
        showToast(`${fullName.trim()} invitado. Comparte el enlace desde Equipo → Invitaciones.`);
      }

      reset();
      onInvited(fullName.trim());
    } catch (e: any) {
      const msg: string = e?.message ?? '';
      if (msg.includes('seat_limit_exceeded')) {
        // Ir directamente a la página de compra de cupos adicionales
        onClose();
        reset();
        navigate('/app/team/adicionales');
      } else if (msg.includes('feature_not_available')) {
        openUpgradeModal({
          title:      'Equipo — Plan PREMIUM',
          message:    'Agrega miembros al equipo con el plan PREMIUM.',
          targetPlan: 'premium',
          ctaLabel:   'Actualizar a PREMIUM',
        });
      } else if (msg.includes('invitation_already_pending')) {
        showToast('Ya existe una invitación pendiente para ese correo.');
      } else if (msg.includes('user_already_in_workspace')) {
        showToast('Este usuario ya pertenece al equipo.');
      } else if (msg.includes('rate_limit_exceeded')) {
        showToast('Límite de invitaciones alcanzado. Espera unos minutos.');
      } else {
        showToast(msg || 'Error al crear la invitación');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div onClick={() => { onClose(); reset(); }} aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 66, background: 'rgba(0,0,0,.5)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity .2s' }} />
      <div role="dialog" aria-modal="true" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 67,
        background: '#fff', borderRadius: '20px 20px 0 0',
        boxShadow: '0 -8px 40px rgba(0,0,0,.2)',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform .28s cubic-bezier(.4,0,.2,1)',
        maxHeight: '85vh', overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#E2E8F0' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px 16px' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Nuevo miembro del equipo</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>Se crea una invitación. El correo se envía si está configurado.</div>
          </div>
          <button onClick={() => { onClose(); reset(); }} style={{ border: 'none', background: '#F1F5F9', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="#374151" />
          </button>
        </div>

        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Nombre */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>Nombre completo *</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Juan García"
              style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>

          {/* Email */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>Correo electrónico *</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="juan@empresa.com"
              style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>

          {/* Teléfono */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>Teléfono *</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" placeholder="+57 300 000 0000"
              style={{ width: '100%', border: `1.5px solid ${phoneErr ? '#FCA5A5' : '#E2E8F0'}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            {phoneErr && <div style={{ fontSize: 11, color: '#DC2626', marginTop: 4 }}>{phoneErr}</div>}
          </div>

          {/* Ciudad */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>Ciudad *</label>
            <input value={city} onChange={e => setCity(e.target.value)} placeholder="Bogotá, Medellín, Cali..."
              style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>

          {/* Profesión */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>Profesión</label>
            <input value={profession} onChange={e => setProfession(e.target.value)} placeholder="Ej: Técnico electricista"
              style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>

          {/* Especialidad */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 8 }}>
              Especialidad <span style={{ fontWeight: 400, color: '#94A3B8' }}>(para asignación automática)</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SPECIALTIES_MINI.map(s => {
                const sel = specialty === s.value;
                return (
                  <button key={s.value} onClick={() => setSpecialty(sel ? '' : s.value)}
                    style={{ padding: '5px 11px', borderRadius: 99, border: `1.5px solid ${sel ? '#7C3AED' : '#E2E8F0'}`, background: sel ? '#F5F3FF' : '#fff', color: sel ? '#7C3AED' : '#64748B', fontWeight: sel ? 700 : 500, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rol */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 8 }}>Rol *</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(['operario', 'supervisor', 'admin', 'comercial'] as const).map(r => (
                <button key={r} onClick={() => setRole(r)}
                  style={{ border: role === r ? '2px solid #7C3AED' : '1.5px solid #E2E8F0', borderRadius: 10, padding: '9px 12px', cursor: 'pointer', textAlign: 'center', background: role === r ? '#F5F3FF' : '#fff', fontWeight: role === r ? 700 : 500, fontSize: 13, color: role === r ? '#7C3AED' : '#374151', fontFamily: 'inherit' }}>
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          {/* Info */}
          <div style={{ background: '#F0FDF4', borderRadius: 10, padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Users size={14} color="#16A34A" style={{ marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: '#15803D' }}>
              El miembro recibirá una invitación. Una vez que acepte, aparecerá disponible para asignación en pedidos.
            </div>
          </div>

          {/* Botón */}
          <button
            onClick={handleInvite}
            disabled={!canSubmit || loading}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
              background: canSubmit && !loading ? '#7C3AED' : '#E2E8F0',
              color:      canSubmit && !loading ? '#fff' : '#94A3B8',
              fontWeight: 800, fontSize: 15, cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
            }}
          >
            {loading ? 'Enviando invitación...' : 'Enviar invitación'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Sheet de asignación de técnico ──────────────────────────────────────────

const SPECIALTY_LABELS: Record<string, string> = {
  electricista: 'Electricista', cctv: 'CCTV', redes: 'Redes',
  fibra_optica: 'Fibra óptica', paneles_solares: 'Paneles solares',
  aires_acondicionados: 'Aires AC', plomeria: 'Plomería',
  soldadura: 'Soldadura', mantenimiento: 'Mantenimiento', otro: 'Otro',
};

const OP_STATUS_LABEL: Record<string, { label: string; dot: string }> = {
  disponible:   { label: 'Disponible',   dot: '#22C55E' },
  en_ruta:      { label: 'En ruta',      dot: '#F59E0B' },
  en_sitio:     { label: 'En sitio',     dot: '#7C3AED' },
  en_ejecucion: { label: 'Trabajando',   dot: '#2563EB' },
  finalizado:   { label: 'Finalizado',   dot: '#6B7280' },
  off:          { label: 'Desconectado', dot: '#CBD5E1' },
};

function AssignTechSheet({
  open, orderId, currentAssignedId, onClose, onAssigned,
}: {
  open: boolean;
  orderId: string;
  currentAssignedId?: string | null;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const { workspace, profile } = useWorkspace();
  const { showToast }          = useToast();
  const [loading,        setLoading]        = useState(false);
  const [inviteOpen,     setInviteOpen]     = useState(false);
  const [filterSpec,     setFilterSpec]     = useState('');
  const [filterAvail,    setFilterAvail]    = useState(false);

  const teamQ = useQuery({
    queryKey: ['team-field', workspace.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('profiles')
        .select('id, full_name, role, operational_status, status, specialty, city, phone')
        .eq('workspace_id', workspace.id)
        .in('role', ['operario', 'supervisor', 'admin'])
        .in('status', ['active', 'invited'])
        .order('full_name');
      return (data ?? []) as {
        id: string; full_name: string; role: string;
        operational_status?: string; status: string;
        specialty?: string; city?: string; phone?: string;
      }[];
    },
    enabled: open,
    staleTime: 30_000,
  });

  // Derivar especialidades únicas del equipo
  const teamSpecialties = [...new Set(
    (teamQ.data ?? []).map(m => m.specialty).filter(Boolean)
  )] as string[];

  async function assign(userId: string | null) {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('assign_order', {
        p_order_id:    orderId,
        p_assigned_to: userId,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? 'Error al asignar');
      showToast(userId ? 'Técnico asignado ✓' : 'Asignación removida');
      onAssigned();
      onClose();
    } catch (e: any) {
      showToast(e.message ?? 'Error al asignar');
    } finally {
      setLoading(false);
    }
  }

  function handleInvited() {
    setInviteOpen(false);
    teamQ.refetch();
  }

  // Aplicar filtros locales
  const displayedMembers = (teamQ.data ?? []).filter(m => {
    if (filterSpec && m.specialty !== filterSpec) return false;
    if (filterAvail && m.operational_status !== 'disponible') return false;
    return true;
  });

  const hasMembers = displayedMembers.length > 0;

  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 58, background: 'rgba(0,0,0,.45)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity .25s' }} />
      <div role="dialog" aria-modal="true" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 59,
        background: '#fff', borderRadius: '20px 20px 0 0',
        boxShadow: '0 -8px 40px rgba(0,0,0,.18)',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform .28s cubic-bezier(.4,0,.2,1)',
        maxHeight: '80vh', overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#E2E8F0' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px 14px' }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Asignar técnico</span>
          <button onClick={onClose} style={{ border: 'none', background: '#F1F5F9', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="#374151" />
          </button>
        </div>

        {/* Quitar asignación */}
        {currentAssignedId && (
          <button onClick={() => assign(null)} disabled={loading} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #F8FAFC' }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} color="#EF4444" />
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#EF4444' }}>Quitar asignación</span>
          </button>
        )}

        {/* Filtros: Disponible + Especialidad */}
        {(teamQ.data?.length ?? 0) > 0 && (
          <div style={{ padding: '10px 16px 6px', borderBottom: '1px solid #F8FAFC' }}>
            {/* Toggle disponible */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => setFilterAvail(v => !v)}
                style={{ padding: '5px 12px', borderRadius: 99, border: `1.5px solid ${filterAvail ? '#16A34A' : '#E2E8F0'}`, background: filterAvail ? '#F0FDF4' : '#fff', color: filterAvail ? '#16A34A' : '#64748B', fontWeight: filterAvail ? 700 : 500, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                🟢 Solo disponibles
              </button>
              {teamSpecialties.map(sp => (
                <button key={sp} onClick={() => setFilterSpec(filterSpec === sp ? '' : sp)}
                  style={{ padding: '5px 12px', borderRadius: 99, border: `1.5px solid ${filterSpec === sp ? '#7C3AED' : '#E2E8F0'}`, background: filterSpec === sp ? '#F5F3FF' : '#fff', color: filterSpec === sp ? '#7C3AED' : '#64748B', fontWeight: filterSpec === sp ? 700 : 500, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {SPECIALTY_LABELS[sp] ?? sp}
                </button>
              ))}
            </div>
          </div>
        )}

        {teamQ.isLoading && (
          <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Cargando equipo...</div>
        )}

        {/* Estado vacío: no hay miembros operativos */}
        {!teamQ.isLoading && !hasMembers && (
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Users size={26} color="#7C3AED" />
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 6 }}>
              No tienes miembros del equipo disponibles
            </div>
            <div style={{ fontSize: 13, color: '#64748B', marginBottom: 22, lineHeight: 1.5 }}>
              Invita a un miembro de tu equipo para asignarlo a este pedido.
            </div>
            <button
              onClick={() => setInviteOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '12px 24px', border: 'none', borderRadius: 12,
                background: '#7C3AED', color: '#fff',
                fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <UserPlus size={16} /> Crear miembro del equipo
            </button>
          </div>
        )}

        {/* Lista de miembros filtrada */}
        {displayedMembers.map(member => {
          const isInvited = member.status === 'invited';
          const opStatus  = OP_STATUS_LABEL[member.operational_status ?? 'off'] ?? OP_STATUS_LABEL.off;
          return (
            <button
              key={member.id}
              onClick={() => !isInvited && assign(member.id)}
              disabled={loading || isInvited}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 20px', border: 'none', background: 'none',
                cursor: isInvited ? 'default' : 'pointer', textAlign: 'left',
                borderBottom: '1px solid #F8FAFC',
                opacity: isInvited ? 0.65 : 1,
              }}
            >
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, color: '#7C3AED' }}>
                  {(member.full_name ?? '?')[0].toUpperCase()}
                </div>
                {!isInvited && (
                  <div style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: '50%', background: opStatus.dot, border: '2px solid #fff' }} />
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{member.full_name}</div>
                <div style={{ fontSize: 11, color: '#94A3B8', display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                  <span style={{ textTransform: 'capitalize' }}>{ROLE_LABELS[member.role] ?? member.role}</span>
                  {member.specialty && <span style={{ color: '#7C3AED', fontWeight: 600 }}>· {SPECIALTY_LABELS[member.specialty] ?? member.specialty}</span>}
                  {member.city && <span>· {member.city}</span>}
                  {isInvited && <span style={{ color: '#F59E0B', fontWeight: 700 }}>· Invitación pendiente</span>}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                {!isInvited && (
                  <span style={{ fontSize: 10, fontWeight: 600, color: opStatus.dot, background: '#F8FAFC', padding: '2px 7px', borderRadius: 99, border: `1px solid ${opStatus.dot}22` }}>
                    {opStatus.label}
                  </span>
                )}
                {!isInvited && currentAssignedId === member.id && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#7C3AED', background: '#F5F3FF', padding: '2px 7px', borderRadius: 99 }}>Asignado</span>
                )}
              </div>
            </button>
          );
        })}

        {/* Botón agregar miembro (cuando ya hay equipo pero quiero uno más) */}
        {hasMembers && (
          <button
            onClick={() => setInviteOpen(true)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer',
              borderTop: '1px solid #F1F5F9', textAlign: 'left',
            }}
          >
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <UserPlus size={16} color="#7C3AED" />
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#7C3AED' }}>Agregar nuevo miembro</span>
          </button>
        )}
      </div>

      {/* Mini-modal de invitación — encima del sheet */}
      <InviteMemberMiniSheet
        open={inviteOpen && open}
        workspaceId={workspace.id}
        inviterName={profile?.full_name ?? 'El administrador'}
        onClose={() => setInviteOpen(false)}
        onInvited={handleInvited}
      />
    </>
  );
}

// ─── PedidoDetailPage ─────────────────────────────────────────────────────────

type TabKey = 'ots' | 'evidencias' | 'bitacora' | 'snapshot';

export function PedidoDetailPage() {
  const { id }         = useParams<{ id: string }>();
  const navigate       = useNavigate();
  const { showToast }  = useToast();
  const queryClient    = useQueryClient();

  const [showCreateWO,   setShowCreateWO]   = useState(false);
  const [woTitle,        setWoTitle]         = useState('');
  const [comment,        setComment]         = useState('');
  const [novedad,        setNovedad]         = useState('');
  const [showStatusMenu, setShowStatusMenu]  = useState(false);
  const [activeTab,      setActiveTab]       = useState<TabKey>('ots');
  const [evidencePhase,  setEvidencePhase]   = useState<string>('todas');
  const [assignOpen,     setAssignOpen]      = useState(false);

  const detailQ    = useOrderDetail(id);
  const statusMut  = useUpdateOrderStatus();
  const createWO   = useCreateWorkOrder();
  const addComment = useAddWorkLogComment();

  const detailRaw = detailQ.data;
  const order     = detailRaw?.order as any;

  if (detailQ.isLoading || !detailRaw || !order) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#94A3B8', fontSize: 14 }}>Cargando pedido...</div>
      </div>
    );
  }

  // Garantizado: detailRaw no es undefined más allá de este punto
  const detail = detailRaw;

  // Pedido directo: usa columna source (migration 0107), fallback a !quote_id
  const isDirect   = order.source === 'direct' || !order.quote_id;
  const clr        = ORDER_STATUS_COLORS[order.status] ?? { color: '#64748B', bg: '#F1F5F9' };
  const snap       = order.order_snapshot as any;

  // FASE 5: filtrar transiciones según reglas de negocio del frontend
  // (el backend también las valida — doble protección)
  const rawTransitions = ORDER_TRANSITIONS[order.status] ?? [];
  const transitions = rawTransitions.filter(s => {
    if (s === 'asignado' && !order.assigned_to) return false;   // necesita técnico
    if (s === 'programado' && !order.scheduled_at) return false; // necesita fecha
    if (s === 'en_ruta' && !order.assigned_to) return false;    // necesita técnico
    return true;
  });

  // Nombre del técnico asignado
  const assignedName: string | null = order.assigned_name ?? null;

  // Tabs disponibles
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'ots',        label: `OTs (${detail.work_orders.length})` },
    { key: 'evidencias', label: 'Evidencias' },
    { key: 'bitacora',   label: 'Bitácora' },
    ...(!isDirect ? [{ key: 'snapshot' as TabKey, label: 'Cotización' }] : []),
  ];

  async function handleStatusChange(newStatus: string) {
    try {
      await statusMut.mutateAsync({ orderId: order.id, status: newStatus });
      showToast(`${ORDER_STATUS_LABELS[newStatus] ?? newStatus}`);
      setShowStatusMenu(false);
    } catch (e: any) { showToast(e.message); }
  }

  async function handleCreateWO() {
    if (!woTitle.trim()) return;
    try {
      // FASE 4: la OT hereda automáticamente el técnico asignado al pedido
      await createWO.mutateAsync({
        orderId:    order.id,
        title:      woTitle.trim(),
        assignedTo: order.assigned_to ?? undefined,
      });
      showToast('OT creada ✓');
      setWoTitle(''); setShowCreateWO(false);
      detailQ.refetch();
    } catch (e: any) { showToast(e.message); }
  }

  async function handleComment() {
    if (!comment.trim()) return;
    try {
      await addComment.mutateAsync({ orderId: order.id, note: comment.trim() });
      showToast('Comentario agregado');
      setComment('');
      detailQ.refetch();
    } catch (e: any) { showToast(e.message); }
  }

  async function handleNovedad() {
    if (!novedad.trim()) return;
    try {
      // Novedades usan event_type 'novedad' vía comentario con prefijo
      await addComment.mutateAsync({ orderId: order.id, note: `[NOVEDAD] ${novedad.trim()}` });
      showToast('Novedad registrada');
      setNovedad('');
      detailQ.refetch();
    } catch (e: any) { showToast(e.message); }
  }

  function handleAssigned() {
    queryClient.invalidateQueries({ queryKey: ['order', id] });
    detailQ.refetch();
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', paddingBottom: 80 }}>

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', padding: '16px 16px 0', borderBottom: '1px solid #F1F5F9', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <ArrowLeft size={20} color="#374151" />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {order.order_number}
            </div>
            <div style={{ fontSize: 12, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {order.title}
              {isDirect && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#7C3AED', background: '#F5F3FF', padding: '1px 6px', borderRadius: 99 }}>Directo</span>}
            </div>
          </div>
          <span style={{ padding: '5px 10px', borderRadius: 99, background: clr.bg, color: clr.color, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
            {ORDER_STATUS_LABELS[order.status] ?? order.status}
          </span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderTop: '1px solid #F1F5F9', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              flex: 1, border: 'none', background: 'none', cursor: 'pointer',
              padding: '10px 4px', fontSize: 12, fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap',
              color:        activeTab === tab.key ? '#7C3AED' : '#94A3B8',
              borderBottom: activeTab === tab.key ? '2px solid #7C3AED' : '2px solid transparent',
            }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI ROW ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, padding: '14px 16px 0' }}>
        {[
          { label: 'Total',   value: formatCurrencyCOP(order.total_amount), color: '#7C3AED' },
          { label: 'OTs',     value: `${detail.work_orders.filter((w: any) => w.status === 'finalizada').length}/${detail.work_orders.length}`, color: '#22C55E' },
          { label: 'Cliente', value: (snap?.client?.name ?? order.client_name ?? '—'), color: '#64748B' },
        ].map(k => (
          <div key={k.label} style={{ flex: 1, background: '#fff', borderRadius: 12, padding: '10px 12px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize: 10.5, color: '#94A3B8', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: k.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* ── LÍNEA DE TIEMPO ─────────────────────────────────────────────────── */}
      <div style={{ paddingTop: 14 }}>
        <OrderTimeline currentStatus={order.status} />
      </div>

      {/* ── TÉCNICO ASIGNADO ─────────────────────────────────────────────────── */}
      <div style={{ margin: '0 16px 14px' }}>
        <div style={{ background: '#fff', border: '1px solid #F1F5F9', borderRadius: 14, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '.5px', marginBottom: 10 }}>TÉCNICO ASIGNADO</div>
          {assignedName ? (
            /* ── Técnico asignado ──────────────────────────────── */
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#7C3AED', flexShrink: 0 }}>
                  {assignedName[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assignedName}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>{ORDER_STATUS_LABELS[order.status] ?? order.status}</div>
                </div>
              </div>
              {/* Acciones disponibles cuando hay técnico */}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  onClick={() => navigate('/app/mapa-operativo')}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px 0', border: '1px solid #E2E8F0', borderRadius: 10, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151', fontFamily: 'inherit' }}
                >
                  <MapPin size={13} color="#7C3AED" /> Ver ubicación
                </button>
                <button
                  onClick={() => setAssignOpen(true)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px 0', border: '1px solid #E2E8F0', borderRadius: 10, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151', fontFamily: 'inherit' }}
                >
                  <UserCheck size={13} color="#64748B" /> Cambiar asignación
                </button>
              </div>
            </div>
          ) : (
            /* ── Sin técnico asignado ──────────────────────────── */
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <User size={18} color="#94A3B8" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8' }}>Sin técnico asignado</div>
                <div style={{ fontSize: 11, color: '#CBD5E1' }}>Asigna un miembro del equipo</div>
              </div>
              <button
                onClick={() => setAssignOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', border: 'none', borderRadius: 10, background: '#7C3AED', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0 }}
              >
                <UserCheck size={14} /> Asignar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── CAMBIAR ESTADO ──────────────────────────────────────────────────── */}
      {transitions.length > 0 && (
        <div style={{ margin: '0 16px 14px', position: 'relative' }}>
          <button onClick={() => setShowStatusMenu(v => !v)} style={{
            width: '100%', border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer',
            borderRadius: 12, padding: '11px 14px', fontWeight: 700, fontSize: 13.5, color: '#374151',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            Cambiar estado <ChevronDown size={16} />
          </button>
          {showStatusMenu && (
            <div style={{ position: 'absolute', top: '110%', left: 0, right: 0, background: '#fff', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 10, overflow: 'hidden' }}>
              {transitions.map(s => {
                const c = ORDER_STATUS_COLORS[s] ?? { color: '#374151', bg: '#F1F5F9' };
                return (
                  <button key={s} onClick={() => handleStatusChange(s)} style={{
                    width: '100%', border: 'none', background: 'none', cursor: 'pointer',
                    padding: '12px 16px', textAlign: 'left', fontSize: 13.5, fontWeight: 600,
                    color: c.color, display: 'block', borderBottom: '1px solid #F8FAFC',
                  }}>
                    → {ORDER_STATUS_LABELS[s] ?? s}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── CONTENIDO POR TAB ───────────────────────────────────────────────── */}
      <div style={{ padding: '0 16px' }}>

        {/* TAB: OTs */}
        {activeTab === 'ots' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!['finalizado', 'facturado', 'cancelado'].includes(order.status) && (
              showCreateWO ? (
                <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>Nueva Orden de Trabajo</div>
                  <input
                    value={woTitle} onChange={e => setWoTitle(e.target.value)}
                    placeholder="Título de la OT..."
                    style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={handleCreateWO} disabled={!woTitle.trim() || createWO.isPending} style={{
                      flex: 1, border: 'none', cursor: 'pointer', background: '#7C3AED', color: '#fff',
                      borderRadius: 10, padding: '10px', fontWeight: 700, fontSize: 13.5,
                      opacity: createWO.isPending ? .6 : 1,
                    }}>
                      {createWO.isPending ? 'Creando...' : 'Crear OT'}
                    </button>
                    <button onClick={() => { setShowCreateWO(false); setWoTitle(''); }} style={{
                      border: '1px solid #E2E8F0', cursor: 'pointer', background: '#fff',
                      borderRadius: 10, padding: '10px 16px', fontWeight: 600, fontSize: 13, color: '#64748B',
                    }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowCreateWO(true)} style={{
                  width: '100%', border: '2px dashed #E2E8F0', background: '#F8FAFC', cursor: 'pointer',
                  borderRadius: 14, padding: '14px', fontWeight: 700, fontSize: 13.5, color: '#7C3AED',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  <Plus size={16} /> Nueva Orden de Trabajo
                </button>
              )
            )}
            {detail.work_orders.length === 0 && !showCreateWO && (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#94A3B8', fontSize: 13 }}>
                Sin órdenes de trabajo. Crea la primera para organizar el trabajo.
              </div>
            )}
            {detail.work_orders.map((wo: any) => (
              <WOCard key={wo.id} wo={wo} onPress={() => navigate(`/app/ordenes-trabajo/${wo.id}`)} />
            ))}
          </div>
        )}

        {/* TAB: Evidencias */}
        {activeTab === 'evidencias' && id && (
          <div>
            {/* Sub-tabs fase */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', scrollbarWidth: 'none' }}>
              {[
                { key: 'todas',   label: 'Todas' },
                { key: 'antes',   label: '📋 Antes' },
                { key: 'durante', label: '🔧 Durante' },
                { key: 'despues', label: '✅ Después' },
                { key: 'fotos',   label: '📷 Fotos' },
                { key: 'firmas',  label: '✍️ Firmas' },
              ].map(f => (
                <button key={f.key} onClick={() => setEvidencePhase(f.key)} style={{
                  flexShrink: 0, border: 'none', borderRadius: 99, padding: '5px 12px',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                  background: evidencePhase === f.key ? '#7C3AED' : '#F1F5F9',
                  color:      evidencePhase === f.key ? '#fff' : '#64748B',
                }}>
                  {f.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Evidencias</div>
              <EvidenceUploader orderId={id} />
            </div>
            {/* Nota de upload para cámara */}
            <div style={{ background: '#F0FDF4', borderRadius: 10, padding: '8px 12px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Camera size={14} color="#16A34A" />
              <span style={{ fontSize: 12, color: '#15803D' }}>
                Las fotos se clasifican automáticamente según el estado actual del pedido.
              </span>
            </div>
            <EvidenceGallery orderId={id} />
          </div>
        )}

        {/* TAB: Bitácora */}
        {activeTab === 'bitacora' && (
          <div>
            {/* Novedades */}
            <div style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#92400E', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                ⚠️ REGISTRAR NOVEDAD
              </div>
              <textarea
                value={novedad}
                onChange={e => setNovedad(e.target.value)}
                placeholder="Ej: Falta material, cliente pidió cambio, retraso de 1 hora..."
                rows={2}
                style={{ width: '100%', border: '1.5px solid #FDE68A', borderRadius: 10, padding: '9px 12px', fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff', color: '#0F172A' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={handleNovedad} disabled={!novedad.trim() || addComment.isPending} style={{
                  flex: 1, border: 'none', cursor: 'pointer',
                  background: novedad.trim() ? '#D97706' : '#E2E8F0',
                  color: novedad.trim() ? '#fff' : '#94A3B8',
                  borderRadius: 10, padding: '9px', fontWeight: 700, fontSize: 13,
                  fontFamily: 'inherit',
                }}>
                  Registrar novedad
                </button>
                <button style={{ border: '1px solid #FDE68A', background: '#fff', borderRadius: 10, padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#92400E', fontFamily: 'inherit' }}>
                  <Camera size={14} /> Foto
                </button>
              </div>
            </div>

            {/* Agregar comentario */}
            <div style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 8 }}>COMENTARIO</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={comment} onChange={e => setComment(e.target.value)}
                  placeholder="Agregar comentario o nota..."
                  style={{ flex: 1, border: '1px solid #E2E8F0', borderRadius: 10, padding: '9px 12px', fontSize: 13, outline: 'none' }}
                />
                <button onClick={handleComment} disabled={!comment.trim()} style={{
                  border: 'none', cursor: 'pointer', background: '#7C3AED', color: '#fff',
                  borderRadius: 10, padding: '9px 14px', display: 'flex', alignItems: 'center',
                  opacity: !comment.trim() ? .5 : 1,
                }}>
                  <MessageSquare size={16} />
                </button>
              </div>
            </div>

            {/* Log entries */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {detail.logs.map((log: any) => (
                <LogEntry key={log.id} log={{
                  ...log,
                  // Detectar novedades por prefijo [NOVEDAD]
                  event_type: log.note?.startsWith('[NOVEDAD]') ? 'novedad' : log.event_type,
                  note: log.note?.startsWith('[NOVEDAD]') ? log.note.replace('[NOVEDAD] ', '') : log.note,
                }} />
              ))}
              {detail.logs.length === 0 && (
                <div style={{ textAlign: 'center', padding: 32, color: '#94A3B8', fontSize: 13 }}>Sin actividad registrada</div>
              )}
            </div>
          </div>
        )}

        {/* TAB: Sincronizados */}
        {activeTab === ('sincronizados' as any) && id && (
          <div>
            <SyncedDocsList orderId={id} />
          </div>
        )}

        {/* TAB: Cotización (Snapshot) — solo si tiene quote_id */}
        {activeTab === 'snapshot' && !isDirect && snap && (
          <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <FileText size={16} color="#7C3AED" />
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Cotización congelada</span>
              <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 'auto' }}>
                {snap.quote_number} · {new Date(snap.frozen_at).toLocaleDateString('es-CO')}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {snap.client && (
                <div style={{ display: 'flex', gap: 10, padding: '10px 12px', background: '#F8FAFC', borderRadius: 10 }}>
                  <User size={16} color="#64748B" />
                  <div>
                    <div style={{ fontSize: 12, color: '#94A3B8' }}>Cliente</div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>{snap.client.name}</div>
                    {snap.client.phone && <div style={{ fontSize: 12, color: '#64748B' }}>{snap.client.phone}</div>}
                  </div>
                </div>
              )}
              {snap.calc_snapshot && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { label: 'Subtotal',  value: snap.calc_snapshot.subtotal },
                    { label: 'Descuento', value: snap.calc_snapshot.discount },
                    { label: 'IVA',       value: snap.calc_snapshot.tax },
                    { label: 'Total',     value: snap.calc_snapshot.total, bold: true },
                  ].filter(r => r.value !== undefined).map(r => (
                    <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F1F5F9' }}>
                      <span style={{ fontSize: 13, color: '#64748B' }}>{r.label}</span>
                      <span style={{ fontSize: 13, fontWeight: r.bold ? 800 : 600, color: r.bold ? '#7C3AED' : '#0F172A' }}>
                        {formatCurrencyCOP(r.value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, padding: '8px 0', borderTop: '1px solid #F1F5F9', marginTop: 4 }}>
                <CheckCircle2 size={14} color="#22C55E" />
                <span style={{ fontSize: 11.5, color: '#64748B' }}>Este snapshot es inmutable. Refleja exactamente lo vendido.</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB: Snapshot — si es pedido directo */}
        {activeTab === 'snapshot' && isDirect && (
          <div style={{ background: '#F5F3FF', border: '1.5px solid #DDD6FE', borderRadius: 14, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📦</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#7C3AED', marginBottom: 6 }}>Pedido creado directamente</div>
            <div style={{ fontSize: 13, color: '#6D28D9' }}>
              Este pedido no proviene de una cotización. Fue creado directamente sin propuesta previa.
            </div>
          </div>
        )}
      </div>

      {/* Overlay para cerrar menú de estado */}
      {showStatusMenu && <div onClick={() => setShowStatusMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />}

      {/* Sheet de asignación de técnico */}
      {id && (
        <AssignTechSheet
          open={assignOpen}
          orderId={id}
          currentAssignedId={order.assigned_to ?? null}
          onClose={() => setAssignOpen(false)}
          onAssigned={handleAssigned}
        />
      )}
    </div>
  );
}
