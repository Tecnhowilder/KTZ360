import { useNavigate } from 'react-router-dom';
import {
  Search, Bell, Plus, FileText, UserPlus, LayoutTemplate,
  Wallet, BarChart2, ChevronRight, MessageCircle,
  TrendingUp, CheckCircle2, Clock, Lock, Crown,
  AlertTriangle, Calendar, Zap,
  ArrowRight, Calculator,
} from 'lucide-react';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useUI, defaultQConfig } from '../features/app/UIProvider';
import { useDerivedQuotes } from '../hooks/useQuotes';
import { usePlanLimit } from '../hooks/usePermissions';
import { getThemeByPlan } from '../lib/planTheme';
import { fmtM, fmt, statusStyle, daysAgo, TODAY, followMessage, openWhats } from '../lib/calc';
import { MONTHS_LONG } from '../lib/data';
import { useWindowWidth, navModeFor } from '../hooks/useWindowWidth';
import { MobileDashboard } from '../components/dashboard/MobileDashboard';
import type { DerivedQuote } from '../lib/types';
import type { ServiceLine } from '../lib/types';
import '../styles/dashboard.css';

// ─── Widget registry (CMS-ready) ─────────────────────────────────────────────
export type WidgetId =
  | 'kpi-row' | 'recientes' | 'estado' | 'seguimiento' | 'ia-upsell'
  | 'plan-card' | 'acciones'
  | 'funnel' | 'seguimientos-pro' | 'actividad' | 'ia-basica' | 'servicios'
  | 'ia-ejecutivo' | 'prediccion-cierre' | 'alertas-ia' | 'embudo'
  | 'ranking-clientes';

// ─── Data helpers ─────────────────────────────────────────────────────────────

const AV_COLORS = ['#6366F1','#F97316','#8B5CF6','#22C55E','#EF4444','#0EA5E9','#F59E0B','#EC4899'];
function avatarColor(name: string) { return AV_COLORS[(name||'?').charCodeAt(0) % AV_COLORS.length]; }

function pctChange(prev: number, curr: number): number | null {
  return prev === 0 ? null : Math.round(((curr - prev) / prev) * 100);
}

function relTime(dateStr: string): string {
  const h = Math.floor((TODAY().getTime() - new Date(dateStr).getTime()) / 3600000);
  if (h < 1)  return 'Hace < 1h';
  if (h < 24) return `Hace ${h}h`;
  if (h < 48) return 'Ayer';
  return `Hace ${Math.floor(h / 24)}d`;
}

function closeProbability(q: DerivedQuote): number {
  if (q.status === 'Aprobada')  return 95;
  if (q.status !== 'Enviada')   return 15;
  const d = daysAgo(q.sent_at ?? q.created_at);
  if (d <= 2) return 87; if (d <= 5) return 72; if (d <= 10) return 55;
  if (d <= 15) return 40; return 28;
}

function getTopServices(quotes: DerivedQuote[]): { name: string; total: number; count: number }[] {
  const acc: Record<string, { name: string; total: number; count: number }> = {};
  quotes.forEach(q => {
    (q.cfg.serviceLines as ServiceLine[]).forEach(sl => {
      const k = sl.service_name || 'Sin servicio';
      if (!acc[k]) acc[k] = { name: k, total: 0, count: 0 };
      acc[k].count++;
      acc[k].total += q.calc.total / Math.max(q.cfg.serviceLines.length, 1);
    });
  });
  return Object.values(acc).sort((a, b) => b.total - a.total).slice(0, 5);
}

function getUpcomingDue(quotes: DerivedQuote[]) {
  return quotes
    .filter(q => q.status === 'Enviada')
    .map(q => {
      const due  = new Date(new Date(q.created_at).getTime() + q.cfg.validDays * 86400000);
      const left = Math.ceil((due.getTime() - TODAY().getTime()) / 86400000);
      return { ...q, daysLeft: left };
    })
    .filter(q => q.daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 4);
}

function getRecentActivity(quotes: DerivedQuote[]) {
  return quotes.slice(0, 6).map(q => {
    const num = q.quote_number
      ? `#KTZ-${String(q.quote_number).padStart(4, '0')}`
      : q.title.slice(0, 14);
    if (q.status === 'Aprobada')
      return { icon: '✅', label: `Aprobada ${num}`, sub: q.clientName, time: relTime(q.updated_at), color: '#22C55E' };
    if (q.status === 'Enviada')
      return { icon: '📤', label: `Enviada ${num}`, sub: q.clientName, time: relTime(q.sent_at ?? q.updated_at), color: '#7C3AED' };
    if (q.status === 'Vencida')
      return { icon: '⚠️', label: `Vencida ${num}`, sub: q.clientName, time: relTime(q.updated_at), color: '#F59E0B' };
    if (q.status === 'Rechazada')
      return { icon: '❌', label: `Rechazada ${num}`, sub: q.clientName, time: relTime(q.updated_at), color: '#EF4444' };
    return { icon: '📋', label: `Nueva ${num}`, sub: q.clientName, time: relTime(q.created_at), color: '#2563EB' };
  });
}

function getClientRanking(quotes: DerivedQuote[]) {
  const acc: Record<string, { name: string; count: number; total: number; prob: number }> = {};
  quotes.filter(q => q.client_id).forEach(q => {
    const k = q.client_id!;
    if (!acc[k]) acc[k] = { name: q.clientName, count: 0, total: 0, prob: 0 };
    acc[k].count++;
    acc[k].total += q.calc.total;
    acc[k].prob = Math.max(acc[k].prob, closeProbability(q));
  });
  return Object.values(acc).sort((a, b) => b.total - a.total).slice(0, 5);
}

function getSmartAlerts(quotes: DerivedQuote[]) {
  const alerts: { type: 'warning' | 'success' | 'danger'; title: string; sub: string; quoteId: string; btn: string }[] = [];
  quotes.filter(q => q.status === 'Enviada' && daysAgo(q.sent_at ?? q.created_at) >= 3).slice(0, 2).forEach(q =>
    alerts.push({ type: 'warning', title: `Sin seguimiento por ${daysAgo(q.sent_at ?? q.created_at)} días`, sub: `${q.clientName} · ${q.title}`, quoteId: q.id, btn: 'Contactar' })
  );
  getUpcomingDue(quotes).slice(0, 1).forEach(q =>
    alerts.push({ type: 'danger', title: `Vence en ${q.daysLeft} día${q.daysLeft === 1 ? '' : 's'}`, sub: `${q.title} · ${q.clientName}`, quoteId: q.id, btn: 'Recordar' })
  );
  quotes.filter(q => q.status === 'Aprobada').slice(0, 1).forEach(q =>
    alerts.push({ type: 'success', title: 'Propuesta aprobada — Anticipo pendiente', sub: `${q.title} · ${q.clientName}`, quoteId: q.id, btn: 'Registrar' })
  );
  return alerts.slice(0, 3);
}

function generateAISummary(quotes: DerivedQuote[], prev: DerivedQuote[], company: { name: string }) {
  const conv     = quotes.length ? Math.round((quotes.filter(q => q.status === 'Aprobada').length / quotes.length) * 100) : 0;
  const prevConv = prev.length   ? Math.round((prev.filter(q => q.status === 'Aprobada').length / prev.length) * 100) : 0;
  const convChg  = conv - prevConv;
  const thisTotal = quotes.reduce((a, q) => a + q.calc.total, 0);
  const prevTotal = prev.reduce((a, q) => a + q.calc.total, 0);
  const totalChg  = prevTotal > 0 ? Math.round(((thisTotal - prevTotal) / prevTotal) * 100) : 0;
  const risk    = quotes.filter(q => q.status === 'Enviada' && daysAgo(q.sent_at ?? q.created_at) >= 5).length;
  const topSvc  = getTopServices(quotes)[0];
  const lines: string[] = [];
  lines.push(convChg >= 0 ? `Tu conversión aumentó ${convChg}pp vs mes pasado.` : `Tu conversión bajó ${Math.abs(convChg)}pp este mes.`);
  if (topSvc)       lines.push(`"${topSvc.name}" es tu servicio más activo.`);
  if (totalChg !== 0) lines.push(`Cotizaste ${fmtM(thisTotal)}, ${Math.abs(totalChg)}% ${totalChg > 0 ? 'más' : 'menos'} que el mes anterior.`);
  if (risk > 0)     lines.push(`${risk} cotización${risk > 1 ? 'es' : ''} en riesgo por falta de seguimiento.`);
  return { lines: lines.slice(0, 4), risk, topSvc: topSvc?.name ?? '—', company: company.name };
}

// ─── Shared constants ─────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #EEF2F7',
  borderRadius: 16,
  padding: 14,
  boxShadow: '0 1px 6px rgba(0,0,0,.055)',
};
const DONUT_COLORS: Record<string, string> = {
  Borrador: '#2563EB', Enviada: '#7C3AED', Aprobada: '#22C55E', Rechazada: '#EF4444', Vencida: '#F59E0B',
};
const DONUT_ORDER = ['Borrador', 'Enviada', 'Aprobada', 'Rechazada', 'Vencida'] as const;
const STATUS_LABEL: Record<string, string> = { Rechazada: 'Perdida', Vencida: 'Por seguir' };

// ─── Shared UI components ─────────────────────────────────────────────────────

function TrendBadge({ pct, suffix }: { pct: number | null; suffix?: string }) {
  if (pct === null) return null;
  const up = pct >= 0;
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2, color: up ? '#16A34A' : '#DC2626', background: up ? '#F0FDF4' : '#FEF2F2', padding: '2px 6px', borderRadius: 99 }}>
      {up ? '↑' : '↓'} {Math.abs(pct)}{suffix ?? '% vs mes ant.'}
    </span>
  );
}

function MiniDonut({ value, color }: { value: number; color: string }) {
  const r = 13, c = 15, stroke = 4, circ = 2 * Math.PI * r;
  return (
    <svg width={30} height={30} viewBox="0 0 30 30">
      <circle cx={c} cy={c} r={r} fill="none" stroke="#E2E8F0" strokeWidth={stroke}/>
      <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${(value / 100) * circ} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${c} ${c})`}/>
    </svg>
  );
}

function DonutChart({ quotes }: { quotes: DerivedQuote[] }) {
  const total = quotes.length;
  const segs  = DONUT_ORDER.map(s => ({ s, count: quotes.filter(q => q.status === s).length })).filter(d => d.count > 0);
  const cx = 55, cy = 55, ro = 48, ri = 31;
  let angle = -Math.PI / 2;
  return (
    <svg viewBox="0 0 110 110" style={{ width: 110, height: 110, flexShrink: 0 }}>
      {total === 0
        ? <circle cx={cx} cy={cy} r={(ro + ri) / 2} fill="none" stroke="#E2E8F0" strokeWidth={ro - ri}/>
        : segs.map(({ s, count }) => {
          const sweep = (count / total) * 2 * Math.PI, end = angle + sweep;
          const [c1x, c1y] = [cx + ro * Math.cos(angle), cy + ro * Math.sin(angle)];
          const [c2x, c2y] = [cx + ro * Math.cos(end),   cy + ro * Math.sin(end)];
          const [i1x, i1y] = [cx + ri * Math.cos(end),   cy + ri * Math.sin(end)];
          const [i2x, i2y] = [cx + ri * Math.cos(angle), cy + ri * Math.sin(angle)];
          const large = sweep > Math.PI ? 1 : 0;
          const d = `M${c1x} ${c1y}A${ro} ${ro} 0 ${large} 1 ${c2x} ${c2y}L${i1x} ${i1y}A${ri} ${ri} 0 ${large} 0 ${i2x} ${i2y}Z`;
          const r = <path key={s} d={d} fill={DONUT_COLORS[s]}/>;
          angle = end; return r;
        })}
      <text x={cx} y={cy - 5} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 20, fontWeight: 800, fill: '#0F172A', fontFamily: 'inherit' }}>{total}</text>
      <text x={cx} y={cx + 12} textAnchor="middle" style={{ fontSize: 8, fill: '#94A3B8', fontFamily: 'inherit' }}>Total</text>
    </svg>
  );
}

function SparkLine({ quotes, color = 'rgba(255,255,255,.6)' }: { quotes: DerivedQuote[]; color?: string }) {
  const now = TODAY();
  const pts = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return quotes.filter(q => {
      const c = new Date(q.created_at);
      return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
    }).reduce((a, q) => a + q.calc.total, 0);
  });
  const max  = Math.max(...pts, 1);
  const W = 140, H = 28;
  const poly = pts.map((v, i) => `${(i / 5) * W},${H - (v / max) * (H - 4) + 2}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H, display: 'block', opacity: .8 }}>
      <polyline points={poly} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}

function QuoteRow({ q, onOpen, onDuplicate }: { q: DerivedQuote; onOpen: () => void; onDuplicate: (e: React.MouseEvent) => void }) {
  const st     = statusStyle(q.status);
  const letter = q.client_id ? q.clientInitial : q.initial;
  const color  = avatarColor(q.client_id ? q.clientName : q.title);
  return (
    <div onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', border: '1px solid #EEF2F7', borderRadius: 13, cursor: 'pointer', transition: 'background .12s,border-color .12s' }}
      onMouseEnter={e => { const b = e.currentTarget as HTMLElement; b.style.background = '#F8FAFC'; b.style.borderColor = '#CBD5E1'; }}
      onMouseLeave={e => { const b = e.currentTarget as HTMLElement; b.style.background = ''; b.style.borderColor = '#EEF2F7'; }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{letter}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.title}</div>
        <div style={{ fontSize: 11, color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.clientName}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmt(q.calc.total)}</div>
        <span style={{ fontSize: 9, fontWeight: 700, color: st.c, background: st.b, padding: '2px 6px', borderRadius: 5 }}>{q.status}</span>
      </div>
      <button onClick={onDuplicate} title="Duplicar" style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#94A3B8', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}><FileText size={12}/></button>
    </div>
  );
}

function ActionBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '10px 6px', border: '1px solid #E2E8F0', borderRadius: 14, background: '#fff', cursor: 'pointer', transition: 'all .12s', color: '#2563EB' }}
      onMouseEnter={e => { const b = e.currentTarget as HTMLElement; b.style.background = '#EFF6FF'; b.style.borderColor = '#BFDBFE'; b.style.boxShadow = '0 3px 10px rgba(37,99,235,.08)'; }}
      onMouseLeave={e => { const b = e.currentTarget as HTMLElement; b.style.background = '#fff'; b.style.borderColor = '#E2E8F0'; b.style.boxShadow = ''; }}>
      <div style={{ width: 34, height: 34, borderRadius: 11, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#0F172A', textAlign: 'center', lineHeight: 1.2 }}>{label}</span>
    </button>
  );
}

function ProbBar({ pct, size = 70 }: { pct: number; size?: number }) {
  const color = pct >= 70 ? '#22C55E' : pct >= 45 ? '#F59E0B' : pct >= 25 ? '#F97316' : '#EF4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: size, height: 5, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99 }}/>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 30 }}>{pct}%</span>
    </div>
  );
}

// ─── PRO: Trapezoid Funnel (real narrowing funnel shape) ─────────────────────
function TrapFunnel({ quotes }: { quotes: DerivedQuote[] }) {
  const stages = [
    { label: 'Borrador',   status: 'Borrador',  color: '#3B82F6' },
    { label: 'Enviada',    status: 'Enviada',   color: '#8B5CF6' },
    { label: 'Aprobada',   status: 'Aprobada',  color: '#10B981' },
    { label: 'Por seguir', status: 'Vencida',   color: '#F59E0B' },
    { label: 'Perdida',    status: 'Rechazada', color: '#EF4444' },
  ];
  // Fixed visual widths create classic funnel shape regardless of data volume
  const WIDTHS = [100, 83, 67, 52, 40];

  const data = stages.map((s, i) => ({
    ...s,
    count: quotes.filter(q => q.status === s.status).length,
    total: quotes.filter(q => q.status === s.status).reduce((a, q) => a + q.calc.total, 0),
    width: WIDTHS[i],
  }));

  const firstCount = data[0].count || 1;
  const convRate   = Math.round((data[2].count / firstCount) * 100);

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {data.map((d, i) => (
          <div key={d.status} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: `${d.width}%`,
                minWidth: 44,
                height: 28,
                background: d.count > 0 ? d.color : '#E2E8F0',
                borderRadius: 5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 10px',
                opacity: d.count > 0 ? 1 : 0.45,
                transition: 'background .3s',
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: d.count > 0 ? '#fff' : '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '70%' }}>
                  {d.label}
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color: d.count > 0 ? '#fff' : '#CBD5E1' }}>{d.count}</span>
              </div>
            </div>
            <div style={{ width: 76, textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{fmtM(d.total)}</div>
              {i > 0 && data[i - 1].count > 0 && d.count > 0 && (
                <div style={{ fontSize: 9, color: '#94A3B8' }}>{Math.round((d.count / data[i - 1].count) * 100)}% tasa</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 6, borderTop: '1px solid #EEF2F7' }}>
        <span style={{ fontSize: 11, color: '#64748B' }}>Conversión Borrador → Aprobada</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#10B981' }}>{convRate}%</span>
      </div>
    </div>
  );
}

// PREMIUM: classic horizontal bars funnel
function FunnelViz({ quotes }: { quotes: DerivedQuote[] }) {
  const stages = [
    { label: 'Borrador',   status: 'Borrador',  color: '#60A5FA' },
    { label: 'Enviada',    status: 'Enviada',   color: '#A78BFA' },
    { label: 'Aprobada',   status: 'Aprobada',  color: '#34D399' },
    { label: 'Por seguir', status: 'Vencida',   color: '#FBB040' },
    { label: 'Perdida',    status: 'Rechazada', color: '#F87171' },
  ];
  const total = quotes.length || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {stages.map(s => {
        const count  = quotes.filter(q => q.status === s.status).length;
        const total2 = quotes.reduce((a, q) => a + (q.status === s.status ? q.calc.total : 0), 0);
        const barPct = Math.max((count / total) * 100, count > 0 ? 5 : 0);
        return (
          <div key={s.status} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: `${Math.min(barPct, 100)}%`, minWidth: count > 0 ? 8 : 0, height: 22, background: s.color, borderRadius: 4, transition: 'width .5s', flexShrink: 0 }}/>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{s.label}</span>
            <span style={{ fontSize: 11, color: '#64748B', marginLeft: 'auto', flexShrink: 0 }}>{count} · {fmtM(total2)}</span>
          </div>
        );
      })}
    </div>
  );
}

function ServiceBars({ quotes }: { quotes: DerivedQuote[] }) {
  const svcs  = getTopServices(quotes);
  if (!svcs.length) return <div style={{ fontSize: 12.5, color: '#94A3B8', textAlign: 'center', padding: '8px 0' }}>Sin datos</div>;
  const maxT  = svcs[0].total;
  const allT  = quotes.reduce((a, q) => a + q.calc.total, 0) || 1;
  const CLRS  = ['#2563EB', '#7C3AED', '#22C55E', '#F59E0B', '#EF4444'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {svcs.map((s, i) => {
        const pct = Math.round((s.total / allT) * 100);
        return (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10.5, color: '#94A3B8', width: 14, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginLeft: 6, flexShrink: 0 }}>{fmtM(s.total)}</span>
              </div>
              <div style={{ height: 5, background: '#F1F5F9', borderRadius: 99 }}>
                <div style={{ width: `${(s.total / maxT) * 100}%`, height: '100%', background: CLRS[i] || '#94A3B8', borderRadius: 99 }}/>
              </div>
            </div>
            <span style={{ fontSize: 10.5, color: '#94A3B8', width: 28, textAlign: 'right', flexShrink: 0 }}>{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Shared dashboard header ──────────────────────────────────────────────────
function DashHeader({ firstName, ctaBg, ctaShadow, onNew, onSearch }: {
  firstName: string; ctaBg: string; ctaShadow: string;
  onNew: () => void; onSearch: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.5px', margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>¡Buenos días, {firstName}! <span>👋</span></h1>
        <p style={{ fontSize: 12, color: '#64748B', margin: '2px 0 0' }}>Resumen de tu actividad comercial.</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 11, padding: '7px 12px', cursor: 'pointer', minWidth: 160 }} onClick={onSearch}>
          <Search size={14} color="#94A3B8"/><span style={{ fontSize: 12.5, color: '#94A3B8' }}>Buscar...</span>
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 11, background: '#F8FAFC', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Bell size={16} color="#64748B"/></div>
        <button onClick={onNew} style={{ border: 'none', background: ctaBg, color: '#fff', fontWeight: 700, fontSize: 13, padding: '9px 14px', borderRadius: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: ctaShadow }}>
          <Plus size={15} strokeWidth={2.5}/> Nueva cotización
        </button>
      </div>
    </div>
  );
}

// ─── KPI Card (FREE / PREMIUM) ────────────────────────────────────────────────
function KpiCard({ label, value, sub, trend, trendSuffix, iconBg, iconColor, icon: IC, onClick, extra }: {
  label: string; value: string; sub: string; trend?: number | null; trendSuffix?: string;
  iconBg: string; iconColor: string; icon: React.FC<{ size?: number; color?: string }>;
  onClick?: () => void; extra?: React.ReactNode;
}) {
  return (
    <div onClick={onClick} style={{ ...CARD, cursor: onClick ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: 0 }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.borderColor = '#CBD5E1'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#EEF2F7'; }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: '#94A3B8', letterSpacing: '.4px' }}>{label}</span>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><IC size={14} color={iconColor}/></div>
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>{sub}</div>
      {extra && <div style={{ marginTop: 4 }}>{extra}</div>}
      {trend !== undefined && trend !== null && <div style={{ marginTop: 5 }}><TrendBadge pct={trend} suffix={trendSuffix}/></div>}
    </div>
  );
}

// ─── FREE Dashboard ───────────────────────────────────────────────────────────
function FreeDashboard({ quotes, company, openQuoteFlow, openQuoteDetail, openUpgradeModal, navigate }: any) {
  const now          = TODAY();
  const prev         = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const inM          = (q: DerivedQuote, d: Date) => { const c = new Date(q.created_at); return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth(); };
  const thisM        = quotes.filter((q: DerivedQuote) => inM(q, now));
  const prevM        = quotes.filter((q: DerivedQuote) => inM(q, prev));
  const monthTotal   = thisM.reduce((a: number, q: DerivedQuote) => a + q.calc.total, 0);
  const monthLabel   = MONTHS_LONG[now.getMonth()].toUpperCase();
  const thisApproved = thisM.filter((q: DerivedQuote) => q.status === 'Aprobada').length;
  const prevApproved = prevM.filter((q: DerivedQuote) => q.status === 'Aprobada').length;
  const pending      = quotes.filter((q: DerivedQuote) => q.status === 'Enviada').length;
  const pendingPct   = quotes.length ? Math.round((pending / quotes.length) * 100) : 0;
  const recentQuotes = quotes.slice(0, 5);
  const followUp     = quotes.find((q: DerivedQuote) => q.status === 'Enviada');
  const moreFollowUps = quotes.filter((q: DerivedQuote) => q.status === 'Enviada').length;

  function duplicate(e: React.MouseEvent, q: DerivedQuote) {
    e.stopPropagation();
    openQuoteFlow({ step: 4, cfg: { clientId: q.client_id, proj: q.title + ' (copia)', loc: q.location || '', serviceLines: q.cfg.serviceLines, adminPct: q.cfg.adminPct, imprevistosPct: q.cfg.imprevistosPct, util: q.cfg.util, taxMode: q.cfg.taxMode, taxRate: q.cfg.taxRate, advancePct: q.cfg.advancePct, docDetailLevel: q.cfg.docDetailLevel, includeTechnicalAnnex: q.cfg.includeTechnicalAnnex, validDays: q.cfg.validDays, discount: q.cfg.discount, discountOn: q.cfg.discountOn } });
  }

  const linkBtn: React.CSSProperties    = { border: 'none', background: 'none', color: '#2563EB', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, padding: 0 };
  const viewAllBtn: React.CSSProperties = { width: '100%', marginTop: 10, border: 'none', background: '#F8FAFC', color: '#2563EB', fontWeight: 700, fontSize: 12.5, padding: '9px 0', borderRadius: 11, cursor: 'pointer', transition: 'background .12s' };

  return (
    <div className="dash-root">
      <div className="dash-kpi">
        <div className="dash-kpi-main" style={{ background: 'linear-gradient(150deg,#2563EB 0%,#1D4ED8 100%)', borderRadius: 18, padding: '14px 18px', color: '#fff', position: 'relative', overflow: 'hidden', boxShadow: '0 6px 20px -4px rgba(37,99,235,.4)' }}>
          <div style={{ position: 'absolute', right: -20, top: -20, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }}/>
          <div style={{ position: 'absolute', right: 18, top: 14, width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 16, fontWeight: 800 }}>$</span></div>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.4px', color: '#BFD3FF', marginBottom: 4 }}>VALOR COTIZADO · {monthLabel}</div>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-1.5px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmtM(monthTotal)}</div>
          <div style={{ fontSize: 11, color: '#BFD3FF', marginTop: 3, marginBottom: 10 }}>Este mes</div>
          <SparkLine quotes={quotes}/>
        </div>
        <KpiCard label="COTIZACIONES" value={String(thisM.length)} sub="Este mes" trend={pctChange(prevM.length, thisM.length)} iconBg="#EEF2FF" iconColor="#2563EB" icon={FileText} onClick={() => navigate('/app/cotizaciones')}/>
        <KpiCard label="APROBADAS" value={String(thisApproved)} sub="Este mes" trend={pctChange(prevApproved, thisApproved)} iconBg="#F0FDF4" iconColor="#22C55E" icon={CheckCircle2} onClick={() => navigate('/app/cotizaciones?estado=Aprobada')}/>
        <KpiCard label="PENDIENTES" value={String(pending)} sub="Por seguir" iconBg="#FFFBEB" iconColor="#F59E0B" icon={Clock} onClick={() => navigate('/app/cotizaciones?estado=Enviada')} extra={pendingPct > 0 ? <span style={{ fontSize: 11, fontWeight: 700, color: '#D97706', background: '#FEF3C7', padding: '2px 7px', borderRadius: 99 }}>↑ {pendingPct}% del total</span> : null}/>
      </div>

      <div className="dash-main">
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Cotizaciones recientes</h3>
            <button onClick={() => navigate('/app/cotizaciones')} style={linkBtn}>Ver todas <ChevronRight size={13}/></button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentQuotes.length === 0
              ? <div style={{ textAlign: 'center', padding: '24px 0', color: '#94A3B8' }}><FileText size={28} color="#E2E8F0" style={{ margin: '0 auto 6px', display: 'block' }}/><div style={{ fontSize: 12.5, fontWeight: 600 }}>Aún no tienes cotizaciones</div></div>
              : recentQuotes.map((q: DerivedQuote) => <QuoteRow key={q.id} q={q} onOpen={() => openQuoteDetail(q.id)} onDuplicate={e => duplicate(e, q)}/>)}
          </div>
          {recentQuotes.length > 0 && <button onClick={() => navigate('/app/cotizaciones')} style={viewAllBtn} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#EFF6FF'; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; }}>Ver todas las cotizaciones →</button>}
        </div>

        <div style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px' }}>Estado de cotizaciones</h3>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}><DonutChart quotes={quotes}/></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
            {DONUT_ORDER.map(s => { const count = quotes.filter((q: DerivedQuote) => q.status === s).length; const pct = quotes.length ? Math.round((count / quotes.length) * 100) : 0; return (<div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: DONUT_COLORS[s], flexShrink: 0 }}/><span style={{ fontSize: 11.5, fontWeight: 600, flex: 1, color: '#374151' }}>{STATUS_LABEL[s] ?? s}</span><span style={{ fontSize: 11.5, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{count}</span><span style={{ fontSize: 10.5, color: '#94A3B8', width: 34, textAlign: 'right' }}>({pct}%)</span></div>); })}
          </div>
          <button onClick={() => navigate('/app/reportes')} style={{ ...viewAllBtn, marginTop: 12 }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#EFF6FF'; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; }}>Ver detalle →</button>
        </div>

        <div className="dash-main-right" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={CARD}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Seguimiento sugerido</h3>
              {moreFollowUps > 1 && <button onClick={() => navigate('/app/cotizaciones?estado=Enviada')} style={linkBtn}>Ver todos ({moreFollowUps}) →</button>}
            </div>
            {followUp
              ? (<div style={{ border: '1px solid #FDE68A', borderRadius: 12, padding: '10px 12px', background: '#FFFBEB' }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{followUp.title}</div>
                <div style={{ fontSize: 11, color: '#92400E', marginBottom: 8 }}>Enviada hace {daysAgo(followUp.sent_at ?? followUp.created_at)} días</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => openQuoteDetail(followUp.id)} style={{ flex: 1, border: 'none', background: '#0F172A', color: '#fff', fontWeight: 700, fontSize: 12, padding: '8px 0', borderRadius: 9, cursor: 'pointer' }}>Contactar</button>
                  <button onClick={() => openWhats(followMessage(followUp.clientName, followUp.title, followUp.calc.total, company.name))} style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid #D1FAE5', background: '#F0FDF4', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} title="WhatsApp"><MessageCircle size={15} color="#16A34A"/></button>
                </div>
              </div>)
              : (<div style={{ textAlign: 'center', padding: '12px 0', color: '#94A3B8', fontSize: 12 }}><CheckCircle2 size={22} color="#BBF7D0" style={{ margin: '0 auto 5px', display: 'block' }}/>Sin seguimientos pendientes. ¡Vas al día!</div>)}
          </div>
          <div style={{ ...CARD, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Lock size={13} color="#2563EB"/></div>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>Shelwi IA</span>
              <span style={{ fontSize: 9, fontWeight: 800, background: '#2563EB', color: '#fff', padding: '2px 8px', borderRadius: 5, letterSpacing: '.3px' }}>PRO</span>
            </div>
            <p style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5, margin: '0 0 9px' }}>Desbloquea la IA para recomendaciones inteligentes, predicción de cierre y más.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 11, flex: 1 }}>
              {['Recomendaciones inteligentes', 'Predicción de cierre', 'Análisis de clientes', 'Reportes avanzados'].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#94A3B8' }}><Lock size={11} color="#CBD5E1"/> {item}</div>
              ))}
            </div>
            <button onClick={() => openUpgradeModal({ title: 'Desbloquea Shelwi IA', message: 'Accede a IA predictiva con el plan PRO.', targetPlan: 'pro', ctaLabel: 'Actualizar a PRO' })} style={{ width: '100%', border: '1.5px solid #BFDBFE', background: '#EFF6FF', color: '#2563EB', fontWeight: 700, fontSize: 13, padding: '9px 0', borderRadius: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 'auto' }}><TrendingUp size={13}/> Actualizar a PRO →</button>
          </div>
        </div>
      </div>

      <div className="dash-bottom">
        <div style={CARD}>
          <h3 style={{ fontSize: 13.5, fontWeight: 700, margin: '0 0 10px' }}>Acciones rápidas</h3>
          <div className="dash-actions-btns" style={{ display: 'flex', gap: 8 }}>
            <ActionBtn icon={<Plus size={18}/>} label="Nueva cotización" onClick={() => openQuoteFlow({ cfg: defaultQConfig(company) })}/>
            <ActionBtn icon={<UserPlus size={18}/>} label="Nuevo cliente" onClick={() => navigate('/app/clientes')}/>
            <ActionBtn icon={<LayoutTemplate size={18}/>} label="Nueva plantilla" onClick={() => navigate('/app/plantillas')}/>
            <ActionBtn icon={<Wallet size={18}/>} label="Registrar anticipo" onClick={() => navigate('/app/cotizaciones')}/>
            <ActionBtn icon={<BarChart2 size={18}/>} label="Reportes básicos" onClick={() => navigate('/app/reportes')}/>
          </div>
        </div>
        <div className="dash-plan-card" style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Crown size={15} color="#2563EB"/></div>
            <span style={{ fontSize: 13.5, fontWeight: 800 }}>Estás en el plan FREE</span>
          </div>
          <p style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5, margin: 0 }}>Actualiza a PRO para acceder a más herramientas y hacer crecer tu negocio.</p>
          <button onClick={() => navigate('/app/planes')} style={{ marginTop: 'auto', border: 'none', background: '#EFF6FF', color: '#2563EB', fontWeight: 700, fontSize: 13, padding: '9px 0', borderRadius: 11, cursor: 'pointer', width: '100%' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#DBEAFE'; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#EFF6FF'; }}>Comparar planes →</button>
        </div>
      </div>
    </div>
  );
}

// ─── PRO Dashboard — 3 filas, cabe en 1366×768 ───────────────────────────────
function ProDashboard({ quotes, company, openQuoteFlow, openQuoteDetail, navigate }: any) {
  const now  = TODAY();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const inM  = (q: DerivedQuote, d: Date) => {
    const c = new Date(q.created_at);
    return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
  };
  const thisM          = quotes.filter((q: DerivedQuote) => inM(q, now));
  const prevM          = quotes.filter((q: DerivedQuote) => inM(q, prev));
  const monthTotal     = thisM.reduce((a: number, q: DerivedQuote) => a + q.calc.total, 0);
  const prevMonthTotal = prevM.reduce((a: number, q: DerivedQuote) => a + q.calc.total, 0);
  const monthLabel     = MONTHS_LONG[now.getMonth()].toUpperCase();
  const monthChg       = pctChange(prevMonthTotal, monthTotal);

  const sentQ     = quotes.filter((q: DerivedQuote) => q.status === 'Enviada');
  const approvedQ = quotes.filter((q: DerivedQuote) => q.status === 'Aprobada');
  const borradorQ = quotes.filter((q: DerivedQuote) => q.status === 'Borrador');
  const vencidaQ  = quotes.filter((q: DerivedQuote) => q.status === 'Vencida');
  const sent      = sentQ.length;
  const approved  = approvedQ.length;

  const probCierre    = sentQ.reduce((a: number, q: DerivedQuote) => a + q.calc.total, 0);
  const approvedTotal = approvedQ.reduce((a: number, q: DerivedQuote) => a + q.calc.total, 0);
  const facturado     = approvedQ.reduce((a: number, q: DerivedQuote) => a + (q.calc.total * (q.cfg.advancePct / 100)), 0);
  const conv          = sent + approved > 0 ? Math.round((approved / (sent + approved)) * 100) : 0;

  // Top 4 follow-ups sorted by days sent (most at-risk first)
  const followUps = sentQ
    .map((q: DerivedQuote) => ({ ...q, dias: daysAgo(q.sent_at ?? q.created_at), prob: closeProbability(q) }))
    .sort((a: any, b: any) => b.dias - a.dias)
    .slice(0, 4);

  // Activity: last 5 events across all quotes
  const activity = getRecentActivity(quotes).slice(0, 5);

  // Upcoming dues
  const upcoming = getUpcomingDue(quotes).slice(0, 3);

  // IA recommendations (data-driven, not mocked)
  const iaRecs: { icon: React.ReactNode; text: string; action: () => void; btnLabel: string }[] = [];
  if (followUps.length > 0) {
    const q = followUps[0];
    iaRecs.push({ icon: <MessageCircle size={11} color="#7C3AED"/>, text: `"${String(q.title).slice(0, 30)}" lleva ${q.dias}d sin respuesta (${q.prob}% prob.)`, action: () => openWhats(followMessage(q.clientName, q.title, q.calc.total, company.name)), btnLabel: 'WA' });
  }
  if (vencidaQ.length > 0) {
    iaRecs.push({ icon: <AlertTriangle size={11} color="#F59E0B"/>, text: `${vencidaQ.length} cotización${vencidaQ.length > 1 ? 'es' : ''} vencida${vencidaQ.length > 1 ? 's' : ''} — renegocia para recuperar.`, action: () => navigate('/app/cotizaciones?estado=Vencida'), btnLabel: 'Ver' });
  }
  if (conv < 50 && quotes.length > 3) {
    iaRecs.push({ icon: <TrendingUp size={11} color="#22C55E"/>, text: `Conversión en ${conv}%. Mejora el seguimiento para subirla.`, action: () => navigate('/app/reportes'), btnLabel: 'Pipeline' });
  }
  if (borradorQ.length > 2) {
    iaRecs.push({ icon: <FileText size={11} color="#3B82F6"/>, text: `${borradorQ.length} cotizaciones en borrador sin enviar.`, action: () => navigate('/app/cotizaciones?estado=Borrador'), btnLabel: 'Enviar' });
  }
  if (iaRecs.length === 0) {
    iaRecs.push({ icon: <CheckCircle2 size={11} color="#22C55E"/>, text: 'Todo al día. Sigue cotizando para mantener el ritmo.', action: () => openQuoteFlow({ cfg: defaultQConfig(company) }), btnLabel: 'Nueva' });
  }

  // Top services compact (4 max)
  const topSvcs = getTopServices(quotes).slice(0, 4);
  const allTotal = quotes.reduce((a: number, q: DerivedQuote) => a + q.calc.total, 0) || 1;

  // Day summary chips
  const daySummary = [
    { label: 'Seguir',     count: sent,             color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A',  icon: <Clock size={11}/>,        action: () => navigate('/app/cotizaciones?estado=Enviada') },
    { label: 'Borradores', count: borradorQ.length, color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE',  icon: <FileText size={11}/>,      action: () => navigate('/app/cotizaciones?estado=Borrador') },
    { label: 'Recuperar',  count: vencidaQ.length,  color: '#EF4444', bg: '#FEF2F2', border: '#FECACA',  icon: <AlertTriangle size={11}/>, action: () => navigate('/app/cotizaciones?estado=Vencida') },
    { label: 'Este mes',   count: thisM.length,      color: '#22C55E', bg: '#F0FDF4', border: '#A7F3D0',  icon: <Plus size={11}/>,          action: () => openQuoteFlow({ cfg: defaultQConfig(company) }) },
  ];

  // Card + text styles
  const CP: React.CSSProperties = { ...CARD, padding: 12 };
  const H:  React.CSSProperties = { fontSize: 13, fontWeight: 700, margin: 0 };
  const LB: React.CSSProperties = { border: 'none', background: 'none', color: '#00B894', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, padding: 0 };
  const SVCCLRS = ['#2563EB', '#7C3AED', '#22C55E', '#F59E0B'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* ── ROW 1: KPI (5 columns) ────────────────────────────────────────── */}
      <div className="dash-pro-kpi">
        {/* Main KPI — gradient PRO green */}
        <div style={{ background: 'linear-gradient(150deg,#003d30 0%,#00503f 100%)', borderRadius: 16, padding: '10px 14px', color: '#fff', boxShadow: '0 6px 20px -4px rgba(0,80,63,.45)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.4px', color: '#6EE7B7' }}>VALOR COTIZADO · {monthLabel}</span>
            {monthChg !== null && <span style={{ fontSize: 9, fontWeight: 700, color: '#6EE7B7' }}>{monthChg >= 0 ? '+' : ''}{monthChg}% vs ant.</span>}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-1.5px', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{fmtM(monthTotal)}</div>
          <div style={{ fontSize: 10, color: '#6EE7B7', marginBottom: 4 }}>Este mes</div>
          <SparkLine quotes={quotes} color="rgba(110,231,183,.65)"/>
        </div>

        {/* 4 mini KPI cards */}
        {([
          { label: 'PROBABLE CIERRE', val: fmtM(probCierre), sub: `${sent} en proceso`, IC: TrendingUp, ib: '#F5F3FF', ic: '#7C3AED' },
          { label: 'APROBADAS',       val: fmtM(approvedTotal), sub: `${approved} cots · ${quotes.length ? Math.round((approved / quotes.length) * 100) : 0}% tot`, IC: CheckCircle2, ib: '#F0FDF4', ic: '#22C55E' },
          { label: 'FACTURADO',       val: fmtM(facturado), sub: `${approvedTotal > 0 ? Math.round((facturado / approvedTotal) * 100) : 0}% del aprobado`, IC: Wallet, ib: '#FFF7ED', ic: '#F97316' },
          { label: 'CONVERSIÓN',      val: `${conv}%`, sub: `${approved} de ${sent + approved}`, IC: BarChart2, ib: '#F0FDF4', ic: '#22C55E', ex: <MiniDonut value={conv} color="#22C55E"/> },
        ] as const).map(k => (
          <div key={k.label} style={{ ...CP, display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <span style={{ fontSize: 8.5, fontWeight: 700, color: '#94A3B8', letterSpacing: '.3px', lineHeight: 1.4 }}>{k.label}</span>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: k.ib, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><k.IC size={12} color={k.ic}/></div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1, marginBottom: 4, fontVariantNumeric: 'tabular-nums' }}>{k.val}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#64748B' }}>{k.sub}</span>
              {(k as any).ex}
            </div>
          </div>
        ))}
      </div>

      {/* ── ROW 2: Pipeline funnel | Seguimientos + Resumen del día ─────────── */}
      <div className="dash-pro-main">
        {/* Pipeline: real trapezoid funnel */}
        <div style={CP}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={H}>Pipeline de ventas</h3>
            <button onClick={() => navigate('/app/reportes')} style={LB}>Analíticas <ArrowRight size={11}/></button>
          </div>
          <TrapFunnel quotes={quotes}/>
        </div>

        {/* Right col: Seguimientos + Resumen stacked */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Seguimientos */}
          <div style={CP}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
              <h3 style={H}>
                Seguimientos
                {followUps.length > 0 && (
                  <span style={{ fontSize: 10.5, fontWeight: 800, background: '#F59E0B', color: '#fff', padding: '1px 7px', borderRadius: 99, marginLeft: 6 }}>{sent}</span>
                )}
              </h3>
              {sent > 4 && <button onClick={() => navigate('/app/cotizaciones?estado=Enviada')} style={LB}>Ver todos →</button>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {followUps.length === 0
                ? <div style={{ fontSize: 11.5, color: '#94A3B8', textAlign: 'center', padding: '6px 0' }}>✓ Sin seguimientos pendientes</div>
                : followUps.map((q: any, i: number) => (
                  <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 7, paddingTop: i > 0 ? 5 : 0, paddingBottom: i < followUps.length - 1 ? 5 : 0, borderBottom: i < followUps.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: q.prob >= 65 ? '#22C55E' : q.prob >= 40 ? '#F59E0B' : '#EF4444' }}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</div>
                      <div style={{ fontSize: 10.5, color: '#64748B' }}>{q.clientName} · {q.dias}d · {q.prob}% prob.</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => openWhats(followMessage(q.clientName, q.title, q.calc.total, company.name))} title="WhatsApp" style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #D1FAE5', background: '#F0FDF4', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}><MessageCircle size={11} color="#16A34A"/></button>
                      <button onClick={() => openQuoteDetail(q.id)} title="Ver" style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}><ArrowRight size={11} color="#94A3B8"/></button>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>

          {/* Resumen del día */}
          <div style={CP}>
            <h3 style={{ ...H, marginBottom: 7 }}>Resumen del día</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {daySummary.map(t => (
                <button key={t.label} onClick={t.action} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px', border: `1px solid ${t.border}`, borderRadius: 10, background: t.bg, cursor: 'pointer', textAlign: 'left', transition: 'opacity .12s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '.85'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}>
                  <span style={{ color: t.color, flexShrink: 0 }}>{t.icon}</span>
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: t.color, flexShrink: 0 }}>{t.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 3: Actividad | IA + Vencimientos | Servicios + Acciones ─────── */}
      <div className="dash-pro-bot">
        {/* Actividad reciente — 5 eventos compactos */}
        <div style={CP}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={H}>Actividad reciente</h3>
            <button onClick={() => navigate('/app/cotizaciones')} style={LB}>Ver todas →</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {activity.length === 0
              ? <div style={{ fontSize: 11.5, color: '#94A3B8', textAlign: 'center', padding: '8px 0' }}>Sin actividad reciente</div>
              : activity.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: i > 0 ? 5 : 0, paddingBottom: i < activity.length - 1 ? 5 : 0, borderBottom: i < activity.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                  <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{a.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</div>
                    <div style={{ fontSize: 10.5, color: '#94A3B8', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.sub}</div>
                  </div>
                  <span style={{ fontSize: 10, color: '#94A3B8', flexShrink: 0, whiteSpace: 'nowrap' }}>{a.time}</span>
                </div>
              ))
            }
          </div>
        </div>

        {/* IA recomendaciones + Vencimientos */}
        <div style={CP}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: 7, background: 'linear-gradient(135deg,#7C3AED,#A855F7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Zap size={12} color="#fff"/></div>
            <h3 style={H}>Recomendaciones IA</h3>
            <span style={{ fontSize: 8.5, fontWeight: 800, background: '#7C3AED', color: '#fff', padding: '2px 6px', borderRadius: 4, letterSpacing: '.3px' }}>PRO</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {iaRecs.slice(0, 4).map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '6px 9px', background: '#F8FAFC', borderRadius: 9, border: '1px solid #EEF2F7' }}>
                <span style={{ flexShrink: 0, marginTop: 1 }}>{r.icon}</span>
                <span style={{ flex: 1, fontSize: 11, color: '#374151', lineHeight: 1.35 }}>{r.text}</span>
                <button onClick={r.action} style={{ flexShrink: 0, border: 'none', background: '#7C3AED', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>{r.btnLabel}</button>
              </div>
            ))}
          </div>

          {/* Próximos vencimientos inline */}
          {upcoming.length > 0 && (
            <div style={{ marginTop: 9, paddingTop: 8, borderTop: '1px solid #EEF2F7' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 5 }}>Próximos vencimientos</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {upcoming.map(q => (
                  <div key={q.id} onClick={() => openQuoteDetail(q.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <Calendar size={11} color={q.daysLeft <= 1 ? '#EF4444' : q.daysLeft <= 3 ? '#F59E0B' : '#7C3AED'} style={{ flexShrink: 0 }}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</div>
                      <div style={{ fontSize: 10, color: '#94A3B8' }}>{q.clientName} · {fmtM(q.calc.total)}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: q.daysLeft <= 1 ? '#EF4444' : q.daysLeft <= 3 ? '#F97316' : '#7C3AED', flexShrink: 0 }}>{q.daysLeft <= 0 ? 'HOY' : `${q.daysLeft}d`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Servicios + Acciones rápidas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ ...CP, flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={H}>Top servicios</h3>
              <span style={{ fontSize: 10.5, color: '#94A3B8' }}>Este mes</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {topSvcs.length === 0
                ? <div style={{ fontSize: 11.5, color: '#94A3B8', textAlign: 'center' }}>Sin datos</div>
                : topSvcs.map((s, i) => {
                  const pct = Math.round((s.total / allTotal) * 100);
                  return (
                    <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: 9.5, color: '#94A3B8', width: 12, flexShrink: 0 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ height: 4, background: '#F1F5F9', borderRadius: 99, marginBottom: 3 }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: SVCCLRS[i] || '#94A3B8', borderRadius: 99 }}/>
                        </div>
                        <div style={{ fontSize: 10.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', flexShrink: 0 }}>{fmtM(s.total)}</span>
                    </div>
                  );
                })
              }
            </div>
          </div>

          <div style={CP}>
            <h3 style={{ ...H, marginBottom: 7 }}>Acciones rápidas</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              {[
                { ic: <Plus size={13}/>,      label: 'Nueva cotización', action: () => openQuoteFlow({ cfg: defaultQConfig(company) }) },
                { ic: <UserPlus size={13}/>,   label: 'Nuevo cliente',    action: () => navigate('/app/clientes') },
                { ic: <BarChart2 size={13}/>,  label: 'Reportes',         action: () => navigate('/app/reportes') },
                { ic: <Calculator size={13}/>, label: 'Calculadora',      action: () => navigate('/app/ia') },
              ].map(a => (
                <button key={a.label} onClick={a.action} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', border: '1px solid #E2E8F0', background: '#fff', borderRadius: 9, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#374151', transition: 'all .12s', textAlign: 'left' }}
                  onMouseEnter={e => { const b = e.currentTarget as HTMLElement; b.style.background = '#F0FDF4'; b.style.borderColor = '#A7F3D0'; }}
                  onMouseLeave={e => { const b = e.currentTarget as HTMLElement; b.style.background = '#fff'; b.style.borderColor = '#E2E8F0'; }}>
                  <span style={{ color: '#00B894', flexShrink: 0 }}>{a.ic}</span>{a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PREMIUM Dashboard ────────────────────────────────────────────────────────
function PremiumDashboard({ quotes, company, openQuoteFlow, openQuoteDetail, navigate }: any) {
  const now  = TODAY();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const inM  = (q: DerivedQuote, d: Date) => { const c = new Date(q.created_at); return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth(); };
  const thisM          = quotes.filter((q: DerivedQuote) => inM(q, now));
  const prevM          = quotes.filter((q: DerivedQuote) => inM(q, prev));
  const monthTotal     = thisM.reduce((a: number, q: DerivedQuote) => a + q.calc.total, 0);
  const prevMonthTotal = prevM.reduce((a: number, q: DerivedQuote) => a + q.calc.total, 0);
  const monthLabel     = MONTHS_LONG[now.getMonth()].toUpperCase();
  const approvedQ      = quotes.filter((q: DerivedQuote) => q.status === 'Aprobada');
  const sentQ          = quotes.filter((q: DerivedQuote) => q.status === 'Enviada');
  const sent           = sentQ.length;
  const approved       = approvedQ.length;
  const probCierre     = sentQ.reduce((a: number, q: DerivedQuote) => a + q.calc.total, 0);
  const approvedTotal  = approvedQ.reduce((a: number, q: DerivedQuote) => a + q.calc.total, 0);
  const facturado      = approvedQ.reduce((a: number, q: DerivedQuote) => a + (q.calc.total * (q.cfg.advancePct / 100)), 0);
  const conv           = sent + approved > 0 ? Math.round((approved / (sent + approved)) * 100) : 0;
  const avgUtil        = quotes.length ? Math.round(quotes.reduce((a: number, q: DerivedQuote) => a + q.cfg.util, 0) / quotes.length) : 0;
  const approvedDays   = approvedQ.length ? Math.round(approvedQ.reduce((a: number, q: DerivedQuote) => a + daysAgo(q.created_at), 0) / approvedQ.length) : null;
  const monthChg       = pctChange(prevMonthTotal, monthTotal);
  const closePreds     = sentQ.map((q: DerivedQuote) => ({ ...q, prob: closeProbability(q) })).sort((a: any, b: any) => b.prob - a.prob).slice(0, 5);
  const smartAlerts    = getSmartAlerts(quotes);
  const clientRanking  = getClientRanking(quotes);
  const recentActivity = getRecentActivity(quotes);
  const upcoming       = getUpcomingDue(quotes);
  const aiSummary      = generateAISummary(thisM, prevM, company);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr 1fr 1fr', gap: 10 }}>
        <div style={{ background: 'linear-gradient(150deg,#1e0a4e 0%,#3b0f8c 100%)', borderRadius: 18, padding: '14px 18px', color: '#fff', position: 'relative', overflow: 'hidden', boxShadow: '0 6px 20px -4px rgba(124,58,237,.5)' }}>
          <div style={{ position: 'absolute', right: -20, top: -20, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,.06)' }}/>
          <div style={{ position: 'absolute', right: 18, top: 14, width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 16, fontWeight: 800 }}>$</span></div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.4px', color: '#C4B5FD', marginBottom: 4 }}>VALOR COTIZADO · {monthLabel}</div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-1.5px', lineHeight: 1 }}>{fmtM(monthTotal)}</div>
          <div style={{ fontSize: 10.5, color: '#C4B5FD', marginTop: 3, marginBottom: 8 }}>{monthChg !== null ? `${monthChg >= 0 ? '+' : ''}${monthChg}% vs mes ant.` : 'Este mes'}</div>
          <SparkLine quotes={quotes} color="rgba(196,181,253,.6)"/>
        </div>
        {([
          { label: 'PROBABLE CIERRE', value: fmtM(probCierre), sub: `${sent} cots · ${conv}% prob.`, ic: TrendingUp, bg: '#F5F3FF', fc: '#7C3AED' },
          { label: 'APROBADAS',       value: fmtM(approvedTotal), sub: `${approved} cots · ${quotes.length ? Math.round((approved / quotes.length) * 100) : 0}% total`, ic: CheckCircle2, bg: '#F0FDF4', fc: '#22C55E' },
          { label: 'FACTURADO',       value: fmtM(facturado), sub: `${approved} proyectos`, ic: Wallet, bg: '#FFF7ED', fc: '#F97316' },
          { label: 'CONVERSIÓN',      value: `${conv}%`, sub: `${approved} de ${sent + approved}`, ic: BarChart2, bg: '#F0FDF4', fc: '#22C55E', extra: <MiniDonut value={conv} color="#7C3AED"/> },
          { label: 'T. PROM. CIERRE', value: approvedDays ? `${approvedDays} días` : '--', sub: 'Promedio histórico', ic: Clock, bg: '#EEF2FF', fc: '#2563EB' },
          { label: 'RENTABILIDAD',    value: avgUtil ? `${avgUtil}%` : '--', sub: 'Utilidad estimada', ic: TrendingUp, bg: '#F0FDF4', fc: '#22C55E' },
        ] as const).map(k => (
          <div key={k.label} style={{ ...CARD, display: 'flex', flexDirection: 'column', padding: 12, gap: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <span style={{ fontSize: 8.5, fontWeight: 700, color: '#94A3B8', letterSpacing: '.3px' }}>{k.label}</span>
              <div style={{ width: 24, height: 24, borderRadius: 7, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><k.ic size={12} color={k.fc}/></div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>{k.sub}</div>
            {(k as any).extra && <div style={{ marginTop: 3 }}>{(k as any).extra}</div>}
          </div>
        ))}
      </div>

      {/* Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.4fr 1.3fr', gap: 12 }}>
        <div style={{ background: '#0F172A', borderRadius: 18, padding: 16, color: '#fff', position: 'relative', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,.2)' }}>
          <div style={{ position: 'absolute', right: -20, bottom: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(124,58,237,.2)' }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: 'linear-gradient(135deg,#7C3AED,#A855F7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ fontSize: 14, fontWeight: 900 }}>AI</span></div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 13, fontWeight: 800 }}>Resumen ejecutivo Shelwi IA</span><span style={{ fontSize: 9, fontWeight: 800, background: 'linear-gradient(135deg,#7C3AED,#A855F7)', padding: '2px 7px', borderRadius: 5 }}>PREMIUM</span></div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>Análisis automático</div>
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#E2E8F0', marginBottom: 8 }}>{aiSummary.risk === 0 ? 'Tu negocio va por excelente camino 🚀' : 'Hay oportunidades de mejora 💡'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
            {aiSummary.lines.map((l, i) => (<div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11.5, color: '#CBD5E1' }}><span style={{ color: '#A78BFA', flexShrink: 0 }}>✓</span>{l}</div>))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 10 }}>
            {[{ label: 'En riesgo', value: String(aiSummary.risk), color: '#EF4444' }, { label: 'Mejor servicio', value: (aiSummary.topSvc || '—').slice(0, 12), color: '#A78BFA' }].map(m => (
              <div key={m.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: m.color }}>{m.value}</div>
                <div style={{ fontSize: 9.5, color: '#64748B' }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Predicción de cierre</h3>
            <button onClick={() => navigate('/app/cotizaciones?estado=Enviada')} style={{ border: 'none', background: 'none', color: '#7C3AED', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Ver todas →</button>
          </div>
          {closePreds.length === 0
            ? <div style={{ fontSize: 12.5, color: '#94A3B8', textAlign: 'center', padding: '8px 0' }}>Sin cotizaciones enviadas</div>
            : <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 80px auto', gap: 8, padding: '5px 8px', borderBottom: '2px solid #F1F5F9' }}>
                {['COTIZACIÓN', 'MONTO', 'PROB.', ''].map(h => <span key={h} style={{ fontSize: 9.5, fontWeight: 700, color: '#94A3B8', letterSpacing: '.3px' }}>{h}</span>)}
              </div>
              {closePreds.map((q: any) => (
                <div key={q.id} onClick={() => openQuoteDetail(q.id)} style={{ display: 'grid', gridTemplateColumns: '1fr auto 80px auto', gap: 8, padding: '8px 8px', borderBottom: '1px solid #F8FAFC', cursor: 'pointer', alignItems: 'center' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</div>
                    <div style={{ fontSize: 10.5, color: '#64748B' }}>{q.clientName}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtM(q.calc.total)}</span>
                  <ProbBar pct={q.prob} size={60}/>
                  <button onClick={e => { e.stopPropagation(); openWhats(followMessage(q.clientName, q.title, q.calc.total, company.name)); }} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #D1FAE5', background: '#F0FDF4', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 }}><MessageCircle size={12} color="#16A34A"/></button>
                </div>
              ))}
            </div>}
        </div>

        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Alertas inteligentes</h3>
            <span style={{ fontSize: 10.5, color: '#64748B' }}>{smartAlerts.length} alertas</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {smartAlerts.length === 0
              ? <div style={{ fontSize: 12.5, color: '#94A3B8', textAlign: 'center', padding: '8px 0' }}>Sin alertas activas ✓</div>
              : smartAlerts.map((a, i) => {
                const clrs = { warning: { bg: '#FFFBEB', border: '#FDE68A', ic: '#F59E0B' }, success: { bg: '#F0FDF4', border: '#A7F3D0', ic: '#22C55E' }, danger: { bg: '#FEF2F2', border: '#FECACA', ic: '#EF4444' } };
                const c = clrs[a.type];
                return (
                  <div key={i} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <AlertTriangle size={14} color={c.ic} style={{ flexShrink: 0, marginTop: 2 }}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>{a.title}</div>
                        <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.sub}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button onClick={() => openQuoteDetail(a.quoteId)} style={{ border: 'none', background: '#0F172A', color: '#fff', fontWeight: 700, fontSize: 11, padding: '5px 10px', borderRadius: 8, cursor: 'pointer' }}>{a.btn}</button>
                      <button onClick={() => { const q = quotes.find((x: DerivedQuote) => x.id === a.quoteId); if (q) openWhats(followMessage(q.clientName, q.title, q.calc.total, company.name)); }} style={{ width: 26, height: 26, borderRadius: 8, border: `1px solid ${c.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}><MessageCircle size={12} color="#16A34A"/></button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Row 3 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 1.4fr', gap: 12 }}>
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Embudo comercial</h3>
            <button onClick={() => navigate('/app/reportes')} style={{ border: 'none', background: 'none', color: '#7C3AED', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>Ver completo <ArrowRight size={12}/></button>
          </div>
          <FunnelViz quotes={quotes}/>
          <div style={{ marginTop: 12, fontSize: 12, color: '#64748B', display: 'flex', justifyContent: 'space-between' }}>
            <span>Conversión global</span>
            <span style={{ fontWeight: 700, color: '#7C3AED' }}>{conv}%</span>
          </div>
        </div>
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Ranking de clientes</h3>
            <button onClick={() => navigate('/app/clientes')} style={{ border: 'none', background: 'none', color: '#7C3AED', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Ver todos →</button>
          </div>
          {clientRanking.length === 0
            ? <div style={{ fontSize: 12.5, color: '#94A3B8', textAlign: 'center', padding: '8px 0' }}>Sin clientes con cotizaciones</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {clientRanking.map((c, i) => (
                <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 10, background: i === 0 ? '#F5F3FF' : '' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#94A3B8', width: 16, flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: avatarColor(c.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{c.name.charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    <div style={{ fontSize: 10.5, color: '#64748B' }}>{c.count} cotizaciones</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{fmtM(c.total)}</div>
                    <ProbBar pct={c.prob} size={50}/>
                  </div>
                </div>
              ))}
            </div>}
        </div>
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Actividad reciente</h3>
            <button onClick={() => navigate('/app/cotizaciones')} style={{ border: 'none', background: 'none', color: '#7C3AED', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Ver todas →</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentActivity.length === 0
              ? <div style={{ fontSize: 12.5, color: '#94A3B8', textAlign: 'center', padding: '8px 0' }}>Sin actividad reciente</div>
              : recentActivity.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '6px 0', borderBottom: i < recentActivity.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{a.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</div>
                    <div style={{ fontSize: 10.5, color: '#94A3B8' }}>{a.sub}</div>
                  </div>
                  <span style={{ fontSize: 10.5, color: '#94A3B8', flexShrink: 0, whiteSpace: 'nowrap' }}>{a.time}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Row 4 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.3fr 1.4fr', gap: 12 }}>
        <div style={CARD}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>Ítems más cotizados</h3>
          <ServiceBars quotes={quotes}/>
        </div>
        <div style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px' }}>Cotizaciones por estado</h3>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><DonutChart quotes={quotes}/></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {DONUT_ORDER.map(s => { const count = quotes.filter((q: DerivedQuote) => q.status === s).length; const pct = quotes.length ? Math.round((count / quotes.length) * 100) : 0; return (<div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: DONUT_COLORS[s], flexShrink: 0 }}/><span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>{STATUS_LABEL[s] ?? s}</span><span style={{ fontSize: 11 }}>{count}</span><span style={{ fontSize: 10.5, color: '#94A3B8', width: 34, textAlign: 'right' }}>({pct}%)</span></div>); })}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ ...CARD, flex: 1 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>Próximos vencimientos</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {upcoming.length === 0
                ? <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: '4px 0' }}>Sin vencimientos próximos ✓</div>
                : upcoming.slice(0, 3).map(q => (
                  <div key={q.id} onClick={() => openQuoteDetail(q.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <Calendar size={13} color={q.daysLeft <= 1 ? '#EF4444' : q.daysLeft <= 3 ? '#F59E0B' : '#7C3AED'} style={{ flexShrink: 0 }}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</div>
                      <div style={{ fontSize: 10, color: '#64748B' }}>{fmtM(q.calc.total)}</div>
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: q.daysLeft <= 1 ? '#EF4444' : q.daysLeft <= 3 ? '#F97316' : '#7C3AED', flexShrink: 0 }}>{q.daysLeft <= 0 ? 'HOY' : `${q.daysLeft}d`}</span>
                  </div>
                ))}
            </div>
          </div>
          <div style={CARD}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>Acciones rápidas</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[
                { ic: <Plus size={14}/>,      label: 'Nueva cotización',   action: () => openQuoteFlow({ cfg: defaultQConfig(company) }) },
                { ic: <UserPlus size={14}/>,   label: 'Nuevo cliente',      action: () => navigate('/app/clientes') },
                { ic: <BarChart2 size={14}/>,  label: 'Reportes avanzados', action: () => navigate('/app/reportes') },
                { ic: <Calculator size={14}/>, label: 'Calculadora',        action: () => navigate('/app/ia') },
              ].map(a => (
                <button key={a.label} onClick={a.action} style={{ border: '1px solid #E2E8F0', background: '#fff', borderRadius: 10, padding: '7px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 11, color: '#374151', transition: 'all .12s', textAlign: 'left' }}
                  onMouseEnter={e => { const b = e.currentTarget as HTMLElement; b.style.background = '#F5F3FF'; b.style.borderColor = '#DDD6FE'; }}
                  onMouseLeave={e => { const b = e.currentTarget as HTMLElement; b.style.background = '#fff'; b.style.borderColor = '#E2E8F0'; }}>
                  <span style={{ color: '#7C3AED', flexShrink: 0 }}>{a.ic}</span>{a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Root Dashboard ───────────────────────────────────────────────────────────
export function Dashboard() {
  const navigate         = useNavigate();
  const { profile, company, planName } = useWorkspace();
  const { openQuoteFlow, openQuoteDetail, openUpgradeModal } = useUI();
  const { quotes, isLoading } = useDerivedQuotes();
  const limitQuery = usePlanLimit('quotes_month');
  const theme      = getThemeByPlan(planName);
  const width      = useWindowWidth();
  const navMode    = navModeFor(width);

  if (isLoading) return null;

  // Mobile: delegar completamente a MobileDashboard (zero impact en desktop)
  if (navMode === 'bottom') {
    return <MobileDashboard/>;
  }

  const plan      = planName.toLowerCase();
  const firstName = (profile.full_name || '').split(' ')[0] || 'Usuario';
  const limit     = limitQuery.data;
  const remaining = limit?.max != null ? limit.max - limit.current : null;
  const showWarning = plan === 'free' && remaining != null && remaining > 0 && remaining <= 2;

  const shared = { quotes, company, profile, openQuoteFlow, openQuoteDetail, openUpgradeModal, navigate, theme };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <DashHeader
        firstName={firstName}
        ctaBg={theme.ctaBg}
        ctaShadow={theme.ctaShadow}
        onNew={() => openQuoteFlow({ cfg: defaultQConfig(company) })}
        onSearch={() => navigate('/app/cotizaciones')}
      />

      {showWarning && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 13, padding: '10px 14px' }}>
          <span style={{ fontSize: 12.5, color: '#92400E', fontWeight: 600 }}>
            Te queda{remaining === 1 ? '' : 'n'} {remaining} cotización{remaining === 1 ? '' : 'es'} este mes en tu plan FREE.
          </span>
          <button onClick={() => openUpgradeModal({ title: 'Cotizaciones ilimitadas con PRO', message: 'Tu plan FREE permite hasta 10 cotizaciones por mes. Actualiza a PRO por $39.900/mes.', targetPlan: 'pro', ctaLabel: 'Actualizar a PRO' })} style={{ border: 'none', background: '#F59E0B', color: '#fff', fontWeight: 700, fontSize: 12, padding: '7px 12px', borderRadius: 9, cursor: 'pointer' }}>Actualizar a PRO</button>
        </div>
      )}

      {plan === 'premium' && <PremiumDashboard {...shared}/>}
      {plan === 'pro'     && <ProDashboard     {...shared}/>}
      {plan === 'free'    && <FreeDashboard    {...shared}/>}
      {plan !== 'free' && plan !== 'pro' && plan !== 'premium' && <FreeDashboard {...shared}/>}
    </div>
  );
}
