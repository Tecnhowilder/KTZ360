import { fmtDateLong, dueDate } from '../../lib/calc';
import { formatCurrencyCOP } from '../../lib/currency';
import { computeTotals, type QuoteItem, type LaborItem, type CostConfig } from '../../lib/itemEngine';
import type { CompanySettings } from '../../lib/types';

interface Props {
  items: QuoteItem[];
  laborItems?: LaborItem[];
  config: CostConfig;
  clientName: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  quoteName: string;
  quoteNumber?: string;
  company?: Partial<CompanySettings>;
  primaryColor?: string;
}

const fmt = formatCurrencyCOP;

export function PDFPreviewRenderer({
  items, laborItems = [], config, clientName, clientPhone, clientEmail, quoteName, quoteNumber,
  company, primaryColor,
}: Props) {
  const totals       = computeTotals(items, config, laborItems);
  const now          = new Date();
  const due          = dueDate(now, config.valid_days || 15);
  const color        = primaryColor ?? company?.color_primary ?? '#2563EB';
  const companyName  = company?.name ?? 'Mi Empresa';

  return (
    <>
      <style>{`
        .pdf-mobile-table { display: none; }
        .pdf-desktop-table { display: block; }
        @media (max-width: 639px) {
          .pdf-desktop-table { display: none; }
          .pdf-mobile-table { display: flex; flex-direction: column; }
        }
      `}</style>
      <div style={{ maxWidth: 780, margin: '0 auto', background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 24px rgba(15,23,42,.12)' }}>

        {/* Header — Fila 1: logo + empresa + cotización */}
        <div style={{ background: color, padding: '20px 22px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {company?.logo_path ? (
              <div style={{ width: 52, height: 52, borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                <img src={company.logo_path} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 3 }}>
                {[.4,.7,1].map((op, i) => <div key={i} style={{ width: 6, height: 24, borderRadius: 3, background: `rgba(255,255,255,${op})`, transform: 'skewX(-16deg)' }} />)}
              </div>
            )}
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{companyName}</div>
              {company?.nit   && <div style={{ fontSize: 11.5, opacity: .8 }}>NIT {company.nit}</div>}
              {company?.email && <div style={{ fontSize: 11.5, opacity: .8 }}>{company.email}</div>}
              {company?.phone && <div style={{ fontSize: 11.5, opacity: .8 }}>{company.phone}</div>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10.5, opacity: .75, fontWeight: 700, letterSpacing: '.8px' }}>COTIZACIÓN</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', marginTop: 2 }}>{quoteNumber || '—'}</div>
          </div>
        </div>

        {/* Fila 2: 4 cards — Cliente / Proyecto / Fecha / Vigencia */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 0, borderBottom: '1px solid #E2E8F0' }}>
          {[
            { label: 'PARA', value: clientName || 'Sin cliente', sub: [clientPhone, clientEmail].filter(Boolean).join(' · ') },
            { label: 'PROYECTO', value: quoteName || 'Cotización', sub: '' },
            { label: 'EMISIÓN', value: fmtDateLong(now), sub: '' },
            { label: 'VIGENCIA', value: fmtDateLong(due), sub: `${config.valid_days || 15} días`, badge: true },
          ].map((card, i) => (
            <div key={i} style={{ padding: '12px 18px', borderRight: i % 2 === 0 ? '1px solid #E2E8F0' : 'none', borderBottom: i < 2 ? '1px solid #E2E8F0' : 'none' }}>
              <div style={{ fontSize: 9.5, color: '#94A3B8', fontWeight: 700, letterSpacing: '.5px', marginBottom: 4 }}>{card.label}</div>
              {card.badge ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#DCFCE7', color: '#166534', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 99 }}>
                  ✓ {card.value}
                </div>
              ) : (
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>{card.value}</div>
              )}
              {card.sub && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{card.sub}</div>}
            </div>
          ))}
        </div>

        {/* Resumen ejecutivo */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 0, background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
          {[
            { label: 'VALOR PROPUESTA', value: fmt(totals.total), color: color },
            { label: 'ÍTEMS', value: String(items.length + laborItems.length), color: '#0F172A' },
            { label: 'IVA INCLUIDO', value: totals.tax > 0 ? fmt(totals.tax) : 'No aplica', color: '#64748B' },
          ].map((c, i) => (
            <div key={i} style={{ padding: '10px 18px', borderRight: i < 2 ? '1px solid #E2E8F0' : 'none', textAlign: i === 0 ? 'left' : 'center' }}>
              <div style={{ fontSize: 9.5, color: '#94A3B8', fontWeight: 700, letterSpacing: '.5px', marginBottom: 3 }}>{c.label}</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: c.color, fontVariantNumeric: 'tabular-nums' }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* Ítems — tabla desktop */}
        {items.length > 0 && (
          <div style={{ padding: '14px 20px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: primaryColor, letterSpacing: '.5px', marginBottom: 8 }}>DETALLE DE LA COTIZACIÓN</div>
            <div className="pdf-desktop-table">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: '#F5F7FB' }}>
                    {['No.','Artículo','Unidad','Cantidad','Precio','Total'].map((h, i) => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: i >= 4 ? 'right' : 'left', fontWeight: 700, color: '#64748B', fontSize: 11, borderBottom: '1px solid #E2E8F0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '9px 10px', color: '#94A3B8', fontFamily: 'monospace' }}>{String(idx+1).padStart(2,'0')}</td>
                      <td style={{ padding: '9px 10px' }}>
                        <div style={{ fontWeight: 600 }}>{item.item_name}</div>
                        {item.description && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{item.description}</div>}
                      </td>
                      <td style={{ padding: '9px 10px', color: '#64748B' }}>{item.unit}</td>
                      <td style={{ padding: '9px 10px', color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>{item.quantity}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(item.unit_price)}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Cards mobile */}
            <div className="pdf-mobile-table">
              {items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #F1F5F9' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{item.item_name}</div>
                    <div style={{ fontSize: 11.5, color: '#94A3B8' }}>{item.quantity} {item.unit} × {fmt(item.unit_price)}</div>
                  </div>
                  <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmt(item.subtotal)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mano de obra */}
        {laborItems.length > 0 && (
          <div style={{ padding: '0 20px 14px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#D97706', letterSpacing: '.5px', marginBottom: 8 }}>MANO DE OBRA</div>
            {laborItems.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{item.item_name}</div>
                  <div style={{ fontSize: 11.5, color: '#94A3B8' }}>{item.quantity} {item.unit} × {fmt(item.unit_price)} · Sin IVA</div>
                </div>
                <div style={{ fontWeight: 700, color: '#D97706', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmt(item.subtotal)}</div>
              </div>
            ))}
          </div>
        )}

        {/* Totales */}
        <div style={{ margin: '0 16px 16px', padding: '14px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12 }}>
          {items.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, color: '#64748B' }}>
              <span>Subtotal productos/servicios</span>
              <span>{fmt(totals.subtotal)}</span>
            </div>
          )}
          {totals.discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, color: '#64748B' }}>
              <span>Descuento ({config.discount_pct}%)</span>
              <span style={{ color: '#DC2626' }}>-{fmt(totals.discount)}</span>
            </div>
          )}
          {totals.overhead > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, color: '#64748B' }}>
              <span>Indirectos / Utilidad</span>
              <span>{fmt(totals.overhead)}</span>
            </div>
          )}
          {totals.tax > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, color: '#64748B' }}>
              <span>IVA ({config.tax_rate}%) sobre productos</span>
              <span>{fmt(totals.tax)}</span>
            </div>
          )}
          {totals.labor_total > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: '#D97706', fontWeight: 600 }}>
              <span>Mano de obra (sin IVA)</span>
              <span>{fmt(totals.labor_total)}</span>
            </div>
          )}
          {totals.transport_cost > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: '#D97706', fontWeight: 600 }}>
              <span>🚚 Transporte (sin IVA)</span>
              <span>{fmt(totals.transport_cost)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: `2px solid ${primaryColor}` }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>TOTAL</span>
            <span style={{ fontSize: 26, fontWeight: 900, color: primaryColor, fontVariantNumeric: 'tabular-nums' }}>{fmt(totals.total)}</span>
          </div>
          {totals.advance > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginTop: 8, paddingTop: 8, borderTop: '1px solid #E2E8F0', color: '#64748B' }}>
              <span>Anticipo ({config.advance_pct}%)</span>
              <span style={{ fontWeight: 700 }}>{fmt(totals.advance)}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 20px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: '#94A3B8' }}>Emitida: {fmtDateLong(now)}</div>
          <div style={{ fontSize: 10, color: '#CBD5E1', fontWeight: 600 }}>Shelwi</div>
        </div>
      </div>
    </>
  );
}
