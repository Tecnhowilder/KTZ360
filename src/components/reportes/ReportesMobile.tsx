/**
 * ReportesMobile — Centro de Inteligencia Sprint 5
 * ZERO TRUST: ningún KPI se calcula en frontend.
 * Todo dato viene de RPCs backend (useReports hooks).
 * Cálculos eliminados: conversión, ranking, funnel, series — ahora son del servidor.
 */
import { useState } from 'react';
import {
  Lock, TrendingUp, TrendingDown, Users,
  Target, ChevronRight, Download, AlertTriangle,
  BarChart2, Sparkles, Calendar,
} from 'lucide-react';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useUI } from '../../features/app/UIProvider';
import { useFeatureAccess } from '../../hooks/usePermissions';
import {
  useReportsSummary, useFunnelReport, useServicesReport,
  useClientsReport, useSmartAlerts, useExportReport,
} from '../../hooks/useReports';
import { formatCurrencyCOPCompact } from '../../lib/currency';
import type { ReportPeriodPreset } from '../../services/reports';

// ─── Constantes ───────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { key: ReportPeriodPreset; label: string }[] = [
  { key: 'mes_actual',    label: 'Este mes' },
  { key: 'mes_anterior',  label: 'Mes anterior' },
  { key: 'ultimos_30',    label: 'Últimos 30 días' },
  { key: 'ultimos_90',    label: 'Últimos 90 días' },
  { key: 'este_año',      label: 'Este año' },
];

const SECTIONS = [
  { key: 'ventas',       label: 'Ventas',       icon: TrendingUp,  pro: false },
  { key: 'conversion',   label: 'Conversión',   icon: Target,      pro: true  },
  { key: 'clientes',     label: 'Clientes',     icon: Users,       pro: true  },
  { key: 'servicios',    label: 'Servicios',    icon: BarChart2,   pro: true  },
  { key: 'ia',           label: 'IA Insights',  icon: Sparkles,    pro: true  },
] as const;

type SectionKey = typeof SECTIONS[number]['key'];

const CARD: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,.05)',
};

// ─── Trend badge ──────────────────────────────────────────────────────────────

function Trend({ curr, prev, inverse = false }: { curr: number; prev: number; inverse?: boolean }) {
  if (prev === 0) return null;
  const pct  = Math.round(((curr - prev) / prev) * 100);
  const up   = pct >= 0;
  const good = inverse ? !up : up;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: good ? '#16A34A' : '#DC2626' }}>
      {up ? <TrendingUp size={11}/> : <TrendingDown size={11}/>}
      {up ? '+' : ''}{pct}% vs período ant.
    </span>
  );
}

// ─── Sección: Ventas ──────────────────────────────────────────────────────────

function SeccionVentas({ preset }: { preset: ReportPeriodPreset }) {
  const { workspace } = useWorkspace();
  void workspace;
  const summaryQ = useReportsSummary(preset);

  if (summaryQ.isLoading) {
    return <Skeleton lines={4} />;
  }
  if (summaryQ.isError || !summaryQ.data) {
    return <ErrorCard message="Error al cargar datos de ventas" />;
  }

  const d   = summaryQ.data;
  const k   = d.kpis;
  const vs  = d.vs_periodo_anterior;
  const serie = d.serie_mensual ?? [];

  const maxVal = Math.max(1, ...serie.map(m => m.valor_cotizado));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* KPIs principales */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <KpiBox
          label="Valor cotizado"
          value={formatCurrencyCOPCompact(k.valor_cotizado)}
          color="#2563EB"
          trend={vs ? <Trend curr={k.valor_cotizado} prev={vs.valor_cotizado_prev} /> : undefined}
        />
        <KpiBox
          label="Valor aprobado"
          value={formatCurrencyCOPCompact(k.valor_aprobado)}
          color="#16A34A"
          trend={vs ? <Trend curr={k.valor_aprobado} prev={vs.valor_cotizado_prev * (vs.aprobadas_prev / Math.max(vs.cotizaciones_creadas_prev, 1))} /> : undefined}
        />
        <KpiBox
          label="Cotizaciones"
          value={String(k.cotizaciones_creadas)}
          color="#7C3AED"
          trend={vs ? <Trend curr={k.cotizaciones_creadas} prev={vs.cotizaciones_creadas_prev} /> : undefined}
        />
        <KpiBox
          label="Aprobadas"
          value={String(k.cotizaciones_aprobadas)}
          color="#0891B2"
          trend={vs ? <Trend curr={k.cotizaciones_aprobadas} prev={vs.aprobadas_prev} /> : undefined}
        />
        <KpiBox label="Rechazadas" value={String(k.cotizaciones_rechazadas)} color="#DC2626" />
        <KpiBox label="Cierre prom." value={k.tiempo_promedio_cierre_dias > 0 ? `${k.tiempo_promedio_cierre_dias}d` : '—'} color="#64748B" />
      </div>

      {/* Serie mensual — cotizado vs aprobado */}
      {serie.length > 0 && (
        <div style={CARD}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Cotizado vs Aprobado por mes</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100 }}>
            {serie.slice(-6).map((m) => (
              <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', height: 80 }}>
                  {/* Cotizado */}
                  <div style={{
                    flex: 1, borderRadius: '4px 4px 0 0', background: '#BFD3FF',
                    height: `${Math.round((m.valor_cotizado / maxVal) * 100)}%`, minHeight: 3,
                  }} />
                  {/* Aprobado */}
                  <div style={{
                    flex: 1, borderRadius: '4px 4px 0 0', background: '#2563EB',
                    height: `${Math.round((m.valor_aprobado / maxVal) * 100)}%`, minHeight: m.valor_aprobado > 0 ? 3 : 0,
                  }} />
                </div>
                <div style={{ fontSize: 9, color: '#94A3B8', whiteSpace: 'nowrap' }}>{m.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#64748B' }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: '#BFD3FF' }} /> Cotizado
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#64748B' }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: '#2563EB' }} /> Aprobado
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sección: Conversión (embudo) ─────────────────────────────────────────────

function SeccionConversion({ preset }: { preset: ReportPeriodPreset }) {
  const funnelQ = useFunnelReport(preset);

  if (funnelQ.isLoading) return <Skeleton lines={5} />;
  if (funnelQ.isError) return <ProRequired />;

  const stages  = funnelQ.data?.stages ?? [];
  const resumen = funnelQ.data?.resumen;
  const active  = stages.filter(s => !['borrador','rechazada','vencida'].includes(s.status));
  void active;

  const COLORS: Record<string, string> = {
    borrador: '#94A3B8', enviada: '#3B82F6', vista: '#06B6D4',
    negociacion: '#F59E0B', aprobada: '#22C55E', rechazada: '#EF4444', vencida: '#CBD5E1',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Métricas rápidas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <KpiBox label="Tasa de cierre" value={`${resumen?.tasa_cierre ?? 0}%`} color="#22C55E" />
        <KpiBox label="Tasa de vista" value={`${resumen?.tasa_vista ?? 0}%`} color="#0891B2" />
        <KpiBox label="En pipeline" value={String(resumen?.total_en_pipeline ?? 0)} color="#7C3AED" />
        <KpiBox label="Valor en juego" value={formatCurrencyCOPCompact(resumen?.valor_en_pipeline ?? 0)} color="#D97706" />
      </div>

      {/* Embudo horizontal */}
      <div style={CARD}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 14 }}>Embudo comercial</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stages.map(s => (
            <div key={s.status}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[s.status] ?? '#94A3B8', display: 'inline-block' }} />
                  <span style={{ fontWeight: 600, color: '#374151' }}>{s.label}</span>
                </div>
                <div style={{ display: 'flex', gap: 10, color: '#64748B' }}>
                  <span style={{ fontWeight: 700, color: COLORS[s.status] }}>{s.count}</span>
                  <span>{s.conversion_from_total}%</span>
                  <span>{formatCurrencyCOPCompact(s.valor)}</span>
                </div>
              </div>
              <div style={{ height: 6, background: '#F1F5F9', borderRadius: 99 }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  background: COLORS[s.status] ?? '#94A3B8',
                  width: `${Math.max(1, Math.round((s.count / Math.max(stages[0]?.count ?? 1, 1)) * 100))}%`,
                  transition: 'width .4s ease',
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Sección: Clientes ────────────────────────────────────────────────────────

function SeccionClientes({ preset }: { preset: ReportPeriodPreset }) {
  const clientsQ = useClientsReport(preset);

  if (clientsQ.isLoading) return <Skeleton lines={4} />;
  if (clientsQ.isError) return <ProRequired />;

  const r   = clientsQ.data?.resumen;
  const top = clientsQ.data?.top_clientes ?? [];
  const inactivos = clientsQ.data?.inactivos_detalle ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        <KpiBox label="Total"       value={String(r?.total ?? 0)}       color="#0F172A" />
        <KpiBox label="Nuevos"      value={String(r?.nuevos ?? 0)}      color="#2563EB" />
        <KpiBox label="Activos"     value={String(r?.activos ?? 0)}     color="#16A34A" />
        <KpiBox label="Inactivos"   value={String(r?.inactivos ?? 0)}   color="#EF4444" />
        <KpiBox label="Recurrentes" value={String(r?.recurrentes ?? 0)} color="#7C3AED" />
      </div>

      {/* Top clientes */}
      {top.length > 0 && (
        <div style={CARD}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Top clientes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {top.slice(0, 5).map((c, i) => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: i > 0 ? '10px 0 0' : '0',
                borderTop: i > 0 ? '1px solid #F1F5F9' : 'none',
                paddingBottom: i < Math.min(top.length, 5) - 1 ? 10 : 0,
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#CBD5E1', width: 14 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>{c.cotizaciones} cotiz. · {c.tasa_conversion}% conv.</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#16A34A', flexShrink: 0 }}>
                  {formatCurrencyCOPCompact(c.valor_aprobado)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clientes en riesgo */}
      {inactivos.length > 0 && (
        <div style={{ ...CARD, border: '1px solid #FECACA' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <AlertTriangle size={14} color="#DC2626" />
            <div style={{ fontSize: 13, fontWeight: 800, color: '#DC2626' }}>Clientes en riesgo ({inactivos.length})</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {inactivos.slice(0, 5).map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>Sin actividad hace {c.dias_sin_actividad} días</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B' }}>{formatCurrencyCOPCompact(c.total_aprobado)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sección: Servicios ───────────────────────────────────────────────────────

function SeccionServicios({ preset }: { preset: ReportPeriodPreset }) {
  const servicesQ = useServicesReport(preset);

  if (servicesQ.isLoading) return <Skeleton lines={5} />;
  if (servicesQ.isError) return <ProRequired />;

  const services = servicesQ.data?.services ?? [];
  const maxQ = Math.max(1, ...services.map(s => s.veces_cotizado));

  return (
    <div style={CARD}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 14 }}>Servicios — cotizado vs vendido</div>
      {services.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0', color: '#94A3B8', fontSize: 13 }}>Sin datos en el período</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {services.slice(0, 8).map(s => (
            <div key={s.service_name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                <span style={{ fontWeight: 700, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>{s.service_name}</span>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, color: '#64748B' }}>
                  <span>{s.veces_cotizado}x</span>
                  <span style={{ color: s.tasa_conversion >= 50 ? '#16A34A' : s.tasa_conversion >= 25 ? '#D97706' : '#EF4444', fontWeight: 700 }}>{s.tasa_conversion}%</span>
                </div>
              </div>
              <div style={{ height: 6, background: '#F1F5F9', borderRadius: 99, position: 'relative' }}>
                <div style={{ position: 'absolute', height: '100%', borderRadius: 99, background: '#BFD3FF', width: `${Math.round((s.veces_cotizado / maxQ) * 100)}%` }} />
                <div style={{ position: 'absolute', height: '100%', borderRadius: 99, background: '#2563EB', width: `${Math.round((s.veces_vendido / maxQ) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sección: IA Insights ─────────────────────────────────────────────────────

function SeccionIA({ preset }: { preset: ReportPeriodPreset }) {
  void preset;
  const alertsQ  = useSmartAlerts();
  const exportM  = useExportReport();

  const alerts = alertsQ.data?.alerts ?? [];

  const SEVERITY_CONFIG = {
    high:   { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
    medium: { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
    low:    { color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Alertas inteligentes */}
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Sparkles size={16} color="#7C3AED" />
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>Alertas del negocio</div>
          {alertsQ.isLoading && <div style={{ fontSize: 11, color: '#94A3B8' }}>Analizando...</div>}
        </div>
        {alerts.length === 0 && !alertsQ.isLoading ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>✅</div>
            <div style={{ fontSize: 13, color: '#16A34A', fontWeight: 700 }}>Todo en orden</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>Sin alertas activas en este momento</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alerts.map((a, i) => {
              const cfg = SEVERITY_CONFIG[a.severity] ?? SEVERITY_CONFIG.low;
              return (
                <div key={i} style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: cfg.color, marginBottom: 4 }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, marginBottom: 6 }}>{a.message}</div>
                  <div style={{ fontSize: 11, color: cfg.color, fontWeight: 600 }}>→ {a.action}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Exportaciones */}
      <div style={CARD}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Exportar reporte</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { type: 'summary'  as const, label: 'Resumen general', fmt: 'csv' as const },
            { type: 'funnel'   as const, label: 'Embudo comercial', fmt: 'csv' as const },
            { type: 'services' as const, label: 'Servicios', fmt: 'csv' as const },
            { type: 'clients'  as const, label: 'Clientes', fmt: 'csv' as const },
            { type: 'summary'  as const, label: 'Reporte ejecutivo PDF', fmt: 'pdf' as const },
          ].map((e, i) => (
            <button
              key={i}
              disabled={exportM.isPending}
              onClick={() => exportM.mutate({ reportType: e.type, format: e.fmt })}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '11px 14px', borderRadius: 12,
                border: '1px solid #E2E8F0', background: exportM.isPending ? '#F8FAFC' : '#fff',
                cursor: exportM.isPending ? 'not-allowed' : 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Download size={14} color="#2563EB" />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{e.label}</span>
              </div>
              <span style={{
                fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                background: e.fmt === 'pdf' ? '#FEF3C7' : '#EFF6FF',
                color: e.fmt === 'pdf' ? '#92400E' : '#1D4ED8',
              }}>{e.fmt.toUpperCase()}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Utilitarios UI ───────────────────────────────────────────────────────────

function KpiBox({ label, value, color, trend }: { label: string; value: string; color: string; trend?: React.ReactNode }) {
  return (
    <div style={{ background: '#F8FAFC', borderRadius: 12, padding: '12px 12px' }}>
      <div style={{ fontSize: 10.5, color: '#94A3B8', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color, letterSpacing: '-0.5px' }}>{value}</div>
      {trend && <div style={{ marginTop: 4 }}>{trend}</div>}
    </div>
  );
}

function Skeleton({ lines }: { lines: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ height: 56, borderRadius: 12, background: '#F1F5F9', animation: 'pulse 1.5s ease-in-out infinite' }} />
      ))}
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div style={{ padding: 16, background: '#FEF2F2', borderRadius: 12, border: '1px solid #FECACA' }}>
      <div style={{ fontSize: 13, color: '#DC2626' }}>{message}</div>
    </div>
  );
}

function ProRequired() {
  const { openUpgradeModal } = useUI();
  return (
    <div style={{ ...CARD, background: '#0F172A', border: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Lock size={16} color="#94A3B8" />
        <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>Reportes avanzados — PRO</div>
      </div>
      <p style={{ fontSize: 12.5, color: '#94A3B8', lineHeight: 1.5, margin: '0 0 14px' }}>
        Accede al embudo de conversión, análisis de clientes, servicios y alertas inteligentes.
      </p>
      <button
        onClick={() => openUpgradeModal({ title: 'Reportes avanzados', message: 'Accede a análisis completos con el plan PRO.', targetPlan: 'pro', ctaLabel: 'Actualizar a PRO' })}
        style={{ border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 13, padding: '10px 18px', borderRadius: 12, cursor: 'pointer' }}
      >
        Activar PRO →
      </button>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ReportesMobile() {
  const { openUpgradeModal } = useUI();
  const advAccess = useFeatureAccess('advanced_reports_enabled');

  const [section,     setSection]     = useState<SectionKey>('ventas');
  const [preset,      setPreset]      = useState<ReportPeriodPreset>('mes_actual');
  const [periodOpen,  setPeriodOpen]  = useState(false);

  const isPro = advAccess.data !== false;

  void SECTIONS.find(s => s.key === section);
  const periodLabel   = PERIOD_OPTIONS.find(p => p.key === preset)?.label ?? 'Este mes';

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #EEF2F7', padding: '12px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: 0 }}>Reportes</h1>
            <p style={{ fontSize: 11.5, color: '#64748B', margin: '2px 0 0' }}>Centro de Inteligencia Comercial</p>
          </div>
          {/* Selector de período */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setPeriodOpen(p => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                border: '1px solid #E2E8F0', background: '#F8FAFC', borderRadius: 10,
                padding: '7px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#374151',
              }}
            >
              <Calendar size={13} color="#2563EB" />
              {periodLabel}
              <ChevronRight size={12} color="#94A3B8" style={{ transform: periodOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }} />
            </button>
            {periodOpen && (
              <>
                <div onClick={() => setPeriodOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                <div style={{
                  position: 'absolute', top: '110%', right: 0, zIndex: 30,
                  background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0',
                  boxShadow: '0 8px 24px rgba(15,23,42,0.12)', overflow: 'hidden', minWidth: 160,
                }}>
                  {PERIOD_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => { setPreset(opt.key); setPeriodOpen(false); }}
                      disabled={opt.key !== 'mes_actual' && !isPro}
                      style={{
                        width: '100%', padding: '11px 14px', border: 'none',
                        background: preset === opt.key ? '#EFF6FF' : 'transparent',
                        cursor: opt.key !== 'mes_actual' && !isPro ? 'not-allowed' : 'pointer',
                        fontSize: 13, fontWeight: preset === opt.key ? 700 : 500,
                        color: preset === opt.key ? '#2563EB' : '#0F172A',
                        textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        opacity: opt.key !== 'mes_actual' && !isPro ? 0.5 : 1,
                      }}
                    >
                      {opt.label}
                      {opt.key !== 'mes_actual' && !isPro && <Lock size={11} color="#94A3B8" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tabs de sección */}
        <div style={{ display: 'flex', overflowX: 'auto', gap: 4, paddingBottom: 1 }}>
          {SECTIONS.map(s => {
            const isActive  = section === s.key;
            const blocked   = s.pro && !isPro;
            return (
              <button
                key={s.key}
                onClick={() => {
                  if (blocked) {
                    openUpgradeModal({ title: `${s.label} — PRO`, message: 'Accede a reportes avanzados con el plan PRO.', targetPlan: 'pro', ctaLabel: 'Ver planes' });
                    return;
                  }
                  setSection(s.key);
                }}
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                  padding: '8px 12px', borderRadius: '8px 8px 0 0', border: 'none',
                  background: isActive ? '#EFF6FF' : 'transparent',
                  borderBottom: isActive ? '2px solid #2563EB' : '2px solid transparent',
                  cursor: 'pointer', position: 'relative',
                }}
              >
                <s.icon size={13} color={isActive ? '#2563EB' : '#94A3B8'} />
                <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? '#2563EB' : '#64748B' }}>
                  {s.label}
                </span>
                {blocked && <Lock size={9} color="#94A3B8" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Contenido de sección activa */}
      <div style={{ padding: '14px 16px 0' }}>
        {section === 'ventas'     && <SeccionVentas     preset={preset} />}
        {section === 'conversion' && (isPro ? <SeccionConversion preset={preset} /> : <ProRequired />)}
        {section === 'clientes'   && (isPro ? <SeccionClientes   preset={preset} /> : <ProRequired />)}
        {section === 'servicios'  && (isPro ? <SeccionServicios  preset={preset} /> : <ProRequired />)}
        {section === 'ia'         && (isPro ? <SeccionIA         preset={preset} /> : <ProRequired />)}
      </div>
    </div>
  );
}
