import { Phone, Mail, MapPin, CheckCircle2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { fmt, fmtDateLong, fmtDate } from '../../lib/calc';
import { formatCurrencyCOP } from '../../lib/currency';
import { logoUrl } from '../../services/workspaces';
import { APP_URL } from '../../lib/brand';
import type { CalcDocResultV2, DocItem } from '../../lib/engine';
import type { CompanySettings, DerivedQuote } from '../../lib/types';

const GRID = '6% 44% 10% 10% 15% 15%';
const C = formatCurrencyCOP;

// ─── Tipos exportados ─────────────────────────────────────────────────────────

export interface UniversalItem {
  id: string;
  item_name: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  subtotal: number;
}

export interface UniversalLaborItem {
  id: string;
  item_name: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  subtotal: number;
}

export interface UniversalTotals {
  subtotal: number;
  discount: number;
  tax: number;
  overhead: number;
  labor_total?: number;
  transport_cost?: number;
  total: number;
  advance: number;
  balance: number;
  tax_rate?: number;
  overhead_pct?: number;
  discount_pct?: number;
}

export interface ProposalDocumentProps {
  quoteNumber: string;
  title: string;
  location: string | null;
  clientName: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  clientMeta?: string | null;
  clientDocument?: string | null;   // Cédula / NIT del cliente
  clientAddress?: string | null;    // Dirección del cliente
  issuedAt: Date;
  due: Date;
  doc: CalcDocResultV2;
  cfg: DerivedQuote['cfg'];
  company: CompanySettings;
  advance: number;
  verifyUrl?: string | null;
  pdfTier?: 'free' | 'pro';
  universalItems?: UniversalItem[];
  universalLaborItems?: UniversalLaborItem[];
  universalTotals?: UniversalTotals;
  /** Términos reales del usuario — si vacío, no se muestra la sección */
  termsConditions?: string[];
  /** Estado actual de la cotización */
  status?: string;
}

// ─── Componente interno: tabla de ítems ──────────────────────────────────────

function ItemTable({ title, headerColor, items, totalLabel, total, accent }: {
  title: string; headerColor: string;
  items: Array<{ id: string; item_name: string; description: string | null; quantity: number; unit: string; unit_price: number; subtotal: number }>;
  totalLabel: string; total: number; accent: string;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', marginBottom: 18 }}>
      <div style={{ padding: '10px 14px', fontSize: 11.5, fontWeight: 800, color: accent, letterSpacing: '.5px', background: headerColor, borderBottom: '1px solid #E2E8F0' }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: GRID, padding: '9px 14px', fontSize: 11, fontWeight: 700, color: '#64748B', background: headerColor }}>
        <div>No.</div><div>Artículo / Descripción</div><div>Unidad</div><div>Cantidad</div>
        <div style={{ textAlign: 'right' }}>Valor unitario</div><div style={{ textAlign: 'right' }}>Total</div>
      </div>
      {items.map((it, idx) => (
        <div key={it.id} style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', padding: '10px 14px', minHeight: 40, fontSize: 12, borderTop: '1px solid #F1F5F9' }}>
          <div style={{ color: '#94A3B8', fontFamily: "'Space Mono',monospace" }}>{String(idx + 1).padStart(2, '0')}</div>
          <div>
            <div style={{ fontWeight: 600 }}>{it.item_name}</div>
            {it.description && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{it.description}</div>}
          </div>
          <div style={{ color: '#64748B' }}>{it.unit}</div>
          <div style={{ color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>{it.quantity}</div>
          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{C(it.unit_price)}</div>
          <div style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{C(it.subtotal)}</div>
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', padding: '10px 14px', borderTop: '1px solid #E2E8F0', background: '#F8FAFC' }}>
        <div style={{ gridColumn: '1 / 6', textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{totalLabel}</div>
        <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 800, color: accent, fontVariantNumeric: 'tabular-nums' }}>{C(total)}</div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ProposalDocument({
  quoteNumber, title, location, clientName, clientPhone, clientEmail, clientMeta,
  clientDocument, clientAddress,
  issuedAt, due, doc, cfg, company, advance, verifyUrl, pdfTier = 'free',
  universalItems, universalLaborItems, universalTotals, termsConditions, status,
}: ProposalDocumentProps) {
  const logo         = logoUrl(company.logo_path);
  const colorPrimary = company.color_primary || '#2563EB';
  const colorAccent  = company.color_accent  || '#0F172A';
  const isUniversal  = universalItems && universalItems.length > 0;
  const showBranding = pdfTier !== 'pro' && !company.white_label_enabled;

  // Totales efectivos
  const T = isUniversal && universalTotals ? universalTotals : null;
  const totalDisplay = T?.total ?? doc.total;
  const itemCount    = isUniversal ? universalItems!.length : doc.items.length;
  const laborCount   = universalLaborItems?.length ?? 0;

  // Términos: de prop directa o de cfg (legacy)
  const terms = (() => {
    const base = termsConditions?.length
      ? [...termsConditions]
      : (cfg.termsConditions?.length ? [...cfg.termsConditions] : []);
    if (cfg.advancePct > 0 && advance > 0) {
      base.push(`Anticipo requerido: ${cfg.advancePct}% del total (${C(advance)}).`);
    }
    return base;
  })();

  return (
    <div id="ktz-doc" style={{ background: '#fff', maxWidth: 820, margin: '0 auto', borderRadius: 14, overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,.25)' }}>

      {/* ── FILA 1: Header corporativo ─────────────────────────────────────── */}
      <div style={{ background: colorPrimary, padding: '24px 32px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, borderRadius: '14px 14px 0 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {logo ? (
            <div style={{ width: 64, height: 64, borderRadius: 14, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              <img src={logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 3 }}>
              {[.4,.7,1].map((op, i) => <div key={i} style={{ width: 7, height: 30, borderRadius: 4, background: `rgba(255,255,255,${op})`, transform: 'skewX(-16deg)' }} />)}
            </div>
          )}
          <div>
            <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-.4px', lineHeight: 1 }}>{company.name || 'Mi Empresa'}</div>
            <div style={{ fontSize: 12, opacity: .8, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {company.nit   && <span>NIT {company.nit}</span>}
              {company.email && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={11} />{company.email}</span>}
              {company.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={11} />{company.phone}</span>}
              {company.city  && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} />{company.city}</span>}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, opacity: .75, fontWeight: 700, letterSpacing: '1.5px', marginBottom: 4 }}>PROPUESTA COMERCIAL</div>
          <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Space Mono',monospace" }}>{quoteNumber}</div>
          {status && (
            <div style={{ marginTop: 6, display: 'inline-block', background: 'rgba(255,255,255,.2)', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99 }}>
              {status}
            </div>
          )}
        </div>
      </div>

      {/* ── FILA 2: 4 cards de información ───────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '1px solid #E2E8F0' }}>
        {/* Card PARA — datos estructurados del cliente */}
        <div style={{ padding: '14px 16px', borderRight: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: 9.5, color: '#94A3B8', fontWeight: 700, letterSpacing: '.5px', marginBottom: 6 }}>PARA</div>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0F172A', marginBottom: 5 }}>{clientName}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {clientDocument && <div style={{ fontSize: 11, color: '#64748B' }}>CC {clientDocument}</div>}
            {clientAddress  && <div style={{ fontSize: 11, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={10} />{clientAddress}</div>}
            {clientPhone    && <div style={{ fontSize: 11, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={10} />{clientPhone}</div>}
            {clientEmail    && <div style={{ fontSize: 11, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={10} />{clientEmail}</div>}
            {!clientDocument && !clientAddress && !clientPhone && !clientEmail && clientMeta && (
              <div style={{ fontSize: 11, color: '#64748B' }}>{clientMeta}</div>
            )}
          </div>
        </div>

        {/* Card PROYECTO */}
        <div style={{ padding: '14px 16px', borderRight: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: 9.5, color: '#94A3B8', fontWeight: 700, letterSpacing: '.5px', marginBottom: 6 }}>📁 PROYECTO</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', lineHeight: 1.3 }}>{title}</div>
          {location && <div style={{ fontSize: 11, color: '#64748B', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={10} />{location}</div>}
        </div>

        {/* Card FECHA */}
        <div style={{ padding: '14px 16px', borderRight: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: 9.5, color: '#94A3B8', fontWeight: 700, letterSpacing: '.5px', marginBottom: 6 }}>📅 FECHA DE EMISIÓN</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', lineHeight: 1.3 }}>{fmtDateLong(issuedAt)}</div>
        </div>

        {/* Card VIGENCIA */}
        <div style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 9.5, color: '#94A3B8', fontWeight: 700, letterSpacing: '.5px', marginBottom: 6 }}>⏳ VIGENCIA</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#EAFBF0', border: '1px solid #C6F0D5', color: '#15803D', fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 99 }}>
            <CheckCircle2 size={12} />Hasta {fmtDateLong(due)}
          </div>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>{cfg.validDays || 15} días</div>
        </div>
      </div>

      {/* ── FILA 3: Resumen ejecutivo ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
        {[
          { label: 'VALOR DE LA PROPUESTA', value: C(totalDisplay), highlight: colorPrimary },
          { label: isUniversal ? `${itemCount + laborCount} ÍTEM${(itemCount + laborCount) !== 1 ? 'S' : ''} INCLUIDOS` : 'ARTÍCULOS', value: isUniversal ? (laborCount > 0 ? `${itemCount} productos · ${laborCount} servicios` : `${itemCount} productos`) : `${doc.items.length} ítems` },
          { label: 'IVA', value: T?.tax != null && T.tax > 0 ? C(T.tax) : (doc.ivaAmt > 0 ? C(doc.ivaAmt) : 'No aplica') },
        ].map((c, i) => (
          <div key={i} style={{ padding: '12px 16px', borderRight: i < 2 ? '1px solid #E2E8F0' : 'none' }}>
            <div style={{ fontSize: 9.5, color: '#94A3B8', fontWeight: 700, letterSpacing: '.5px', marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: c.highlight ?? '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '24px 28px 0' }}>
        {/* ── Ítems universales (V2) ──────────────────────────────────────────── */}
        {isUniversal && universalItems && (
          <ItemTable
            title="DETALLE DE LA COTIZACIÓN"
            headerColor="#F5F7FB"
            accent={colorPrimary}
            items={universalItems}
            totalLabel="Subtotal"
            total={T?.subtotal ?? 0}
          />
        )}

        {/* Servicios adicionales / Mano de obra (sin IVA) */}
        {universalLaborItems && universalLaborItems.length > 0 && (
          <ItemTable
            title="SERVICIOS ADICIONALES · Sin IVA"
            headerColor="#FFFBEB"
            accent="#D97706"
            items={universalLaborItems}
            totalLabel="Total servicios adicionales"
            total={T?.labor_total ?? 0}
          />
        )}

        {/* ── Ítems legacy V1 (service_lines) ────────────────────────────────── */}
        {!isUniversal && (() => {
          const materialItems  = doc.items.filter(i => i.kind === 'material');
          const laborItems     = doc.items.filter(i => i.kind === 'labor');
          const equipmentItems = doc.items.filter(i => i.kind === 'equipment');
          const toUniversal = (it: DocItem) => ({
            id: it.no, item_name: it.desc, description: null,
            quantity: it.qty, unit: it.unit, unit_price: it.unitPrice, subtotal: it.total,
          });
          return (
            <>
              {materialItems.length > 0  && <ItemTable title="MATERIALES"    headerColor="#F5F7FB" accent={colorPrimary} items={materialItems.map(toUniversal)}  totalLabel="Subtotal materiales"   total={doc.materialsAmt} />}
              {laborItems.length > 0     && <ItemTable title="MANO DE OBRA"  headerColor="#FFFBEB" accent="#D97706"      items={laborItems.map(toUniversal)}     totalLabel="Subtotal mano de obra" total={doc.laborAmt} />}
              {equipmentItems.length > 0 && <ItemTable title="EQUIPOS/OTROS" headerColor="#F5F7FB" accent="#64748B"      items={equipmentItems.map(toUniversal)} totalLabel="Subtotal equipos"      total={doc.equipmentAmt} />}
            </>
          );
        })()}

        {/* ── RESUMEN DE INVERSIÓN ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
          <div style={{ width: 340, border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ background: colorPrimary, color: '#fff', padding: '10px 18px', fontSize: 11, fontWeight: 800, letterSpacing: '1px' }}>
              RESUMEN DE INVERSIÓN
            </div>
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {/* Subtotal */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#64748B' }}>Subtotal</span>
                <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{C(T?.subtotal ?? doc.subtotal)}</span>
              </div>
              {/* Descuento */}
              {(T?.discount ?? 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#64748B' }}>Descuentos{T?.discount_pct ? ` (${T.discount_pct}%)` : ''}</span>
                  <span style={{ fontWeight: 600, color: '#16A34A', fontVariantNumeric: 'tabular-nums' }}>-{C(T!.discount)}</span>
                </div>
              )}
              {/* Gastos indirectos */}
              {(T?.overhead ?? 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#64748B' }}>Gastos indirectos</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{C(T!.overhead)}</span>
                </div>
              )}
              {/* Servicios adicionales */}
              {(T?.labor_total ?? 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#64748B' }}>Servicios adicionales</span>
                  <span style={{ fontWeight: 600, color: '#D97706', fontVariantNumeric: 'tabular-nums' }}>{C(T!.labor_total!)}</span>
                </div>
              )}
              {/* Transporte */}
              {(T?.transport_cost ?? 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#64748B' }}>🚚 Transporte (sin IVA)</span>
                  <span style={{ fontWeight: 600, color: '#D97706', fontVariantNumeric: 'tabular-nums' }}>{C(T!.transport_cost!)}</span>
                </div>
              )}
              {/* Impuestos */}
              {(T?.tax ?? doc.ivaAmt) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#64748B' }}>Impuestos{T?.tax_rate ? ` (IVA ${T.tax_rate}%)` : ''}</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{C(T?.tax ?? doc.ivaAmt)}</span>
                </div>
              )}
              {/* Legacy: admin, transporte, descuento */}
              {!isUniversal && doc.adminPct > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#64748B' }}>Administración ({doc.adminPct}%)</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(doc.adminAmt)}</span>
                </div>
              )}
              {/* TOTAL */}
              <div style={{ borderTop: `2px solid ${colorAccent}`, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 800 }}>TOTAL PROPUESTA</span>
                <span style={{ fontSize: 26, fontWeight: 900, color: colorPrimary, fontVariantNumeric: 'tabular-nums' }}>{C(totalDisplay)}</span>
              </div>
              {/* Anticipo */}
              {advance > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, paddingTop: 8, borderTop: '1px dashed #E2E8F0', color: '#64748B' }}>
                  <span>Anticipo ({cfg.advancePct}%)</span>
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{C(advance)}</span>
                </div>
              )}
              {advance > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748B' }}>
                  <span>Saldo restante</span>
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{C(totalDisplay - advance)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Términos y condiciones ───────────────────────────────────────────── */}
        <div style={{ marginBottom: 24, paddingTop: 16, borderTop: '1px solid #F1F5F9' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '.5px', marginBottom: 10 }}>TÉRMINOS Y CONDICIONES</div>
          {terms.length === 0 ? (
            <div style={{ fontSize: 11, color: '#CBD5E1', fontStyle: 'italic' }}>
              No se configuraron términos y condiciones para esta propuesta.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '4px 24px' }}>
              {terms.map((t, i) => (
                <div key={i} style={{ fontSize: 11, color: '#64748B', lineHeight: 1.5 }}>
                  <strong style={{ color: '#0F172A' }}>{i + 1}.</strong> {t}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── FOOTER: 3 columnas ───────────────────────────────────────────────── */}
        {/* Footer: si no hay branding ni verifyUrl, no renderizar el footer vacío */}
        {(showBranding || verifyUrl) && <div style={{ paddingTop: 20, marginTop: 4, borderTop: '1px solid #F1F5F9', display: 'grid', gridTemplateColumns: showBranding && verifyUrl ? '1fr 1px 160px 1px 1fr' : showBranding ? '1fr' : verifyUrl ? '1fr 1px 160px' : '1fr', alignItems: 'stretch', gap: 0 }}>

          {/* Columna izquierda: branding Shelwi */}
          {showBranding && (
            <div style={{ paddingRight: 24, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
              <div>
                <div style={{ fontSize: 9.5, color: '#94A3B8', fontWeight: 700, letterSpacing: '.5px', marginBottom: 6 }}>
                  GENERADO CON
                </div>
                <img
                  src="/icons/logo-horizontal-white-bg.png"
                  alt="Shelwi"
                  style={{ height: 28, width: 'auto', objectFit: 'contain', display: 'block' }}
                />
              </div>
              <div style={{ fontSize: 10.5, color: '#94A3B8', lineHeight: 1.6, maxWidth: 220 }}>
                Plataforma de cotización profesional para cualquier sector económico.
              </div>
              <a href={`https://${APP_URL.replace(/^https?:\/\//, '')}`} style={{ fontSize: 10.5, color: colorPrimary }}>
                🌐 {APP_URL.replace(/^https?:\/\//, '')}
              </a>
            </div>
          )}

          {/* Separador */}
          {verifyUrl && showBranding && <div style={{ background: '#E2E8F0', width: 1, margin: '0 24px' }} />}

          {/* Columna central: QR inteligente */}
          {verifyUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '0 16px' }}>
              <div style={{ background: '#fff', border: `2px solid ${colorPrimary}22`, borderRadius: 12, padding: 8 }}>
                <QRCodeSVG value={verifyUrl} size={100} fgColor={colorAccent} />
              </div>
              <div style={{ textAlign: 'center', fontSize: 10, color: '#94A3B8', lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 11 }}>Verifica esta propuesta</div>
                <div>{quoteNumber}</div>
                {status && <div style={{ color: colorPrimary, fontWeight: 600 }}>{status}</div>}
              </div>
            </div>
          )}

          {/* Separador */}
          {verifyUrl && <div style={{ background: '#E2E8F0', width: 1, margin: '0 24px' }} />}

          {/* Columna derecha: info verificación */}
          {verifyUrl && (
            <div style={{ paddingLeft: showBranding ? 0 : 0, display: 'flex', flexDirection: 'column', gap: 5, justifyContent: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Consulta online</div>
              <div style={{ fontSize: 10.5, color: '#64748B' }}>
                <a href={verifyUrl} style={{ color: colorPrimary, wordBreak: 'break-all', fontSize: 10 }}>{verifyUrl.replace(/^https?:\/\//, '')}</a>
              </div>
              <div style={{ fontSize: 10.5, color: '#64748B' }}>📅 Emisión: {fmtDate(issuedAt)}</div>
              <div style={{ fontSize: 10.5, color: '#64748B' }}>⏰ Vence: {fmtDate(due)}</div>
              <div style={{ marginTop: 4, fontSize: 10.5, color: '#94A3B8', lineHeight: 1.5 }}>
                Aprueba, descarga o comenta esta propuesta desde el enlace anterior.
              </div>
            </div>
          )}
        </div>}

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
