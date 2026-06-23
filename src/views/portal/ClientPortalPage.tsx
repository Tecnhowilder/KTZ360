/**
 * ClientPortalPage — Portal del Cliente Sprint 10
 * URL: /portal/:token
 * Público: sin auth requerida. El token valida el acceso.
 * Mobile-first: 390/430px primero.
 * Branding: logo y colores de la empresa, NO de Shelwi.
 */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Package, Image, Clock,
  AlertTriangle, ExternalLink, ChevronRight, CheckCircle2,
  XCircle, Download, Star, Gift, ClipboardList, Share2, Copy, CheckCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import type { PortalReferralInfo } from '../../lib/database.types';
import { submitReview, starLabel } from '../../services/reviews';
import { submitSurveyResponse } from '../../services/surveys';
import { getClientLoyalty, LOYALTY_TYPE_LABELS, type ClientLoyaltyData } from '../../services/loyalty';
import { useState as useS, useEffect as useE } from 'react';
import { useClientPortal, usePortalQuotes, usePortalOrders,
  usePortalWorkOrders, usePortalEvidences, usePortalTimeline } from '../../hooks/useClientPortal';
import { getPortalEvidenceUrl } from '../../services/clientPortal';
import {
  PORTAL_ORDER_STATUS, PORTAL_WO_STATUS, PORTAL_QUOTE_STATUS,
  TIMELINE_ICONS,
} from '../../services/clientPortal';
import { formatCurrencyCOP } from '../../lib/currency';
import type { PortalOrder } from '../../lib/database.types';

// ─── Tipos de tab ─────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'cotizaciones' | 'pedidos' | 'evidencias' | 'timeline' | 'resenas' | 'encuesta' | 'puntos' | 'referidos';

// ─── Componente: branding header ─────────────────────────────────────────────

function PortalHeader({
  companyName, logoPath, colorPrimary, clientName, activeTab, onTabChange, config,
}: {
  companyName: string; logoPath: string | null; colorPrimary: string;
  clientName: string; activeTab: Tab; onTabChange: (t: Tab) => void;
  config: { show_evidences: boolean; show_timeline: boolean; show_reviews?: boolean; show_loyalty?: boolean; active_survey?: { id: string; title: string } | null };
}) {
  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { key: 'dashboard',   label: 'Inicio',   icon: LayoutDashboard },
    { key: 'cotizaciones',label: 'Cotiz.',   icon: FileText },
    { key: 'pedidos',     label: 'Pedidos',  icon: Package },
    ...(config.show_evidences  ? [{ key: 'evidencias' as Tab, label: 'Fotos',    icon: Image }] : []),
    ...(config.show_timeline   ? [{ key: 'timeline'  as Tab, label: 'Historial', icon: Clock }] : []),
    ...(config.show_reviews    ? [{ key: 'resenas'   as Tab, label: 'Reseña',    icon: Star }] : []),
    ...(config.active_survey   ? [{ key: 'encuesta'  as Tab, label: 'Encuesta',  icon: ClipboardList }] : []),
    ...(config.show_loyalty    ? [{ key: 'puntos'    as Tab, label: 'Puntos',    icon: Gift }] : []),
    { key: 'referidos' as Tab, label: 'Invitar', icon: Share2 },
  ];

  return (
    <div style={{
      background: '#fff', borderBottom: '1px solid #F1F5F9', position: 'sticky', top: 0, zIndex: 20,
    }}>
      {/* Company branding */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 10px' }}>
        {logoPath ? (
          <img src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/logos/${logoPath}`}
            alt={companyName} style={{ height: 32, objectFit: 'contain' }} />
        ) : (
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: colorPrimary, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 16,
          }}>
            {companyName.charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{companyName}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>Portal de {clientName}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', overflowX: 'auto', borderTop: '1px solid #F1F5F9' }}>
        {tabs.map(t => {
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onTabChange(t.key)}
              style={{
                flexShrink: 0, flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 3, padding: '9px 8px',
                border: 'none', background: 'none', cursor: 'pointer',
                borderBottom: isActive ? `2px solid ${colorPrimary}` : '2px solid transparent',
                color: isActive ? colorPrimary : '#94A3B8',
              }}
            >
              <t.icon size={16} />
              <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500 }}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab: Dashboard ───────────────────────────────────────────────────────────

function TabDashboard({ token, colorPrimary, onNavigate }: {
  token: string; colorPrimary: string; onNavigate: (tab: Tab) => void;
}) {
  const portalQ = useClientPortal(token);
  const d = portalQ.data;

  if (!d) return <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8' }}>Cargando...</div>;

  const s = d.summary;

  return (
    <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {[
          { label: 'Cotizaciones', value: s.total_quotes, color: '#2563EB', bg: '#EFF6FF', tab: 'cotizaciones' as Tab },
          { label: 'Aprobadas',    value: s.approved_quotes, color: '#16A34A', bg: '#F0FDF4', tab: 'cotizaciones' as Tab },
          { label: 'Pedidos activos', value: d.active_orders?.length ?? 0, color: '#D97706', bg: '#FFFBEB', tab: 'pedidos' as Tab },
          { label: 'Total aprobado', value: null, color: colorPrimary, bg: '#F8FAFC', tab: 'cotizaciones' as Tab },
        ].map((k, i) => (
          <button
            key={i}
            onClick={() => onNavigate(k.tab)}
            style={{
              textAlign: 'left', border: 'none', background: k.bg,
              borderRadius: 14, padding: '14px 14px', cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>
              {k.value !== null ? k.value : formatCurrencyCOP(s.total_value)}
            </div>
          </button>
        ))}
      </div>

      {/* Cotización más reciente */}
      {d.recent_quote && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 10, textTransform: 'uppercase', letterSpacing: .4 }}>
            Última cotización
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{d.recent_quote.title}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{d.recent_quote.quote_number}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: colorPrimary }}>
                {formatCurrencyCOP(d.recent_quote.total)}
              </div>
              {(() => {
                const st = PORTAL_QUOTE_STATUS[d.recent_quote.status];
                return (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: st?.bg, color: st?.color }}>
                    {st?.label ?? d.recent_quote.status}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Pedidos activos */}
      {(d.active_orders?.length ?? 0) > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 10, textTransform: 'uppercase', letterSpacing: .4 }}>
            Trabajos activos
          </div>
          {d.active_orders!.map(order => {
            const st = PORTAL_ORDER_STATUS[order.status];
            return (
              <div key={order.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: st?.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Package size={16} color={st?.color} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{order.title}</div>
                  <div style={{ fontSize: 11.5, color: '#64748B' }}>{order.order_number}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: st?.bg, color: st?.color, flexShrink: 0 }}>
                  {st?.label ?? order.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Cotizaciones ────────────────────────────────────────────────────────

function TabCotizaciones({ token, colorPrimary }: { token: string; colorPrimary: string }) {
  const quotesQ = usePortalQuotes(token);
  const quotes  = quotesQ.data?.quotes ?? [];

  if (quotesQ.isLoading) return <Loader />;

  return (
    <div style={{ padding: '16px 16px 0' }}>
      {!quotes.length ? (
        <EmptyState icon="📋" message="No hay cotizaciones disponibles" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {quotes.map(q => {
            const st = PORTAL_QUOTE_STATUS[q.status];
            return (
              <div key={q.id} style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>{q.title}</div>
                    <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{q.quote_number}</div>
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: st?.bg, color: st?.color, flexShrink: 0, marginLeft: 8 }}>
                    {st?.label ?? q.status}
                  </span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: colorPrimary, marginBottom: 10 }}>
                  {formatCurrencyCOP(q.total)}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {q.status === 'Aprobada' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#16A34A', fontWeight: 600 }}>
                      <CheckCircle2 size={14} /> Aprobada por ti
                    </div>
                  )}
                  {q.status === 'Rechazada' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#DC2626', fontWeight: 600 }}>
                      <XCircle size={14} /> Rechazada
                    </div>
                  )}
                  {q.status === 'Enviada' && (
                    <div style={{ fontSize: 12, color: '#64748B' }}>
                      {q.sent_at ? `Enviada ${new Date(q.sent_at).toLocaleDateString('es-CO')}` : 'Pendiente de revisión'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Pedidos ─────────────────────────────────────────────────────────────

function TabPedidos({ token }: { token: string }) {
  const [selectedOrder, setSelectedOrder] = useState<PortalOrder | null>(null);
  const ordersQ = usePortalOrders(token);
  const orders  = ordersQ.data?.orders ?? [];
  const woQ     = usePortalWorkOrders(token, selectedOrder?.id ?? '');

  if (ordersQ.isLoading) return <Loader />;

  if (selectedOrder) {
    const st = PORTAL_ORDER_STATUS[selectedOrder.status];
    const wos = woQ.data?.work_orders ?? [];
    return (
      <div style={{ padding: '16px 16px 0' }}>
        <button
          onClick={() => setSelectedOrder(null)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer', color: '#2563EB', fontWeight: 600, fontSize: 13.5, padding: '0 0 14px', marginBottom: 4 }}
        >
          ← Volver a pedidos
        </button>
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.06)', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>{selectedOrder.title}</div>
              <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{selectedOrder.order_number}</div>
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: st?.bg, color: st?.color }}>
              {st?.label}
            </span>
          </div>
          {selectedOrder.description && (
            <div style={{ fontSize: 13, color: '#374151', marginTop: 12, lineHeight: 1.6 }}>{selectedOrder.description}</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
            <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>Avance</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>
                {selectedOrder.work_orders_done}/{selectedOrder.work_order_count} OTs
              </div>
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>Valor</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#2563EB' }}>
                {formatCurrencyCOP(selectedOrder.total_amount)}
              </div>
            </div>
          </div>
        </div>

        {/* Progreso OTs */}
        {wos.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Actividades</div>
            {wos.map((wo, i) => {
              const ws = PORTAL_WO_STATUS[wo.status];
              return (
                <div key={wo.id} style={{ display: 'flex', gap: 12, paddingBottom: i < wos.length - 1 ? 12 : 0, marginBottom: i < wos.length - 1 ? 12 : 0, borderBottom: i < wos.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: ws?.color ?? '#94A3B8', marginTop: 4 }} />
                    {i < wos.length - 1 && <div style={{ width: 2, flex: 1, background: '#F1F5F9', margin: '4px 0' }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{wo.title}</div>
                    <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 1 }}>
                      {ws?.label}
                      {wo.assigned_name ? ` · ${wo.assigned_name}` : ''}
                    </div>
                    {wo.comments.length > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {wo.comments.map((c, ci) => (
                          <div key={ci} style={{ background: '#F8FAFC', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, color: '#374151' }}>
                            {c.note}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 16px 0' }}>
      {!orders.length ? (
        <EmptyState icon="📦" message="No hay pedidos registrados" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {orders.map(o => {
            const st = PORTAL_ORDER_STATUS[o.status];
            const pct = o.work_order_count > 0 ? Math.round((o.work_orders_done / o.work_order_count) * 100) : null;
            return (
              <button
                key={o.id}
                onClick={() => setSelectedOrder(o)}
                style={{ textAlign: 'left', border: 'none', background: '#fff', borderRadius: 16, padding: '14px 16px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,.06)', width: '100%' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>{o.title}</div>
                    <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{o.order_number}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: st?.bg, color: st?.color }}>
                      {st?.label}
                    </span>
                    <ChevronRight size={14} color="#CBD5E1" />
                  </div>
                </div>
                {pct !== null && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748B', marginBottom: 4 }}>
                      <span>Avance</span><span>{pct}%</span>
                    </div>
                    <div style={{ height: 6, background: '#F1F5F9', borderRadius: 99 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: st?.color ?? '#2563EB', borderRadius: 99 }} />
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Evidencias ──────────────────────────────────────────────────────────

function TabEvidencias({ token }: { token: string }) {
  const evQ = usePortalEvidences(token);

  if (evQ.isLoading) return <Loader />;
  if (evQ.isError) {
    const code = (evQ.error as Error & { code?: string })?.code;
    if (code === 'evidences_disabled') return <EmptyState icon="🔒" message="Las evidencias no están habilitadas por esta empresa" />;
    return <EmptyState icon="📷" message="No se pudieron cargar las evidencias" />;
  }

  const evidences = evQ.data?.evidences ?? [];
  if (!evidences.length) return <EmptyState icon="📷" message="No hay evidencias disponibles" />;

  const images   = evidences.filter(e => e.file_type === 'image' || e.file_type === 'signature');
  const others   = evidences.filter(e => e.file_type !== 'image' && e.file_type !== 'signature');

  async function openEvidence(storagePath: string, _mimeType: string) {
    try {
      const url = await getPortalEvidenceUrl(storagePath, 3600);
      window.open(url, '_blank');
    } catch { /* ignore */ }
  }

  return (
    <div style={{ padding: '16px 16px 0' }}>
      {images.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 10, textTransform: 'uppercase', letterSpacing: .4 }}>
            Fotos y firmas
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
            {images.map(e => (
              <button key={e.id} onClick={() => openEvidence(e.storage_path, e.mime_type)}
                style={{ aspectRatio: '1', borderRadius: 10, border: 'none', cursor: 'pointer', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, overflow: 'hidden' }}>
                <Image size={24} color="#2563EB" />
              </button>
            ))}
          </div>
        </div>
      )}
      {others.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 10, textTransform: 'uppercase', letterSpacing: .4 }}>
            Documentos y archivos
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {others.map(e => (
              <button key={e.id} onClick={() => openEvidence(e.storage_path, e.mime_type)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: 'none', background: '#fff', cursor: 'pointer', textAlign: 'left', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
                <Download size={18} color="#2563EB" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.file_name}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>{e.file_type}</div>
                </div>
                <ExternalLink size={14} color="#94A3B8" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Timeline ────────────────────────────────────────────────────────────

function TabTimeline({ token }: { token: string }) {
  const tlQ = usePortalTimeline(token);
  const events = tlQ.data?.events ?? [];

  if (tlQ.isLoading) return <Loader />;
  if (!events.length) return <EmptyState icon="📋" message="Sin historial de actividad" />;

  return (
    <div style={{ padding: '16px 16px 0' }}>
      {events.map((evt, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
              {TIMELINE_ICONS[evt.event_type] ?? '📌'}
            </div>
            {i < events.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 12, background: '#F1F5F9', margin: '4px 0' }} />}
          </div>
          <div style={{ flex: 1, paddingBottom: i < events.length - 1 ? 14 : 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{evt.title}</div>
            {evt.description && <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2 }}>{evt.description}</div>}
            <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 4 }}>
              {new Date(evt.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Loader() {
  return <div style={{ padding: '40px 0', textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>Cargando...</div>;
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div style={{ padding: '40px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 14, color: '#64748B' }}>{message}</div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ClientPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  const portalQ = useClientPortal(token ?? '');

  if (!token) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>Token inválido</div>;
  }

  if (portalQ.isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <div style={{ width: 40, height: 40, border: '3px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
        <div style={{ fontSize: 13, color: '#94A3B8' }}>Cargando portal...</div>
      </div>
    );
  }

  if (portalQ.isError) {
    const code = (portalQ.error as Error & { code?: string })?.code;
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
        <AlertTriangle size={40} color="#EF4444" style={{ marginBottom: 12 }} />
        <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginBottom: 6 }}>
          {code === 'portal_disabled' ? 'Portal no disponible' : 'Acceso no válido'}
        </div>
        <div style={{ fontSize: 13, color: '#64748B', maxWidth: 300 }}>
          {code === 'portal_disabled'
            ? 'La empresa ha deshabilitado el portal del cliente temporalmente.'
            : 'El enlace de acceso no es válido o ha expirado. Contacta a la empresa para obtener un nuevo enlace.'}
        </div>
      </div>
    );
  }

  const d = portalQ.data!;
  const c = d.company;

  return (
    <div style={{ minHeight: '100dvh', background: '#F8FAFC', paddingBottom: 24 }}>
      <PortalHeader
        companyName={c.name}
        logoPath={c.logo_path}
        colorPrimary={c.color_primary}
        clientName={d.client.name}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        config={d.config}
      />

      {activeTab === 'dashboard'    && <TabDashboard    token={token} colorPrimary={c.color_primary} onNavigate={setActiveTab} />}
      {activeTab === 'cotizaciones' && <TabCotizaciones token={token} colorPrimary={c.color_primary} />}
      {activeTab === 'pedidos'      && <TabPedidos      token={token} />}
      {activeTab === 'evidencias'   && <TabEvidencias   token={token} />}
      {activeTab === 'timeline'     && <TabTimeline     token={token} />}
      {activeTab === 'resenas'      && <TabResenas      token={token} colorPrimary={c.color_primary} />}
      {activeTab === 'encuesta'     && d.config.active_survey && (
        <TabEncuesta token={token} survey={d.config.active_survey} />
      )}
      {activeTab === 'puntos'       && <TabPuntos    token={token} colorPrimary={c.color_primary} />}
      {activeTab === 'referidos'    && <TabReferidosPortal token={token} colorPrimary={c.color_primary} />}
    </div>
  );
}

// ─── Tab: Reseñas ─────────────────────────────────────────────────────────────

function TabResenas({ token, colorPrimary }: { token: string; colorPrimary: string }) {
  const [rating, setRating] = useS(0);
  const [comment, setComment] = useS('');
  const [orderId, setOrderId] = useS('');
  const [submitted, setSubmitted] = useS(false);
  const [error, setError] = useS<string | null>(null);
  const [loading, setLoading] = useS(false);
  const ordersQ = usePortalOrders(token);
  const orders = ordersQ.data?.orders ?? [];

  async function handleSubmit() {
    if (!orderId || rating === 0) { setError('Selecciona un pedido y una calificación'); return; }
    setLoading(true);
    try {
      await submitReview(token, orderId, rating, comment || undefined);
      setSubmitted(true);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Error al enviar');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) return (
    <div style={{ padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>¡Gracias por tu reseña!</div>
      <div style={{ fontSize: 14, color: '#64748B' }}>Tu opinión nos ayuda a mejorar.</div>
      {starLabel(rating) && <div style={{ fontSize: 24, marginTop: 12, color: colorPrimary }}>{starLabel(rating)}</div>}
    </div>
  );

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Deja tu reseña</div>
      <div style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>¿Cómo fue tu experiencia?</div>

      {/* Selector de pedido */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 6 }}>PEDIDO A CALIFICAR</div>
        <select value={orderId} onChange={e => setOrderId(e.target.value)}
          style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box' as const, outline: 'none' }}>
          <option value="">Selecciona un pedido...</option>
          {orders.filter(o => o.status === 'finalizado').map(o => (
            <option key={o.id} value={o.id}>{o.order_number} — {o.title}</option>
          ))}
        </select>
      </div>

      {/* Rating */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 8 }}>CALIFICACIÓN</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[1,2,3,4,5].map(s => (
            <button key={s} onClick={() => setRating(s)} style={{
              fontSize: 32, border: 'none', background: 'none', cursor: 'pointer',
              filter: s <= rating ? 'none' : 'grayscale(1)',
              transform: s <= rating ? 'scale(1.1)' : 'scale(1)',
              transition: 'all .15s',
            }}>★</button>
          ))}
        </div>
      </div>

      {/* Comentario */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 6 }}>COMENTARIO (OPCIONAL)</div>
        <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
          placeholder="Cuéntanos tu experiencia..."
          style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 14, resize: 'none', boxSizing: 'border-box' as const, outline: 'none', fontFamily: 'inherit' }} />
      </div>

      {error && <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 10 }}>{error}</div>}
      <button onClick={handleSubmit} disabled={loading || !orderId || rating === 0} style={{
        width: '100%', padding: 14, borderRadius: 14, border: 'none',
        background: (!orderId || rating === 0) ? '#E2E8F0' : colorPrimary,
        color: (!orderId || rating === 0) ? '#94A3B8' : '#fff',
        fontWeight: 700, fontSize: 15, cursor: (!orderId || rating === 0) ? 'not-allowed' : 'pointer',
      }}>
        {loading ? 'Enviando...' : 'Enviar reseña'}
      </button>
    </div>
  );
}

// ─── Tab: Encuesta ────────────────────────────────────────────────────────────

function TabEncuesta({ token, survey }: { token: string; survey: { id: string; title: string } }) {
  const [nps, setNps] = useS<number | null>(null);
  const [submitted, setSubmitted] = useS(false);
  const [loading, setLoading] = useS(false);
  const [error, setError] = useS<string | null>(null);

  async function handleSubmit() {
    if (nps === null) { setError('Por favor selecciona una puntuación NPS'); return; }
    setLoading(true);
    try {
      await submitSurveyResponse({ token, surveyId: survey.id, answers: {}, npsScore: nps });
      setSubmitted(true);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Error');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) return (
    <div style={{ padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🙏</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>¡Gracias por tu respuesta!</div>
    </div>
  );

  const npsColor = nps === null ? '#94A3B8' : nps >= 9 ? '#16A34A' : nps >= 7 ? '#D97706' : '#DC2626';

  return (
    <div style={{ padding: '16px 16px 0' }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>{survey.title}</div>
      <div style={{ fontSize: 13, color: '#64748B', marginBottom: 20 }}>
        Del 0 al 10, ¿qué tan probable es que nos recomiendes?
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(11, 1fr)', gap: 6, marginBottom: 10 }}>
        {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
          <button key={n} onClick={() => setNps(n)} style={{
            padding: '10px 0', borderRadius: 10, border: 'none',
            background: nps === n ? npsColor : '#F8FAFC',
            color: nps === n ? '#fff' : '#374151',
            fontWeight: nps === n ? 800 : 500, fontSize: 13.5, cursor: 'pointer',
          }}>
            {n}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94A3B8', marginBottom: 24 }}>
        <span>Nada probable</span><span>Muy probable</span>
      </div>
      {nps !== null && (
        <div style={{ textAlign: 'center', marginBottom: 14, fontSize: 13, color: npsColor, fontWeight: 700 }}>
          {nps >= 9 ? '¡Excelente! Eres un promotor ⭐' : nps >= 7 ? 'Gracias por tu respuesta 👍' : 'Lamentamos tu experiencia. Mejoraremos 💪'}
        </div>
      )}
      {error && <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 10 }}>{error}</div>}
      <button onClick={handleSubmit} disabled={loading || nps === null} style={{
        width: '100%', padding: 14, borderRadius: 14, border: 'none',
        background: nps === null ? '#E2E8F0' : '#2563EB',
        color: nps === null ? '#94A3B8' : '#fff',
        fontWeight: 700, fontSize: 15, cursor: nps === null ? 'not-allowed' : 'pointer',
      }}>
        {loading ? 'Enviando...' : 'Enviar respuesta'}
      </button>
    </div>
  );
}

// ─── Tab: Puntos de Fidelidad ─────────────────────────────────────────────────

function TabPuntos({ token, colorPrimary }: { token: string; colorPrimary: string }) {
  const [data, setData] = useS<ClientLoyaltyData | null>(null);
  const [loading, setLoading] = useS(true);
  const [error, setError] = useS<string | null>(null);

  useE(() => {
    getClientLoyalty(token)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8' }}>Cargando puntos...</div>;
  if (error) return <div style={{ padding: 16, color: '#DC2626', fontSize: 13 }}>{error}</div>;
  if (!data)  return null;

  const level = data.current_level;
  const nextLevel = data.next_level;

  return (
    <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Score principal */}
      <div style={{ background: `linear-gradient(135deg, ${colorPrimary} 0%, ${colorPrimary}CC 100%)`, borderRadius: 18, padding: '20px 20px', color: '#fff', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 4 }}>{level?.icon ?? '🎖️'}</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,.8)' }}>Nivel</div>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>{level?.name ?? 'Bronce'}</div>
        <div style={{ fontSize: 40, fontWeight: 900 }}>{data.total_points}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)' }}>puntos acumulados</div>
        {nextLevel && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,.8)' }}>
            {data.points_to_next} puntos para {nextLevel.icon} {nextLevel.name}
          </div>
        )}
      </div>

      {/* Recompensas */}
      {data.rewards.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: .4, marginBottom: 10 }}>Recompensas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.rewards.map(r => (
              <div key={r.id} style={{ background: '#fff', borderRadius: 14, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 4px rgba(0,0,0,.06)', opacity: r.available ? 1 : 0.6 }}>
                <div style={{ fontSize: 24, flexShrink: 0 }}>🎁</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>{r.name}</div>
                  {r.description && <div style={{ fontSize: 12, color: '#64748B', marginTop: 1 }}>{r.description}</div>}
                  <div style={{ fontSize: 12, color: r.can_redeem ? '#16A34A' : '#94A3B8', marginTop: 3, fontWeight: 600 }}>
                    {r.points_required} pts {r.can_redeem ? '✓ Puedes canjear' : `(te faltan ${r.points_required - data.total_points} pts)`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historial */}
      {data.transactions.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: .4, marginBottom: 10 }}>Historial</div>
          <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
            {data.transactions.map((tx, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: i < data.transactions.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A' }}>{LOYALTY_TYPE_LABELS[tx.type] ?? tx.type}</div>
                  {tx.description && <div style={{ fontSize: 11.5, color: '#94A3B8' }}>{tx.description}</div>}
                </div>
                <span style={{ fontSize: 14, fontWeight: 800, color: tx.points > 0 ? '#16A34A' : '#DC2626', flexShrink: 0 }}>
                  {tx.points > 0 ? '+' : ''}{tx.points}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Referidos (portal público — llama a get_portal_referral_info) ──────

function TabReferidosPortal({ token, colorPrimary }: { token: string; colorPrimary: string }) {
  const [info, setInfo] = useS<PortalReferralInfo | null>(null);
  const [loading, setLoading] = useS(true);
  const [copied, setCopied] = useS(false);

  useE(() => {
    (async () => {
      const { data } = await supabase.rpc('get_portal_referral_info', { p_portal_token: token });
      setInfo((data as unknown as PortalReferralInfo) ?? { active: false });
      setLoading(false);
    })();
  }, [token]);

  function copyLink() {
    if (!info?.ref_url) return;
    const fullUrl = window.location.origin + info.ref_url;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  if (loading) return (
    <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8' }}>Cargando...</div>
  );

  if (!info?.active) return (
    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🤝</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Programa de referidos no activo</div>
      <div style={{ fontSize: 13, color: '#64748B' }}>La empresa todavía no ha habilitado el programa de referidos.</div>
    </div>
  );

  const fullUrl = window.location.origin + (info.ref_url ?? '');

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero */}
      <div style={{ background: `linear-gradient(135deg, ${colorPrimary}, #8B5CF6)`, borderRadius: 16, padding: '20px 18px', color: '#fff', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🎁</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>{info.program_name}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.85)' }}>
          Gana <strong>{info.referrer_points} puntos</strong> por cada amigo que contrate.
          Tu amigo recibe <strong>{info.referee_points} puntos</strong> de bienvenida.
        </div>
      </div>

      {/* Link */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>Tu link único</div>
        <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#374151', wordBreak: 'break-all', marginBottom: 10 }}>{fullUrl}</div>
        <button onClick={copyLink} style={{
          width: '100%', padding: '11px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
          background: copied ? '#F0FDF4' : colorPrimary, color: '#fff', fontWeight: 700, fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'background .2s',
        }}>
          {copied ? <><CheckCircle size={16} /> ¡Copiado!</> : <><Copy size={16} /> Copiar link</>}
        </button>
      </div>

      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ background: '#EFF6FF', borderRadius: 14, padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB' }}>{info.visits ?? 0}</div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>Visitas a tu link</div>
        </div>
        <div style={{ background: '#F0FDF4', borderRadius: 14, padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A' }}>{info.conversions ?? 0}</div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>Referidos exitosos</div>
        </div>
      </div>

      {/* Instrucciones */}
      <div style={{ background: '#F8FAFC', borderRadius: 14, padding: '14px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' as const, marginBottom: 10 }}>Cómo funciona</div>
        {[
          { n: '1', text: 'Comparte tu link con amigos o familiares' },
          { n: '2', text: 'Ellos visitan el link y solicitan una cotización' },
          { n: '3', text: 'Cuando aprueban la cotización, ambos ganan puntos' },
        ].map(step => (
          <div key={step.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: colorPrimary, color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{step.n}</div>
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.4 }}>{step.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
