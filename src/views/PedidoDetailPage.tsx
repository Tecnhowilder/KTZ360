/**
 * PedidoDetailPage.tsx — Detalle de un pedido operativo (Sprint 6)
 * Mobile First. Incluye: info del pedido, OTs, bitácora, snapshot R4.
 */
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Package, ChevronDown, MessageSquare,
  User, FileText, CheckCircle2,
} from 'lucide-react';
import { useOrderDetail, useUpdateOrderStatus } from '../hooks/useOrders';
import { useCreateWorkOrder } from '../hooks/useWorkOrders';
import { useAddWorkLogComment } from '../hooks/useWorkOrders';
import { EvidenceGallery } from '../components/evidences/EvidenceGallery';
import { EvidenceUploader } from '../components/evidences/EvidenceUploader';
import { SyncedDocsList } from '../components/evidences/SyncedDocsList';
import { useToast } from '../components/ui/Toast';
import { formatCurrencyCOP } from '../lib/currency';
import {
  ORDER_STATUS_LABELS, ORDER_STATUS_COLORS,
  WO_STATUS_LABELS, WO_STATUS_COLORS, PRIORITY_COLORS, PRIORITY_LABELS,
} from '../services/workOrders';

const ORDER_TRANSITIONS: Record<string, string[]> = {
  pendiente:    ['programado', 'en_ejecucion', 'cancelado'],
  programado:   ['en_ejecucion', 'pausado', 'cancelado'],
  en_ejecucion: ['pausado', 'finalizado', 'cancelado'],
  pausado:      ['en_ejecucion', 'cancelado'],
  finalizado:   [],
  cancelado:    [],
};

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
    order_created: '📦', order_status_changed: '🔄', order_assigned: '👤',
    work_order_created: '🔧', work_order_status_changed: '🔄', work_order_assigned: '👤',
    comment: '💬', completed: '✅',
  };
  return (
    <div style={{ display: 'flex', gap: 10, paddingBottom: 12, borderBottom: '1px solid #F1F5F9' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>
        {icons[log.event_type] ?? '📋'}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, color: '#0F172A', fontWeight: 600 }}>
          {log.user_name ?? 'Sistema'}
          {log.from_status && log.to_status && (
            <span style={{ fontWeight: 400, color: '#64748B' }}>
              {' '}{ORDER_STATUS_LABELS[log.from_status] ?? log.from_status} → {ORDER_STATUS_LABELS[log.to_status] ?? log.to_status}
            </span>
          )}
        </div>
        {log.note && <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{log.note}</div>}
        <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 3 }}>
          {new Date(log.created_at).toLocaleString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

export function PedidoDetailPage() {
  const { id }       = useParams<{ id: string }>();
  const navigate     = useNavigate();
  const { showToast } = useToast();
  const [showCreateWO, setShowCreateWO] = useState(false);
  const [woTitle, setWoTitle]           = useState('');
  const [comment, setComment]           = useState('');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [activeTab, setActiveTab]       = useState<'ots' | 'evidencias' | 'sincronizados' | 'bitacora' | 'snapshot'>('ots');

  const detailQ   = useOrderDetail(id);
  const statusMut = useUpdateOrderStatus();
  const createWO  = useCreateWorkOrder();
  const addComment = useAddWorkLogComment();

  const detail  = detailQ.data;
  const orderMb = detail?.order;

  if (detailQ.isLoading || !orderMb) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#94A3B8', fontSize: 14 }}>Cargando pedido...</div>
      </div>
    );
  }

  const order     = orderMb;
  const clr       = ORDER_STATUS_COLORS[order.status] ?? { color: '#64748B', bg: '#F1F5F9' };
  const transitions = ORDER_TRANSITIONS[order.status] ?? [];
  const snap      = order.order_snapshot as any;

  async function handleStatusChange(newStatus: string) {
    try {
      await statusMut.mutateAsync({ orderId: order.id, status: newStatus });
      showToast(`Estado cambiado a ${ORDER_STATUS_LABELS[newStatus]}`);
      setShowStatusMenu(false);
    } catch (e: any) { showToast(e.message); }
  }

  async function handleCreateWO() {
    if (!woTitle.trim()) return;
    try {
      await createWO.mutateAsync({ orderId: order.id, title: woTitle.trim() });
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
              {order.order_number}
            </div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>{order.title}</div>
          </div>
          <span style={{ padding: '5px 10px', borderRadius: 99, background: clr.bg, color: clr.color, fontSize: 12, fontWeight: 700 }}>
            {ORDER_STATUS_LABELS[order.status]}
          </span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderTop: '1px solid #F1F5F9', overflowX: 'auto' }}>
          {([
            { key: 'ots',            label: `OTs (${detail.work_orders.length})` },
            { key: 'evidencias',     label: 'Evidencias' },
            { key: 'sincronizados',  label: 'Sync' },
            { key: 'bitacora',       label: 'Bitácora' },
            { key: 'snapshot',       label: 'Snapshot' },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              flex: 1, border: 'none', background: 'none', cursor: 'pointer',
              padding: '10px 0', fontSize: 12, fontWeight: 600, flexShrink: 0,
              color:        activeTab === tab.key ? '#2563EB' : '#94A3B8',
              borderBottom: activeTab === tab.key ? '2px solid #2563EB' : '2px solid transparent',
            }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'flex', gap: 10, padding: '14px 16px 0' }}>
        {[
          { label: 'Total',    value: formatCurrencyCOP(order.total_amount), color: '#2563EB' },
          { label: 'OTs',      value: `${detail.work_orders.filter(w => w.status === 'finalizada').length}/${detail.work_orders.length}`, color: '#22C55E' },
          { label: 'Cliente',  value: snap?.client?.name ?? '—', color: '#64748B' },
        ].map(k => (
          <div key={k.label} style={{ flex: 1, background: '#fff', borderRadius: 12, padding: '10px 12px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize: 10.5, color: '#94A3B8', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: k.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Cambiar estado */}
      {transitions.length > 0 && (
        <div style={{ margin: '14px 16px 0', position: 'relative' }}>
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
                    color: c.color, display: 'block',
                    borderBottom: '1px solid #F8FAFC',
                  }}>
                    {ORDER_STATUS_LABELS[s]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Contenido por tab */}
      <div style={{ padding: '14px 16px 0' }}>

        {/* TAB: OTs */}
        {activeTab === 'ots' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!['finalizado','cancelado'].includes(order.status) && (
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
                      flex: 1, border: 'none', cursor: 'pointer', background: '#2563EB', color: '#fff',
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
                  borderRadius: 14, padding: '14px', fontWeight: 700, fontSize: 13.5, color: '#2563EB',
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
            {detail.work_orders.map(wo => (
              <WOCard key={wo.id} wo={wo} onPress={() => navigate(`/app/ordenes-trabajo/${wo.id}`)} />
            ))}
          </div>
        )}

        {/* TAB: Documentos Sincronizados */}
        {activeTab === 'sincronizados' && id && (
          <div>
            <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5, background: '#EFF6FF', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
              <span style={{ fontWeight: 700, color: '#2563EB' }}>Documentos sincronizados</span> — evidencias en Shelwi y su respaldo en Drive/OneDrive. Shelwi siempre es la fuente de verdad.
            </div>
            <SyncedDocsList orderId={id} />
          </div>
        )}

        {/* TAB: Evidencias */}
        {activeTab === 'evidencias' && id && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Evidencias</div>
              <EvidenceUploader orderId={id} />
            </div>
            <EvidenceGallery orderId={id} />
          </div>
        )}

        {/* TAB: Bitácora */}
        {activeTab === 'bitacora' && (
          <div>
            {/* Agregar comentario */}
            <div style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={comment} onChange={e => setComment(e.target.value)}
                  placeholder="Agregar comentario o nota..."
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {detail.logs.map(log => <LogEntry key={log.id} log={log} />)}
              {detail.logs.length === 0 && <div style={{ textAlign: 'center', padding: 32, color: '#94A3B8', fontSize: 13 }}>Sin actividad registrada</div>}
            </div>
          </div>
        )}

        {/* TAB: Snapshot (R4) */}
        {activeTab === 'snapshot' && snap && (
          <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <FileText size={16} color="#2563EB" />
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
                    { label: 'Subtotal',   value: snap.calc_snapshot.subtotal },
                    { label: 'Descuento',  value: snap.calc_snapshot.discount },
                    { label: 'IVA',        value: snap.calc_snapshot.tax },
                    { label: 'Total',      value: snap.calc_snapshot.total, bold: true },
                  ].filter(r => r.value !== undefined).map(r => (
                    <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F1F5F9' }}>
                      <span style={{ fontSize: 13, color: '#64748B' }}>{r.label}</span>
                      <span style={{ fontSize: 13, fontWeight: r.bold ? 800 : 600, color: r.bold ? '#2563EB' : '#0F172A' }}>
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
      </div>

      {/* Overlay cierre del menú de estado */}
      {showStatusMenu && <div onClick={() => setShowStatusMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />}
    </div>
  );
}
