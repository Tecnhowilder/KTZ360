import { useQuery } from '@tanstack/react-query';
import { useDerivedQuotes, useQuotesRaw } from '../hooks/useQuotes';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { chartData, fmt, fmtM } from '../lib/calc';
import { listQuoteEvents } from '../services/events';

export function Reportes() {
  const { workspace } = useWorkspace();
  const { quotes, isLoading } = useDerivedQuotes();
  const rawQuery = useQuotesRaw();
  const eventsQuery = useQuery({
    queryKey: ['quoteEvents', workspace.id],
    queryFn: () => listQuoteEvents(workspace.id),
  });

  if (isLoading || !rawQuery.data || !eventsQuery.data) return null;

  const events = eventsQuery.data;
  const eventsByQuote = new Map<string, typeof events>();
  events.forEach((e) => {
    const arr = eventsByQuote.get(e.quote_id) ?? [];
    arr.push(e);
    eventsByQuote.set(e.quote_id, arr);
  });

  const sentQuoteIds = new Set(events.filter((e) => e.event_type === 'proposal_sent').map((e) => e.quote_id));
  const openedQuoteIds = new Set(events.filter((e) => e.event_type === 'proposal_opened').map((e) => e.quote_id));
  const acceptedQuoteIds = new Set(events.filter((e) => e.event_type === 'proposal_accepted').map((e) => e.quote_id));
  const rejectedQuoteIds = new Set(events.filter((e) => e.event_type === 'proposal_rejected').map((e) => e.quote_id));

  const sentCount = sentQuoteIds.size;
  const openRate = sentCount ? Math.round(([...sentQuoteIds].filter((id) => openedQuoteIds.has(id)).length / sentCount) * 100) : 0;
  const acceptRate = sentCount ? Math.round((acceptedQuoteIds.size / sentCount) * 100) : 0;

  const closeTimes: number[] = [];
  eventsByQuote.forEach((qEvents) => {
    const sent = qEvents.find((e) => e.event_type === 'proposal_sent');
    const resolved = qEvents.find((e) => e.event_type === 'proposal_accepted' || e.event_type === 'proposal_rejected');
    if (sent && resolved) {
      const days = (new Date(resolved.created_at).getTime() - new Date(sent.created_at).getTime()) / 86400000;
      if (days >= 0) closeTimes.push(days);
    }
  });
  const avgCloseDays = closeTimes.length ? Math.round((closeTimes.reduce((a, b) => a + b, 0) / closeTimes.length) * 10) / 10 : null;

  const valueWon = quotes.filter((q) => acceptedQuoteIds.has(q.id)).reduce((a, q) => a + q.calc.total, 0);
  const valueLost = quotes.filter((q) => rejectedQuoteIds.has(q.id)).reduce((a, q) => a + q.calc.total, 0);

  const points = chartData(rawQuery.data);
  const maxValue = Math.max(1, ...points.map((p) => p.value));
  const chartBars = points.map((p, i) => ({
    label: fmtM(p.value),
    month: p.label,
    h: Math.round((p.value / maxValue) * 100),
    color: i === points.length - 1 ? '#2563EB' : '#BFD3FF',
  }));

  const serviceCounts = new Map<string, number>();
  quotes.forEach((q) => {
    q.cfg.serviceLines.forEach((line) => {
      serviceCounts.set(line.service_name, (serviceCounts.get(line.service_name) || 0) + 1);
    });
  });
  const maxCount = Math.max(1, ...serviceCounts.values());
  const topServices = Array.from(serviceCounts.entries())
    .map(([name, count]) => ({ name, pct: Math.round((count / maxCount) * 100) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4);

  const approvedCount = quotes.filter((q) => q.status === 'Aprobada').length;
  const rejectedCount = quotes.filter((q) => q.status === 'Rechazada').length;
  const closed = approvedCount + rejectedCount;
  const closeRate = closed ? Math.round((approvedCount / closed) * 100) : 0;

  return (
    <div>
      <h1 style={{ fontSize: 'clamp(22px,4vw,30px)', fontWeight: 800, letterSpacing: '-1px', marginBottom: 18 }}>Reportes</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 20, padding: 22, gridColumn: '1/-1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Valor cotizado por mes</h3>
            <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>{new Date().getFullYear()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 170 }}>
            {chartBars.map((b, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#0F172A' }}>{b.label}</div>
                <div style={{ width: '100%', borderRadius: '9px 9px 0 0', background: b.color, height: `${b.h}%`, minHeight: 6, transition: 'height .4s ease' }} />
                <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>{b.month}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 20, padding: 22 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Servicios más cotizados</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {topServices.map((s) => (
              <div key={s.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  <span style={{ color: '#64748B' }}>{s.pct}%</span>
                </div>
                <div style={{ height: 8, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${s.pct}%`, background: '#2563EB', borderRadius: 99 }} />
                </div>
              </div>
            ))}
            {topServices.length === 0 && <div style={{ fontSize: 12.5, color: '#94A3B8' }}>Sin datos todavía.</div>}
          </div>
        </div>
        <div style={{ background: '#0F172A', borderRadius: 20, padding: 22, color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600 }}>TASA DE CIERRE PROMEDIO</div>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-2px', marginTop: 6 }}>{closeRate}%</div>
          <div style={{ height: 1, background: 'rgba(255,255,255,.1)', margin: '18px 0' }} />
          <div style={{ fontSize: 13, color: '#C7D2E4', lineHeight: 1.5 }}>
            Las cotizaciones enviadas el mismo día cierran un <strong style={{ color: '#fff' }}>40% más</strong>.
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 20, padding: 22, gridColumn: '1/-1' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Embudo de propuestas</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>TASA DE APERTURA</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{openRate}%</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>TASA DE ACEPTACIÓN</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{acceptRate}%</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>TIEMPO PROMEDIO DE CIERRE</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{avgCloseDays === null ? '—' : `${avgCloseDays} d`}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>VALOR GANADO</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4, color: '#16A34A' }}>{fmt(valueWon)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>VALOR PERDIDO</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4, color: '#DC2626' }}>{fmt(valueLost)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
