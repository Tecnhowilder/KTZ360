import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, MessageCircle, MoreVertical, Download, Mail, Pencil, Package } from 'lucide-react';
import { getQuote, updateQuoteStatus } from '../services/quotes';
import { listQuoteItems } from '../services/quoteItems';
import { listClients } from '../services/clients';
import { getOrCreateQuoteToken } from '../services/publicPortal';
import { QuoteStatusBadge } from '../components/quotes/QuoteStatusBadge';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useUI } from '../features/app/UIProvider';
import { useFeatureAccess } from '../hooks/usePermissions';
import { useToast } from '../components/ui/Toast';
import { formatCurrencyCOP } from '../lib/currency';
import { shareByEmail, openWhatsAppShare } from '../lib/shareUtils';
import { useCreateOrder } from '../hooks/useOrders';
import type { QuoteStatus } from '../lib/types';
import type { QuoteItemRow } from '../services/quoteItems';

const STATUS_ACTIONS: { status: QuoteStatus; label: string; color: string; bg: string }[] = [
  { status: 'Enviada',   label: 'Marcar como enviada',   color: '#92400E', bg: '#FEF3C7' },
  { status: 'Aprobada',  label: 'Marcar como aprobada',  color: '#166534', bg: '#DCFCE7' },
  { status: 'Rechazada', label: 'Marcar como rechazada', color: '#991B1B', bg: '#FEE2E2' },
  { status: 'Vencida',   label: 'Marcar como vencida',   color: '#64748B', bg: '#E2E8F0' },
];

export function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { workspace } = useWorkspace();
  const { openDocument } = useUI();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const editAccess   = useFeatureAccess('quote_editing_enabled');
  const ordersAccess = useFeatureAccess('orders_enabled');
  const { openUpgradeModal } = useUI();
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const createOrderMut = useCreateOrder();

  const quoteQ  = useQuery({ queryKey: ['quote', id],          queryFn: () => getQuote(id!),               enabled: !!id });
  const itemsQ  = useQuery({ queryKey: ['quoteItems', id],     queryFn: () => listQuoteItems(id!),          enabled: !!id });
  const clientsQ = useQuery({ queryKey: ['clients', workspace.id], queryFn: () => listClients(workspace.id) });

  const statusMut = useMutation({
    mutationFn: (s: QuoteStatus) => updateQuoteStatus(id!, s),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quote', id] });
      qc.invalidateQueries({ queryKey: ['quotes'] });
      showToast('Estado actualizado ✓');
      setStatusMenuOpen(false);
    },
  });

  const q = quoteQ.data;
  const items: QuoteItemRow[] = itemsQ.data ?? [];
  const client = q?.client_id ? clientsQ.data?.find(c => c.id === q.client_id) : null;

  if (quoteQ.isLoading || !q) {
    return <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: '#94A3B8', fontSize: 14 }}>Cargando...</div></div>;
  }

  const snap = (q as any).snapshot_items as any;
  const totals = snap?.totals ?? (q as any).calc_snapshot as any;
  const total = totals?.total ?? 0;
  const tax = totals?.tax ?? 0;
  const discount = totals?.discount ?? 0;

  async function getPublicUrl() {
    const token = await getOrCreateQuoteToken(id!);
    // B2-C: auto-cambiar a 'Enviada' al generar/compartir el link
    if (q && q.status === 'Borrador') {
      updateQuoteStatus(id!, 'Enviada')
        .then(() => { qc.invalidateQueries({ queryKey: ['quote', id] }); qc.invalidateQueries({ queryKey: ['quotes'] }); })
        .catch(() => {});
    }
    return `${window.location.origin}/p/${token}`;
  }

  async function handleWhatsApp() {
    setSharing(true);
    try {
      const url = await getPublicUrl();
      openWhatsAppShare({
        clientName: client?.name ?? '',
        projectName: q?.title ?? '',
        companyName: '',
        publicUrl: url,
        total: total,
        phone: client?.phone ?? undefined,
      });
    } catch { showToast('Error al generar link'); }
    finally { setSharing(false); }
  }

  async function handleEmail() {
    setSharing(true);
    try {
      const url = await getPublicUrl();
      await shareByEmail({
        clientName: client?.name ?? '',
        projectName: q?.title ?? '',
        companyName: '',
        publicUrl: url,
        total: total,
        clientEmail: client?.email ?? undefined,
      });
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') showToast('Error al abrir correo');
    }
    finally { setSharing(false); }
  }

  async function handleCopyLink() {
    setSharing(true);
    try {
      const url = await getPublicUrl();
      await navigator.clipboard.writeText(url);
      showToast('Link copiado ✓');
    } catch { showToast('Error al copiar link'); }
    finally { setSharing(false); }
  }

  function handlePDF() {
    openDocument(id!);
  }

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      {/* Header sticky */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '12px 16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/app/cotizaciones')} style={{ border: 'none', background: '#F1F5F9', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#0F172A', flexShrink: 0 }}>
            <ArrowLeft size={18} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</div>
            <div style={{ fontSize: 12, color: '#64748B' }}>{(q as any).quote_number ?? ''}</div>
          </div>
          <QuoteStatusBadge status={q.status} />
        </div>
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Total */}
        <div style={{ background: 'linear-gradient(135deg,#2563EB 0%,#1D4ED8 100%)', borderRadius: 16, padding: '18px 20px', color: '#fff' }}>
          <div style={{ fontSize: 12, opacity: .8, marginBottom: 4 }}>Total de la cotización</div>
          <div style={{ fontSize: 30, fontWeight: 900, fontVariantNumeric: 'tabular-nums', letterSpacing: '-1px' }}>{formatCurrencyCOP(total)}</div>
          {client && <div style={{ fontSize: 13, opacity: .8, marginTop: 6 }}>Cliente: {client.name}</div>}
        </div>

        {/* Ítems */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px' }}>Detalle de la cotización</div>
          </div>
          {items.length > 0 ? items.map((item, idx) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: idx < items.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>{item.item_name}</div>
                {item.description && <div style={{ fontSize: 12, color: '#94A3B8' }}>{item.description}</div>}
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{item.quantity} {item.unit} × ${item.unit_price.toLocaleString('es-CO')}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>${Math.round(item.subtotal).toLocaleString('es-CO')}</div>
            </div>
          )) : (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Sin ítems registrados</div>
          )}
          {/* Totales */}
          <div style={{ padding: '14px 16px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0' }}>
            {discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748B', marginBottom: 6 }}><span>Descuento</span><span style={{ color: '#DC2626' }}>-${Math.round(discount).toLocaleString('es-CO')}</span></div>}
            {tax > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748B', marginBottom: 8 }}><span>IVA</span><span>${Math.round(tax).toLocaleString('es-CO')}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid #E2E8F0' }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>Total</span>
              <span style={{ fontSize: 22, fontWeight: 900, color: '#2563EB', fontVariantNumeric: 'tabular-nums' }}>{formatCurrencyCOP(total)}</span>
            </div>
          </div>
        </div>

        {/* Compartir */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>Compartir</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={handleWhatsApp} disabled={sharing} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', border: 'none', borderRadius: 11, background: '#F0FDF4', color: '#16A34A', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', opacity: sharing ? .6 : 1, fontFamily: 'inherit' }}>
              <MessageCircle size={16} /> WhatsApp
            </button>
            <button onClick={handleEmail} disabled={sharing} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', border: 'none', borderRadius: 11, background: '#EFF6FF', color: '#2563EB', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', opacity: sharing ? .6 : 1, fontFamily: 'inherit' }}>
              <Mail size={16} /> Correo
            </button>
            <button onClick={handleCopyLink} disabled={sharing} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', border: 'none', borderRadius: 11, background: '#EFF6FF', color: '#2563EB', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', opacity: sharing ? .6 : 1, fontFamily: 'inherit' }}>
              <Copy size={16} /> Copiar link
            </button>
            <button onClick={handlePDF} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', border: 'none', borderRadius: 11, background: '#F8FAFC', color: '#0F172A', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Download size={16} /> Ver PDF
            </button>
          </div>
        </div>

        {/* Editar cotización */}
        <button
          onClick={() => {
            if (editAccess.data === false) {
              openUpgradeModal({
                title: 'Shelwi PRO',
                message: 'La edición de cotizaciones ya enviadas está disponible en los planes PRO y PREMIUM.',
                targetPlan: 'pro',
                ctaLabel: 'Actualizar a PRO',
                secondaryLabel: 'Seguir con FREE',
                bullets: [
                  'Editar cotizaciones enviadas',
                  'Agregar o eliminar artículos',
                  'Modificar clientes y precios',
                  'Actualizar vigencias y condiciones',
                  'Mantener historial de cambios',
                ],
              });
            } else {
              navigate(`/app/cotizaciones/${id}/editar`);
            }
          }}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 0 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Pencil size={15} color="#2563EB" />
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Editar cotización</div>
              <div style={{ fontSize: 12, color: '#94A3B8' }}>
                {editAccess.data === false ? 'Disponible en PRO y PREMIUM' : 'Modificar ítems, precios y condiciones'}
              </div>
            </div>
          </div>
          {editAccess.data === false && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#D97706', background: '#FEF3C7', padding: '3px 8px', borderRadius: 99 }}>PRO</span>
          )}
        </button>

        {/* Crear Pedido — solo si cotización Aprobada */}
        {q.status === 'Aprobada' && (
          <button
            onClick={async () => {
              if (ordersAccess.data === false) {
                openUpgradeModal({ title: 'Pedidos operativos en PREMIUM', message: 'Convierte cotizaciones aprobadas en pedidos ejecutables con órdenes de trabajo.', targetPlan: 'premium', ctaLabel: 'Actualizar a PREMIUM' });
                return;
              }
              setCreatingOrder(true);
              try {
                const { orderId } = await createOrderMut.mutateAsync({ quoteId: id! });
                showToast('Pedido creado ✓');
                navigate(`/app/pedidos/${orderId}`);
              } catch (e: any) {
                showToast(e.message?.includes('Ya existe') ? 'Ya existe un pedido activo para esta cotización' : e.message);
              } finally { setCreatingOrder(false); }
            }}
            disabled={creatingOrder}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', background: '#F0FDF4', border: '2px solid #BBF7D0',
              borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit', opacity: creatingOrder ? .7 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Package size={15} color="#16A34A" />
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#166534' }}>
                  {creatingOrder ? 'Creando pedido...' : 'Crear Pedido'}
                </div>
                <div style={{ fontSize: 12, color: '#4ADE80' }}>Generar pedido operativo desde esta cotización</div>
              </div>
            </div>
            {ordersAccess.data === false && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED', background: '#F3E8FF', padding: '3px 8px', borderRadius: 99 }}>PREMIUM</span>
            )}
          </button>
        )}

        {/* Cambiar estado */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden', position: 'relative' }}>
          <button onClick={() => setStatusMenuOpen(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Cambiar estado</span>
            <MoreVertical size={18} color="#64748B" />
          </button>
          {statusMenuOpen && (
            <div style={{ padding: '0 12px 12px' }}>
              {STATUS_ACTIONS.filter(a => a.status !== q.status).map(a => (
                <button key={a.status} onClick={() => statusMut.mutate(a.status)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', border: 'none', borderRadius: 10, background: a.bg, cursor: 'pointer', marginBottom: 6, fontFamily: 'inherit' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: a.color }}>{a.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
