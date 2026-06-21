/**
 * OTDetailPage.tsx — Detalle de Orden de Trabajo (Sprint 6)
 * Mobile First. Cambio de estado + asignación + bitácora.
 */
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Wrench, ChevronDown, MessageSquare, User, AlertTriangle, Calendar,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useUpdateWorkOrderStatus, useAddWorkLogComment } from '../hooks/useWorkOrders';
import { useToast } from '../components/ui/Toast';
import { listWorkOrders } from '../services/workOrders';
import { EvidenceGallery } from '../components/evidences/EvidenceGallery';
import { EvidenceUploader } from '../components/evidences/EvidenceUploader';
import {
  WO_STATUS_LABELS, WO_STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS,
} from '../services/workOrders';

const WO_TRANSITIONS: Record<string, string[]> = {
  pendiente:   ['asignada', 'en_progreso', 'cancelada'],
  asignada:    ['en_progreso', 'pausada', 'cancelada'],
  en_progreso: ['pausada', 'finalizada', 'cancelada'],
  pausada:     ['en_progreso', 'cancelada'],
  finalizada:  [],
  cancelada:   [],
};


export function OTDetailPage() {
  const { id }       = useParams<{ id: string }>();
  const navigate     = useNavigate();
  const { showToast } = useToast();
  
  const [comment, setComment]           = useState('');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [activeTab, setActiveTab]       = useState<'info' | 'evidencias' | 'bitacora'>('info');

  const statusMut  = useUpdateWorkOrderStatus();
  const addComment = useAddWorkLogComment();

  const woQ = useQuery({
    queryKey: ['workOrderDetail', id],
    queryFn: async () => {
      const wos = await listWorkOrders({});
      const wo  = wos.find(w => w.id === id);
      if (!wo) throw new Error('Orden de trabajo no encontrada');
      return wo;
    },
    enabled: !!id,
    staleTime: 30_000,
  });

  const wo = woQ.data;

  if (woQ.isLoading || !wo) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#94A3B8', fontSize: 14 }}>Cargando OT...</div>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const wo_         = wo!;
  const sc          = WO_STATUS_COLORS[wo_.status] ?? { color: '#64748B', bg: '#F1F5F9' };
  const pc          = PRIORITY_COLORS[wo_.priority] ?? { color: '#64748B', bg: '#F1F5F9' };
  const transitions = WO_TRANSITIONS[wo_.status] ?? [];

  async function handleStatusChange(newStatus: string) {
    try {
      await statusMut.mutateAsync({ woId: wo_.id, status: newStatus });
      showToast(`OT → ${WO_STATUS_LABELS[newStatus]}`);
      setShowStatusMenu(false);
      woQ.refetch();
    } catch (e: any) { showToast(e.message); }
  }

  async function handleComment() {
    if (!comment.trim()) return;
    try {
      await addComment.mutateAsync({ workOrderId: wo_.id, note: comment.trim() });
      showToast('Comentario agregado');
      setComment('');
      woQ.refetch();
    } catch (e: any) { showToast(e.message); }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#fff', padding: '16px 16px 0', borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <ArrowLeft size={20} color="#374151" />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {wo.work_order_number}
            </div>
            <div style={{ fontSize: 12, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wo.title}</div>
          </div>
          <span style={{ padding: '5px 10px', borderRadius: 99, background: sc.bg, color: sc.color, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
            {WO_STATUS_LABELS[wo.status]}
          </span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderTop: '1px solid #F1F5F9', overflowX: 'auto' }}>
          {([
            { key: 'info',        label: 'Información' },
            { key: 'evidencias',  label: 'Evidencias' },
            { key: 'bitacora',    label: 'Bitácora' },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              flex: 1, border: 'none', background: 'none', cursor: 'pointer',
              padding: '10px 0', fontSize: 12.5, fontWeight: 600, flexShrink: 0,
              color:        activeTab === tab.key ? '#2563EB' : '#94A3B8',
              borderBottom: activeTab === tab.key ? '2px solid #2563EB' : '2px solid transparent',
            }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 16px 0' }}>

        {/* TAB: Info */}
        {activeTab === 'info' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Meta */}
            <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
              {wo.description && (
                <p style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.6, marginBottom: 14 }}>{wo.description}</p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <AlertTriangle size={15} color={pc.color} />
                  <span style={{ fontSize: 13, color: '#64748B' }}>Prioridad</span>
                  <span style={{ marginLeft: 'auto', padding: '2px 10px', borderRadius: 99, background: pc.bg, color: pc.color, fontSize: 12, fontWeight: 700 }}>
                    {PRIORITY_LABELS[wo.priority]}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <User size={15} color="#64748B" />
                  <span style={{ fontSize: 13, color: '#64748B' }}>Asignado a</span>
                  <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: wo.assigned_name ? '#0F172A' : '#CBD5E1' }}>
                    {wo.assigned_name ?? 'Sin asignar'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Wrench size={15} color="#64748B" />
                  <span style={{ fontSize: 13, color: '#64748B' }}>Pedido</span>
                  <button onClick={() => navigate(`/app/pedidos/${wo.order_id}`)} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: '#2563EB', fontSize: 13, fontWeight: 600, padding: 0 }}>
                    {wo.order_number} →
                  </button>
                </div>
                {wo.scheduled_at && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Calendar size={15} color="#64748B" />
                    <span style={{ fontSize: 13, color: '#64748B' }}>Programada</span>
                    <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: '#0F172A' }}>
                      {new Date(wo.scheduled_at).toLocaleDateString('es-CO')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Cambiar estado */}
            {transitions.length > 0 && (
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowStatusMenu(v => !v)} style={{
                  width: '100%', border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer',
                  borderRadius: 12, padding: '12px 14px', fontWeight: 700, fontSize: 13.5, color: '#374151',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  Cambiar estado <ChevronDown size={16} />
                </button>
                {showStatusMenu && (
                  <div style={{ position: 'absolute', top: '110%', left: 0, right: 0, background: '#fff', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 10, overflow: 'hidden' }}>
                    {transitions.map(s => {
                      const c = WO_STATUS_COLORS[s] ?? { color: '#374151', bg: '#F1F5F9' };
                      return (
                        <button key={s} onClick={() => handleStatusChange(s)} style={{
                          width: '100%', border: 'none', background: 'none', cursor: 'pointer',
                          padding: '12px 16px', textAlign: 'left', fontSize: 13.5, fontWeight: 600,
                          color: c.color, display: 'block', borderBottom: '1px solid #F8FAFC',
                        }}>
                          {WO_STATUS_LABELS[s]}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB: Evidencias */}
        {activeTab === 'evidencias' && id && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Evidencias</div>
              <EvidenceUploader workOrderId={id} />
            </div>
            <EvidenceGallery workOrderId={id} />
          </div>
        )}

        {/* TAB: Bitácora */}
        {activeTab === 'bitacora' && (
          <div>
            <div style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={comment} onChange={e => setComment(e.target.value)}
                  placeholder="Agregar comentario..."
                  style={{ flex: 1, border: '1px solid #E2E8F0', borderRadius: 10, padding: '9px 12px', fontSize: 13, outline: 'none' }}
                />
                <button onClick={handleComment} disabled={!comment.trim()} style={{
                  border: 'none', cursor: 'pointer', background: '#2563EB', color: '#fff',
                  borderRadius: 10, padding: '9px 14px', display: 'flex', alignItems: 'center',
                  opacity: !comment.trim() ? .5 : 1,
                }}>
                  <MessageSquare size={16} />
                </button>
              </div>
            </div>
            <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: 24 }}>
              La bitácora detallada se muestra desde el pedido.
            </div>
          </div>
        )}
      </div>

      {showStatusMenu && <div onClick={() => setShowStatusMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />}
    </div>
  );
}
