import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import { useUI } from '../features/app/UIProvider';
import { useDerivedQuotes } from '../hooks/useQuotes';
import { QuoteCard } from '../components/quotes/QuoteCard';
import { EmptyQuotes } from '../components/quotes/EmptyQuotes';
import { formatCurrencyCOP } from '../lib/currency';
import { useWindowWidth, navModeFor } from '../hooks/useWindowWidth';
import { CotizacionesMobile } from '../components/cotizaciones/CotizacionesMobile';
import type { DerivedQuote } from '../lib/types';

const STATUS_FILTERS = [
  { key: 'todas',    label: 'Todas' },
  { key: 'borrador', label: 'Borradores' },
  { key: 'enviada',  label: 'Enviadas' },
  { key: 'aprobada', label: 'Aprobadas' },
  { key: 'rechazada',label: 'Rechazadas' },
  { key: 'vencida',  label: 'Vencidas' },
];

export function Cotizaciones() {
  const width   = useWindowWidth();
  const navMode = navModeFor(width);

  // Mobile: delegar a CotizacionesMobile (zero impact en desktop)
  if (navMode === 'bottom') {
    return <CotizacionesMobile />;
  }

  return <CotizacionesDesktop />;
}

// ─── Vista Desktop (sin cambios) ─────────────────────────────────────────────

function CotizacionesDesktop() {
  const navigate = useNavigate();
  const { openQuoteFlow } = useUI();
  const { quotes, isLoading } = useDerivedQuotes();
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('todas');

  const filtered = quotes.filter(q => {
    const matchStatus = statusFilter === 'todas' || q.status.toLowerCase() === statusFilter;
    const matchSearch = !search || q.title.toLowerCase().includes(search.toLowerCase()) || q.clientName.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const totalQuoted = quotes.reduce((a, q) => a + q.calc.total, 0);
  const approved    = quotes.filter(q => q.status === 'Aprobada').length;

  function duplicate(q: DerivedQuote) {
    openQuoteFlow({
      step: 4,
      cfg: {
        clientId: q.client_id, proj: q.title + ' (copia)', loc: (q as any).location || '',
        serviceLines: q.cfg.serviceLines, adminPct: q.cfg.adminPct, imprevistosPct: q.cfg.imprevistosPct,
        util: q.cfg.util, taxMode: q.cfg.taxMode, taxRate: q.cfg.taxRate, advancePct: q.cfg.advancePct,
        docDetailLevel: q.cfg.docDetailLevel, includeTechnicalAnnex: q.cfg.includeTechnicalAnnex,
        validDays: q.cfg.validDays, discount: q.cfg.discount, discountOn: q.cfg.discountOn,
        transportCost: q.cfg.transportCost, transportEnabled: q.cfg.transportEnabled,
      },
    });
  }

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      {/* Header desktop */}
      <div style={{ background: '#fff', padding: '20px 16px 0', borderBottom: '1px solid #F1F5F9', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Cotizaciones</h1>
            {!isLoading && quotes.length > 0 && (
              <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2 }}>
                {formatCurrencyCOP(totalQuoted)} · {approved} aprobadas
              </div>
            )}
          </div>
          <button
            onClick={() => navigate('/app/cotizaciones/nueva')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 14, padding: '10px 18px', borderRadius: 12, cursor: 'pointer' }}>
            <Plus size={16} /> Nueva
          </button>
        </div>

        {/* Buscador */}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input type="search" placeholder="Buscar cotización o cliente..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', height: 42, border: '1px solid #E2E8F0', borderRadius: 12, paddingLeft: 36, fontSize: 14.5, outline: 'none', background: '#F8FAFC', color: '#0F172A', boxSizing: 'border-box' }} />
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, scrollbarWidth: 'none' }}>
          {STATUS_FILTERS.map(f => {
            const active = statusFilter === f.key;
            return (
              <button key={f.key} onClick={() => setStatusFilter(f.key)}
                style={{ flexShrink: 0, border: 'none', cursor: 'pointer', background: active ? '#2563EB' : '#F1F5F9', color: active ? '#fff' : '#475569', fontWeight: active ? 700 : 500, fontSize: 13, padding: '7px 14px', borderRadius: 99, fontFamily: 'inherit' }}>
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista */}
      <div style={{ background: '#fff', marginTop: 8 }}>
        {isLoading ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: '#94A3B8' }}>Cargando...</div>
        ) : filtered.length === 0 ? (
          <EmptyQuotes onNew={() => navigate('/app/cotizaciones/nueva')} hasFilters={statusFilter !== 'todas' || search.length > 0} />
        ) : (
          filtered.map(q => (
            <QuoteCard key={q.id} quote={q}
              onOpen={() => navigate(`/app/cotizaciones/${q.id}`)}
              onDuplicate={() => duplicate(q)} />
          ))
        )}
      </div>
    </div>
  );
}
