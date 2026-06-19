/**
 * MobileDashboard — pantalla Inicio rediseñada mobile-first.
 * Solo se renderiza cuando navMode === 'bottom' (< 760 px).
 * El desktop sigue usando FreeDashboard / ProDashboard / PremiumDashboard.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Plus, UserPlus, LayoutTemplate, BarChart2, Calculator,
  MessageCircle, ChevronRight, TrendingUp, CheckCircle2,
  Clock, Calendar, Zap, Lock, Crown,
  ShoppingBag, Eye, Target, DollarSign, Users,
  FileText,
} from 'lucide-react';
import { useWorkspace }      from '../../features/auth/WorkspaceProvider';
import { useUI, defaultQConfig } from '../../features/app/UIProvider';
import { useDerivedQuotes }  from '../../hooks/useQuotes';
import {
  fmtM, daysAgo, TODAY, followMessage, openWhats,
} from '../../lib/calc';
import { MONTHS_LONG } from '../../lib/data';
import { getQuoteViewStats, type QuoteViewStats } from '../../services/quoteViews';
import type { DerivedQuote } from '../../lib/types';
import type { ServiceLine }  from '../../lib/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AV_COLORS = ['#6366F1','#F97316','#8B5CF6','#22C55E','#EF4444','#0EA5E9','#F59E0B','#EC4899'];
function avatarColor(name: string) { return AV_COLORS[(name || '?').charCodeAt(0) % AV_COLORS.length]; }

function relTime(dateStr: string): string {
  const h = Math.floor((TODAY().getTime() - new Date(dateStr).getTime()) / 3600000);
  if (h < 1)  return 'Hace < 1h';
  if (h < 24) return `Hace ${h}h`;
  if (h < 48) return 'Ayer';
  return `Hace ${Math.floor(h / 24)}d`;
}

function greetingByHour(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

function closeProbability(q: DerivedQuote): number {
  if (q.status === 'Aprobada') return 95;
  if (q.status !== 'Enviada')  return 15;
  const d = daysAgo(q.sent_at ?? q.created_at);
  if (d <= 2)  return 87; if (d <= 5)  return 72; if (d <= 10) return 55;
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
    return { icon: '📋', label: `Borrador ${num}`, sub: q.clientName, time: relTime(q.created_at), color: '#2563EB' };
  });
}

function buildExtendedAlerts(
  quotes: DerivedQuote[],
  viewMap: Record<string, QuoteViewStats>,
  company: { name: string },
) {
  const alerts: {
    type: 'warning' | 'success' | 'danger';
    icon: string;
    title: string;
    sub: string;
    quoteId: string;
    btn: string;
    whatsApp?: string;
  }[] = [];

  const sentQ = quotes.filter(q => q.status === 'Enviada');

  // 🔥 Abrió 5+ veces — muy interesado
  sentQ.forEach(q => {
    const s = viewMap[q.id];
    if (s && s.total >= 5 && alerts.length < 3) {
      alerts.push({
        type: 'success',
        icon: '🔥',
        title: `Abrió ${s.total} veces — muy interesado`,
        sub: `${q.clientName} · Última vez ${relTime(s.lastViewed)}`,
        quoteId: q.id,
        btn: 'Contactar ahora',
        whatsApp: followMessage(q.clientName, q.title, q.calc.total, company.name),
      });
    }
  });

  // 👀 Abrió 3+ veces hoy
  sentQ.forEach(q => {
    const s = viewMap[q.id];
    if (s && s.today >= 3 && s.total < 5 && alerts.length < 3) {
      alerts.push({
        type: 'warning',
        icon: '👀',
        title: `Revisó ${s.today} veces hoy`,
        sub: `${q.clientName} · ${relTime(s.lastViewed)}`,
        quoteId: q.id,
        btn: 'Escribir',
        whatsApp: followMessage(q.clientName, q.title, q.calc.total, company.name),
      });
    }
  });

  // 📱 Abrió desde dispositivo diferente
  sentQ.forEach(q => {
    const s = viewMap[q.id];
    if (s && s.devices.length >= 2 && alerts.length < 3) {
      alerts.push({
        type: 'warning',
        icon: '📱',
        title: 'Consultó desde otro dispositivo',
        sub: `${q.clientName} · ${s.devices.join(' + ')}`,
        quoteId: q.id,
        btn: 'Ver',
      });
    }
  });

  // Sin seguimiento 3+ días
  if (alerts.length < 3) {
    sentQ
      .filter(q => daysAgo(q.sent_at ?? q.created_at) >= 3)
      .slice(0, 1)
      .forEach(q =>
        alerts.push({
          type: 'warning',
          icon: '⏰',
          title: `Sin seguimiento hace ${daysAgo(q.sent_at ?? q.created_at)} días`,
          sub: `${q.clientName} · ${q.title}`,
          quoteId: q.id,
          btn: 'Contactar',
          whatsApp: followMessage(q.clientName, q.title, q.calc.total, company.name),
        }),
      );
  }

  // Vence en 48h
  getUpcomingDue(quotes)
    .filter(q => q.daysLeft <= 2)
    .slice(0, 1)
    .forEach(q => {
      if (alerts.length < 3) {
        alerts.push({
          type: 'danger',
          icon: '⚡',
          title: `Vence en ${q.daysLeft <= 0 ? 'HOY' : `${q.daysLeft}d`}`,
          sub: `${q.title} · ${q.clientName}`,
          quoteId: q.id,
          btn: 'Recordar',
        });
      }
    });

  // Aprobada sin anticipo
  quotes
    .filter(q => q.status === 'Aprobada')
    .slice(0, 1)
    .forEach(q => {
      if (alerts.length < 3) {
        alerts.push({
          type: 'success',
          icon: '✅',
          title: 'Propuesta aprobada — anticipo pendiente',
          sub: `${q.title} · ${q.clientName}`,
          quoteId: q.id,
          btn: 'Registrar',
        });
      }
    });

  return alerts.slice(0, 3);
}

// ─── Shared primitives ────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #EEF2F7',
  borderRadius: 20,
  padding: 16,
  boxShadow: '0 2px 12px rgba(0,0,0,.06)',
};

const DONUT_COLORS: Record<string, string> = {
  Borrador: '#2563EB', Enviada: '#7C3AED', Aprobada: '#22C55E',
  Rechazada: '#EF4444', Vencida: '#F59E0B',
};
const DONUT_ORDER = ['Borrador', 'Enviada', 'Aprobada', 'Rechazada', 'Vencida'] as const;

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up = pct >= 0;
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, color: up ? '#16A34A' : '#DC2626', background: up ? '#F0FDF4' : '#FEF2F2', padding: '2px 7px', borderRadius: 99 }}>
      {up ? '↑' : '↓'} {Math.abs(pct)}%
    </span>
  );
}

function ProbBar({ pct }: { pct: number }) {
  const color = pct >= 70 ? '#22C55E' : pct >= 45 ? '#F59E0B' : '#EF4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 56, height: 4, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99 }}/>
      </div>
      <span style={{ fontSize: 10.5, fontWeight: 700, color }}>{pct}%</span>
    </div>
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
  const W = 120, H = 24;
  const poly = pts.map((v, i) => `${(i / 5) * W},${H - (v / max) * (H - 4) + 2}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H, display: 'block', opacity: 0.8 }}>
      <polyline points={poly} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}

function DonutCompact({ quotes }: { quotes: DerivedQuote[] }) {
  const total = quotes.length;
  const segs  = DONUT_ORDER.map(s => ({ s, count: quotes.filter(q => q.status === s).length })).filter(d => d.count > 0);
  const cx = 45, cy = 45, ro = 38, ri = 24;
  let angle = -Math.PI / 2;
  return (
    <svg viewBox="0 0 90 90" style={{ width: 90, height: 90, flexShrink: 0 }}>
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
      <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 16, fontWeight: 800, fill: '#0F172A', fontFamily: 'inherit' }}>{total}</text>
      <text x={cx} y={cy + 9} textAnchor="middle" style={{ fontSize: 7, fill: '#94A3B8', fontFamily: 'inherit' }}>Total</text>
    </svg>
  );
}

// ─── Block 1: Hero ────────────────────────────────────────────────────────────

function MobileHeroCard({
  firstName, planName, monthTotal, monthChg, quotes,
}: {
  firstName: string; planName: string; monthTotal: number;
  monthChg: number | null; quotes: DerivedQuote[];
}) {
  const monthLabel = MONTHS_LONG[TODAY().getMonth()];
  const gradients: Record<string, string> = {
    free:    'linear-gradient(150deg,#2563EB 0%,#1D4ED8 100%)',
    pro:     'linear-gradient(150deg,#003d30 0%,#005043 100%)',
    premium: 'linear-gradient(150deg,#1e0a4e 0%,#3b0f8c 100%)',
  };
  const plan = planName.toLowerCase();
  return (
    <div style={{ background: gradients[plan] ?? gradients.free, borderRadius: 22, padding: '20px 20px 16px', color: '#fff', position: 'relative', overflow: 'hidden', boxShadow: '0 8px 28px -6px rgba(37,99,235,.38)' }}>
      <div style={{ position: 'absolute', right: -24, top: -24, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,.07)' }}/>
      <div style={{ position: 'absolute', right: 20, bottom: 20, width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,.05)' }}/>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.4px', marginBottom: 2 }}>{greetingByHour()}, {firstName} 👋</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,.65)', marginBottom: 16 }}>Aquí tienes el control total de tu negocio</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', letterSpacing: '.4px', marginBottom: 4 }}>VALOR COTIZADO · {monthLabel.toUpperCase()}</div>
      <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-1.5px', lineHeight: 1, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>{fmtM(monthTotal)}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {monthChg !== null && (
          <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,.18)', padding: '2px 8px', borderRadius: 99 }}>
            {monthChg >= 0 ? '↑' : '↓'} {Math.abs(monthChg)}% vs mes ant.
          </span>
        )}
      </div>
      <SparkLine quotes={quotes}/>
      <div style={{ marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,.4)' }}>Actualizado hace menos de 1 min</div>
    </div>
  );
}

// ─── Block 2: KPI Carousel ────────────────────────────────────────────────────

function KpiCarousel({ quotes, planName }: { quotes: DerivedQuote[]; planName: string }) {
  const now    = TODAY();
  const prev   = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const inM    = (q: DerivedQuote, d: Date) => {
    const c = new Date(q.created_at);
    return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
  };
  const thisM      = quotes.filter(q => inM(q, now));
  const prevM      = quotes.filter(q => inM(q, prev));
  const approvedQ  = quotes.filter(q => q.status === 'Aprobada');
  const sentQ      = quotes.filter(q => q.status === 'Enviada');
  const approved   = approvedQ.length;
  const sent       = sentQ.length;
  const monthTotal = thisM.reduce((a, q) => a + q.calc.total, 0);
  const prevTotal  = prevM.reduce((a, q) => a + q.calc.total, 0);
  const facturado  = approvedQ.reduce((a, q) => a + (q.calc.total * (q.cfg.advancePct / 100)), 0);
  const conv       = sent + approved > 0 ? Math.round((approved / (sent + approved)) * 100) : 0;
  const avgTicket  = quotes.length ? Math.round(quotes.reduce((a, q) => a + q.calc.total, 0) / quotes.length) : 0;
  const avgUtil    = quotes.length ? Math.round(quotes.reduce((a, q) => a + q.cfg.util, 0) / quotes.length) : 0;
  const monthChg   = prevTotal > 0 ? Math.round(((monthTotal - prevTotal) / prevTotal) * 100) : null;
  const isPaid     = planName !== 'Free';

  const cards: { label: string; value: string; sub: string; trend?: number | null; icon: React.ReactNode; color: string; bg: string; locked?: boolean }[] = [
    { label: 'Cotizaciones', value: String(thisM.length), sub: 'Este mes', trend: monthChg, icon: <FileText size={16}/>, color: '#2563EB', bg: '#EFF6FF' },
    { label: 'Aprobadas',    value: String(approved),     sub: `${quotes.length ? Math.round((approved / quotes.length) * 100) : 0}% del total`, icon: <CheckCircle2 size={16}/>, color: '#22C55E', bg: '#F0FDF4' },
    { label: 'Facturado',    value: fmtM(facturado),      sub: 'Anticipos',  icon: <DollarSign size={16}/>, color: '#F97316', bg: '#FFF7ED', locked: !isPaid },
    { label: 'Conversión',   value: `${conv}%`,            sub: `${approved} de ${sent + approved}`, icon: <Target size={16}/>, color: '#7C3AED', bg: '#F5F3FF' },
    { label: 'Ticket prom.', value: fmtM(avgTicket),      sub: 'Por cotización', icon: <BarChart2 size={16}/>, color: '#0EA5E9', bg: '#F0F9FF', locked: !isPaid },
    { label: 'Rentabilidad', value: avgUtil ? `${avgUtil}%` : '--', sub: 'Utilidad est.', icon: <TrendingUp size={16}/>, color: '#22C55E', bg: '#F0FDF4', locked: !isPaid },
  ];

  return (
    <div className="mob-kpi-carousel">
      {cards.map(c => (
        <div key={c.label} style={{ ...CARD, minWidth: 130, padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 4, position: 'relative', overflow: 'hidden' }}>
          {c.locked && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,.75)', backdropFilter: 'blur(3px)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
              <Lock size={16} color="#94A3B8"/>
            </div>
          )}
          <div style={{ width: 30, height: 30, borderRadius: 9, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.color }}>{c.icon}</div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{c.value}</div>
          <div style={{ fontSize: 10.5, color: '#64748B' }}>{c.sub}</div>
          {c.trend !== undefined && <TrendBadge pct={c.trend ?? null}/>}
          <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Block 3: IA Insight ─────────────────────────────────────────────────────

function IAInsightCard({
  quotes, prevQuotes, planName, openUpgradeModal,
}: {
  quotes: DerivedQuote[]; prevQuotes: DerivedQuote[];
  planName: string;
  openUpgradeModal: (i: any) => void;
}) {
  const plan    = planName.toLowerCase();
  const isPaid  = plan !== 'free';
  const conv    = quotes.length ? Math.round((quotes.filter(q => q.status === 'Aprobada').length / quotes.length) * 100) : 0;
  const prevConv= prevQuotes.length ? Math.round((prevQuotes.filter(q => q.status === 'Aprobada').length / prevQuotes.length) * 100) : 0;
  const convChg = conv - prevConv;
  const risk    = quotes.filter(q => q.status === 'Enviada' && daysAgo(q.sent_at ?? q.created_at) >= 5).length;
  const borradores = quotes.filter(q => q.status === 'Borrador').length;
  const topItems   = getTopItems(quotes)[0];

  const bullets = [
    convChg >= 0 ? `Conversión ${convChg >= 0 ? 'subió' : 'bajó'} ${Math.abs(convChg)}pp vs mes pasado.` : `Conversión bajó ${Math.abs(convChg)}pp este mes.`,
    topItems ? `"${topItems.name}" es tu ítem más cotizado.` : null,
    risk > 0 ? `${risk} cotización${risk > 1 ? 'es' : ''} en riesgo por falta de seguimiento.` : null,
    borradores > 2 ? `${borradores} borradores sin enviar — ¡son oportunidades!` : null,
  ].filter(Boolean) as string[];

  const headline = risk === 0 ? 'Tu negocio va por excelente camino 🚀' : 'Hay oportunidades de mejora 💡';

  if (!isPaid) {
    return (
      <div style={{ ...CARD, background: '#0F172A', border: 'none', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#7C3AED,#A855F7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 900 }}>AI</span>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800 }}>Shelwi IA</div>
            <div style={{ fontSize: 10.5, color: '#64748B' }}>Análisis automático</div>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, background: '#2563EB', color: '#fff', padding: '2px 8px', borderRadius: 5 }}>PRO</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
          {['Recomendaciones inteligentes', 'Predicción de cierre', 'Alertas de riesgo', 'Análisis por cliente'].map(item => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#475569' }}>
              <Lock size={11} color="#334155"/> {item}
            </div>
          ))}
        </div>
        <button onClick={() => openUpgradeModal({ title: 'Desbloquea Shelwi IA', message: 'Con el plan PRO obtienes IA predictiva para tus ventas.', targetPlan: 'pro', ctaLabel: 'Actualizar a PRO' })}
          style={{ width: '100%', border: 'none', background: 'linear-gradient(135deg,#2563EB,#7C3AED)', color: '#fff', fontWeight: 700, fontSize: 13.5, padding: '12px 0', borderRadius: 13, cursor: 'pointer' }}>
          Actualizar a PRO →
        </button>
      </div>
    );
  }

  return (
    <div style={{ ...CARD, background: '#0F172A', border: 'none', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#7C3AED,#A855F7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 900 }}>AI</span>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800 }}>Shelwi IA</div>
          <div style={{ fontSize: 10.5, color: '#64748B' }}>Análisis automático</div>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, background: plan === 'premium' ? 'linear-gradient(135deg,#7C3AED,#A855F7)' : '#00503f', color: '#fff', padding: '2px 8px', borderRadius: 5 }}>
          {planName.toUpperCase()}
        </span>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#E2E8F0', marginBottom: 10 }}>{headline}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {bullets.map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12, color: '#CBD5E1', lineHeight: 1.4 }}>
            <span style={{ color: '#A78BFA', flexShrink: 0, marginTop: 1 }}>✓</span>{l}
          </div>
        ))}
      </div>
      <button style={{ width: '100%', border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: '#E2E8F0', fontWeight: 700, fontSize: 13, padding: '11px 0', borderRadius: 13, cursor: 'pointer' }}>
        Ver análisis completo →
      </button>
    </div>
  );
}

// ─── Block 4: Acciones Rápidas (dinámicas) ───────────────────────────────────

function QuickActionsGrid({
  quotes, company, openQuoteFlow, navigate,
}: {
  quotes: DerivedQuote[];
  company: any;
  openQuoteFlow: (c: any) => void;
  navigate: (p: string) => void;
}) {
  const borradores = quotes.filter(q => q.status === 'Borrador');
  const sinSeguimiento = quotes.filter(q => q.status === 'Enviada' && daysAgo(q.sent_at ?? q.created_at) >= 3);
  const venciendo  = quotes.filter(q => q.status === 'Enviada').filter(q => {
    const due  = new Date(new Date(q.created_at).getTime() + q.cfg.validDays * 86400000);
    return Math.ceil((due.getTime() - TODAY().getTime()) / 86400000) <= 3;
  });

  const staticActions = [
    { icon: <Plus size={22}/>,         label: 'Nueva cotización',  color: '#2563EB', bg: '#EFF6FF', action: () => openQuoteFlow({ cfg: defaultQConfig(company) }) },
    { icon: <UserPlus size={22}/>,     label: 'Nuevo cliente',     color: '#7C3AED', bg: '#F5F3FF', action: () => navigate('/app/clientes') },
    { icon: <ShoppingBag size={22}/>,  label: 'Catálogo',          color: '#0EA5E9', bg: '#F0F9FF', action: () => navigate('/app/catalog') },
    { icon: <BarChart2 size={22}/>,    label: 'Reportes',          color: '#22C55E', bg: '#F0FDF4', action: () => navigate('/app/reportes') },
    { icon: <LayoutTemplate size={22}/>,label: 'Plantillas',       color: '#F97316', bg: '#FFF7ED', action: () => navigate('/app/plantillas') },
    { icon: <Calculator size={22}/>,   label: 'Calculadora',       color: '#EC4899', bg: '#FDF2F8', action: () => navigate('/app/ia') },
  ];

  const dynamicActions: typeof staticActions = [];
  if (borradores.length > 0)
    dynamicActions.push({ icon: <FileText size={22}/>,  label: `Continuar (${borradores.length})`, color: '#2563EB', bg: '#EFF6FF', action: () => navigate('/app/cotizaciones?estado=Borrador') });
  if (sinSeguimiento.length > 0)
    dynamicActions.push({ icon: <MessageCircle size={22}/>, label: 'Seguimiento', color: '#F59E0B', bg: '#FFFBEB', action: () => navigate('/app/cotizaciones?estado=Enviada') });
  if (venciendo.length > 0)
    dynamicActions.push({ icon: <Clock size={22}/>, label: `Vencen (${venciendo.length})`, color: '#EF4444', bg: '#FEF2F2', action: () => navigate('/app/cotizaciones?estado=Enviada') });

  const actions = [...dynamicActions, ...staticActions].slice(0, 6);

  return (
    <div style={CARD}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 14 }}>Acciones rápidas</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {actions.map((a, i) => (
          <button key={i} onClick={a.action}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '14px 6px', border: '1px solid #EEF2F7', borderRadius: 16, background: '#fff', cursor: 'pointer', transition: 'all .12s' }}
            onTouchStart={e => { (e.currentTarget as HTMLElement).style.background = a.bg; }}
            onTouchEnd={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, background: a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: a.color }}>{a.icon}</div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', textAlign: 'center', lineHeight: 1.25 }}>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Block 5: Alertas ────────────────────────────────────────────────────────

function AlertsSection({
  quotes, viewMap, company, openQuoteDetail,
}: {
  quotes: DerivedQuote[];
  viewMap: Record<string, QuoteViewStats>;
  company: { name: string };
  openQuoteDetail: (id: string) => void;
}) {
  const alerts = buildExtendedAlerts(quotes, viewMap, company);
  if (!alerts.length) return null;

  const clrs = {
    warning: { bg: '#FFFBEB', border: '#FDE68A', ic: '#F59E0B', dot: '#F59E0B' },
    success: { bg: '#F0FDF4', border: '#A7F3D0', ic: '#22C55E', dot: '#22C55E' },
    danger:  { bg: '#FEF2F2', border: '#FECACA', ic: '#EF4444', dot: '#EF4444' },
  };

  return (
    <div style={CARD}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 14 }}>Alertas importantes</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {alerts.map((a, i) => {
          const c = clrs[a.type];
          return (
            <div key={i} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 9 }}>
                <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{a.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, color: '#0F172A' }}>{a.title}</div>
                  <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.sub}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                <button onClick={() => openQuoteDetail(a.quoteId)} style={{ flex: 1, border: 'none', background: '#0F172A', color: '#fff', fontWeight: 700, fontSize: 12, padding: '9px 0', borderRadius: 10, cursor: 'pointer' }}>{a.btn}</button>
                {a.whatsApp && (
                  <button onClick={() => openWhats(a.whatsApp!)} style={{ width: 38, height: 38, borderRadius: 10, border: `1px solid ${c.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <MessageCircle size={16} color="#16A34A"/>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Block 6: Embudo ─────────────────────────────────────────────────────────

function FunnelMobileRows({ quotes }: { quotes: DerivedQuote[] }) {
  const stages = [
    { label: 'Borrador',    status: 'Borrador',   color: '#2563EB', bg: '#EFF6FF' },
    { label: 'Enviadas',    status: 'Enviada',    color: '#7C3AED', bg: '#F5F3FF' },
    { label: 'Vistas',      status: 'Enviada',    color: '#0EA5E9', bg: '#F0F9FF', viewBased: true },
    { label: 'Negociación', status: 'Enviada',    color: '#F59E0B', bg: '#FFFBEB', negoc: true },
    { label: 'Aprobadas',   status: 'Aprobada',   color: '#22C55E', bg: '#F0FDF4' },
    { label: 'Perdidas',    status: 'Rechazada',  color: '#EF4444', bg: '#FEF2F2' },
  ];
  const approvedCount = quotes.filter(q => q.status === 'Aprobada').length;
  const total         = quotes.length || 1;
  const conv          = Math.round((approvedCount / total) * 100);

  return (
    <div style={CARD}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 14 }}>Embudo comercial</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {stages.map((s, i) => {
          const count = quotes.filter(q => q.status === s.status).length;
          const total2 = quotes.filter(q => q.status === s.status).reduce((a, q) => a + q.calc.total, 0);
          return (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: i > 0 ? 11 : 0, paddingBottom: i < stages.length - 1 ? 11 : 0, borderBottom: i < stages.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }}/>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#374151' }}>{s.label}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', minWidth: 20, textAlign: 'right' }}>{count}</span>
              <span style={{ fontSize: 12, color: '#94A3B8', minWidth: 70, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtM(total2)}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid #EEF2F7' }}>
        <span style={{ fontSize: 12.5, color: '#64748B', fontWeight: 600 }}>Conversión global</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#22C55E' }}>{conv}%</span>
      </div>
    </div>
  );
}

// ─── Block 7: Top Clientes ───────────────────────────────────────────────────

function TopClientsSection({
  quotes, planName, openUpgradeModal, navigate,
}: {
  quotes: DerivedQuote[]; planName: string;
  openUpgradeModal: (i: any) => void; navigate: (p: string) => void;
}) {
  const isPaid   = planName !== 'Free';
  const clients  = getClientRanking(quotes);

  return (
    <div style={{ ...CARD, position: 'relative', overflow: isPaid ? 'visible' : 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>Clientes TOP</div>
        <button onClick={() => navigate('/app/clientes')} style={{ border: 'none', background: 'none', color: '#2563EB', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, padding: 0 }}>Ver todos <ChevronRight size={13}/></button>
      </div>
      {!isPaid ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', gap: 10 }}>
          <Crown size={28} color="#94A3B8"/>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', textAlign: 'center' }}>Ranking de clientes en PRO</div>
          <div style={{ fontSize: 12, color: '#64748B', textAlign: 'center' }}>Descubre quién genera más valor</div>
          <button onClick={() => openUpgradeModal({ title: 'Ranking de clientes', message: 'Accede al ranking con PRO.', targetPlan: 'pro', ctaLabel: 'Actualizar a PRO' })} style={{ border: 'none', background: '#EFF6FF', color: '#2563EB', fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 12, cursor: 'pointer' }}>Ver planes →</button>
        </div>
      ) : clients.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#94A3B8', fontSize: 13 }}>Sin clientes con cotizaciones</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {clients.map((c, i) => (
            <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 11, paddingTop: i > 0 ? 12 : 0, paddingBottom: i < clients.length - 1 ? 12 : 0, borderBottom: i < clients.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#CBD5E1', width: 14, flexShrink: 0 }}>{i + 1}</span>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: avatarColor(c.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{c.name.charAt(0).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>{c.count} cotizaciones</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtM(c.total)}</div>
                <ProbBar pct={c.prob}/>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Block 8: Actividad ──────────────────────────────────────────────────────

function ActivityFeed({ quotes, navigate }: { quotes: DerivedQuote[]; navigate: (p: string) => void }) {
  const activity = getRecentActivity(quotes);
  return (
    <div style={CARD}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>Actividad reciente</div>
        <button onClick={() => navigate('/app/cotizaciones')} style={{ border: 'none', background: 'none', color: '#2563EB', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, padding: 0 }}>Ver todas <ChevronRight size={13}/></button>
      </div>
      {activity.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#94A3B8', fontSize: 13 }}>Sin actividad reciente</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {activity.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, paddingTop: i > 0 ? 11 : 0, paddingBottom: i < activity.length - 1 ? 11 : 0, borderBottom: i < activity.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
              <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1 }}>{a.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0F172A' }}>{a.label}</div>
                <div style={{ fontSize: 11, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.sub}</div>
              </div>
              <span style={{ fontSize: 10.5, color: '#94A3B8', flexShrink: 0, whiteSpace: 'nowrap' }}>{a.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Block 9: Próximos vencimientos ──────────────────────────────────────────

function UpcomingExpiries({ quotes, openQuoteDetail }: { quotes: DerivedQuote[]; openQuoteDetail: (id: string) => void }) {
  const upcoming = getUpcomingDue(quotes);
  if (!upcoming.length) return null;
  return (
    <div style={CARD}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 14 }}>Próximos vencimientos</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {upcoming.map((q, i) => {
          const urgColor = q.daysLeft <= 1 ? '#EF4444' : q.daysLeft <= 3 ? '#F59E0B' : '#7C3AED';
          const urgBg    = q.daysLeft <= 1 ? '#FEF2F2' : q.daysLeft <= 3 ? '#FFFBEB' : '#F5F3FF';
          return (
            <div key={q.id} onClick={() => openQuoteDetail(q.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 11, paddingTop: i > 0 ? 12 : 0, paddingBottom: i < upcoming.length - 1 ? 12 : 0, borderBottom: i < upcoming.length - 1 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer' }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: urgBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Calendar size={16} color={urgColor}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0F172A' }}>{q.title}</div>
                <div style={{ fontSize: 11, color: '#64748B' }}>{q.clientName} · {fmtM(q.calc.total)}</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: urgColor, flexShrink: 0 }}>{q.daysLeft <= 0 ? 'HOY' : `${q.daysLeft}d`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Block 10: Donut por estado ───────────────────────────────────────────────

function DonutStateCard({ quotes, navigate }: { quotes: DerivedQuote[]; navigate: (p: string) => void }) {
  const STATUS_LABEL: Record<string, string> = { Rechazada: 'Perdida', Vencida: 'Por seguir' };
  return (
    <div style={CARD}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 14 }}>Cotizaciones por estado</div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <DonutCompact quotes={quotes}/>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {DONUT_ORDER.map(s => {
            const count = quotes.filter(q => q.status === s).length;
            const pct   = quotes.length ? Math.round((count / quotes.length) * 100) : 0;
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: DONUT_COLORS[s], flexShrink: 0 }}/>
                <span style={{ fontSize: 12, fontWeight: 600, flex: 1, color: '#374151' }}>{STATUS_LABEL[s] ?? s}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{count}</span>
                <span style={{ fontSize: 11, color: '#94A3B8', width: 34, textAlign: 'right' }}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
      <button onClick={() => navigate('/app/reportes')} style={{ width: '100%', marginTop: 14, border: 'none', background: '#F8FAFC', color: '#2563EB', fontWeight: 700, fontSize: 13, padding: '11px 0', borderRadius: 12, cursor: 'pointer' }}>
        Ver reporte detallado →
      </button>
    </div>
  );
}

// ─── Block 11+13: Métricas comerciales ──────────────────────────────────────

function CommercialMetrics({
  quotes, viewStats, planName, openUpgradeModal,
}: {
  quotes: DerivedQuote[];
  viewStats: QuoteViewStats[];
  planName: string;
  openUpgradeModal: (i: any) => void;
}) {
  const isPaid       = planName !== 'Free';
  const sentQ        = quotes.filter(q => q.status === 'Enviada');
  const pendingValue = sentQ.reduce((a, q) => a + q.calc.total, 0);
  const avgProb      = sentQ.length
    ? Math.round(sentQ.reduce((a, q) => a + closeProbability(q), 0) / sentQ.length)
    : 0;
  const totalViews   = viewStats.reduce((a, s) => a + s.total, 0);
  const activeClients = new Set(quotes.filter(q => q.client_id).map(q => q.client_id)).size;

  const metrics = [
    { icon: <Users size={18}/>,      label: 'Clientes activos',    value: String(activeClients),  color: '#2563EB', bg: '#EFF6FF' },
    { icon: <Eye size={18}/>,        label: 'Cotizaciones vistas',  value: String(totalViews),     color: '#7C3AED', bg: '#F5F3FF', locked: !isPaid },
    { icon: <Target size={18}/>,     label: 'Prob. prom. cierre',   value: `${avgProb}%`,           color: '#22C55E', bg: '#F0FDF4', locked: !isPaid },
    { icon: <Zap size={18}/>,        label: 'Valor por cerrar',     value: fmtM(pendingValue),     color: '#F97316', bg: '#FFF7ED', locked: !isPaid },
  ];

  return (
    <div style={CARD}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 14 }}>Métricas comerciales</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {metrics.map(m => (
          <div key={m.label} style={{ background: '#F8FAFC', border: '1px solid #EEF2F7', borderRadius: 14, padding: '14px 12px', position: 'relative', overflow: 'hidden' }}>
            {m.locked && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(248,250,252,.8)', backdropFilter: 'blur(3px)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, cursor: 'pointer' }}
                onClick={() => openUpgradeModal({ title: 'Métricas avanzadas', message: 'Accede a métricas comerciales completas con PRO.', targetPlan: 'pro', ctaLabel: 'Actualizar a PRO' })}>
                <Lock size={14} color="#94A3B8"/>
              </div>
            )}
            <div style={{ width: 32, height: 32, borderRadius: 9, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: m.color, marginBottom: 8 }}>{m.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.5px', color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Block 12: Ítems más cotizados ───────────────────────────────────────────

function TopItemsCard({ quotes }: { quotes: DerivedQuote[] }) {
  const items  = getTopItems(quotes);
  const allT   = quotes.reduce((a, q) => a + q.calc.total, 0) || 1;
  const CLRS   = ['#2563EB', '#7C3AED', '#22C55E', '#F59E0B', '#EF4444'];

  if (!items.length) return null;

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>Ítems más cotizados</div>
        <span style={{ fontSize: 11, color: '#94A3B8' }}>Este mes</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((s, i) => {
          const pct = Math.round((s.total / allT) * 100);
          return (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 11, color: '#CBD5E1', width: 14, flexShrink: 0 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginLeft: 6, flexShrink: 0 }}>{fmtM(s.total)}</span>
                </div>
                <div style={{ height: 4, background: '#F1F5F9', borderRadius: 99 }}>
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

// ─── Block Final: Banner IA Premium ──────────────────────────────────────────

function IAPremiumBanner({ planName, navigate, openUpgradeModal }: { planName: string; navigate: (p: string) => void; openUpgradeModal: (i: any) => void }) {
  const isPremium = planName === 'Premium';
  return (
    <div style={{ background: 'linear-gradient(150deg,#1e0a4e 0%,#3b0f8c 60%,#7C3AED 100%)', borderRadius: 22, padding: '22px 20px', color: '#fff', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', right: -20, top: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,.06)' }}/>
      <div style={{ position: 'absolute', left: -15, bottom: -15, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,.04)' }}/>
      <div style={{ fontSize: 28, marginBottom: 6 }}>🚀</div>
      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.3px', marginBottom: 6 }}>Lleva tu negocio al siguiente nivel</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,.65)', marginBottom: 18, lineHeight: 1.5 }}>Descubre el análisis avanzado con Shelwi PREMIUM</div>
      <button
        onClick={() => isPremium ? navigate('/app/ia') : openUpgradeModal({ title: 'Shelwi IA Premium', message: 'Accede a análisis predictivo, cierre asistido y más.', targetPlan: 'premium', ctaLabel: 'Ver PREMIUM' })}
        style={{ border: 'none', background: '#fff', color: '#3b0f8c', fontWeight: 800, fontSize: 14, padding: '13px 24px', borderRadius: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
        <Zap size={15}/> {isPremium ? 'Hablar con IA' : 'Ver planes →'}
      </button>
    </div>
  );
}

// ─── MobileDashboard (root) ───────────────────────────────────────────────────

export function MobileDashboard() {
  const navigate = useNavigate();
  const { profile, company, planName, workspace } = useWorkspace();
  const { openQuoteFlow, openQuoteDetail, openUpgradeModal } = useUI();
  const { quotes, isLoading } = useDerivedQuotes();
  const quoteIds = useMemo(() => quotes.map(q => q.id), [quotes]);

  const { data: viewStats = [] } = useQuery({
    queryKey: ['quoteViews', workspace.id],
    queryFn:  () => getQuoteViewStats(quoteIds),
    enabled:  quoteIds.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  const viewMap = useMemo(() => {
    const m: Record<string, QuoteViewStats> = {};
    viewStats.forEach(s => { m[s.quote_id] = s; });
    return m;
  }, [viewStats]);

  if (isLoading) return null;

  const now        = TODAY();
  const prev       = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const inM        = (q: DerivedQuote, d: Date) => {
    const c = new Date(q.created_at);
    return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
  };
  const thisM      = quotes.filter(q => inM(q, now));
  const prevM      = quotes.filter(q => inM(q, prev));
  const monthTotal = thisM.reduce((a, q) => a + q.calc.total, 0);
  const prevTotal  = prevM.reduce((a, q) => a + q.calc.total, 0);
  const monthChg   = prevTotal > 0 ? Math.round(((monthTotal - prevTotal) / prevTotal) * 100) : null;
  const firstName  = (profile.full_name || '').split(' ')[0] || 'Usuario';

  return (
    <div className="mob-dashboard">
      <MobileHeroCard
        firstName={firstName}
        planName={planName}
        monthTotal={monthTotal}
        monthChg={monthChg}
        quotes={quotes}
      />

      <KpiCarousel quotes={quotes} planName={planName}/>

      <IAInsightCard
        quotes={thisM}
        prevQuotes={prevM}
        planName={planName}
        openUpgradeModal={openUpgradeModal}
      />

      <QuickActionsGrid
        quotes={quotes}
        company={company}
        openQuoteFlow={openQuoteFlow}
        navigate={navigate}
      />

      <AlertsSection
        quotes={quotes}
        viewMap={viewMap}
        company={company}
        openQuoteDetail={openQuoteDetail}
      />

      <FunnelMobileRows quotes={quotes}/>

      <TopClientsSection
        quotes={quotes}
        planName={planName}
        openUpgradeModal={openUpgradeModal}
        navigate={navigate}
      />

      <ActivityFeed quotes={quotes} navigate={navigate}/>

      <UpcomingExpiries quotes={quotes} openQuoteDetail={openQuoteDetail}/>

      <DonutStateCard quotes={quotes} navigate={navigate}/>

      <CommercialMetrics
        quotes={quotes}
        viewStats={viewStats}
        planName={planName}
        openUpgradeModal={openUpgradeModal}
      />

      <TopItemsCard quotes={quotes}/>

      <IAPremiumBanner
        planName={planName}
        navigate={navigate}
        openUpgradeModal={openUpgradeModal}
      />
    </div>
  );
}
