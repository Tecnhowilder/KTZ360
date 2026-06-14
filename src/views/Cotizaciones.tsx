import { useState } from 'react';
import { Icon, COPY_ICON_PATH } from '../lib/icons';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useUI, defaultQConfig } from '../features/app/UIProvider';
import { useDerivedQuotes } from '../hooks/useQuotes';
import { fmtM, statusStyle } from '../lib/calc';
import type { DerivedQuote, QuoteStatus } from '../lib/types';

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'borrador', label: 'Borradores' },
  { key: 'enviada', label: 'Enviadas' },
  { key: 'aprobada', label: 'Aprobadas' },
  { key: 'rechazada', label: 'Rechazadas' },
  { key: 'vencida', label: 'Vencidas' },
];

export function Cotizaciones() {
  const { company } = useWorkspace();
  const { openQuoteFlow, openQuoteDetail } = useUI();
  const { quotes, isLoading } = useDerivedQuotes();
  const [statusFilter, setStatusFilter] = useState('todas');

  if (isLoading) return null;

  const cnt = (st: QuoteStatus) => quotes.filter((q) => q.status === st).length;
  const totalQuoted = quotes.reduce((a, q) => a + q.calc.total, 0);
  const approvedCount = cnt('Aprobada');
  const sentCount = cnt('Enviada');
  const closedCount = approvedCount + cnt('Rechazada');
  const closeRate = closedCount ? Math.round((approvedCount / closedCount) * 100) : 0;

  const filteredQuotes = quotes.filter((q) => statusFilter === 'todas' || q.status.toLowerCase() === statusFilter);

  function duplicate(e: React.MouseEvent, q: DerivedQuote) {
    e.stopPropagation();
    openQuoteFlow({
      step: 4,
      cfg: {
        clientId: q.client_id,
        proj: q.title + ' (copia)',
        loc: q.location || '',
        serviceLines: q.cfg.serviceLines,
        adminPct: q.cfg.adminPct,
        imprevistosPct: q.cfg.imprevistosPct,
        util: q.cfg.util,
        taxMode: q.cfg.taxMode,
        taxRate: q.cfg.taxRate,
        advancePct: q.cfg.advancePct,
        docDetailLevel: q.cfg.docDetailLevel,
        includeTechnicalAnnex: q.cfg.includeTechnicalAnnex,
        validDays: q.cfg.validDays,
        discount: q.cfg.discount,
        discountOn: q.cfg.discountOn,
        transportCost: q.cfg.transportCost,
        transportEnabled: q.cfg.transportEnabled,
      },
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
        <h1 style={{ fontSize: 'clamp(22px,4vw,30px)', fontWeight: 800, letterSpacing: '-1px' }}>Cotizaciones</h1>
        <button
          onClick={() => openQuoteFlow({ cfg: defaultQConfig(company) })}
          style={{ border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 14, padding: '11px 17px', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}
        >
          <span style={{ fontSize: 17 }}>+</span> Nueva
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 15, padding: 15 }}>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>Total cotizado</div>
          <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtM(totalQuoted)}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 15, padding: 15 }}>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>Aprobadas</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#22C55E' }}>{approvedCount}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 15, padding: 15 }}>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>Por seguir</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#F59E0B' }}>{sentCount}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 15, padding: 15 }}>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>Tasa de cierre</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB' }}>{closeRate}%</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {STATUS_FILTERS.map((f) => {
          const active = statusFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              style={{
                border: `1px solid ${active ? '#2563EB' : '#E2E8F0'}`,
                background: active ? '#2563EB' : '#fff',
                color: active ? '#fff' : '#475569',
                fontWeight: 600,
                fontSize: 13,
                padding: '8px 15px',
                borderRadius: 99,
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, overflow: 'hidden' }}>
        {filteredQuotes.map((q) => {
          const st = statusStyle(q.status);
          return (
            <div
              key={q.id}
              onClick={() => openQuoteDetail(q.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}
            >
              <div style={{ width: 42, height: 42, borderRadius: 12, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB', fontWeight: 800, flexShrink: 0 }}>
                {q.initial}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.title}</div>
                <div style={{ fontSize: 12, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {q.clientName} · {q.dateLabel}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtM(q.calc.total)}</div>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: st.c, background: st.b, padding: '2px 7px', borderRadius: 6 }}>{q.status}</span>
              </div>
              <button
                onClick={(e) => duplicate(e, q)}
                title="Duplicar"
                style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <span style={{ width: 17, height: 17, display: 'flex' }}>
                  <Icon path={COPY_ICON_PATH} />
                </span>
              </button>
            </div>
          );
        })}
        {filteredQuotes.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: '#94A3B8' }}>No hay cotizaciones en esta categoría.</div>
        )}
      </div>
    </div>
  );
}
