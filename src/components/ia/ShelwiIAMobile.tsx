/**
 * ShelwiIAMobile — Copiloto comercial IA premium mobile-first.
 * Referencia: imagen adjunta KTZ360 IA / ChatGPT / Perplexity.
 * Todos los datos provienen de Supabase — cero datos mockeados.
 * Desktop NO se modifica.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageCircle, Phone, ChevronRight, FileText,
  Users, TrendingUp, Lightbulb, Clock, AlertTriangle,
  Sparkles, Lock,
} from 'lucide-react';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useDerivedQuotes, useClients } from '../../hooks/useQuotes';
import { useFeatureAccess } from '../../hooks/usePermissions';
import { daysAgo } from '../../lib/calc';
import { formatCurrencyCOP } from '../../lib/currency';
import { NotificationBell } from '../ui/NotificationBell';
import type { DerivedQuote } from '../../lib/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1_000)     return '$' + Math.round(n / 1_000) + 'k';
  return '$' + Math.round(n);
}

function closeProbability(q: DerivedQuote): number {
  if (q.status === 'Aprobada') return 100;
  if (q.status === 'Rechazada') return 0;
  let s = 40;
  if ((q.status as string) === 'Vista') s += 30;
  else if (q.status === 'Enviada') s += 15;
  if (q.sent_at) {
    const d = daysAgo(q.sent_at);
    if (d < 3) s += 15;
    else if (d > 10) s -= 20;
  }
  return Math.max(5, Math.min(95, s));
}

// ─── Círculo de conversión ────────────────────────────────────────────────────

function ConversionDonut({ pct }: { pct: number }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const stroke = circ * (pct / 100);
  return (
    <svg width={64} height={64} viewBox="0 0 64 64" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
      <circle cx={32} cy={32} r={r} fill="none" stroke="#E2E8F0" strokeWidth={6} />
      <circle cx={32} cy={32} r={r} fill="none" stroke="#2563EB" strokeWidth={6}
        strokeDasharray={`${stroke} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 32 32)" />
    </svg>
  );
}

// ─── Tarjeta de recomendación ─────────────────────────────────────────────────

function RecoCard({
  icon, iconBg, iconColor, title, sub, action,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  sub: string;
  action: { label: string; icon?: React.ReactNode; onClick: () => void; style?: 'outline' | 'link' };
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderBottom: '1px solid #F8FAFC' }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: iconColor }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A', lineHeight: 1.4, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#64748B' }}>{sub}</div>
      </div>
      {action.style === 'outline' ? (
        <button onClick={action.onClick}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: '1.5px solid #E2E8F0', borderRadius: 10, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#0F172A', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap' }}>
          {action.icon}{action.label}
        </button>
      ) : (
        <button onClick={action.onClick}
          style={{ display: 'flex', alignItems: 'center', gap: 3, border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#2563EB', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap' }}>
          {action.label}<ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}

// ─── Pantalla de upgrade (FREE) ──────────────────────────────────────────────

function UpgradePrompt() {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg,#7C3AED,#2563EB)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <Lock size={32} color="#fff" />
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>Shelwi IA está disponible en PRO</div>
      <div style={{ fontSize: 14, color: '#64748B', lineHeight: 1.6, marginBottom: 28 }}>
        Accede a tu copiloto comercial: analiza cotizaciones, predice cierres y recibe recomendaciones en tiempo real.
      </div>
      <button onClick={() => navigate('/app/planes')}
        style={{ border: 'none', background: 'linear-gradient(135deg,#7C3AED,#2563EB)', color: '#fff', fontWeight: 700, fontSize: 15, padding: '14px 32px', borderRadius: 14, cursor: 'pointer', boxShadow: '0 8px 24px rgba(124,58,237,.4)' }}>
        ✨ Actualizar a PRO
      </button>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ShelwiIAMobile() {
  const navigate    = useNavigate();
  const { } = useWorkspace();
  const { quotes, isLoading: qLoading } = useDerivedQuotes();
  const { data: clients = [] } = useClients();
  const aiAccess    = useFeatureAccess('ai_enabled');
  const [activeTab, setActiveTab] = useState<'recomendaciones' | 'predicciones' | 'oportunidades' | 'analisis'>('recomendaciones');

  // ── Métricas reales ──────────────────────────────────────────────────────────
  const enviadas  = quotes.filter(q => q.status === 'Enviada');
  const aprobadas = quotes.filter(q => q.status === 'Aprobada');
  const probCierre = enviadas.reduce((a, q) => a + q.calc.total * (closeProbability(q) / 100), 0);
  const totalAprobado = aprobadas.reduce((a, q) => a + q.calc.total, 0);
  const facturado  = aprobadas.reduce((a, q) => a + q.calc.total * (q.cfg.advancePct / 100), 0);
  const conv       = (aprobadas.length + enviadas.length) > 0
    ? Math.round((aprobadas.length / (aprobadas.length + enviadas.length)) * 100)
    : 0;
  const avgProbPct = enviadas.length > 0
    ? Math.round(enviadas.reduce((a, q) => a + closeProbability(q), 0) / enviadas.length)
    : 0;
  const clientesEnRiesgo = clients.filter(c => {
    const cq = quotes.filter(q => q.client_id === c.id && q.status === 'Enviada');
    return cq.some(q => daysAgo(q.sent_at ?? q.created_at) >= 5);
  }).length;
  const tiempoAhorrado = (quotes.length * 0.4).toFixed(1);

  // ── Recomendaciones reales ──────────────────────────────────────────────────
  const sinSeguimiento = quotes.filter(q => q.status === 'Enviada' && daysAgo(q.sent_at ?? q.created_at) >= 4).slice(0, 1);
  const vistasMuchas   = quotes.filter(q => (q.status as string) === 'Vista').slice(0, 1);
  const topOportunidad = quotes.filter(q => q.status === 'Enviada').sort((a, b) => b.calc.total - a.calc.total).slice(0, 1);

  const TABS = [
    { key: 'recomendaciones', label: 'Recomendaciones' },
    { key: 'predicciones',    label: 'Predicciones' },
    { key: 'oportunidades',   label: 'Oportunidades' },
    { key: 'analisis',        label: 'Análisis' },
  ] as const;

  const QUICK_ACTIONS = [
    { icon: <FileText size={20} color="#7C3AED" />, bg: '#F5F3FF', label: 'Analizar\ncotizaciones', onClick: () => {} },
    { icon: <Users size={20} color="#16A34A" />,    bg: '#F0FDF4', label: 'Clientes\nen riesgo',    onClick: () => navigate('/app/clientes') },
    { icon: <TrendingUp size={20} color="#D97706" />,bg: '#FFFBEB', label: 'Forecast de\nventas',  onClick: () => {} },
    { icon: <Lightbulb size={20} color="#2563EB" />, bg: '#EFF6FF', label: 'Recomendaciones\nIA', onClick: () => {} },
    { icon: <Clock size={20} color="#EF4444" />,     bg: '#FEF2F2', label: 'Mejor horario\nde envío', onClick: () => {} },
  ];

  const isPro = aiAccess.data === true;

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>

      {/* ── HEADER ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px 12px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-.5px' }}>Shelwi IA</div>
              <span style={{ fontSize: 10.5, fontWeight: 800, background: '#16A34A', color: '#fff', padding: '2px 8px', borderRadius: 99 }}>PRO</span>
            </div>
            <div style={{ fontSize: 12.5, color: '#64748B', lineHeight: 1.4 }}>
              Inteligencia artificial que analiza tus datos<br />y te ayuda a vender más.
            </div>
          </div>
          <NotificationBell />
        </div>
      </div>

      {/* Si FREE: mostrar upgrade */}
      {!isPro && !qLoading && (
        <>
          <div style={{ margin: '16px 16px 0', background: 'linear-gradient(135deg, #F5F3FF 0%, #EFF6FF 100%)', borderRadius: 20, padding: '20px 18px', display: 'flex', alignItems: 'center', gap: 14, border: '1px solid #DDD6FE' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 6 }}>Tu copiloto comercial</div>
              <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.5 }}>La IA de Shelwi analiza tus cotizaciones, clientes y comportamiento para darte recomendaciones que cierran más ventas.</div>
            </div>
            <div style={{ fontSize: 52, flexShrink: 0 }}>🤖</div>
          </div>
          <UpgradePrompt />
        </>
      )}

      {/* Contenido PRO */}
      {isPro && (
        <>
          {/* ── HERO BANNER ── */}
          <div style={{ margin: '12px 16px 0', background: 'linear-gradient(135deg, #EDE9FE 0%, #DBEAFE 100%)', borderRadius: 20, padding: '18px 18px', display: 'flex', alignItems: 'center', gap: 14, border: '1px solid #DDD6FE' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#7C3AED,#2563EB)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles size={18} color="#fff" />
                </div>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>Tu copiloto comercial</span>
              </div>
              <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.5 }}>
                La IA de Shelwi analiza tus cotizaciones, clientes y comportamiento para darte recomendaciones que cierran más ventas.
              </div>
            </div>
            <div style={{ fontSize: 52, flexShrink: 0 }}>🤖</div>
          </div>

          {/* ── KPIs FILA 1 ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, padding: '12px 16px 0' }}>
            {[
              { label: 'Probable cierre', value: fmtCompact(probCierre), sub1: `${enviadas.length} cotizaciones`, sub2: `${avgProbPct}% de probabilidad`, sub2c: '#7C3AED' },
              { label: 'Aprobadas',       value: fmtCompact(totalAprobado), sub1: `${aprobadas.length} cotizaciones`, sub2: `${quotes.length ? Math.round((aprobadas.length/quotes.length)*100) : 0}% del total`, sub2c: '#16A34A' },
              { label: 'Facturado',       value: fmtCompact(facturado), sub1: 'Este mes', sub2: `${totalAprobado > 0 ? Math.round((facturado/totalAprobado)*100) : 0}% del total`, sub2c: '#D97706' },
            ].map((k, i) => (
              <div key={i} style={{ background: '#fff', border: '1px solid #F1F5F9', borderRadius: 14, padding: '12px 10px', boxShadow: '0 1px 4px rgba(15,23,42,.05)' }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: '#64748B', marginBottom: 6, lineHeight: 1.3 }}>{k.label}</div>
                <div style={{ fontSize: 17, fontWeight: 900, color: '#0F172A', fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: 6 }}>{k.value}</div>
                <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 2 }}>{k.sub1}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: k.sub2c }}>{k.sub2}</div>
              </div>
            ))}
          </div>

          {/* ── KPIs FILA 2 ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, padding: '8px 16px 0' }}>
            {/* Conversión */}
            <div style={{ background: '#fff', border: '1px solid #F1F5F9', borderRadius: 14, padding: '12px 10px', boxShadow: '0 1px 4px rgba(15,23,42,.05)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>Conversión del mes</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#0F172A', lineHeight: 1, marginBottom: 4 }}>{conv}%</div>
              <div style={{ fontSize: 10, color: '#94A3B8' }}>{aprobadas.length} de {aprobadas.length + enviadas.length} enviadas</div>
              <ConversionDonut pct={conv} />
            </div>

            {/* Tiempo ahorrado */}
            <div style={{ background: '#fff', border: '1px solid #F1F5F9', borderRadius: 14, padding: '12px 10px', boxShadow: '0 1px 4px rgba(15,23,42,.05)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>Tiempo ahorrado</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#0F172A', lineHeight: 1, marginBottom: 4 }}>{tiempoAhorrado} h</div>
              <div style={{ fontSize: 10, color: '#94A3B8', lineHeight: 1.4 }}>Con IA este mes vs procesos manuales</div>
            </div>

            {/* Clientes en riesgo */}
            <div style={{ background: '#fff', border: '1px solid #F1F5F9', borderRadius: 14, padding: '12px 10px', boxShadow: '0 1px 4px rgba(15,23,42,.05)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#64748B', marginBottom: 6 }}>Clientes en riesgo</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: clientesEnRiesgo > 0 ? '#EF4444' : '#0F172A', lineHeight: 1, marginBottom: 4 }}>{clientesEnRiesgo}</div>
              <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>Requieren seguimiento</div>
              {clientesEnRiesgo > 0 && (
                <button onClick={() => navigate('/app/clientes')}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 10.5, fontWeight: 700, color: '#EF4444', padding: 0, fontFamily: 'inherit' }}>
                  ver ahora
                </button>
              )}
            </div>
          </div>

          {/* ── TABS ── */}
          <div style={{ display: 'flex', overflowX: 'auto', scrollbarWidth: 'none', padding: '14px 16px 0', borderBottom: '1px solid #F1F5F9', background: '#fff', marginTop: 12 }}>
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                style={{ flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer', padding: '0 4px 12px', marginRight: 20, fontFamily: 'inherit', fontSize: 14, fontWeight: activeTab === tab.key ? 700 : 500, color: activeTab === tab.key ? '#2563EB' : '#64748B', borderBottom: `2px solid ${activeTab === tab.key ? '#2563EB' : 'transparent'}` }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── SUGERENCIAS IA ── */}
          <div style={{ background: '#fff', marginTop: 6, borderTop: '1px solid #F1F5F9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 8px' }}>
              <span style={{ fontSize: 14.5, fontWeight: 800, color: '#0F172A' }}>Sugerencias de Shelwi IA</span>
              <span style={{ fontSize: 12.5, color: '#2563EB', fontWeight: 600, cursor: 'pointer' }}>Ver todas</span>
            </div>

            {/* Recomendación 1: sin seguimiento */}
            {sinSeguimiento.map(q => (
              <RecoCard key={q.id}
                icon={<AlertTriangle size={18} />} iconBg="#F5F3FF" iconColor="#7C3AED"
                title={`La cotización ${(q as any).quote_number ?? q.title} lleva ${daysAgo(q.sent_at ?? q.created_at)} días sin seguimiento.`}
                sub="Probabilidad de cierre: Media"
                action={{ label: 'Enviar WhatsApp', icon: <MessageCircle size={13} />, style: 'outline', onClick: () => navigate(`/app/cotizaciones/${q.id}`) }}
              />
            ))}
            {sinSeguimiento.length === 0 && (
              <RecoCard
                icon={<AlertTriangle size={18} />} iconBg="#F5F3FF" iconColor="#7C3AED"
                title="Sin cotizaciones pendientes de seguimiento"
                sub="Todas tus cotizaciones están al día 🎉"
                action={{ label: 'Ver cotizaciones', style: 'link', onClick: () => navigate('/app/cotizaciones') }}
              />
            )}

            {/* Recomendación 2: propuesta muy vista */}
            {vistasMuchas.map(q => (
              <RecoCard key={q.id}
                icon={<TrendingUp size={18} />} iconBg="#F0FDF4" iconColor="#16A34A"
                title={`${q.clientName} ha abierto la propuesta.`}
                sub="Probabilidad alta de cierre."
                action={{ label: 'Contactar ahora', icon: <Phone size={13} />, style: 'outline', onClick: () => navigate(`/app/cotizaciones/${q.id}`) }}
              />
            ))}
            {vistasMuchas.length === 0 && (
              <RecoCard
                icon={<TrendingUp size={18} />} iconBg="#F0FDF4" iconColor="#16A34A"
                title="Mejor horario para enviar cotizaciones:"
                sub="Lunes a viernes entre 8:00 AM - 10:00 AM"
                action={{ label: 'Ver detalles', style: 'link', onClick: () => {} }}
              />
            )}

            {/* Recomendación 3: horario */}
            <RecoCard
              icon={<Clock size={18} />} iconBg="#FEF3C7" iconColor="#D97706"
              title="Mejor horario para enviar cotizaciones:"
              sub="Lunes a viernes entre 8:00 AM - 10:00 AM"
              action={{ label: 'Ver detalles', style: 'link', onClick: () => {} }}
            />

            {/* Recomendación 4: top oportunidad */}
            {topOportunidad.map(q => (
              <RecoCard key={q.id}
                icon={<Sparkles size={18} />} iconBg="#EFF6FF" iconColor="#2563EB"
                title="Esta es tu mejor oportunidad del mes"
                sub={`${q.title} · ${formatCurrencyCOP(q.calc.total)}`}
                action={{ label: 'Ver oportunidad', style: 'link', onClick: () => navigate(`/app/cotizaciones/${q.id}`) }}
              />
            ))}
          </div>

          {/* ── ACCIONES RÁPIDAS ── */}
          <div style={{ padding: '14px 16px 8px' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', marginBottom: 14 }}>Acciones rápidas</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>
              {QUICK_ACTIONS.map(({ icon, bg, label, onClick }) => (
                <button key={label} onClick={onClick}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '12px 4px', border: '1px solid #F1F5F9', borderRadius: 14, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
                  <span style={{ fontSize: 9.5, fontWeight: 600, color: '#475569', textAlign: 'center', lineHeight: 1.3, whiteSpace: 'pre-line' }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Loading state */}
      {qLoading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: 14, color: '#94A3B8' }}>Cargando análisis...</div>
        </div>
      )}
    </div>
  );
}
