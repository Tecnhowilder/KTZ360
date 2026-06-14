import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useUI, defaultQConfig } from '../features/app/UIProvider';
import { listTemplates } from '../services/templates';
import { serviceLabel, fmtM } from '../lib/calc';
import { computeQuote } from '../lib/engine';
import type { ServiceLine } from '../lib/engine';

export function Plantillas() {
  const { workspace, company } = useWorkspace();
  const { openQuoteFlow } = useUI();

  const query = useQuery({
    queryKey: ['templates', workspace.id],
    queryFn: () => listTemplates(workspace.id),
  });

  if (query.isLoading || !query.data) return null;

  const templateCards = query.data.map((t) => {
    const serviceLines = (Array.isArray(t.service_lines) ? t.service_lines : []) as unknown as ServiceLine[];
    const total = computeQuote(serviceLines, {
      adminPct: t.admin_pct, imprevistosPct: t.imprevistos_pct, util: t.util, taxMode: t.tax_mode, taxRate: t.tax_rate, discount: t.discount, discountOn: t.discount_on,
      transportCost: t.transport_cost, transportEnabled: t.transport_enabled,
    }).total;
    return {
      id: t.id,
      name: t.name,
      summary: serviceLabel(serviceLines),
      estFmt: fmtM(total),
      serviceLines,
      admin_pct: t.admin_pct,
      imprevistos_pct: t.imprevistos_pct,
      util: t.util,
      valid_days: t.valid_days,
      discount: t.discount,
      discount_on: t.discount_on,
      tax_mode: t.tax_mode,
      tax_rate: t.tax_rate,
      transport_cost: t.transport_cost,
      transport_enabled: t.transport_enabled,
    };
  });

  function applyTemplate(t: (typeof templateCards)[number]) {
    openQuoteFlow({
      step: 4,
      cfg: {
        ...defaultQConfig(company),
        serviceLines: t.serviceLines,
        adminPct: t.admin_pct,
        imprevistosPct: t.imprevistos_pct,
        util: t.util,
        validDays: t.valid_days,
        discount: t.discount,
        discountOn: t.discount_on,
        taxMode: t.tax_mode,
        taxRate: t.tax_rate,
        transportCost: t.transport_cost,
        transportEnabled: t.transport_enabled,
        proj: t.name,
      },
    });
  }

  return (
    <div>
      <h1 style={{ fontSize: 'clamp(22px,4vw,30px)', fontWeight: 800, letterSpacing: '-1px', marginBottom: 6 }}>Plantillas favoritas</h1>
      <p style={{ fontSize: 13.5, color: '#64748B', marginBottom: 18 }}>
        Guarda combinaciones que cotizas seguido y reutilízalas en segundos. Guarda una nueva desde cualquier cotización.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 14 }}>
        {templateCards.map((t) => (
          <div key={t.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, padding: 20, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>⭐</span>
              <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.25 }}>{t.name}</div>
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>{t.summary}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#2563EB', fontVariantNumeric: 'tabular-nums', marginBottom: 14 }}>Desde {t.estFmt}</div>
            <button
              onClick={() => applyTemplate(t)}
              style={{ marginTop: 'auto', border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 13.5, padding: 11, borderRadius: 11, cursor: 'pointer' }}
            >
              Usar plantilla →
            </button>
          </div>
        ))}
        <div style={{ background: '#F8FAFF', border: '1px dashed #BFD3FF', borderRadius: 18, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1E40AF' }}>¿Cotizas algo seguido?</div>
          <p style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.5 }}>
            Abre cualquier cotización y toca <strong>“Guardar como plantilla ⭐”</strong>.
          </p>
          <button
            onClick={() => openQuoteFlow({ cfg: defaultQConfig(company) })}
            style={{ marginTop: 4, border: '1.5px solid #2563EB', background: '#fff', color: '#2563EB', fontWeight: 700, fontSize: 13, padding: '9px 14px', borderRadius: 11, cursor: 'pointer' }}
          >
            Crear cotización
          </button>
        </div>
      </div>
    </div>
  );
}
