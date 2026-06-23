/**
 * BIPage — Business Intelligence Sprint 19
 * /app/bi — Mobile-first 390px
 * KPI Engine: 1 llamada por tab. NO llama 20 RPCs.
 * Reutiliza todo de Sprints 1–18. NO duplica ningún dashboard.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BarChart3, TrendingUp, Settings2, Megaphone,
  Users, Zap, Loader2,
} from 'lucide-react';
import {
  useBIExecutiveKPIs, useBISalesKPIs, useBIOperationsKPIs,
  useBIMarketingKPIs, useBICustomerKPIs, useFullFunnel,
} from '../hooks/useBI';
import { useWorkspaceProfitability } from '../hooks/useFinance';
import { formatCurrencyCOPCompact } from '../lib/currency';
import {
  generateExecutiveSummary, generateBusinessForecast,
  generateRiskAssessment, generateGrowthRecommendations,
} from '../services/aiCommercial';
import type { AIResponse } from '../services/aiStudio';

type Tab = 'ceo' | 'comercial' | 'operaciones' | 'marketing' | 'clientes' | 'ia';

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'ceo',         label: 'CEO',       icon: <BarChart3 size={13} /> },
  { key: 'comercial',   label: 'Ventas',    icon: <TrendingUp size={13} /> },
  { key: 'operaciones', label: 'Ops',       icon: <Settings2 size={13} /> },
  { key: 'marketing',   label: 'Mktg',      icon: <Megaphone size={13} /> },
  { key: 'clientes',    label: 'Clientes',  icon: <Users size={13} /> },
  { key: 'ia',          label: 'IA',        icon: <Zap size={13} /> },
];

const HEALTH_COLOR: Record<string, string> = {
  good:    '#16A34A', warning: '#D97706',
  critical:'#DC2626', no_data: '#94A3B8',
};

function pct(n: number | null | undefined, suffix = '%') {
  if (n === null || n === undefined) return '—';
  return (n > 0 ? '+' : '') + n + suffix;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function BIPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('ceo');

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#0F172A', padding: '14px 16px 0', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#fff' }}><ArrowLeft size={20} /></button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart3 size={17} color="#818CF8" /> Business Intelligence
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>KPI Engine · Datos Sprints 1–18</div>
          </div>
        </div>
        <div style={{ display: 'flex', overflowX: 'auto', gap: 2 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
              padding: '7px 10px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? '#818CF8' : '#64748B',
              borderBottom: tab === t.key ? '2px solid #818CF8' : '2px solid transparent',
            }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        {tab === 'ceo'         && <TabCEO />}
        {tab === 'comercial'   && <TabComercial />}
        {tab === 'operaciones' && <TabOperaciones />}
        {tab === 'marketing'   && <TabMarketing />}
        {tab === 'clientes'    && <TabClientes />}
        {tab === 'ia'          && <TabIA />}
      </div>
    </div>
  );
}

// ─── Tab CEO ──────────────────────────────────────────────────────────────────

function TabCEO() {
  const execQ = useBIExecutiveKPIs();
  const d = execQ.data;
  if (execQ.isLoading) return <Loader />;
  if (!d) return <Error msg={execQ.error?.message} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Health badge */}
      <div style={{ background: HEALTH_COLOR[d.financial_health] + '20', borderLeft: `4px solid ${HEALTH_COLOR[d.financial_health]}`, borderRadius: 12, padding: '10px 14px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: HEALTH_COLOR[d.financial_health] }}>
          Salud financiera: {d.financial_health === 'good' ? 'Saludable' : d.financial_health === 'warning' ? 'Atención' : d.financial_health === 'critical' ? 'Crítico' : 'Sin datos'}
        </div>
        <div style={{ fontSize: 11, color: '#64748B' }}>{d.period_start} → {d.period_end}</div>
      </div>

      {/* KPIs grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <KPICard label="Ingresos" value={formatCurrencyCOPCompact(d.revenue)} change={d.revenue_change_pct} color="#16A34A" bg="#F0FDF4" />
        <KPICard label="Utilidad estimada" value={formatCurrencyCOPCompact(d.profit)} change={d.profit_change_pct} color="#2563EB" bg="#EFF6FF" />
        <KPICard label="Margen estimado" value={d.margin_pct + '%'} color={HEALTH_COLOR[d.financial_health]} bg="#F8FAFC" />
        <KPICard label="Pipeline activo" value={formatCurrencyCOPCompact(d.pipeline_value)} sub={d.pipeline_count + ' oportunidades'} color="#7C3AED" bg="#F5F3FF" />
      </div>

      {/* Conversión y CS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        <MiniKPI label="Conversión 30d" value={d.conversion_rate_30d + '%'} />
        <MiniKPI label="Clientes VIP" value={d.vip_clients} color="#16A34A" />
        <MiniKPI label="En riesgo" value={d.at_risk_clients} color="#DC2626" />
      </div>

      {/* Tendencia mensual */}
      {d.monthly_trend?.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 12 }}>Tendencia mensual</div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            {d.monthly_trend.map(m => (
              <div key={m.month} style={{ minWidth: 68, textAlign: 'center', flexShrink: 0 }}>
                <div style={{ height: 56, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 4 }}>
                  <div style={{
                    width: 26, borderRadius: '4px 4px 0 0', background: HEALTH_COLOR[m.margin_pct >= 12 ? 'good' : m.margin_pct >= 5 ? 'warning' : 'critical'],
                    height: m.revenue > 0 ? Math.max(6, Math.round((m.util_amount / Math.max(...d.monthly_trend.map(x => x.revenue), 1)) * 52)) : 4,
                  }} />
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0F172A' }}>{m.margin_pct}%</div>
                <div style={{ fontSize: 10, color: '#94A3B8' }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clientes top */}
      {d.top_clients?.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>Top clientes</div>
          {d.top_clients.slice(0, 3).map((c: Record<string, unknown>, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
              <span style={{ fontSize: 13, color: '#374151' }}>{c.client_name as string}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#16A34A' }}>{formatCurrencyCOPCompact(c.revenue as number)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab Comercial ────────────────────────────────────────────────────────────

function TabComercial() {
  const salesQ = useBISalesKPIs();
  const funnelQ = useFullFunnel();
  const d = salesQ.data;
  if (salesQ.isLoading) return <Loader />;
  if (!d) return <Error msg={salesQ.error?.message} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPIs ventas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <KPICard label="Valor cotizado" value={formatCurrencyCOPCompact(d.total_quoted)} color="#2563EB" bg="#EFF6FF" />
        <KPICard label="Valor aprobado" value={formatCurrencyCOPCompact(d.total_approved)} color="#16A34A" bg="#F0FDF4" />
        <KPICard label="Tasa de conversión" value={d.conversion_rate + '%'} sub={d.approved_count + '/' + d.quotes_count + ' cotizaciones'} color="#7C3AED" bg="#F5F3FF" />
        <KPICard label="Tiempo promedio cierre" value={d.avg_close_days !== null ? d.avg_close_days + ' días' : '—'} color="#D97706" bg="#FFF7ED" />
      </div>

      {/* Embudo completo */}
      {funnelQ.data && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>Embudo completo</div>
          {funnelQ.data.stages.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: i < funnelQ.data!.stages.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
              <span style={{ fontSize: 16, width: 24 }}>{s.icon}</span>
              <span style={{ flex: 1, fontSize: 13, color: '#374151' }}>{s.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{s.count}</span>
              {s.value > 0 && <span style={{ fontSize: 11, color: '#94A3B8' }}>{formatCurrencyCOPCompact(s.value)}</span>}
            </div>
          ))}
          {/* Tasa de cierre global */}
          <div style={{ marginTop: 10, background: '#F0FDF4', borderRadius: 10, padding: '8px 12px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#374151' }}>Tasa de cierre global</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#16A34A' }}>{funnelQ.data.conversion.overall_close_rate ?? '—'}%</span>
          </div>
        </div>
      )}

      {/* Por comercial */}
      {d.by_rep?.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>Performance por comercial</div>
          {d.by_rep.slice(0, 5).map((r, i) => (
            <div key={r.user_id} style={{ padding: '10px 0', borderBottom: i < d.by_rep.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{r.full_name}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#16A34A' }}>{formatCurrencyCOPCompact(r.approved_value)}</span>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#64748B' }}>
                <span>{r.quotes_approved}/{r.quotes_created} aprobadas</span>
                <span>Conversión: {r.conversion_rate}%</span>
                {r.avg_close_days && <span>Cierre: {r.avg_close_days}d</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab Operaciones ──────────────────────────────────────────────────────────

function TabOperaciones() {
  const opsQ = useBIOperationsKPIs();
  const d = opsQ.data;
  if (opsQ.isLoading) return <Loader />;
  if (!d) return <Error msg={opsQ.error?.message} />;

  const ows = d.work_orders_status as Record<string, number>;
  const os  = d.orders_status    as Record<string, number>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Estado actual */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        <MiniKPI label="Pedidos activos" value={(os.en_ejecucion ?? 0) + (os.programado ?? 0)} color="#2563EB" />
        <MiniKPI label="OTs activas" value={(ows.en_progreso ?? 0) + (ows.asignada ?? 0)} color="#7C3AED" />
        <MiniKPI label="En campo hoy" value={d.team_in_field ?? '—'} color="#D97706" />
      </div>

      {/* Productividad */}
      {d.productivity_summary && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KPICard label="OTs finalizadas" value={(d.productivity_summary as Record<string, unknown>).finalizadas as number ?? 0} color="#16A34A" bg="#F0FDF4" />
          <KPICard label="Duración promedio" value={((d.productivity_summary as Record<string, unknown>).avg_duration_h as number ?? 0) + 'h'} color="#2563EB" bg="#EFF6FF" />
        </div>
      )}

      {/* Por operario */}
      {d.productivity_by_member?.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>Productividad por operario</div>
          {d.productivity_by_member.slice(0, 5).map((m, i) => (
            <div key={m.user_id} style={{ padding: '10px 0', borderBottom: i < d.productivity_by_member.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{m.full_name}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#16A34A' }}>{m.wos_finished} OTs</span>
              </div>
              <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#64748B' }}>
                <span>{m.completion_rate}% completadas</span>
                {m.avg_duration_hours > 0 && <span>Avg {m.avg_duration_hours}h/OT</span>}
                {m.delayed_count > 0 && <span style={{ color: '#DC2626' }}>{m.delayed_count} retrasadas</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab Marketing ────────────────────────────────────────────────────────────

function TabMarketing() {
  const mktQ = useBIMarketingKPIs();
  const d = mktQ.data;
  if (mktQ.isLoading) return <Loader />;
  if (!d) return <Error msg={mktQ.error?.message} />;

  const UTM_ICONS: Record<string, string> = {
    facebook: '📘', instagram: '📸', google: '🔍',
    tiktok: '🎵', whatsapp: '💬', referral: '🤝',
    direct: '🔗', email: '✉️',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        <MiniKPI label="Clientes nuevos" value={d.new_clients} color="#16A34A" />
        <MiniKPI label="Referidos" value={d.referral_conversions} color="#7C3AED" />
        <MiniKPI label="Visitas UTM" value={d.utm_visits} />
      </div>

      {/* Revenue por canal */}
      {d.revenue_by_channel?.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>Ingresos por canal de adquisición</div>
          {d.revenue_by_channel.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: i < d.revenue_by_channel.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
              <span style={{ fontSize: 18 }}>{UTM_ICONS[c.source] ?? '🔗'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{c.source}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>{c.clients} clientes</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#16A34A' }}>{formatCurrencyCOPCompact(c.revenue_from_clients)}</div>
                <div style={{ fontSize: 11, color: '#64748B' }}>{formatCurrencyCOPCompact(c.revenue_per_client)}/cliente</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* UTM por fuente */}
      {Array.isArray(d.utm_by_source) && d.utm_by_source.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>Tráfico por fuente</div>
          {(d.utm_by_source as Array<Record<string, unknown>>).map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F8FAFC' }}>
              <span style={{ fontSize: 13, color: '#374151' }}>{UTM_ICONS[s.source as string] ?? '🔗'} {s.source as string}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#2563EB' }}>{s.visits as number} visitas</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab Clientes ─────────────────────────────────────────────────────────────

function TabClientes() {
  const csQ = useBICustomerKPIs();
  const d = csQ.data;
  if (csQ.isLoading) return <Loader />;
  if (!d) return <Error msg={csQ.error?.message} />;

  const hs = d.health_summary as Record<string, number>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Segmentos de salud */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        <MiniKPI label="VIP"       value={hs?.vip ?? 0}     color="#16A34A" />
        <MiniKPI label="Saludables"value={hs?.healthy ?? 0} color="#2563EB" />
        <MiniKPI label="Riesgo"    value={hs?.at_risk ?? 0}  color="#D97706" />
        <MiniKPI label="Inactivos" value={hs?.churned ?? 0}  color="#DC2626" />
      </div>

      {/* NPS */}
      <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>NPS & Satisfacción</div>
        <div style={{ display: 'flex', gap: 14 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: d.nps_score !== null ? (d.nps_score >= 50 ? '#16A34A' : d.nps_score >= 0 ? '#D97706' : '#DC2626') : '#94A3B8' }}>
              {d.nps_score ?? '—'}
            </div>
            <div style={{ fontSize: 11, color: '#64748B' }}>NPS</div>
            <div style={{ fontSize: 10, color: '#94A3B8' }}>{d.nps_label}</div>
          </div>
          <div style={{ flex: 1, borderLeft: '1px solid #F1F5F9', paddingLeft: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#F59E0B' }}>{d.avg_rating ?? '—'}/5</div>
            <div style={{ fontSize: 11, color: '#64748B' }}>{d.total_reviews} reseñas</div>
          </div>
        </div>
      </div>

      {/* Cohortes de retención */}
      {d.cohorts?.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Retención por cohorte</div>
          <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 10 }}>% clientes activos por mes desde adquisición</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', color: '#64748B', padding: '4px 0', fontWeight: 600 }}>Cohorte</th>
                  <th style={{ color: '#64748B', padding: '4px 4px', fontWeight: 600 }}>N</th>
                  {['M0','M1','M2','M3'].map(m => <th key={m} style={{ color: '#64748B', padding: '4px 4px', fontWeight: 600 }}>{m}</th>)}
                </tr>
              </thead>
              <tbody>
                {d.cohorts.slice(-4).map(c => (
                  <tr key={c.cohort}>
                    <td style={{ color: '#374151', padding: '4px 0', fontWeight: 600 }}>{c.label}</td>
                    <td style={{ textAlign: 'center', color: '#374151' }}>{c.size}</td>
                    {c.retention_pct.slice(0, 4).map((pct, i) => (
                      <td key={i} style={{ textAlign: 'center', padding: '4px 4px',
                        color: pct === null ? '#94A3B8' : pct >= 50 ? '#16A34A' : pct >= 20 ? '#D97706' : '#DC2626',
                        fontWeight: pct !== null ? 700 : 400,
                      }}>
                        {pct !== null ? pct + '%' : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab IA ───────────────────────────────────────────────────────────────────

function TabIA() {
  const execQ = useBIExecutiveKPIs();
  const salesQ = useBISalesKPIs();
  const csQ   = useBICustomerKPIs();
  const mktQ  = useBIMarketingKPIs();
  const profQ = useWorkspaceProfitability();

  const [results, setResults] = useState<Record<string, AIResponse | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  async function run(key: string, fn: () => Promise<AIResponse>) {
    setLoading(l => ({ ...l, [key]: true }));
    try {
      const r = await fn();
      setResults(prev => ({ ...prev, [key]: r }));
    } catch (e: unknown) {
      setResults(prev => ({ ...prev, [key]: { text: (e as Error).message } as unknown as AIResponse }));
    } finally {
      setLoading(l => ({ ...l, [key]: false }));
    }
  }

  const hasData = execQ.data && salesQ.data && csQ.data && mktQ.data && profQ.data;

  const IA_ACTIONS = [
    {
      key: 'summary',
      label: 'Resumen ejecutivo',
      icon: '📊',
      desc: 'Estado general del negocio en 1 párrafo',
      fn:  () => generateExecutiveSummary(execQ.data!),
    },
    {
      key: 'forecast',
      label: 'Forecast de negocio',
      icon: '📈',
      desc: 'Proyección de ingresos próximos 3 meses (rango min-max)',
      fn:  () => generateBusinessForecast(salesQ.data!, profQ.data!),
    },
    {
      key: 'risk',
      label: 'Evaluación de riesgos',
      icon: '⚠️',
      desc: 'Riesgos del negocio detectados por IA',
      fn:  () => generateRiskAssessment(csQ.data!, profQ.data!),
    },
    {
      key: 'growth',
      label: 'Recomendaciones de crecimiento',
      icon: '🚀',
      desc: 'Oportunidades y quick wins de crecimiento',
      fn:  () => generateGrowthRecommendations(mktQ.data!, salesQ.data!),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'linear-gradient(135deg, #1E1B4B, #4338CA)', borderRadius: 16, padding: '16px 18px', color: '#fff' }}>
        <div style={{ fontSize: 24, marginBottom: 6 }}>🤖</div>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Análisis IA del Negocio</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.75)', marginTop: 4, lineHeight: 1.5 }}>
          4 análisis disponibles · 3 créditos IA cada uno · Solo plan PREMIUM
        </div>
      </div>

      {!hasData && (
        <div style={{ background: '#FFF7ED', borderRadius: 12, padding: '10px 14px', fontSize: 12, color: '#92400E' }}>
          Cargando datos del KPI Engine para alimentar la IA...
        </div>
      )}

      {IA_ACTIONS.map(action => {
        const res = results[action.key];
        let parsed: Record<string, unknown> | null = null;
        if (res?.text) {
          try {
            const json = res.text.match(/\{[\s\S]*\}/)?.[0] ?? res.text;
            parsed = JSON.parse(json);
          } catch { /* texto libre */ }
        }

        return (
          <div key={action.key} style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 22 }}>{action.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{action.label}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>{action.desc}</div>
              </div>
            </div>

            {!res && (
              <button
                onClick={() => run(action.key, action.fn)}
                disabled={!hasData || loading[action.key]}
                style={{
                  width: '100%', padding: '10px 0', borderRadius: 12, border: 'none',
                  background: hasData ? '#4338CA' : '#E2E8F0',
                  color: hasData ? '#fff' : '#94A3B8',
                  fontWeight: 700, fontSize: 13, cursor: hasData ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                {loading[action.key] ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Analizando...</> : <>Generar (3 créditos)</>}
              </button>
            )}

            {parsed && (
              <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 12, fontSize: 12, color: '#374151', lineHeight: 1.6 }}>
                {Object.entries(parsed).slice(0, 4).map(([k, v]) => (
                  <div key={k} style={{ marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, color: '#0F172A', textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}: </span>
                    {Array.isArray(v) ? (v as unknown[]).map((x, i) => (
                      <div key={i} style={{ paddingLeft: 12, color: '#374151' }}>• {typeof x === 'object' ? JSON.stringify(x) : String(x)}</div>
                    )) : String(v)}
                  </div>
                ))}
                <button onClick={() => setResults(p => ({ ...p, [action.key]: null }))}
                  style={{ marginTop: 8, background: 'none', border: 'none', color: '#6366F1', fontSize: 11, cursor: 'pointer' }}>
                  Regenerar
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, color, bg, change }: {
  label: string; value: string | number; sub?: string;
  color: string; bg: string; change?: number | null;
}) {
  return (
    <div style={{ background: bg, borderRadius: 14, padding: '12px 12px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
      <div style={{ fontSize: 18, fontWeight: 900, color }}>{value}</div>
      {change !== undefined && change !== null && (
        <div style={{ fontSize: 11, fontWeight: 700, color: change >= 0 ? '#16A34A' : '#DC2626', marginTop: 1 }}>
          {pct(change, '% vs anterior')}
        </div>
      )}
      {sub && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{sub}</div>}
      <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 3 }}>{label}</div>
    </div>
  );
}

function MiniKPI({ label, value, color = '#64748B' }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '10px 8px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: '#94A3B8' }}>{label}</div>
    </div>
  );
}

function Loader() {
  return <div style={{ padding: 32, textAlign: 'center', color: '#818CF8' }}><Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} /></div>;
}

function Error({ msg }: { msg?: string }) {
  return <div style={{ padding: 24, textAlign: 'center', color: '#DC2626', fontSize: 13 }}>{msg ?? 'Error al cargar datos'}</div>;
}
