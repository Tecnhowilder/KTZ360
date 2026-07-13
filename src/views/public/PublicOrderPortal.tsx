/**
 * PublicOrderPortal — /o/:token
 * Portal público de pedidos. Espejo de PublicQuotePortal para el módulo Pedidos.
 * No requiere autenticación. Acceso controlado exclusivamente por token UUID.
 *
 * Zero Trust: el RPC get_public_order valida el token en DB (SECURITY DEFINER).
 * Sin token válido → mensaje de error, sin datos expuestos.
 */
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPublicOrder } from '../../services/orderPortal';
import { formatCurrencyCOP } from '../../lib/currency';

export function PublicOrderPortal() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey:  ['publicOrder', token],
    queryFn:   () => getPublicOrder(token!),
    enabled:   !!token,
    staleTime: 5 * 60_000,
    retry:     false,
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
          <div style={{ fontSize: 14, color: '#94A3B8' }}>Cargando pedido...</div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>Enlace no válido</h1>
          <p style={{ fontSize: 14, color: '#64748B' }}>
            Este enlace ha expirado o no es válido. Contacta al remitente para obtener un nuevo enlace.
          </p>
        </div>
      </div>
    );
  }

  const order   = data.order   as Record<string, unknown>;
  const client  = data.client  as Record<string, unknown> | null;
  const company = data.company as Record<string, unknown> | null;

  const items    = (((order.order_snapshot as Record<string, unknown>)?.items as unknown[]) ?? []) as Record<string, unknown>[];
  const total    = Number(order.total_amount ?? 0);
  const title    = String(order.title ?? 'Pedido');
  const orderNum = String(order.order_number ?? '');
  const status   = String(order.status ?? 'pendiente');

  const STATUS_LABEL: Record<string, string> = {
    pendiente:    'Pendiente',
    programado:   'Programado',
    en_ejecucion: 'En ejecución',
    pausado:      'Pausado',
    finalizado:   'Finalizado',
    cancelado:    'Cancelado',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      {/* Header empresa */}
      <div style={{ background: '#7C3AED', padding: '20px 16px 24px', color: '#fff' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ fontSize: 12, opacity: .8, marginBottom: 4 }}>
            {company ? String(company.name ?? 'Empresa') : 'Empresa'}
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, lineHeight: 1.2 }}>{title}</h1>
          {orderNum && <div style={{ fontSize: 13, opacity: .8, marginTop: 4 }}>{orderNum}</div>}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
            <div style={{ background: 'rgba(255,255,255,.2)', borderRadius: 99, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>
              {STATUS_LABEL[status] ?? status}
            </div>
            {client && (
              <div style={{ fontSize: 13, opacity: .8 }}>
                👤 {String(client.name ?? '')}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px' }}>
        {/* Total */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
          <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 4 }}>Total del pedido</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrencyCOP(total)}
          </div>
        </div>

        {/* Ítems */}
        {items.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
            <div style={{ padding: '14px 16px 10px', fontSize: 13, fontWeight: 700, color: '#0F172A', borderBottom: '1px solid #F1F5F9' }}>
              Ítems del pedido
            </div>
            {items.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i < items.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>
                    {String(it.item_name ?? it.service_name ?? `Ítem ${i + 1}`)}
                  </div>
                  <div style={{ fontSize: 12, color: '#94A3B8' }}>
                    {Number(it.quantity ?? 1)} {String(it.unit ?? 'und')} × {formatCurrencyCOP(Number(it.unit_price ?? 0))}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>
                  {formatCurrencyCOP(Number(it.subtotal ?? 0))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info empresa */}
        {company && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
              {String(company.name ?? '')}
            </div>
            {company.phone != null && (
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 2 }}>📞 {String(company.phone)}</div>
            )}
            {company.email != null && (
              <div style={{ fontSize: 12, color: '#64748B' }}>✉️ {String(company.email)}</div>
            )}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: '#CBD5E1' }}>
          Documento generado con Shelwi
        </div>
      </div>
    </div>
  );
}
