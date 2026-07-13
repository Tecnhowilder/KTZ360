/**
 * OrderDocumentOverlay — PDF profesional para Pedidos.
 *
 * - Usa PDFPreviewRenderer (mismo motor visual que Cotizaciones)
 * - Reconstruye QuoteItem[] y CostConfig desde order_snapshot
 * - Envuelve en #ktz-doc-wrap para que el CSS de impresión funcione
 * - Sin barra de share duplicada (el share está en Step 4)
 */
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { formatCurrencyCOP } from '../../lib/currency';
import { DEFAULT_COST_CONFIG, type QuoteItem, type CostConfig } from '../../lib/document-engine';
import { PDFPreviewRenderer } from '../quote-new/PDFPreviewRenderer';
import { getOrCreateOrderToken, registerOrderEvent } from '../../services/orderPortal';
import { getOrder } from '../../services/orders';

interface Props {
  orderId: string;
  onClose: () => void;
}

/** Extrae CostConfig guardado en notes con formato "__cfg:{...}}" */
function parseCostConfig(notes: string | null | undefined): CostConfig {
  try {
    if (!notes) return DEFAULT_COST_CONFIG;
    const match = notes.match(/__cfg:(\{.+?\})\}/);
    if (!match) return DEFAULT_COST_CONFIG;
    const partial = JSON.parse(match[1]) as Partial<CostConfig>;
    return { ...DEFAULT_COST_CONFIG, ...partial };
  } catch {
    return DEFAULT_COST_CONFIG;
  }
}

export function OrderDocumentOverlay({ orderId, onClose }: Props) {
  const { company } = useWorkspace();

  const orderQ = useQuery({
    queryKey: ['order', orderId],
    queryFn:  () => getOrder(orderId),
    enabled:  !!orderId,
    staleTime: 5 * 60_000,
  });

  const tokenQ = useQuery({
    queryKey: ['orderToken', orderId],
    queryFn:  () => getOrCreateOrderToken(orderId),
    enabled:  !!orderId,
    staleTime: 60 * 60_000,
  });

  const order = orderQ.data?.order as Record<string, unknown> | undefined;
  if (!order) return null;

  const snapshot   = (order.order_snapshot as Record<string, unknown>) ?? {};
  const rawItems   = (snapshot.items as Record<string, unknown>[]) ?? [];
  const totalAmt   = Number(order.total_amount ?? snapshot.total ?? 0);
  const title      = String(order.title ?? 'Pedido');
  const orderNum   = String(order.order_number ?? '');
  const clientName = String((order as Record<string, unknown>).client_name ?? 'Cliente');
  const notesRaw   = (order as Record<string, unknown>).notes as string | null;

  // Reconstruir QuoteItem[] desde el snapshot para PDFPreviewRenderer
  const quoteItems: QuoteItem[] = rawItems.map((it, idx) => {
    const unitPrice = Number(it.unit_price ?? 0);
    const qty       = Number(it.quantity ?? 1);
    const discount  = Number(it.discount ?? 0);
    const subtotal  = Number(it.subtotal ?? unitPrice * qty * (1 - discount / 100));
    return {
      type:            'PRODUCT' as const,
      item_name:       String(it.item_name ?? it.service_name ?? `Ítem ${idx + 1}`),
      description:     it.description ? String(it.description) : undefined,
      quantity:        qty,
      unit:            String(it.unit ?? 'und'),
      unit_price:      unitPrice,
      discount,
      subtotal,
      catalog_item_id: it.catalog_item_id ? String(it.catalog_item_id) : null,
      sort_order:      idx,
    };
  });

  // Reconstruir CostConfig desde notes (guardado en handleSave de PedidoNuevoPage)
  const costConfig = parseCostConfig(notesRaw);

  function handlePrint() {
    if (tokenQ.data) registerOrderEvent(tokenQ.data, 'order_downloaded').catch(() => {});
    window.print();
  }

  return (
    <>
      {/* Backdrop — oculto al imprimir */}
      <div onClick={onClose} className="no-print"
        style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,.5)' }} />

      {/* Panel — oculto al imprimir excepto #ktz-doc-wrap */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 65, display: 'flex', flexDirection: 'column', background: '#F8FAFC' }}>

        {/* Header */}
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: '#fff', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>{title}</div>
            {orderNum && <div style={{ fontSize: 11, color: '#94A3B8' }}>{orderNum}</div>}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#F1F5F9', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={18} color="#374151" />
          </button>
        </div>

        {/* Total + botón PDF */}
        <div className="no-print" style={{ background: '#7C3AED', padding: '12px 16px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.8)', marginBottom: 2 }}>Total del pedido</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
              {formatCurrencyCOP(totalAmt)}
            </div>
          </div>
          <button onClick={handlePrint} disabled={orderQ.isLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'rgba(255,255,255,.2)', color: '#fff', fontWeight: 700, fontSize: 13, padding: '10px 18px', borderRadius: 10, cursor: 'pointer' }}>
            🖨 Descargar PDF
          </button>
        </div>

        {/* Documento — #ktz-doc-wrap detectado por CSS de impresión */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }} id="ktz-doc-scroll">
          {orderQ.isLoading ? (
            <div style={{ textAlign: 'center', color: '#94A3B8', padding: 40 }}>Cargando...</div>
          ) : (
            <div id="ktz-doc-wrap">
              <div id="ktz-doc">
                <PDFPreviewRenderer
                  items={quoteItems}
                  laborItems={[]}
                  config={costConfig}
                  clientName={clientName}
                  quoteName={title}
                  quoteNumber={orderNum}
                  company={company ?? undefined}
                  documentLabel="PEDIDO"
                  primaryColor="#7C3AED"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
