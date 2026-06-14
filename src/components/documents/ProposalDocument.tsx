import { Phone, Mail, MapPin, Package, Hammer, Wrench, Info, CheckCircle2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { fmt, fmtDateLong } from '../../lib/calc';
import { DOC_NOTICE, type CalcDocResultV2, type DocItem } from '../../lib/engine';
import { logoUrl } from '../../services/workspaces';
import type { CompanySettings, DerivedQuote } from '../../lib/types';

const TAX_LABELS: Record<string, string> = {
  materials: 'IVA sobre materiales',
  materials_labor: 'IVA sobre materiales y mano de obra',
  custom: 'IVA',
};

const GRID = '6% 44% 10% 10% 15% 15%';

export interface ProposalDocumentProps {
  quoteNumber: string;
  title: string;
  location: string | null;
  clientName: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  clientMeta?: string | null;
  issuedAt: Date;
  due: Date;
  doc: CalcDocResultV2;
  cfg: DerivedQuote['cfg'];
  company: CompanySettings;
  advance: number;
  /** Enlace público para verificar/consultar esta cotización (portal del cliente). */
  verifyUrl?: string | null;
}

function DocSection({ title, items, subtotalLabel, subtotal }: { title: string; items: DocItem[]; subtotalLabel: string; subtotal: number }) {
  if (items.length === 0) return null;
  return (
    <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden', marginBottom: 18 }}>
      <div style={{ padding: '10px 14px', fontSize: 11.5, fontWeight: 800, color: '#2563EB', letterSpacing: '.5px', background: '#F5F7FB', borderBottom: '1px solid #E2E8F0' }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: GRID, padding: '9px 14px', fontSize: 11, fontWeight: 700, color: '#64748B', background: '#F5F7FB' }}>
        <div>No.</div><div>Descripción</div><div>Unidad</div><div>Cantidad</div><div style={{ textAlign: 'right' }}>Precio Unitario</div><div style={{ textAlign: 'right' }}>Total</div>
      </div>
      {items.map((it) => (
        <div key={it.no} style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', padding: '10px 14px', minHeight: 40, fontSize: 12, borderTop: '1px solid #F1F5F9' }}>
          <div style={{ color: '#94A3B8', fontFamily: "'Space Mono',monospace" }}>{it.no}</div>
          <div>{it.desc}</div>
          <div style={{ color: '#64748B' }}>{it.unit}</div>
          <div style={{ color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>{it.qty}</div>
          <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(it.unitPrice)}</div>
          <div style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(it.total)}</div>
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', padding: '10px 14px', minHeight: 40, borderTop: '1px solid #E2E8F0', background: '#F8FAFC' }}>
        <div style={{ gridColumn: '1 / 6', textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{subtotalLabel}</div>
        <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 800, color: '#2563EB', fontVariantNumeric: 'tabular-nums' }}>{fmt(subtotal)}</div>
      </div>
    </div>
  );
}

export function ProposalDocument({ quoteNumber, title, location, clientName, clientPhone, clientEmail, clientMeta, issuedAt, due, doc, cfg, company, advance, verifyUrl }: ProposalDocumentProps) {
  const logo = logoUrl(company.logo_path);
  const materialItems = doc.items.filter((i) => i.kind === 'material');
  const laborItems = doc.items.filter((i) => i.kind === 'labor');
  const equipmentItems = doc.items.filter((i) => i.kind === 'equipment');

  return (
    <div id="brivia-doc" style={{ background: '#fff', maxWidth: 820, margin: '0 auto', borderRadius: 14, overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,.25)' }}>
      <div style={{ background: '#2563EB', padding: '26px 32px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, borderRadius: '14px 14px 0 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {logo ? (
            <div style={{ width: 64, height: 64, borderRadius: 14, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              <img src={logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 3 }}>
              <div style={{ width: 7, height: 30, borderRadius: 4, background: 'rgba(255,255,255,.5)', transform: 'skewX(-16deg)' }} />
              <div style={{ width: 7, height: 30, borderRadius: 4, background: 'rgba(255,255,255,.8)', transform: 'skewX(-16deg)' }} />
              <div style={{ width: 7, height: 30, borderRadius: 4, background: '#fff', transform: 'skewX(-16deg)' }} />
            </div>
          )}
          <div>
            <div style={{ fontWeight: 800, fontSize: 23, letterSpacing: '-.4px' }}>{company.name || 'Mi Empresa'}</div>
            <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 2 }}>NIT {company.nit || '—'}{company.phone ? ` - ${company.phone}` : ''}</div>
            {company.email && <div style={{ fontSize: 12.5, opacity: 0.85 }}>{company.email}</div>}
            {company.city && <div style={{ fontSize: 12.5, opacity: 0.85 }}>{company.city}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11.5, opacity: 0.85, fontWeight: 700, letterSpacing: '1px' }}>COTIZACIÓN</div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Space Mono',monospace", marginTop: 2 }}>{quoteNumber}</div>
        </div>
      </div>

      <div style={{ padding: 32 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 10.5, color: '#94A3B8', fontWeight: 700, letterSpacing: '.5px' }}>CLIENTE</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>{clientName}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              {clientPhone && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#64748B' }}><Phone size={13} /> {clientPhone}</div>}
              {clientEmail && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#64748B' }}><Mail size={13} /> {clientEmail}</div>}
              {clientMeta && <div style={{ fontSize: 12.5, color: '#64748B' }}>{clientMeta}</div>}
              {location && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#64748B' }}><MapPin size={13} /> {location}</div>}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: '#94A3B8', fontWeight: 700, letterSpacing: '.5px' }}>PROYECTO</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>{title}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10.5, color: '#94A3B8', fontWeight: 700, letterSpacing: '.5px' }}>VIGENCIA</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, background: '#EAFBF0', border: '1px solid #C6F0D5', color: '#15803D', fontSize: 12.5, fontWeight: 700, padding: '8px 14px', borderRadius: 999 }}>
              <CheckCircle2 size={14} /> Vigente hasta {fmtDateLong(due)}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'stretch', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 10.5, color: '#94A3B8', fontWeight: 700, letterSpacing: '.5px' }}>FECHA DE EMISIÓN</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>{fmtDateLong(issuedAt)}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px', minHeight: 74, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Package size={18} /></div>
              <div>
                <div style={{ fontSize: 10.5, color: '#94A3B8', fontWeight: 700, letterSpacing: '.5px' }}>MATERIALES</div>
                <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{fmt(doc.materialsAmt)}</div>
              </div>
            </div>
            <div style={{ flex: '1 1 160px', minHeight: 74, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FFFBEB', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Hammer size={18} /></div>
              <div>
                <div style={{ fontSize: 10.5, color: '#94A3B8', fontWeight: 700, letterSpacing: '.5px' }}>MANO DE OBRA</div>
                <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{fmt(doc.laborAmt)}</div>
              </div>
            </div>
            {doc.equipmentAmt > 0 && (
              <div style={{ flex: '1 1 160px', minHeight: 74, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F1F5F9', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Wrench size={18} /></div>
                <div>
                  <div style={{ fontSize: 10.5, color: '#94A3B8', fontWeight: 700, letterSpacing: '.5px' }}>EQUIPOS / OTROS</div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{fmt(doc.equipmentAmt)}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DocSection title="MATERIALES" items={materialItems} subtotalLabel="Subtotal materiales" subtotal={doc.materialsAmt} />
        <DocSection title="MANO DE OBRA" items={laborItems} subtotalLabel="Subtotal mano de obra" subtotal={doc.laborAmt} />
        <DocSection title="EQUIPOS / OTROS" items={equipmentItems} subtotalLabel="Subtotal equipos" subtotal={doc.equipmentAmt} />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
          <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #E2E8F0', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: '#64748B' }}>Subtotal</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(doc.subtotal)}</span></div>
            {doc.adminPct > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: '#64748B' }}>Administración ({doc.adminPct}%)</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(doc.adminAmt)}</span></div>
            )}
            {doc.transportAmt > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: '#64748B' }}>Transporte 🚚</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(doc.transportAmt)}</span></div>
            )}
            {doc.discPct > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: '#64748B' }}>Descuento ({doc.discPct}%)</span><span style={{ fontWeight: 700, color: '#DC2626', fontVariantNumeric: 'tabular-nums' }}>-{fmt(doc.discAmt)}</span></div>
            )}
            {doc.taxMode !== 'none' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: '#64748B' }}>{TAX_LABELS[doc.taxMode] || 'IVA'} ({doc.taxRate}%)</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(doc.ivaAmt)}</span></div>
            )}
            <div style={{ borderTop: '2px solid #0F172A', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 800 }}>TOTAL</span>
              <span style={{ fontSize: 30, fontWeight: 800, color: '#2563EB', fontVariantNumeric: 'tabular-nums' }}>{fmt(doc.total)}</span>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 18, background: '#F4F8FF', border: '1px solid #D6E4FF', borderRadius: 10, padding: '10px 14px', fontSize: 11, color: '#1E40AF', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 9 }}>
          <Info size={16} style={{ flexShrink: 0 }} /><span>{DOC_NOTICE}</span>
        </div>

        {(() => {
          const terms = [...cfg.termsConditions];
          if (cfg.advancePct > 0) {
            terms.push(`Anticipo requerido: ${cfg.advancePct}% del valor total (${fmt(advance)}).`);
          }
          if (terms.length === 0) return null;
          return (
            <div style={{ marginBottom: 18, paddingTop: 14, borderTop: '1px solid #F1F5F9' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '.5px', marginBottom: 8 }}>TÉRMINOS Y CONDICIONES</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '4px 24px' }}>
                {terms.map((t, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#64748B', lineHeight: 1.5 }}>
                    <strong style={{ color: '#0F172A' }}>{i + 1}.</strong> {t}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {cfg.includeTechnicalAnnex && (
          <div style={{ marginBottom: 18, paddingTop: 14, borderTop: '1px solid #F1F5F9' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '.5px', marginBottom: 10 }}>ANEXO TÉCNICO — MEMORIA DE CÁLCULO</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cfg.serviceLines.map((l) => {
                const context = l.service_name + (l.variant_name ? ' · ' + l.variant_name : '');
                const materialsWithFormula = l.materials.filter((m) => m.base_qty != null && m.waste_pct != null);
                if (materialsWithFormula.length === 0) return null;
                return (
                  <div key={l.id}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{context}</div>
                    {materialsWithFormula.map((m, i) => {
                      const baseQty = m.base_qty!;
                      const waste = m.waste_pct!;
                      const qtyAfterWaste = baseQty * (1 + waste / 100);
                      return (
                        <div key={i} style={{ fontSize: 11.5, color: '#64748B', lineHeight: 1.6 }}>
                          {m.is_primary && m.technical_unit ? (
                            <>
                              <strong style={{ color: '#0F172A' }}>{m.name}:</strong> Área original {Math.round(baseQty * 100) / 100} {m.technical_unit} × (1 + {waste}%) = {Math.round(qtyAfterWaste * 100) / 100} {m.technical_unit} de compra.
                              {m.coverage_per_package != null && m.package_qty != null && m.package_unit != null && m.package_price != null && (
                                <>
                                  {' '}Cobertura por {m.package_unit.toLowerCase()}: {m.coverage_per_package} {m.technical_unit} (puede variar según el formato del fabricante; calculado sobre una medida base) → {m.package_qty} {m.package_unit} × {fmt(m.package_price)} = {fmt(m.package_qty * m.package_price)}.
                                </>
                              )}
                            </>
                          ) : m.technical_unit ? (
                            <>
                              <strong style={{ color: '#0F172A' }}>{m.name}:</strong> {Math.round(baseQty * 100) / 100} {m.technical_unit} × (1 + {waste}%) = {Math.round(qtyAfterWaste * 100) / 100} {m.technical_unit}
                              {' '}÷ {m.packaging_size} {m.technical_unit}/{m.unit} → {m.qty} {m.unit}
                            </>
                          ) : (
                            <>
                              <strong style={{ color: '#0F172A' }}>{m.name}:</strong> {Math.round(baseQty * 100) / 100} {m.unit} × (1 + {waste}%) = {Math.round(qtyAfterWaste * 100) / 100} {m.unit}
                              {m.packaging_size ? (
                                <> ÷ {m.packaging_size} {m.unit}/empaque → {Math.ceil(qtyAfterWaste / m.packaging_size) * m.packaging_size} {m.unit}</>
                              ) : null}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!company.white_label_enabled && (
          <div style={{ paddingTop: 22, marginTop: 6, borderTop: '1px solid #F1F5F9', display: 'grid', gridTemplateColumns: verifyUrl ? '1fr 1px 1fr' : '1fr', alignItems: 'stretch', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', gap: 2 }}>
                  <div style={{ width: 5, height: 18, borderRadius: 3, background: '#CBD5E1', transform: 'skewX(-16deg)' }} />
                  <div style={{ width: 5, height: 18, borderRadius: 3, background: '#94A3B8', transform: 'skewX(-16deg)' }} />
                  <div style={{ width: 5, height: 18, borderRadius: 3, background: '#2563EB', transform: 'skewX(-16deg)' }} />
                </div>
                <span style={{ fontSize: 13, color: '#94A3B8' }}>Generado con <strong style={{ color: '#0F172A' }}>Brivia</strong></span>
              </div>
              <div style={{ fontSize: 10.5, color: '#94A3B8', lineHeight: 1.6, maxWidth: 280 }}>
                Software para cotización profesional de construcción, remodelación y servicios técnicos.
              </div>
              <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 2 }}>🌐 www.brivia.co</div>
            </div>

            {verifyUrl && (
              <>
                <div style={{ width: 1, background: '#E2E8F0' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 8, flexShrink: 0 }}>
                    <QRCodeSVG value={verifyUrl} size={110} />
                  </div>
                  <div style={{ fontSize: 10.5, color: '#94A3B8', lineHeight: 1.6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 3 }}>Verifica esta cotización</div>
                    <div>Escanea el código QR o ingresa a:</div>
                    <div><a href={verifyUrl} style={{ color: '#2563EB', wordBreak: 'break-all' }}>{verifyUrl.replace(/^https?:\/\//, '')}</a></div>
                    <div>Consulta, aprueba o descarga esta cotización online.</div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
