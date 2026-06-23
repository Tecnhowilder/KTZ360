/**
 * FinancePage — Dashboard Finanzas Sprint 18
 * /app/finanzas — Mobile-first 390px
 * Pregunta central: "¿Cuánto dinero gano realmente?"
 * Reutiliza: calc_snapshot, aiCommercial.ts, automation_rules, Alegra (Sprint 12),
 *            useIntegrations() (Sprint 11), forecastFinance() (Sprint 18)
 * NO duplica: get_reports_summary, dashboards existentes
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, TrendingUp, DollarSign, Target, AlertTriangle,
  FileText, Zap, ChevronRight, Info, Link2, Loader2,
} from 'lucide-react';
import { useFinanceDashboard, useServiceProfit, useWorkspaceProfitability } from '../hooks/useFinance';
import { useIntegrations } from '../hooks/useIntegrations';
import { formatCurrencyCOP, formatCurrencyCOPCompact } from '../lib/currency';
import { healthColor, healthLabel, marginColor } from '../services/finance';
import { forecastFinance } from '../services/aiCommercial';
import type { AIResponse } from '../services/aiStudio';

type Tab = 'resumen' | 'rentabilidad' | 'pedidos' | 'integraciones' | 'forecast';

// ─── Componente principal ─────────────────────────────────────────────────────

export function FinancePage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('resumen');
  const dashQ = useFinanceDashboard();
  const d     = dashQ.data;

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'resumen',       label: 'Resumen',    icon: <TrendingUp size={13} /> },
    { key: 'rentabilidad',  label: 'Rentab.',    icon: <Target size={13} /> },
    { key: 'pedidos',       label: 'Pedidos',    icon: <FileText size={13} /> },
    { key: 'integraciones', label: 'Conectado',  icon: <Link2 size={13} /> },
    { key: 'forecast',      label: 'Forecast',   icon: <Zap size={13} /> },
  ];

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px 0', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#0F172A' }}><ArrowLeft size={20} /></button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              <DollarSign size={18} color="#16A34A" /> Finanzas
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 1 }}>Ingresos · Costos · Utilidad · Margen</div>
          </div>
          {d && (
            <div style={{ background: healthColor(d.financial_health) + '20', color: healthColor(d.financial_health), fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99 }}>
              {healthLabel(d.financial_health)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
              padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? '#16A34A' : '#94A3B8',
              borderBottom: tab === t.key ? '2px solid #16A34A' : '2px solid transparent',
            }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        {dashQ.isLoading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>Calculando rentabilidad...</div>
        ) : dashQ.isError ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#DC2626' }}>Error al cargar datos financieros</div>
        ) : (
          <>
            {tab === 'resumen'      && <TabResumen data={d!} />}
            {tab === 'rentabilidad' && <TabRentabilidad data={d!} />}
            {tab === 'pedidos'      && <TabPedidos data={d!} />}
            {tab === 'integraciones' && <TabIntegraciones data={d!} navigate={navigate} />}
            {tab === 'forecast'     && <TabForecast />}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tab Resumen Ejecutivo ────────────────────────────────────────────────────

function TabResumen({ data }: { data: ReturnType<typeof useFinanceDashboard>['data'] }) {
  if (!data) return null;
  const s = data.summary;

  const kpis = [
    {
      label: 'Ingresos comprometidos',
      value: formatCurrencyCOPCompact(s.total_revenue),
      sub:   s.quotes_approved + ' cotizaciones aprobadas',
      color: '#16A34A', bg: '#F0FDF4',
      change: s.revenue_change_pct,
    },
    {
      label: 'Costo directo estimado',
      value: formatCurrencyCOPCompact(s.total_direct_cost),
      sub:   'Materiales + MO + Equipo',
      color: '#2563EB', bg: '#EFF6FF',
      change: null,
    },
    {
      label: 'Utilidad estimada (AIU-U)',
      value: formatCurrencyCOPCompact(s.estimated_profit),
      sub:   'Margen ' + s.estimated_margin_pct + '%',
      color: marginColor(s.estimated_margin_pct), bg: '#FFF',
      change: s.profit_change_pct,
    },
    {
      label: 'Margen bruto estimado',
      value: s.gross_margin_pct + '%',
      sub:   '(Ingresos − Costo directo) / Ingresos',
      color: marginColor(s.gross_margin_pct), bg: '#FFF',
      change: null,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Aviso margen estimado */}
      <div style={{ background: '#FFF7ED', borderRadius: 12, padding: '10px 12px', display: 'flex', gap: 8 }}>
        <Info size={15} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: '#92400E', lineHeight: 1.5 }}>
          <strong>Margen estimado</strong> — Basado en el AIU configurado en las cotizaciones aprobadas.<br/>
          {s.has_real_costs
            ? 'Tienes costos reales registrados. El margen real se muestra abajo.'
            : 'Registra costos reales en los pedidos para calcular el margen real.'}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 14, padding: '12px 12px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: k.color }}>{k.value}</div>
            {k.change !== null && k.change !== undefined && (
              <div style={{ fontSize: 11, color: k.change >= 0 ? '#16A34A' : '#DC2626', fontWeight: 700, marginTop: 1 }}>
                {k.change >= 0 ? '▲' : '▼'} {Math.abs(k.change)}% vs período anterior
              </div>
            )}
            <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 3, lineHeight: 1.4 }}>{k.sub}</div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Margen real (si hay costos reales) */}
      {s.has_real_costs && s.real_margin_pct !== null && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)', border: `2px solid ${marginColor(s.real_margin_pct)}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 6 }}>MARGEN REAL (con costos registrados)</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, color: marginColor(s.real_margin_pct) }}>{s.real_margin_pct}%</div>
              <div style={{ fontSize: 12, color: '#64748B' }}>Utilidad real: {formatCurrencyCOPCompact(s.real_profit ?? 0)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: '#64748B' }}>Costo real total</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#DC2626' }}>{formatCurrencyCOPCompact(s.real_cost_total)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Tendencia mensual */}
      {data.monthly_trend.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Tendencia mensual</div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            {data.monthly_trend.map(m => (
              <div key={m.month} style={{ minWidth: 72, textAlign: 'center', flexShrink: 0 }}>
                <div style={{ height: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 4 }}>
                  <div style={{
                    width: 28,
                    height: m.revenue > 0 ? Math.max(8, Math.round((m.util_amount / Math.max(...data.monthly_trend.map(x => x.revenue), 1)) * 56)) : 8,
                    background: marginColor(m.margin_pct),
                    borderRadius: '4px 4px 0 0',
                    minHeight: 4,
                  }} />
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: marginColor(m.margin_pct) }}>{m.margin_pct}%</div>
                <div style={{ fontSize: 10, color: '#94A3B8' }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab Rentabilidad ─────────────────────────────────────────────────────────

function TabRentabilidad({ data }: { data: ReturnType<typeof useFinanceDashboard>['data'] }) {
  const serviceQ = useServiceProfit();
  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Top clientes */}
      {data.top_clients.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 10 }}>Top clientes por ingreso</div>
          {data.top_clients.map((c, i) => (
            <div key={c.client_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < data.top_clients.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#F0FDF4', color: '#16A34A', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{c.client_name}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>{c.quote_count} cotizaciones</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#16A34A' }}>{formatCurrencyCOPCompact(c.revenue)}</div>
                <div style={{ fontSize: 11, color: marginColor(c.margin_pct), fontWeight: 700 }}>{c.margin_pct}% margen</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Clientes bajo margen */}
      {data.low_margin_clients.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)', border: '1px solid #FEE2E2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <AlertTriangle size={14} color="#DC2626" />
            <div style={{ fontSize: 13, fontWeight: 800, color: '#DC2626' }}>Clientes de bajo margen (&lt;10%)</div>
          </div>
          {data.low_margin_clients.map((c, i) => (
            <div key={c.client_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < data.low_margin_clients.length - 1 ? '1px solid #FEE2E2' : 'none' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{c.client_name}</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#64748B' }}>{formatCurrencyCOPCompact(c.revenue)}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#DC2626' }}>{c.margin_pct}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top servicios */}
      {serviceQ.data?.services && serviceQ.data.services.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 10 }}>Rentabilidad por servicio</div>
          {serviceQ.data.services.slice(0, 6).map((s, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{s.service_name}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#94A3B8' }}>{s.quote_count} cot.</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: marginColor(s.margin_pct) }}>{s.margin_pct}%</span>
                </div>
              </div>
              <div style={{ height: 5, background: '#F1F5F9', borderRadius: 99 }}>
                <div style={{ width: `${Math.min(100, Math.max(5, s.margin_pct * 3))}%`, height: '100%', background: marginColor(s.margin_pct), borderRadius: 99 }} />
              </div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                Ingreso: {formatCurrencyCOPCompact(s.total_revenue)} · Costo: {formatCurrencyCOPCompact(s.total_direct_cost)}
              </div>
            </div>
          ))}
        </div>
      )}

      {data.top_clients.length === 0 && (!serviceQ.data?.services || serviceQ.data.services.length === 0) && (
        <EmptyState icon="📊" title="Sin datos de rentabilidad" sub="Aprueba cotizaciones para ver análisis de rentabilidad por cliente y servicio." />
      )}
    </div>
  );
}

// ─── Tab Pedidos ──────────────────────────────────────────────────────────────

function TabPedidos({ data }: { data: ReturnType<typeof useFinanceDashboard>['data'] }) {
  const navigate = useNavigate();
  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: '#FFF7ED', borderRadius: 12, padding: '10px 12px', display: 'flex', gap: 8 }}>
        <Info size={15} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12, color: '#92400E', lineHeight: 1.5 }}>
          Registra <strong>costos reales</strong> en cada pedido para ver el margen real vs estimado. Ve a un pedido → Costos.
        </div>
      </div>

      {data.low_margin_orders.length > 0 ? (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)', border: '1px solid #FEE2E2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <AlertTriangle size={14} color="#DC2626" />
            <div style={{ fontSize: 13, fontWeight: 800, color: '#DC2626' }}>Pedidos con margen estimado &lt;5%</div>
          </div>
          {data.low_margin_orders.map((o, i) => (
            <button
              key={o.order_id}
              onClick={() => navigate('/app/pedidos/' + o.order_id)}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: i < data.low_margin_orders.length - 1 ? '1px solid #FEE2E2' : 'none', background: 'none', border: 'none', cursor: 'pointer' }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{o.order_number}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>{o.client_name} · {formatCurrencyCOPCompact(o.revenue)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: '#DC2626' }}>{o.margin_pct}%</span>
                <ChevronRight size={14} color="#94A3B8" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState icon="✅" title="Sin pedidos de bajo margen" sub="Todos los pedidos tienen margen estimado mayor al 5%." />
      )}

      <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>¿Cómo calcular el margen real?</div>
        <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.6 }}>
          Ingresa a cualquier pedido y registra los costos reales: materiales usados, horas de mano de obra, equipos alquilados y otros gastos. Shelwi calculará automáticamente el margen real vs el estimado de la cotización.
        </div>
        <button onClick={() => navigate('/app/pedidos')}
          style={{ marginTop: 12, background: '#EFF6FF', color: '#2563EB', border: 'none', borderRadius: 12, padding: '10px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          Ver pedidos activos
        </button>
      </div>
    </div>
  );
}

// ─── Tab Integraciones — Estado de conectividad financiera ───────────────────

function TabIntegraciones({ data, navigate }: { data: ReturnType<typeof useFinanceDashboard>['data']; navigate: ReturnType<typeof useNavigate> }) {
  const intQ = useIntegrations();
  if (!data) return null;

  const integrations = intQ.data?.integrations ?? [];
  const a = data.alegra;

  const FINANCE_INTEGRATIONS = [
    { provider: 'alegra',       label: 'Alegra',         icon: '🧾', desc: 'Facturación electrónica' },
    { provider: 'gmail',        label: 'Gmail',          icon: '✉️', desc: 'Envío de cotizaciones' },
    { provider: 'drive',        label: 'Google Drive',   icon: '📂', desc: 'Documentos y respaldos' },
    { provider: 'onedrive',     label: 'OneDrive',       icon: '☁️', desc: 'Documentos y respaldos' },
    { provider: 'outlook_mail', label: 'Outlook',        icon: '📧', desc: 'Correo empresarial' },
  ];

  const statusFor = (provider: string) =>
    integrations.find(i => i.provider === provider)?.status ?? 'disconnected';

  const statusColor = (s: string) =>
    s === 'connected' ? '#16A34A' : s === 'error' ? '#DC2626' : s === 'pending' ? '#D97706' : '#94A3B8';

  const statusLabel = (s: string) =>
    s === 'connected' ? 'Conectado' : s === 'error' ? 'Error' : s === 'pending' ? 'Pendiente' : 'Desconectado';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Estado general */}
      <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Estado de integraciones financieras</div>
        {FINANCE_INTEGRATIONS.map((fi, i) => {
          const st = statusFor(fi.provider);
          return (
            <div key={fi.provider} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < FINANCE_INTEGRATIONS.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
              <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{fi.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{fi.label}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>{fi.desc}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(st) }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: statusColor(st) }}>{statusLabel(st)}</span>
              </div>
            </div>
          );
        })}
        <button onClick={() => navigate('/app/config/integraciones')}
          style={{ marginTop: 12, width: '100%', background: '#F1F5F9', color: '#374151', border: 'none', borderRadius: 12, padding: '10px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          Gestionar integraciones
        </button>
      </div>

      {/* Resumen facturas Alegra (si conectado) */}
      {a.connected && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 10 }}>Facturas Alegra — período</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
            <div style={{ background: '#EFF6FF', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB' }}>{a.invoices_total}</div>
              <div style={{ fontSize: 10, color: '#64748B' }}>Total</div>
            </div>
            <div style={{ background: '#F0FDF4', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#16A34A' }}>{a.invoices_paid}</div>
              <div style={{ fontSize: 10, color: '#64748B' }}>Pagadas</div>
            </div>
            <div style={{ background: '#FFF7ED', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#D97706' }}>{a.invoices_pending}</div>
              <div style={{ fontSize: 10, color: '#64748B' }}>Pendientes</div>
            </div>
          </div>
          {a.amount_pending > 0 && (
            <div style={{ background: '#FFF7ED', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: '#92400E', fontWeight: 600 }}>Por cobrar</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#D97706' }}>{formatCurrencyCOP(a.amount_pending)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab Forecast IA — Datos reales de rentabilidad ──────────────────────────

function TabForecast() {
  const profQ = useWorkspaceProfitability();
  const [result, setResult] = useState<AIResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runForecast() {
    if (!profQ.data) return;
    setLoading(true);
    setError(null);
    try {
      const res = await forecastFinance(profQ.data);
      setResult(res);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Error al generar forecast');
    } finally {
      setLoading(false);
    }
  }

  let parsed: Record<string, unknown> | null = null;
  if (result?.text) {
    try {
      const json = result.text.match(/\{[\s\S]*\}/)?.[0] ?? result.text;
      parsed = JSON.parse(json);
    } catch { /* texto libre */ }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'linear-gradient(135deg, #1E40AF, #6366F1)', borderRadius: 16, padding: '18px 16px', color: '#fff' }}>
        <div style={{ fontSize: 24, marginBottom: 6 }}>📊</div>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Forecast Financiero IA</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.8)', lineHeight: 1.5 }}>
          Proyecta ingresos, utilidad y riesgos usando tus datos reales de los últimos meses. 3 créditos IA (PREMIUM).
        </div>
      </div>

      {!result && !loading && (
        <button onClick={runForecast} disabled={!profQ.data || profQ.isLoading}
          style={{ background: profQ.data ? '#6366F1' : '#E2E8F0', color: profQ.data ? '#fff' : '#94A3B8', border: 'none', borderRadius: 14, padding: '13px 0', fontWeight: 800, fontSize: 14, cursor: profQ.data ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Zap size={16} /> Generar forecast de 3 meses
        </button>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 24, color: '#6366F1' }}>
          <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
          <div style={{ fontSize: 13, marginTop: 8 }}>Analizando tus datos financieros...</div>
        </div>
      )}

      {error && (
        <div style={{ background: '#FEF2F2', borderRadius: 12, padding: '12px 14px', color: '#DC2626', fontSize: 13 }}>
          {error.includes('créditos') ? '⚠️ Créditos IA insuficientes. Actualiza al plan PREMIUM.' : error}
        </div>
      )}

      {parsed && Array.isArray(parsed.forecast) && (
        <>
          {/* Forecast mensual */}
          <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Proyección 3 meses</div>
            {(parsed.forecast as Array<Record<string, unknown>>).map((m, i) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: i < 2 ? '1px solid #F1F5F9' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{m.month as string}</span>
                  <span style={{ fontSize: 11, color: m.confidence === 'alta' ? '#16A34A' : m.confidence === 'media' ? '#D97706' : '#94A3B8', fontWeight: 600 }}>
                    Confianza {m.confidence as string}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>Ingresos</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#16A34A' }}>{formatCurrencyCOPCompact(m.projected_revenue as number)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>Utilidad</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: marginColor(m.projected_margin_pct as number) }}>{formatCurrencyCOPCompact(m.projected_profit as number)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>Margen</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: marginColor(m.projected_margin_pct as number) }}>{m.projected_margin_pct as number}%</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Insight + tendencia */}
          {parsed.insight && (
            <div style={{ background: '#EEF2FF', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#4338CA', marginBottom: 4 }}>DIAGNÓSTICO</div>
              <div style={{ fontSize: 13, color: '#1E1B4B', lineHeight: 1.5 }}>{parsed.insight as string}</div>
            </div>
          )}

          {/* Riesgos y oportunidades */}
          {Array.isArray(parsed.risks) && parsed.risks.length > 0 && (
            <div style={{ background: '#FEF2F2', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', marginBottom: 6 }}>RIESGOS DETECTADOS</div>
              {(parsed.risks as string[]).map((r, i) => (
                <div key={i} style={{ fontSize: 12, color: '#7F1D1D', marginBottom: 3 }}>• {r}</div>
              ))}
            </div>
          )}

          {Array.isArray(parsed.opportunities) && parsed.opportunities.length > 0 && (
            <div style={{ background: '#F0FDF4', borderRadius: 14, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#16A34A', marginBottom: 6 }}>OPORTUNIDADES</div>
              {(parsed.opportunities as string[]).map((o, i) => (
                <div key={i} style={{ fontSize: 12, color: '#14532D', marginBottom: 3 }}>• {o}</div>
              ))}
            </div>
          )}

          <button onClick={runForecast}
            style={{ background: '#F1F5F9', color: '#374151', border: 'none', borderRadius: 12, padding: '10px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Regenerar forecast (3 créditos)
          </button>
        </>
      )}

      {result?.text && !parsed && (
        <div style={{ background: '#fff', borderRadius: 14, padding: 14, fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {result.text}
        </div>
      )}
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 16px' }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#64748B' }}>{sub}</div>
    </div>
  );
}
