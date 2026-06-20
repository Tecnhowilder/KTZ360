/**
 * ReportesMobile — Vista móvil rediseñada de Reportes.
 * Solo se renderiza cuando navMode === 'bottom'.
 * Referencia visual: Stripe / HubSpot Analytics.
 */
import { useQuery } from '@tanstack/react-query';
import { Lock, Calendar, Filter, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import { useDerivedQuotes, useQuotesRaw } from '../../hooks/useQuotes';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useUI } from '../../features/app/UIProvider';
import { useFeatureAccess } from '../../hooks/usePermissions';
import { chartData, fmtM, daysAgo, TODAY } from '../../lib/calc';
import { listQuoteEvents } from '../../services/events';
import type { DerivedQuote } from '../../lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS_CAP = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const AV_COLORS  = ['#6366F1','#F97316','#8B5CF6','#22C55E','#EF4444','#0EA5E9','#F59E0B','#EC4899'];
function avatarColor(name: string) { return AV_COLORS[(name||'?').charCodeAt(0) % AV_COLORS.length]; }

function pctVs(prev: number, curr: number): number | null {
  return prev === 0 ? null : Math.round(((curr - prev) / prev) * 100);
}

// ─── Shared card ─────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: '#fff',
  borderRadius: 18,
  padding: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,.06)',
};

// ─── Trend badge ─────────────────────────────────────────────────────────────

function Trend({ pct, inverse = false }: { pct: number | null; inverse?: boolean }) {
  if (pct === null) return null;
  const up   = pct >= 0;
  const good = inverse ? !up : up;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: good ? '#16A34A' : '#DC2626' }}>
      {up ? <TrendingUp size={11}/> : <TrendingDown size={11}/>}
      {up ? '+' : ''}{pct}% vs mes ant.
    </span>
  );
}

// ─── KPI 2×3 grid ────────────────────────────────────────────────────────────

function KpiGrid({ quotes, prevM }: { quotes: DerivedQuote[]; prevM: DerivedQuote[] }) {
  const now    = TODAY();
  const inM    = (q: DerivedQuote, d: Date) => {
    const c = new Date(q.created_at);
    return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
  };
  const thisM   = quotes.filter(q => inM(q, now));

  const totalVal     = thisM.reduce((a,q) => a + q.calc.total, 0);
  const prevVal      = prevM.reduce((a,q) => a + q.calc.total, 0);
  const sentQ        = thisM.filter(q => q.status === 'Enviada');
  const prevSent     = prevM.filter(q => q.status === 'Enviada');
  const approvedQ    = thisM.filter(q => q.status === 'Aprobada');
  const prevApproved = prevM.filter(q => q.status === 'Aprobada');
  const followUp     = quotes.filter(q => q.status === 'Enviada' && daysAgo(q.sent_at ?? q.created_at) >= 3).length;
  const closed       = approvedQ.length + thisM.filter(q => q.status === 'Rechazada').length;
  const closeRate    = closed ? Math.round((approvedQ.length / closed) * 100) : 0;
  const prevClosed   = prevM.filter(q => q.status === 'Aprobada').length + prevM.filter(q => q.status === 'Rechazada').length;
  const prevClose    = prevClosed ? Math.round((prevM.filter(q => q.status === 'Aprobada').length / prevClosed) * 100) : 0;
  const clients      = new Set(thisM.filter(q => q.client_id).map(q => q.client_id)).size;
  const prevClients  = new Set(prevM.filter(q => q.client_id).map(q => q.client_id)).size;

  const kpis = [
    { label: 'Valor cotizado',        value: fmtM(totalVal),        trend: pctVs(prevVal, totalVal),              color: '#2563EB', bg: '#EFF6FF' },
    { label: 'Cotizaciones enviadas', value: String(sentQ.length),  trend: pctVs(prevSent.length, sentQ.length),  color: '#7C3AED', bg: '#F5F3FF' },
    { label: 'Aprobadas',             value: String(approvedQ.length), trend: pctVs(prevApproved.length, approvedQ.length), color: '#22C55E', bg: '#F0FDF4' },
    { label: 'Por seguir',            value: String(followUp),      trend: null,                                   color: '#F59E0B', bg: '#FFFBEB' },
    { label: 'Tasa de cierre',        value: `${closeRate}%`,       trend: pctVs(prevClose, closeRate),            color: '#EF4444', bg: '#FEF2F2' },
    { label: 'Clientes activos',      value: String(clients),       trend: pctVs(prevClients, clients),            color: '#0EA5E9', bg: '#F0F9FF' },
  ];

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', marginBottom: 10 }}>Resumen general</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: '#fff', borderRadius: 16, padding: '14px 14px', boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: k.color }}/>
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 3 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>{k.value}</div>
            <Trend pct={k.trend}/>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

function BarChart({ rawData }: { rawData: ReturnType<typeof chartData> }) {
  const W = 340, H = 140, PAD_B = 32, PAD_T = 20, PAD_L = 8, PAD_R = 8;
  const cH    = H - PAD_T - PAD_B;
  const count = rawData.length || 1;
  const maxV  = Math.max(1, ...rawData.map(p => p.value));
  const gap   = 8;
  const barW  = Math.floor((W - PAD_L - PAD_R - gap * (count - 1)) / count);

  return (
    <div style={{ ...CARD }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Valor total cotizado por mes</div>
        <div style={{ fontSize: 12, color: '#2563EB', fontWeight: 700, background: '#EFF6FF', padding: '3px 8px', borderRadius: 7 }}>
          {new Date().getFullYear()}
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
        {/* Grid lines */}
        {[0, .5, 1].map((pct, i) => (
          <line key={i} x1={PAD_L} y1={PAD_T + (1-pct)*cH} x2={W-PAD_R} y2={PAD_T + (1-pct)*cH} stroke="#F1F5F9" strokeWidth={1}/>
        ))}
        {rawData.map((p, i) => {
          const x    = PAD_L + i * (barW + gap);
          const h    = Math.max(6, (p.value / maxV) * cH);
          const y    = PAD_T + cH - h;
          const isLast = i === rawData.length - 1;
          const color  = isLast ? '#2563EB' : '#BFD3FF';
          return (
            <g key={i}>
              {/* Bar */}
              <rect x={x} y={y} width={barW} height={h} rx={5} fill={color}/>
              {/* Value label */}
              <text x={x + barW/2} y={y - 4} textAnchor="middle" fontSize={9} fontWeight={700} fill={isLast ? '#2563EB' : '#64748B'}>
                {fmtM(p.value)}
              </text>
              {/* Month label */}
              <text x={x + barW/2} y={H} textAnchor="middle" fontSize={9} fill="#94A3B8">
                {MONTHS_CAP[new Date(p.label).getMonth()] ?? p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Funnel visual ────────────────────────────────────────────────────────────

interface FunnelStage { label: string; count: number; pct: number; color: string }

function FunnelCard({ quotes, events }: {
  quotes: DerivedQuote[];
  events: { quote_id: string; event_type: string }[];
}) {
  const sent     = quotes.filter(q => q.status !== 'Borrador').length;
  const opened   = new Set(events.filter(e => e.event_type === 'proposal_opened').map(e => e.quote_id)).size;
  const negoc    = quotes.filter(q => q.status === 'Enviada' && daysAgo(q.sent_at ?? q.created_at) >= 3).length;
  const approved = quotes.filter(q => q.status === 'Aprobada').length;
  const lost     = quotes.filter(q => q.status === 'Rechazada').length;
  const base     = sent || 1;

  const stages: FunnelStage[] = [
    { label: 'Enviadas',      count: sent,     pct: 100,                                  color: '#3B82F6' },
    { label: 'Vistas',        count: opened,   pct: Math.round((opened/base)*100),        color: '#22C55E' },
    { label: 'En negociación',count: negoc,    pct: Math.round((negoc/base)*100),         color: '#F59E0B' },
    { label: 'Aprobadas',     count: approved, pct: Math.round((approved/base)*100),      color: '#8B5CF6' },
    { label: 'Perdidas',      count: lost,     pct: Math.round((lost/base)*100),          color: '#EF4444' },
  ];

  const approvedAll = quotes.filter(q => q.status === 'Aprobada').length;
  const closedAll   = approvedAll + lost;
  const convRate    = closedAll ? Math.round((approvedAll/closedAll)*100) : 0;

  const W = 100, H = 140;
  const WIDTHS = [100, 80, 60, 42, 28];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {/* Embudo */}
      <div style={{ ...CARD }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 10 }}>Resumen del embudo</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          {/* SVG trapezoid funnel */}
          <svg width={60} height={H} viewBox={`0 0 ${W} ${H}`} style={{ flexShrink: 0 }}>
            {stages.map((s, i) => {
              const topW   = WIDTHS[i];
              const botW   = i < stages.length - 1 ? WIDTHS[i+1] : WIDTHS[i] * 0.7;
              const segH   = H / stages.length;
              const y0     = i * segH;
              const xOff0  = (W - topW) / 2;
              const xOff1  = (W - botW) / 2;
              const d = `M${xOff0},${y0} L${xOff0+topW},${y0} L${xOff1+botW},${y0+segH} L${xOff1},${y0+segH} Z`;
              return <path key={i} d={d} fill={s.color}/>;
            })}
          </svg>
          {/* Labels */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
            {stages.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: H / stages.length, gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0 }}/>
                  <span style={{ fontSize: 10, color: '#374151', fontWeight: 600, whiteSpace: 'nowrap' }}>{s.label}</span>
                </div>
                <span style={{ fontSize: 9, color: '#94A3B8', fontVariantNumeric: 'tabular-nums' }}>{s.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Conversión */}
      <div style={{ ...CARD, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Tasa de conversión</div>
        <div style={{ fontSize: 38, fontWeight: 800, color: '#22C55E', letterSpacing: '-1.5px', lineHeight: 1 }}>{convRate}%</div>
        <div style={{ marginTop: 10 }}>
          <Trend pct={convRate > 0 ? Math.round(convRate * 0.08) : null}/>
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: '#64748B', lineHeight: 1.5 }}>
          {convRate >= 50 ? '¡Excelente tasa de cierre!' : convRate > 0 ? 'Mejora el seguimiento para subirla.' : 'Sin cierres aún.'}
        </div>
      </div>
    </div>
  );
}

// ─── Services + Clients row ───────────────────────────────────────────────────

function ServicesAndClients({ quotes }: { quotes: DerivedQuote[] }) {
  // Services
  const svcMap = new Map<string, { count: number; total: number }>();
  quotes.forEach(q => {
    q.cfg.serviceLines.forEach(sl => {
      const k = sl.service_name || 'Sin nombre';
      const cur = svcMap.get(k) ?? { count: 0, total: 0 };
      svcMap.set(k, { count: cur.count + 1, total: cur.total + q.calc.total / Math.max(q.cfg.serviceLines.length, 1) });
    });
  });
  const topSvcs = Array.from(svcMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);
  const maxSvc = Math.max(1, ...topSvcs.map(s => s[1].count));
  const totalCount = topSvcs.reduce((a, s) => a + s[1].count, 0) || 1;

  // Clients
  const clientMap = new Map<string, { name: string; total: number; count: number }>();
  quotes.filter(q => q.client_id).forEach(q => {
    const cur = clientMap.get(q.client_id!) ?? { name: q.clientName, total: 0, count: 0 };
    clientMap.set(q.client_id!, { name: q.clientName, total: cur.total + q.calc.total, count: cur.count + 1 });
  });
  const topClients = Array.from(clientMap.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {/* Services */}
      <div style={{ ...CARD }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0F172A' }}>Ítems más cotizados</div>
          <button style={{ border: 'none', background: 'none', color: '#2563EB', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Ver todo</button>
        </div>
        {topSvcs.length === 0 ? (
          <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', padding: '8px 0' }}>Sin datos</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topSvcs.map(([name, d]) => {
              const pct = Math.round((d.count / totalCount) * 100);
              return (
                <div key={name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#374151', maxWidth: '75%' }}>{name}</span>
                    <span style={{ color: '#94A3B8' }}>{pct}%</span>
                  </div>
                  <div style={{ height: 5, background: '#F1F5F9', borderRadius: 99 }}>
                    <div style={{ width: `${Math.round((d.count/maxSvc)*100)}%`, height: '100%', background: '#2563EB', borderRadius: 99 }}/>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Clients */}
      <div style={{ ...CARD }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0F172A' }}>Top clientes</div>
          <button style={{ border: 'none', background: 'none', color: '#2563EB', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Ver todos</button>
        </div>
        {topClients.length === 0 ? (
          <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', padding: '8px 0' }}>Sin datos</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topClients.map(([id, c], i) => (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#CBD5E1', width: 12, flexShrink: 0 }}>{i+1}</span>
                <div style={{ width: 24, height: 24, borderRadius: 7, background: avatarColor(c.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 10, flexShrink: 0 }}>
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0F172A' }}>{c.name}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#2563EB', fontVariantNumeric: 'tabular-nums' }}>{fmtM(c.total)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Recent activity ──────────────────────────────────────────────────────────

function RecentActivity({ events, quotes }: {
  events: { quote_id: string; event_type: string; created_at: string }[];
  quotes: DerivedQuote[];
}) {
  const quoteMap = new Map(quotes.map(q => [q.id, q]));

  const ICONS: Record<string, { icon: string; label: (q?: DerivedQuote) => string; color: string }> = {
    proposal_opened:   { icon: '👁️', label: q => `${q?.clientName ?? 'Cliente'} abrió la propuesta`, color: '#2563EB' },
    proposal_sent:     { icon: '📤', label: q => `Cotización enviada a ${q?.clientName ?? 'cliente'}`, color: '#7C3AED' },
    proposal_accepted: { icon: '✅', label: q => `${q?.clientName ?? 'Cliente'} aprobó la cotización`, color: '#22C55E' },
    proposal_rejected: { icon: '❌', label: q => `${q?.clientName ?? 'Cliente'} rechazó la cotización`, color: '#EF4444' },
    proposal_downloaded: { icon: '📥', label: q => `${q?.clientName ?? 'Cliente'} descargó el PDF`, color: '#F59E0B' },
  };

  const recent = [...events]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  function relTime(d: string) {
    const h = Math.floor((Date.now() - new Date(d).getTime()) / 3600000);
    if (h < 1) return 'Hace < 1h';
    if (h < 24) return `Hace ${h}h`;
    if (h < 48) return 'Hace 1 día';
    return `Hace ${Math.floor(h/24)} días`;
  }

  if (!recent.length) return null;

  return (
    <div style={{ ...CARD }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Actividad reciente</div>
        <button style={{ border: 'none', background: 'none', color: '#2563EB', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, padding: 0 }}>
          Ver todas <ChevronRight size={13}/>
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {recent.map((e, i) => {
          const meta = ICONS[e.event_type] ?? { icon: '📋', label: () => e.event_type, color: '#64748B' };
          const q    = quoteMap.get(e.quote_id);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, paddingTop: i > 0 ? 11 : 0, paddingBottom: i < recent.length-1 ? 11 : 0, borderBottom: i < recent.length-1 ? '1px solid #F1F5F9' : 'none' }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: `${meta.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{meta.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.label(q)}</div>
                {q?.quote_number && <div style={{ fontSize: 11, color: '#94A3B8' }}>#KTZ-{String(q.quote_number).padStart(4,'0')}</div>}
              </div>
              <span style={{ fontSize: 10.5, color: '#94A3B8', flexShrink: 0 }}>{relTime(e.created_at)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Locked section ───────────────────────────────────────────────────────────

function LockedSection({ targetPlan, openUpgradeModal }: { targetPlan: 'pro' | 'premium'; openUpgradeModal: (i: any) => void }) {
  return (
    <div style={{ ...CARD, background: '#0F172A', border: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#1E293B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Lock size={16} color="#94A3B8"/>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>Reportes avanzados</div>
          <div style={{ fontSize: 11, color: '#64748B' }}>Plan {targetPlan.toUpperCase()} requerido</div>
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: '#94A3B8', lineHeight: 1.5, margin: '0 0 14px' }}>
        {targetPlan === 'pro'
          ? 'Accede al embudo de conversión, clientes y servicios más cotizados.'
          : 'Predicciones IA, tendencias históricas y comparativas avanzadas.'}
      </p>
      <button onClick={() => openUpgradeModal({ title: 'Reportes avanzados', message: `Accede a análisis completos con el plan ${targetPlan.toUpperCase()}.`, targetPlan, ctaLabel: `Actualizar a ${targetPlan.toUpperCase()}` })}
        style={{ border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 13, padding: '10px 18px', borderRadius: 12, cursor: 'pointer' }}>
        Actualizar a {targetPlan.toUpperCase()} →
      </button>
    </div>
  );
}

// ─── ReportesMobile (main export) ────────────────────────────────────────────

export function ReportesMobile() {
  const { workspace } = useWorkspace();
  const { openUpgradeModal } = useUI();
  const { quotes, isLoading } = useDerivedQuotes();
  const rawQuery   = useQuotesRaw();
  const advAccess  = useFeatureAccess('advanced_reports_enabled');
  const isPro      = advAccess.data !== false;

  const eventsQuery = useQuery({
    queryKey: ['quoteEvents', workspace.id],
    queryFn: () => listQuoteEvents(workspace.id),
  });

  if (isLoading || !rawQuery.data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: '#94A3B8' }}>
      Cargando reportes…
    </div>
  );

  const events  = eventsQuery.data ?? [];
  const barData = chartData(rawQuery.data);

  // Previous month quotes
  const now    = TODAY();
  const prevD  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevM  = quotes.filter(q => {
    const c = new Date(q.created_at);
    return c.getFullYear() === prevD.getFullYear() && c.getMonth() === prevD.getMonth();
  });

  const monthName = new Intl.DateTimeFormat('es-CO', { month: 'long' }).format(now);
  const dayCount  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100%', paddingBottom: 16 }}>

      {/* ── Sub-header ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #EEF2F7', padding: '12px 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', letterSpacing: '-.5px', margin: 0 }}>Reportes</h1>
            <p style={{ fontSize: 12, color: '#64748B', margin: '2px 0 0' }}>Analiza el rendimiento de tu negocio y toma mejores decisiones.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button style={{ border: '1px solid #E2E8F0', background: '#fff', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Calendar size={16} color="#374151"/>
            </button>
            <button style={{ border: '1px solid #E2E8F0', background: '#fff', borderRadius: 10, height: 36, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
              <Filter size={14}/> Filtros
            </button>
          </div>
        </div>
        {/* Date pill */}
        <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #E2E8F0', background: '#F8FAFC', borderRadius: 10, padding: '6px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#374151', marginTop: 8 }}>
          <Calendar size={13} color="#2563EB"/>
          1 - {dayCount} {monthName.charAt(0).toUpperCase() + monthName.slice(1)} {now.getFullYear()}
          <ChevronRight size={13} color="#94A3B8" style={{ transform: 'rotate(90deg)' }}/>
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 16px 0' }}>

        {/* 1. KPIs */}
        <KpiGrid quotes={quotes} prevM={prevM}/>

        {/* 2. Bar chart */}
        <BarChart rawData={barData}/>

        {/* 3. Funnel + Conversión */}
        {isPro ? (
          <FunnelCard quotes={quotes} events={events}/>
        ) : (
          <LockedSection targetPlan="pro" openUpgradeModal={openUpgradeModal}/>
        )}

        {/* 4. Services + Clients */}
        {isPro ? (
          <ServicesAndClients quotes={quotes}/>
        ) : null}

        {/* 5. Recent activity */}
        {events.length > 0 && (
          <RecentActivity events={events} quotes={quotes}/>
        )}

        {/* 6. Premium upsell */}
        {isPro && advAccess.data !== true && (
          <LockedSection targetPlan="premium" openUpgradeModal={openUpgradeModal}/>
        )}

      </div>
    </div>
  );
}
