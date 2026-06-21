/**
 * MobileDashboard — Diseño premium mobile-first basado en referencia visual aprobada.
 * Se renderiza únicamente cuando navMode === 'bottom' (< 760 px).
 * El AppShell suprime el MobileHeader global en esta ruta.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell, Menu, Plus, UserPlus, LayoutTemplate, BarChart2, Calculator,
  MessageCircle, ChevronRight, TrendingUp, CheckCircle2,
  Clock, AlertTriangle, Calendar, FileText,
  Bot, Phone, Wallet,
} from 'lucide-react';
import { MobileDrawer } from '../layout/MobileDrawer';
import { OnboardingCard } from './OnboardingCard';
import { CrmMetricsCard } from './CrmMetricsCard';
import { StorageWidget } from './StorageWidget';
import { OperationalDashboardWidget } from './OperationalDashboardWidget';
import { useWorkspace }      from '../../features/auth/WorkspaceProvider';
import { useUI, defaultQConfig } from '../../features/app/UIProvider';
import { useDerivedQuotes }  from '../../hooks/useQuotes';
import { fmtM, daysAgo, TODAY, followMessage, openWhats } from '../../lib/calc';
import { getQuoteViewStats } from '../../services/quoteViews';
import type { DerivedQuote } from '../../lib/types';
import type { ServiceLine }  from '../../lib/types';

// ─── Constantes ───────────────────────────────────────────────────────────────

const MONTHS_CAP = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const AV_COLORS = ['#6366F1','#F97316','#8B5CF6','#22C55E','#EF4444','#0EA5E9','#F59E0B','#EC4899'];
function avatarColor(name: string) { return AV_COLORS[(name || '?').charCodeAt(0) % AV_COLORS.length]; }

function relTime(dateStr: string): string {
  const h = Math.floor((TODAY().getTime() - new Date(dateStr).getTime()) / 3600000);
  if (h < 1)  return 'Hace < 1h';
  if (h < 24) return `Hace ${h}h`;
  if (h < 48) return 'Ayer';
  return `Hace ${Math.floor(h / 24)}d`;
}

function greetingByHour(name: string): { greeting: string; sub: string } {
  const h = new Date().getHours();
  const g = h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
  return { greeting: `${g}, ${name} 👋`, sub: 'Aquí tienes el resumen de tu negocio' };
}

function closeProbability(q: DerivedQuote): number {
  if (q.status === 'Aprobada') return 95;
  if (q.status !== 'Enviada')  return 15;
  const d = daysAgo(q.sent_at ?? q.created_at);
  if (d <= 2) return 87; if (d <= 5) return 72; if (d <= 10) return 55;
  if (d <= 15) return 40; return 28;
}

function getTopItems(quotes: DerivedQuote[]) {
  const acc: Record<string, { name: string; total: number; count: number }> = {};
  quotes.forEach(q => {
    (q.cfg.serviceLines as ServiceLine[]).forEach(sl => {
      const k = sl.service_name || 'Sin nombre';
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
    .slice(0, 3);
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

function getRecentActivity(quotes: DerivedQuote[]) {
  return quotes.slice(0, 5).map(q => {
    const num = q.quote_number ? `#KTZ-${String(q.quote_number).padStart(4, '0')}` : q.title.slice(0, 14);
    if (q.status === 'Aprobada')  return { icon: '✅', label: `Aprobada ${num}`, sub: q.clientName, time: relTime(q.updated_at), color: '#22C55E' };
    if (q.status === 'Enviada')   return { icon: '📤', label: `Enviada ${num}`,  sub: q.clientName, time: relTime(q.sent_at ?? q.updated_at), color: '#2563EB' };
    if (q.status === 'Vencida')   return { icon: '⚠️', label: `Vencida ${num}`,  sub: q.clientName, time: relTime(q.updated_at), color: '#F59E0B' };
    if (q.status === 'Rechazada') return { icon: '❌', label: `Rechazada ${num}`,sub: q.clientName, time: relTime(q.updated_at), color: '#EF4444' };
    return { icon: '📋', label: `Borrador ${num}`, sub: q.clientName, time: relTime(q.created_at), color: '#64748B' };
  });
}

// ─── Shared card style ────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: '#fff',
  borderRadius: 18,
  padding: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,.06)',
};

const DONUT_COLORS: Record<string, string> = {
  Borrador: '#2563EB', Enviada: '#F97316', Aprobada: '#22C55E',
  Rechazada: '#EF4444', Vencida: '#F59E0B',
};
const DONUT_ORDER = ['Borrador', 'Enviada', 'Aprobada', 'Rechazada', 'Vencida'] as const;

// ─── BLOCK 1: Header compacto ─────────────────────────────────────────────────

function DashHeader({ firstName, alerts, onMenuOpen }: { firstName: string; alerts: number; onMenuOpen: () => void }) {
  const { greeting, sub } = greetingByHour(firstName);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '16px 16px 8px',
      paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
      gap: 10,
    }}>
      {/* Hamburguesa */}
      <button onClick={onMenuOpen} aria-label="Abrir menú" style={{ border: 'none', background: '#F1F5F9', borderRadius: 12, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
        <Menu size={19} color="#374151" />
      </button>

      {/* Saludo */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', letterSpacing: '-.4px', margin: 0, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {greeting}
        </h1>
        <p style={{ fontSize: 11.5, color: '#64748B', margin: '2px 0 0' }}>{sub}</p>
      </div>

      {/* Campana */}
      <button aria-label="Notificaciones" style={{ position: 'relative', border: 'none', background: '#F1F5F9', borderRadius: 12, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
        <Bell size={18} color="#374151" />
        {alerts > 0 && (
          <span style={{ position: 'absolute', top: 7, right: 7, width: 8, height: 8, background: '#EF4444', borderRadius: '50%', border: '1.5px solid #F1F5F9' }}/>
        )}
      </button>
    </div>
  );
}

// ─── BLOCK 2: Hero KPI ────────────────────────────────────────────────────────

function HeroCard({ monthTotal, monthChg, quotes, planName }: {
  monthTotal: number; monthChg: number | null; quotes: DerivedQuote[]; planName: string;
}) {
  const now     = TODAY();
  const pts     = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return quotes.filter(q => {
      const c = new Date(q.created_at);
      return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
    }).reduce((a, q) => a + q.calc.total, 0);
  });
  const max     = Math.max(...pts, 1);
  const W = 280, H = 48;

  // smooth path
  const xs = pts.map((_, i) => (i / 5) * W);
  const ys = pts.map(v => H - (v / max) * (H - 6) + 3);
  const linePts = xs.map((x, i) => `${x},${ys[i]}`).join(' ');
  const areaD   = `M${xs[0]},${ys[0]} ${xs.slice(1).map((x, i) => `L${x},${ys[i+1]}`).join(' ')} L${xs[5]},${H} L${xs[0]},${H} Z`;

  const gradients: Record<string, string> = {
    free:    'linear-gradient(135deg,#2563EB 0%,#1D4ED8 100%)',
    pro:     'linear-gradient(135deg,#003d30 0%,#005043 100%)',
    premium: 'linear-gradient(135deg,#1e0a4e 0%,#3b0f8c 100%)',
  };
  const bg = gradients[planName.toLowerCase()] ?? gradients.free;

  return (
    <div style={{ background: bg, borderRadius: 20, padding: '18px 18px 14px', margin: '0 16px', color: '#fff', boxShadow: '0 8px 24px rgba(37,99,235,.3)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', right: -20, top: -20, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,.07)' }}/>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.5px', color: 'rgba(255,255,255,.6)', marginBottom: 4 }}>VALOR COTIZADO · {MONTHS_CAP[now.getMonth()].toUpperCase()}</div>
      <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-1.5px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmtM(monthTotal)}</div>
      <div style={{ marginTop: 6, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        {monthChg !== null && (
          <span style={{ fontSize: 11.5, fontWeight: 700, background: monthChg >= 0 ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.2)', color: monthChg >= 0 ? '#86EFAC' : '#FCA5A5', padding: '2px 8px', borderRadius: 99 }}>
            {monthChg >= 0 ? '↑' : '↓'} {Math.abs(monthChg)}% vs mes anterior
          </span>
        )}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', opacity: .85 }}>
        <defs>
          <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,.25)"/>
            <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#hg)"/>
        <polyline points={linePts} fill="none" stroke="rgba(255,255,255,.8)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"/>
      </svg>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', marginTop: 6 }}>Actualizado hace menos de 1 min</div>
    </div>
  );
}

// ─── BLOCK 3: Mini KPI Grid ───────────────────────────────────────────────────

function MiniKpiGrid({ quotes, thisM, prevM }: { quotes: DerivedQuote[]; thisM: DerivedQuote[]; prevM: DerivedQuote[] }) {
  const approvedThis = thisM.filter(q => q.status === 'Aprobada').length;
  const approvedPrev = prevM.filter(q => q.status === 'Aprobada').length;
  const activeClients = new Set(quotes.filter(q => q.client_id).map(q => q.client_id)).size;
  const sentQ   = quotes.filter(q => q.status === 'Enviada');
  const approvQ = quotes.filter(q => q.status === 'Aprobada');
  const conv    = (sentQ.length + approvQ.length) > 0 ? Math.round((approvQ.length / (sentQ.length + approvQ.length)) * 100) : 0;

  function pct(prev: number, curr: number) {
    return prev === 0 ? null : Math.round(((curr - prev) / prev) * 100);
  }

  const cards = [
    { label: 'Cotizaciones', value: String(thisM.length), trend: pct(prevM.length, thisM.length), icon: <FileText size={16}/>, color: '#2563EB', bg: '#EFF6FF' },
    { label: 'Aprobadas',    value: String(approvedThis), trend: pct(approvedPrev, approvedThis), icon: <CheckCircle2 size={16}/>, color: '#22C55E', bg: '#F0FDF4' },
    { label: 'Clientes',     value: String(activeClients), trend: null, icon: <UserPlus size={16}/>, color: '#7C3AED', bg: '#F5F3FF' },
    { label: 'Conversión',   value: `${conv}%`, trend: null, icon: <TrendingUp size={16}/>, color: '#F97316', bg: '#FFF7ED' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 16px' }}>
      {cards.map(c => (
        <div key={c.label} style={{ ...CARD, padding: '14px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.color }}>{c.icon}</div>
            {c.trend !== null && (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: c.trend >= 0 ? '#22C55E' : '#EF4444', background: c.trend >= 0 ? '#F0FDF4' : '#FEF2F2', padding: '2px 6px', borderRadius: 99 }}>
                {c.trend >= 0 ? '↑' : '↓'} {Math.abs(c.trend)}%
              </span>
            )}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{c.value}</div>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── BLOCK 4: Area Chart ──────────────────────────────────────────────────────

function AreaChartCard({ quotes }: { quotes: DerivedQuote[] }) {
  const now = TODAY();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const val = quotes.filter(q => {
      const c = new Date(q.created_at);
      return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
    }).reduce((a, q) => a + q.calc.total, 0);
    return { label: MONTHS_CAP[d.getMonth()], val };
  });

  const W = 320, H = 130, PL = 52, PR = 12, PT = 14, PB = 24;
  const cW = W - PL - PR, cH = H - PT - PB;
  const vals = months.map(m => m.val);
  const maxV = Math.max(...vals, 1);

  const xAt = (i: number) => PL + (i / 5) * cW;
  const yAt = (v: number) => PT + cH - (v / maxV) * cH;

  // Smooth cubic bezier path
  const pts = months.map((m, i) => ({ x: xAt(i), y: yAt(m.val) }));
  function cubicPath(pts: {x:number;y:number}[]) {
    const d = [`M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i-1], c = pts[i];
      const cpX = (p.x + c.x) / 2;
      d.push(`C${cpX.toFixed(1)},${p.y.toFixed(1)} ${cpX.toFixed(1)},${c.y.toFixed(1)} ${c.x.toFixed(1)},${c.y.toFixed(1)}`);
    }
    return d.join(' ');
  }
  const linePath = cubicPath(pts);
  const areaPath = `${linePath} L${xAt(5).toFixed(1)},${(PT+cH).toFixed(1)} L${xAt(0).toFixed(1)},${(PT+cH).toFixed(1)} Z`;

  // Y labels: 3 levels
  const yLevels = [maxV, maxV * 0.5, 0];
  const gridY   = [PT, PT + cH * 0.5, PT + cH];

  return (
    <div style={{ ...CARD, margin: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Valor cotizado</div>
        <div style={{ fontSize: 11.5, color: '#94A3B8', background: '#F8FAFC', padding: '3px 8px', borderRadius: 7 }}>Últimos 6 meses</div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
        <defs>
          <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563EB" stopOpacity=".18"/>
            <stop offset="100%" stopColor="#2563EB" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {gridY.map((y, i) => (
          <line key={i} x1={PL} y1={y} x2={W-PR} y2={y} stroke="#F1F5F9" strokeWidth={1}/>
        ))}
        {/* Y labels */}
        {yLevels.map((v, i) => (
          <text key={i} x={PL-4} y={gridY[i]+4} textAnchor="end" fontSize={9} fill="#94A3B8">{fmtM(v)}</text>
        ))}
        {/* Area fill */}
        <path d={areaPath} fill="url(#ag)"/>
        {/* Line */}
        <path d={linePath} fill="none" stroke="#2563EB" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"/>
        {/* Dots */}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#2563EB" stroke="#fff" strokeWidth={1.5}/>
        ))}
        {/* X labels */}
        {months.map((m, i) => (
          <text key={i} x={xAt(i)} y={H} textAnchor="middle" fontSize={9} fill="#94A3B8">{m.label}</text>
        ))}
      </svg>
    </div>
  );
}

// ─── BLOCK 5: Donut por estado ────────────────────────────────────────────────

function DonutStatusCard({ quotes, navigate }: { quotes: DerivedQuote[]; navigate: (p: string) => void }) {
  const total = quotes.length;
  const segs  = DONUT_ORDER.map(s => ({ s, count: quotes.filter(q => q.status === s).length })).filter(d => d.count > 0);
  const cx = 48, cy = 48, ro = 40, ri = 26;
  let angle = -Math.PI / 2;

  const STATUS_LABEL: Record<string, string> = { Rechazada: 'Perdida', Vencida: 'Seguimiento' };

  return (
    <div style={{ ...CARD, margin: '0 16px' }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', marginBottom: 14 }}>Cotizaciones por estado</div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <svg width={96} height={96} viewBox="0 0 96 96" style={{ flexShrink: 0 }}>
          {total === 0
            ? <circle cx={cx} cy={cy} r={(ro+ri)/2} fill="none" stroke="#E2E8F0" strokeWidth={ro-ri}/>
            : segs.map(({ s, count }) => {
              const sweep = (count/total)*2*Math.PI, end = angle+sweep;
              const [c1x,c1y] = [cx+ro*Math.cos(angle), cy+ro*Math.sin(angle)];
              const [c2x,c2y] = [cx+ro*Math.cos(end),   cy+ro*Math.sin(end)];
              const [i1x,i1y] = [cx+ri*Math.cos(end),   cy+ri*Math.sin(end)];
              const [i2x,i2y] = [cx+ri*Math.cos(angle), cy+ri*Math.sin(angle)];
              const large = sweep > Math.PI ? 1 : 0;
              const d = `M${c1x} ${c1y}A${ro} ${ro} 0 ${large} 1 ${c2x} ${c2y}L${i1x} ${i1y}A${ri} ${ri} 0 ${large} 0 ${i2x} ${i2y}Z`;
              const r = <path key={s} d={d} fill={DONUT_COLORS[s]}/>;
              angle = end; return r;
            })}
          <text x={cx} y={cy-4} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'inherit' }}>Total</text>
          <text x={cx} y={cx+8} textAnchor="middle" style={{ fontSize: 18, fontWeight: 800, fill: '#0F172A', fontFamily: 'inherit' }}>{total}</text>
        </svg>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {DONUT_ORDER.map(s => {
            const count = quotes.filter(q => q.status === s).length;
            const pct   = total ? Math.round((count/total)*100) : 0;
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: DONUT_COLORS[s], flexShrink: 0 }}/>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#374151' }}>{STATUS_LABEL[s] ?? s}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{count}</span>
                <span style={{ fontSize: 10.5, color: '#94A3B8', minWidth: 36, textAlign: 'right' }}>({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>
      <button onClick={() => navigate('/app/cotizaciones')} style={{ width: '100%', marginTop: 14, border: 'none', background: '#F8FAFC', color: '#2563EB', fontWeight: 700, fontSize: 13, padding: '10px 0', borderRadius: 11, cursor: 'pointer' }}>
        Ver todas las cotizaciones
      </button>
    </div>
  );
}

// ─── BLOCK 6: Actividad reciente ──────────────────────────────────────────────

function ActivityFeed({ quotes, navigate }: { quotes: DerivedQuote[]; navigate: (p: string) => void }) {
  const activity = getRecentActivity(quotes);
  return (
    <div style={{ ...CARD, margin: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Actividad reciente</div>
        <button onClick={() => navigate('/app/cotizaciones')} style={{ border: 'none', background: 'none', color: '#2563EB', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, padding: 0 }}>Ver todas <ChevronRight size={13}/></button>
      </div>
      {activity.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0', color: '#94A3B8', fontSize: 13 }}>Sin actividad reciente</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {activity.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, paddingTop: i > 0 ? 11 : 0, paddingBottom: i < activity.length-1 ? 11 : 0, borderBottom: i < activity.length-1 ? '1px solid #F1F5F9' : 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${a.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{a.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</div>
                <div style={{ fontSize: 11, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.sub}</div>
              </div>
              <span style={{ fontSize: 10.5, color: '#94A3B8', flexShrink: 0 }}>{a.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── BLOCK 7: Top Clientes ────────────────────────────────────────────────────

function TopClientsCard({ quotes, navigate }: { quotes: DerivedQuote[]; navigate: (p: string) => void }) {
  const clients = getClientRanking(quotes);
  return (
    <div style={{ ...CARD, margin: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Top clientes por valor cotizado</div>
        <button onClick={() => navigate('/app/clientes')} style={{ border: 'none', background: 'none', color: '#2563EB', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>Ver todas</button>
      </div>
      {clients.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0', color: '#94A3B8', fontSize: 13 }}>Sin clientes con cotizaciones</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {clients.map((c, i) => (
            <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: i > 0 ? 11 : 0, paddingBottom: i < clients.length-1 ? 11 : 0, borderBottom: i < clients.length-1 ? '1px solid #F1F5F9' : 'none' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#CBD5E1', width: 16, flexShrink: 0, textAlign: 'right' }}>{i+1}</span>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: avatarColor(c.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{c.name.charAt(0).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0F172A' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>{c.count} cotización{c.count !== 1 ? 'es' : ''}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtM(c.total)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── BLOCK 8: Resumen de desempeño ───────────────────────────────────────────

function PerformanceMetrics({ quotes, thisM, prevM }: { quotes: DerivedQuote[]; thisM: DerivedQuote[]; prevM: DerivedQuote[] }) {
  const avgTicket      = thisM.length ? Math.round(thisM.reduce((a, q) => a + q.calc.total, 0) / thisM.length) : 0;
  const prevAvgTicket  = prevM.length ? Math.round(prevM.reduce((a, q) => a + q.calc.total, 0) / prevM.length) : 0;
  const approvalRate   = thisM.length ? Math.round((thisM.filter(q => q.status === 'Aprobada').length / thisM.length) * 100) : 0;
  const prevApproval   = prevM.length ? Math.round((prevM.filter(q => q.status === 'Aprobada').length / prevM.length) * 100) : 0;
  const newClients     = new Set(thisM.filter(q => q.client_id).map(q => q.client_id)).size;
  const prevNewClients = new Set(prevM.filter(q => q.client_id).map(q => q.client_id)).size;

  // Tiempo promedio de respuesta (días de borrador a enviada)
  const sentWithTime = quotes.filter(q => q.sent_at && q.created_at);
  const avgResponseDays = sentWithTime.length
    ? Math.round(sentWithTime.reduce((a, q) => {
      const diff = (new Date(q.sent_at!).getTime() - new Date(q.created_at).getTime()) / 86400000;
      return a + Math.max(0, diff);
    }, 0) / sentWithTime.length * 10) / 10
    : null;

  function trend(prev: number, curr: number) {
    if (prev === 0) return null;
    return Math.round(((curr - prev) / prev) * 100);
  }

  const metrics = [
    { label: 'Ticket promedio',     value: fmtM(avgTicket),    sub: 'Por cotización', trend: trend(prevAvgTicket, avgTicket), icon: <Wallet size={16}/>, color: '#2563EB', bg: '#EFF6FF', inverse: false },
    { label: 'Tiempo de respuesta', value: avgResponseDays !== null ? `${avgResponseDays}d` : '--', sub: 'Días promedio', trend: null, icon: <Clock size={16}/>, color: '#F97316', bg: '#FFF7ED', inverse: true },
    { label: 'Tasa de aprobación',  value: `${approvalRate}%`, sub: 'Este mes',       trend: trend(prevApproval, approvalRate), icon: <CheckCircle2 size={16}/>, color: '#22C55E', bg: '#F0FDF4', inverse: false },
    { label: 'Nuevos clientes',     value: String(newClients), sub: 'Este mes',       trend: trend(prevNewClients, newClients), icon: <UserPlus size={16}/>, color: '#7C3AED', bg: '#F5F3FF', inverse: false },
  ];

  return (
    <div style={{ ...CARD, margin: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Resumen de desempeño</div>
        <div style={{ fontSize: 11.5, color: '#94A3B8', background: '#F8FAFC', padding: '3px 8px', borderRadius: 7 }}>Este mes</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {metrics.map(m => (
          <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: '#F8FAFC', borderRadius: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: m.color, flexShrink: 0 }}>{m.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 1 }}>{m.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
            </div>
            {m.trend !== null && (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: (m.trend >= 0) !== m.inverse ? '#22C55E' : '#EF4444', background: (m.trend >= 0) !== m.inverse ? '#F0FDF4' : '#FEF2F2', padding: '3px 7px', borderRadius: 99, flexShrink: 0 }}>
                {(m.trend >= 0) !== m.inverse ? '↑' : '↓'} {Math.abs(m.trend)}% vs mes ant.
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── BLOCK 9: Seguimientos sugeridos ─────────────────────────────────────────

function FollowUpSection({
  quotes, company, openQuoteDetail,
}: {
  quotes: DerivedQuote[]; company: { name: string }; openQuoteDetail: (id: string) => void;
}) {
  const followUps = quotes
    .filter(q => q.status === 'Enviada')
    .map(q => ({ ...q, dias: daysAgo(q.sent_at ?? q.created_at), prob: closeProbability(q) }))
    .sort((a: any, b: any) => b.dias - a.dias)
    .slice(0, 3);

  if (!followUps.length) return null;

  return (
    <div style={{ ...CARD, margin: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Seguimientos sugeridos</div>
        <span style={{ fontSize: 11, fontWeight: 800, background: '#FEF3C7', color: '#92400E', padding: '3px 8px', borderRadius: 7 }}>{followUps.length} pendiente{followUps.length !== 1 ? 's' : ''}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {followUps.map((q: any) => {
          const probColor = q.prob >= 70 ? '#22C55E' : q.prob >= 40 ? '#F59E0B' : '#EF4444';
          return (
            <div key={q.id} style={{ border: '1px solid #EEF2F7', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.clientName}</div>
                  <div style={{ fontSize: 11.5, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{fmtM(q.calc.total)}</div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: probColor }}>{q.prob}% prob.</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 10.5, color: '#92400E', background: '#FEF3C7', padding: '2px 7px', borderRadius: 99 }}>Hace {q.dias} días</span>
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                <button onClick={() => openWhats(followMessage(q.clientName, q.title, q.calc.total, company.name))} style={{ flex: 1, border: 'none', background: '#F0FDF4', color: '#16A34A', fontWeight: 700, fontSize: 12, padding: '8px 0', borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <MessageCircle size={13}/> WhatsApp
                </button>
                <button style={{ flex: 1, border: 'none', background: '#EFF6FF', color: '#2563EB', fontWeight: 700, fontSize: 12, padding: '8px 0', borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <Phone size={13}/> Llamar
                </button>
                <button onClick={() => openQuoteDetail(q.id)} style={{ flex: 1, border: 'none', background: '#0F172A', color: '#fff', fontWeight: 700, fontSize: 12, padding: '8px 0', borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <FileText size={13}/> Ver
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── BLOCK 10: Vencimientos próximos ─────────────────────────────────────────

function UpcomingExpiries({ quotes, openQuoteDetail }: { quotes: DerivedQuote[]; openQuoteDetail: (id: string) => void }) {
  const upcoming = getUpcomingDue(quotes);
  if (!upcoming.length) return null;
  return (
    <div style={{ ...CARD, margin: '0 16px' }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', marginBottom: 14 }}>Próximos vencimientos</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {upcoming.map((q, i) => {
          const uc = q.daysLeft <= 1 ? '#EF4444' : q.daysLeft <= 3 ? '#F59E0B' : '#7C3AED';
          const ub = q.daysLeft <= 1 ? '#FEF2F2' : q.daysLeft <= 3 ? '#FFFBEB' : '#F5F3FF';
          return (
            <div key={q.id} onClick={() => openQuoteDetail(q.id)} style={{ display: 'flex', alignItems: 'center', gap: 11, paddingTop: i > 0 ? 11 : 0, paddingBottom: i < upcoming.length-1 ? 11 : 0, borderBottom: i < upcoming.length-1 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: ub, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Calendar size={16} color={uc}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</div>
                <div style={{ fontSize: 11, color: '#64748B' }}>{q.clientName} · {fmtM(q.calc.total)}</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: uc, flexShrink: 0 }}>{q.daysLeft <= 0 ? 'HOY' : `${q.daysLeft}d`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── BLOCK 11: Shelwi IA card ─────────────────────────────────────────────────

function ShelwiIACard({
  quotes, prevQuotes, planName, openUpgradeModal, navigate,
}: {
  quotes: DerivedQuote[]; prevQuotes: DerivedQuote[];
  planName: string; openUpgradeModal: (i: any) => void; navigate: (p: string) => void;
}) {
  const isPaid = planName !== 'Free';
  const risk   = quotes.filter(q => q.status === 'Enviada' && daysAgo(q.sent_at ?? q.created_at) >= 5).length;
  const conv   = quotes.length ? Math.round((quotes.filter(q => q.status === 'Aprobada').length / quotes.length) * 100) : 0;
  const prevConv = prevQuotes.length ? Math.round((prevQuotes.filter(q => q.status === 'Aprobada').length / prevQuotes.length) * 100) : 0;
  const convDiff = conv - prevConv;
  const borr   = quotes.filter(q => q.status === 'Borrador').length;

  const insight = risk > 0
    ? `${risk} cotización${risk > 1 ? 'es llevan' : ' lleva'} más de 5 días sin seguimiento.`
    : convDiff > 0
    ? `Tu conversión subió ${convDiff}pp este mes. ¡Buen trabajo!`
    : borr > 2
    ? `Tienes ${borr} borradores sin enviar — son oportunidades perdidas.`
    : 'Todo en orden. Crea nuevas cotizaciones para seguir creciendo.';

  return (
    <div style={{ margin: '0 16px', background: '#0F172A', borderRadius: 18, padding: 16, display: 'flex', alignItems: 'flex-start', gap: 12, boxShadow: '0 4px 20px rgba(0,0,0,.18)' }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#7C3AED,#A855F7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Bot size={20} color="#fff"/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: '#fff' }}>Shelwi IA</span>
          <span style={{ fontSize: 9, fontWeight: 800, background: isPaid ? '#7C3AED' : '#2563EB', color: '#fff', padding: '2px 7px', borderRadius: 5 }}>{isPaid ? 'PRO' : 'GRATIS'}</span>
        </div>
        <p style={{ fontSize: 12.5, color: '#94A3B8', lineHeight: 1.5, margin: '0 0 10px' }}>{insight}</p>
        <button
          onClick={() => isPaid ? navigate('/app/ia') : openUpgradeModal({ title: 'Shelwi IA', message: 'Obtén recomendaciones inteligentes para ganar más cotizaciones.', targetPlan: 'pro', ctaLabel: 'Actualizar a PRO' })}
          style={{ border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.07)', color: '#E2E8F0', fontWeight: 700, fontSize: 12.5, padding: '9px 16px', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
          Ver recomendaciones →
        </button>
      </div>
    </div>
  );
}

// ─── BLOCK 12: Ítems más cotizados ───────────────────────────────────────────

function TopItemsCard({ quotes }: { quotes: DerivedQuote[] }) {
  const items = getTopItems(quotes);
  const allT  = quotes.reduce((a, q) => a + q.calc.total, 0) || 1;
  const CLRS  = ['#2563EB','#7C3AED','#22C55E','#F59E0B','#EF4444'];
  if (!items.length) return null;
  return (
    <div style={{ ...CARD, margin: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Ítems más cotizados</div>
        <span style={{ fontSize: 11, color: '#94A3B8' }}>Este mes</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((s, i) => {
          const pct = Math.round((s.total / allT) * 100);
          return (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 11, color: '#CBD5E1', width: 14, flexShrink: 0 }}>{i+1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0F172A' }}>{s.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginLeft: 6, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtM(s.total)}</span>
                </div>
                <div style={{ height: 5, background: '#F1F5F9', borderRadius: 99 }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: CLRS[i] ?? '#94A3B8', borderRadius: 99 }}/>
                </div>
              </div>
              <span style={{ fontSize: 10.5, color: '#94A3B8', width: 28, textAlign: 'right', flexShrink: 0 }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── BLOCK 13: Acciones rápidas ───────────────────────────────────────────────

function QuickActionsGrid({ quotes, company, openQuoteFlow, navigate }: {
  quotes: DerivedQuote[]; company: any; openQuoteFlow: (c: any) => void; navigate: (p: string) => void;
}) {
  const borradores     = quotes.filter(q => q.status === 'Borrador').length;
  const sinSeguimiento = quotes.filter(q => q.status === 'Enviada' && daysAgo(q.sent_at ?? q.created_at) >= 3).length;

  const actions = [
    { icon: <Plus size={20}/>,          label: 'Nueva cotización', color: '#2563EB', bg: '#EFF6FF', action: () => openQuoteFlow({ cfg: defaultQConfig(company) }) },
    { icon: <UserPlus size={20}/>,      label: 'Nuevo cliente',    color: '#7C3AED', bg: '#F5F3FF', action: () => navigate('/app/clientes') },
    { icon: <LayoutTemplate size={20}/>,label: 'Plantillas',       color: '#F97316', bg: '#FFF7ED', action: () => navigate('/app/plantillas') },
    { icon: <Wallet size={20}/>,        label: 'Registrar anticipo', color: '#22C55E', bg: '#F0FDF4', action: () => navigate('/app/cotizaciones') },
    { icon: <BarChart2 size={20}/>,     label: 'Reportes',         color: '#0EA5E9', bg: '#F0F9FF', action: () => navigate('/app/reportes') },
    { icon: <Calculator size={20}/>,    label: 'Calculadora',      color: '#EC4899', bg: '#FDF2F8', action: () => navigate('/app/ia') },
    ...(borradores > 0 ? [{ icon: <FileText size={20}/>, label: `Borradores (${borradores})`, color: '#2563EB', bg: '#EFF6FF', action: () => navigate('/app/cotizaciones?estado=Borrador') }] : []),
    ...(sinSeguimiento > 0 ? [{ icon: <AlertTriangle size={20}/>, label: `Seguir (${sinSeguimiento})`, color: '#F59E0B', bg: '#FFFBEB', action: () => navigate('/app/cotizaciones?estado=Enviada') }] : []),
  ].slice(0, 6);

  return (
    <div style={{ ...CARD, margin: '0 16px' }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', marginBottom: 14 }}>Acciones rápidas</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {actions.map((a, i) => (
          <button key={i} onClick={a.action} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: '1px solid #EEF2F7', borderRadius: 14, background: '#fff', cursor: 'pointer', textAlign: 'left', transition: 'background .12s' }}
            onTouchStart={e => { (e.currentTarget as HTMLElement).style.background = a.bg; }}
            onTouchEnd={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: a.color, flexShrink: 0 }}>{a.icon}</div>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', lineHeight: 1.3 }}>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── MobileDashboard (root) ───────────────────────────────────────────────────

export function MobileDashboard() {
  const navigate = useNavigate();
  const { profile, company, planName, workspace } = useWorkspace();
  const { openQuoteFlow, openQuoteDetail, openUpgradeModal } = useUI();
  const { quotes, isLoading } = useDerivedQuotes();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const quoteIds = useMemo(() => quotes.map(q => q.id), [quotes]);

  const { data: viewStats = [] } = useQuery({
    queryKey: ['quoteViews', workspace.id],
    queryFn:  () => getQuoteViewStats(quoteIds),
    enabled:  quoteIds.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) return null;

  const now        = TODAY();
  const prev       = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const inM        = (q: DerivedQuote, d: Date) => {
    const c = new Date(q.created_at);
    return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
  };
  const thisM        = quotes.filter(q => inM(q, now));
  const prevM        = quotes.filter(q => inM(q, prev));
  const monthTotal   = thisM.reduce((a, q) => a + q.calc.total, 0);
  const prevTotal    = prevM.reduce((a, q) => a + q.calc.total, 0);
  const monthChg     = prevTotal > 0 ? Math.round(((monthTotal - prevTotal) / prevTotal) * 100) : null;
  const firstName    = (profile.full_name || '').split(' ')[0] || 'Usuario';
  const alertsCount  = quotes.filter(q => q.status === 'Enviada' && daysAgo(q.sent_at ?? q.created_at) >= 3).length;

  void viewStats;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 12,
      background: '#F8FAFC',
      minHeight: '100vh',
      paddingBottom: 16,
    }}>

      {/* Drawer lateral (el header global está suprimido en esta ruta) */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* 1. Header con hamburguesa */}
      <DashHeader firstName={firstName} alerts={alertsCount} onMenuOpen={() => setDrawerOpen(true)} />

      {/* 2. Hero KPI */}
      <HeroCard
        monthTotal={monthTotal}
        monthChg={monthChg}
        quotes={quotes}
        planName={planName}
      />

      {/* Tarjeta de activación guiada — solo visible mientras progreso < 100% o recompensa pendiente de ocultar */}
      <OnboardingCard />

      {/* 3. Mini KPI Grid */}
      <MiniKpiGrid quotes={quotes} thisM={thisM} prevM={prevM} />

      {/* 4. Area chart */}
      <AreaChartCard quotes={quotes} />

      {/* 5. Donut status */}
      <DonutStatusCard quotes={quotes} navigate={navigate} />

      {/* 6. Actividad reciente */}
      <ActivityFeed quotes={quotes} navigate={navigate} />

      {/* 7. Top clientes */}
      <TopClientsCard quotes={quotes} navigate={navigate} />

      {/* 8. Resumen de desempeño */}
      <PerformanceMetrics quotes={quotes} thisM={thisM} prevM={prevM} />

      {/* 9. Seguimientos sugeridos */}
      <FollowUpSection
        quotes={quotes}
        company={company}
        openQuoteDetail={openQuoteDetail}
      />

      {/* 10. Próximos vencimientos */}
      <UpcomingExpiries quotes={quotes} openQuoteDetail={openQuoteDetail} />

      {/* 11. CRM Metrics */}
      <CrmMetricsCard />

      {/* 11b. Equipo Operativo GPS (PREMIUM) */}
      <OperationalDashboardWidget />

      {/* 11c. Storage (PREMIUM) */}
      <StorageWidget />

      {/* 12. Shelwi IA */}
      <ShelwiIACard
        quotes={thisM}
        prevQuotes={prevM}
        planName={planName}
        openUpgradeModal={openUpgradeModal}
        navigate={navigate}
      />

      {/* 13. Ítems más cotizados */}
      <TopItemsCard quotes={quotes} />

      {/* 14. Acciones rápidas */}
      <QuickActionsGrid
        quotes={quotes}
        company={company}
        openQuoteFlow={openQuoteFlow}
        navigate={navigate}
      />

    </div>
  );
}
