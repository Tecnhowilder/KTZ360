/**
 * IAOperacionesPage — /app/ia/operaciones
 * IA Operativa: detecta riesgos, retrasos, productividad, costos.
 * Reutiliza: aiCommercial.ts, BIOperationsKPIs, FinanceDashboard, BICustomerKPIs.
 * Sin nuevo motor IA. Todo via ai-proxy + check_ai_credits + consume_ai_credits.
 * Mobile-first. Zero Trust: workspace_id del JWT.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, AlertTriangle, Clock, Users, DollarSign,
  ShieldAlert, Zap, Loader2, ChevronRight,
} from 'lucide-react';
import { useBIOperationsKPIs, useBICustomerKPIs } from '../hooks/useBI';
import { useFinanceDashboard, useWorkspaceProfitability } from '../hooks/useFinance';
import {
  detectOperationalRisks,
  detectDelayedWorkOrders,
  detectLowProductivity,
  detectCostOverruns,
  detectAtRiskProjects,
  recommendOperationalActions,
} from '../services/aiCommercial';
import type { AIResponse } from '../services/aiStudio';
import { isAICreditsExhausted, isAIPlanNotIncluded } from '../services/aiStudio';

type Panel = 'riesgos' | 'retrasos' | 'productividad' | 'costos' | 'proyectos' | 'plan';

const PANELS: { key: Panel; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: 'riesgos',       label: 'Riesgos',       icon: <ShieldAlert size={15} />, desc: 'Detección holística de riesgos operativos' },
  { key: 'retrasos',      label: 'Retrasos',       icon: <Clock size={15} />,       desc: 'Análisis de OTs retrasadas por operario' },
  { key: 'productividad', label: 'Productividad',  icon: <Users size={15} />,       desc: 'Rendimiento comparativo del equipo' },
  { key: 'costos',        label: 'Costos',         icon: <DollarSign size={15} />,  desc: 'Desviaciones de costo y sobrecostos' },
  { key: 'proyectos',     label: 'Proyectos',      icon: <AlertTriangle size={15}/>, desc: 'Pedidos y clientes en riesgo' },
  { key: 'plan',          label: 'Plan de acción', icon: <Zap size={15} />,         desc: 'Recomendaciones priorizadas para la semana' },
];

export function IAOperacionesPage() {
  const navigate = useNavigate();
  const opsQ    = useBIOperationsKPIs();
  const finQ    = useFinanceDashboard();
  const profQ   = useWorkspaceProfitability();
  const csQ     = useBICustomerKPIs();

  const loading = opsQ.isLoading || finQ.isLoading || profQ.isLoading || csQ.isLoading;
  const hasData = !!opsQ.data && !!finQ.data && !!profQ.data && !!csQ.data;

  return (
    <div style={{ background: '#0F172A', minHeight: '100dvh', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 16px', background: '#0F172A' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button onClick={() => navigate('/app/ia')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8' }}><ArrowLeft size={20} /></button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
              🤖 IA Operativa
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 1 }}>Riesgos · Retrasos · Productividad · Costos · Proyectos</div>
          </div>
          <div style={{ background: '#1E293B', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: '#818CF8', fontWeight: 700 }}>3 créditos/análisis</div>
        </div>

        {/* Estado de datos */}
        {loading && (
          <div style={{ background: '#1E293B', borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <Loader2 size={14} color="#818CF8" style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 13, color: '#94A3B8' }}>Cargando datos operativos...</span>
          </div>
        )}
        {!loading && !hasData && (
          <div style={{ background: '#1E293B', borderRadius: 12, padding: '12px 14px', fontSize: 13, color: '#F59E0B' }}>
            ⚠️ Sin datos suficientes. Registra pedidos, OTs y costos para activar la IA operativa.
          </div>
        )}
        {!loading && hasData && (
          <div style={{ background: '#1E293B', borderRadius: 12, padding: '10px 14px', display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 12, color: '#4ADE80' }}>✅ Datos listos</span>
            <span style={{ fontSize: 12, color: '#64748B' }}>·</span>
            <span style={{ fontSize: 12, color: '#94A3B8' }}>
              {(opsQ.data?.work_orders_status as Record<string,number>)?.en_progreso ?? 0} OTs activas
            </span>
            <span style={{ fontSize: 12, color: '#64748B' }}>·</span>
            <span style={{ fontSize: 12, color: '#94A3B8' }}>
              {opsQ.data?.productivity_by_member?.length ?? 0} operarios
            </span>
          </div>
        )}
      </div>

      {/* Paneles de análisis */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {PANELS.map(p => (
          <AnalysisPanel
            key={p.key}
            panel={p}
            enabled={hasData}
            opsData={opsQ.data}
            finData={finQ.data}
            profData={profQ.data}
            csData={csQ.data}
            navigate={navigate}
          />
        ))}
      </div>
    </div>
  );
}

// ─── AnalysisPanel ────────────────────────────────────────────────────────────

function AnalysisPanel({
  panel, enabled, opsData, finData, profData, csData, navigate,
}: {
  panel: typeof PANELS[0];
  enabled: boolean;
  opsData: ReturnType<typeof useBIOperationsKPIs>['data'];
  finData: ReturnType<typeof useFinanceDashboard>['data'];
  profData: ReturnType<typeof useWorkspaceProfitability>['data'];
  csData: ReturnType<typeof useBICustomerKPIs>['data'];
  navigate: (path: string) => void;
}) {
  const [result, setResult] = useState<AIResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!enabled || !opsData || !finData || !profData || !csData) return;
    setLoading(true);
    setError(null);
    try {
      let res: AIResponse;
      switch (panel.key) {
        case 'riesgos':
          res = await detectOperationalRisks(opsData, finData);
          break;
        case 'retrasos':
          res = await detectDelayedWorkOrders(opsData);
          break;
        case 'productividad':
          res = await detectLowProductivity(opsData);
          break;
        case 'costos':
          res = await detectCostOverruns(finData, profData);
          break;
        case 'proyectos':
          res = await detectAtRiskProjects(finData, csData);
          break;
        case 'plan': {
          // Para el plan necesitamos los resultados de los otros análisis
          const [r1, r2, r3, r4] = await Promise.allSettled([
            detectOperationalRisks(opsData, finData),
            detectDelayedWorkOrders(opsData),
            detectLowProductivity(opsData),
            detectCostOverruns(finData, profData),
          ]);
          const texts = [r1,r2,r3,r4].map(r => r.status === 'fulfilled' ? r.value.text : '');
          res = await recommendOperationalActions(texts[0], texts[1], texts[2], texts[3]);
          break;
        }
        default:
          return;
      }
      setResult(res);
    } catch (e: unknown) {
      if (isAICreditsExhausted(e)) {
        setError('Créditos IA agotados este mes. Actualiza a PREMIUM o espera el próximo ciclo.');
      } else if (isAIPlanNotIncluded(e)) {
        setError('Esta función requiere plan PREMIUM.');
      } else {
        setError((e as Error).message ?? 'Error al ejecutar análisis');
      }
    } finally {
      setLoading(false);
    }
  }

  // Parsear resultado JSON
  let parsed: Record<string, unknown> | null = null;
  if (result?.text) {
    try {
      const json = result.text.match(/\{[\s\S]*\}/)?.[0] ?? result.text;
      parsed = JSON.parse(json);
    } catch { /* texto libre */ }
  }

  const NIVEL_COLORS: Record<string, string> = {
    'Crítico': '#DC2626', 'Alto': '#D97706', 'Medio': '#2563EB', 'Bajo': '#16A34A',
    'Critical': '#DC2626', 'Crítica': '#DC2626', 'Alta': '#D97706',
    'Excelente': '#16A34A', 'Bueno': '#16A34A', 'Regular': '#D97706',
  };

  // Clave de nivel por tipo de análisis
  const levelKey: Record<Panel, string> = {
    riesgos: 'nivel_riesgo', retrasos: 'severidad', productividad: 'estado_general',
    costos: 'nivel_alerta', proyectos: '', plan: 'estado_operativo',
  };
  const level = parsed?.[levelKey[panel.key]] as string | undefined;
  const levelColor = level ? (NIVEL_COLORS[level] ?? '#64748B') : '#64748B';

  return (
    <div style={{ background: '#1E293B', borderRadius: 14, overflow: 'hidden' }}>
      {/* Header del panel */}
      <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ background: parsed ? levelColor + '30' : '#0F172A', borderRadius: 10, padding: 8, color: parsed ? levelColor : '#64748B' }}>
          {panel.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{panel.label}</div>
          <div style={{ fontSize: 11, color: '#64748B' }}>{panel.desc}</div>
        </div>
        {level && (
          <div style={{ background: levelColor + '20', color: levelColor, borderRadius: 8, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
            {level}
          </div>
        )}
        {result && (
          <div style={{ fontSize: 10, color: '#64748B' }}>{result.credits_consumed}cr</div>
        )}
      </div>

      {/* Botón de análisis */}
      {!result && !loading && (
        <div style={{ padding: '0 16px 14px' }}>
          <button onClick={run} disabled={!enabled}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
              background: enabled ? '#6366F1' : '#334155',
              color: enabled ? '#fff' : '#475569',
              fontWeight: 700, fontSize: 13, cursor: enabled ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
            <Zap size={14} /> {panel.key === 'plan' ? 'Generar plan (12 créditos)' : 'Analizar ahora (3 créditos)'}
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: '14px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Loader2 size={14} color="#818CF8" style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 13, color: '#94A3B8' }}>
            {panel.key === 'plan' ? 'Ejecutando 4 análisis...' : 'Analizando datos...'}
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ margin: '0 16px 14px', background: '#450A0A', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 12, color: '#FCA5A5' }}>{error}</div>
          <button onClick={() => setError(null)}
            style={{ marginTop: 6, background: 'none', border: 'none', color: '#818CF8', fontSize: 11, cursor: 'pointer' }}>
            Reintentar
          </button>
        </div>
      )}

      {/* Resultado */}
      {parsed && (
        <div style={{ padding: '0 16px 14px' }}>
          <ParsedResult panel={panel.key} data={parsed} navigate={navigate} />
          <button onClick={() => setResult(null)}
            style={{ marginTop: 10, width: '100%', padding: '7px 0', borderRadius: 8, border: 'none', background: '#0F172A', color: '#64748B', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            Nuevo análisis (3 créditos)
          </button>
        </div>
      )}

      {result?.text && !parsed && (
        <div style={{ margin: '0 16px 14px', background: '#0F172A', borderRadius: 10, padding: 12, fontSize: 12, color: '#94A3B8', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {result.text}
        </div>
      )}
    </div>
  );
}

// ─── ParsedResult — renderiza el JSON de cada análisis ───────────────────────

/** Convierte unknown a string para JSX */
function str(v: unknown): string { return v != null ? String(v) : ''; }

function ParsedResult({ panel, data, navigate }: { panel: Panel; data: Record<string, unknown>; navigate: (p: string) => void }) {
  const URGENCY_COLOR: Record<string, string> = {
    'Inmediata': '#DC2626', 'Esta semana': '#D97706', 'Este mes': '#2563EB',
    'Hoy': '#DC2626', 'Mañana': '#D97706',
  };

  switch (panel) {
    case 'riesgos': {
      const riesgos = (data.riesgos as Array<Record<string, unknown>>) ?? [];
      return (
        <div>
          {!!data.alerta_principal && (
            <div style={{ background: '#450A0A', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#FCA5A5', fontWeight: 700 }}>ALERTA PRINCIPAL</div>
              <div style={{ fontSize: 13, color: '#FECACA', marginTop: 2 }}>{str(data.alerta_principal)}</div>
            </div>
          )}
          {riesgos.map((r, i) => (
            <div key={i} style={{ background: '#0F172A', borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#E2E8F0' }}>{str(r.tipo)}</span>
                <span style={{ fontSize: 11, color: URGENCY_COLOR[r.urgencia as string] ?? '#94A3B8', fontWeight: 700 }}>{str(r.urgencia)}</span>
              </div>
              <div style={{ fontSize: 12, color: '#94A3B8' }}>{str(r.descripcion)}</div>
            </div>
          ))}
          {(data.acciones_inmediatas as string[] ?? []).map((a, i) => (
            <div key={i} style={{ fontSize: 12, color: '#4ADE80', marginTop: 6 }}>→ {a}</div>
          ))}
        </div>
      );
    }

    case 'retrasos': {
      const causas = (data.causas_probables as string[]) ?? [];
      const recs   = (data.recomendaciones as string[]) ?? [];
      return (
        <div>
          {!!data.patron_detectado && (
            <div style={{ background: '#0F172A', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#F59E0B', fontWeight: 700 }}>PATRÓN DETECTADO</div>
              <div style={{ fontSize: 13, color: '#E2E8F0', marginTop: 3 }}>{str(data.patron_detectado)}</div>
            </div>
          )}
          {causas.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#64748B', fontWeight: 700, marginBottom: 6 }}>CAUSAS PROBABLES</div>
              {causas.map((c, i) => <div key={i} style={{ fontSize: 12, color: '#94A3B8', marginBottom: 3 }}>• {c}</div>)}
            </div>
          )}
          {recs.map((r, i) => <div key={i} style={{ fontSize: 12, color: '#4ADE80', marginBottom: 4 }}>→ {r}</div>)}
          <button onClick={() => navigate('/app/automatizaciones')}
            style={{ marginTop: 8, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#1E3A5F', color: '#60A5FA', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={12} /> Crear alerta automática
          </button>
        </div>
      );
    }

    case 'productividad': {
      const bajos = (data.miembros_bajo_rendimiento as Array<Record<string,unknown>>) ?? [];
      const mejores = (data.mejores_performers as string[]) ?? [];
      return (
        <div>
          {!!data.insight_equipo && (
            <div style={{ background: '#0F172A', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: '#E2E8F0', lineHeight: 1.5 }}>{str(data.insight_equipo)}</div>
            </div>
          )}
          {mejores.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#4ADE80', fontWeight: 700 }}>🏆 MEJORES PERFORMERS</div>
              {mejores.map((m, i) => <div key={i} style={{ fontSize: 12, color: '#4ADE80', marginTop: 3 }}>• {m}</div>)}
            </div>
          )}
          {bajos.map((m, i) => (
            <div key={i} style={{ background: '#0F172A', borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B' }}>{str(m.nombre)}</div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{str(m.problema)}</div>
              <div style={{ fontSize: 11, color: '#60A5FA', marginTop: 2 }}>→ {str(m.sugerencia)}</div>
            </div>
          ))}
          {(data.acciones_recomendadas as string[] ?? []).map((a, i) => (
            <div key={i} style={{ fontSize: 12, color: '#4ADE80', marginTop: 6 }}>→ {a}</div>
          ))}
        </div>
      );
    }

    case 'costos': {
      const desv = (data.desviaciones_detectadas as Array<Record<string,unknown>>) ?? [];
      return (
        <div>
          {!!data.causa_raiz_probable && (
            <div style={{ background: '#450A0A', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#FCA5A5', fontWeight: 700 }}>CAUSA RAÍZ</div>
              <div style={{ fontSize: 12, color: '#FECACA', marginTop: 2 }}>{str(data.causa_raiz_probable)}</div>
            </div>
          )}
          {desv.map((d, i) => (
            <div key={i} style={{ background: '#0F172A', borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#E2E8F0' }}>{str(d.area)}</span>
                <span style={{ fontSize: 11, color: d.impacto === 'Alto' ? '#DC2626' : '#D97706', fontWeight: 700 }}>{str(d.impacto)}</span>
              </div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{str(d.problema)}</div>
            </div>
          ))}
          {(data.acciones as string[] ?? []).map((a, i) => (
            <div key={i} style={{ fontSize: 12, color: '#4ADE80', marginTop: 6 }}>→ {a}</div>
          ))}
          <button onClick={() => navigate('/app/finanzas')}
            style={{ marginTop: 10, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#1E3A5F', color: '#60A5FA', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ChevronRight size={12} /> Ver dashboard de costos
          </button>
        </div>
      );
    }

    case 'proyectos': {
      const proyectos = (data.proyectos_en_riesgo as Array<Record<string,unknown>>) ?? [];
      const clientes  = (data.clientes_prioridad as string[]) ?? [];
      return (
        <div>
          {proyectos.map((p, i) => (
            <div key={i} style={{ background: '#0F172A', borderRadius: 8, padding: '8px 10px', marginBottom: 6, borderLeft: `3px solid ${p.nivel === 'Crítico' ? '#DC2626' : p.nivel === 'Alto' ? '#D97706' : '#2563EB'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#E2E8F0' }}>{str(p.identificador)}</span>
                <span style={{ fontSize: 11, color: '#94A3B8' }}>{str(p.tipo_riesgo)}</span>
              </div>
              <div style={{ fontSize: 11, color: '#60A5FA' }}>→ {str(p.accion)}</div>
            </div>
          ))}
          {clientes.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: '#F59E0B', fontWeight: 700, marginBottom: 4 }}>CONTACTAR URGENTE</div>
              {clientes.map((c, i) => <div key={i} style={{ fontSize: 12, color: '#FCD34D' }}>• {c}</div>)}
            </div>
          )}
          {!!data.recomendacion_clave && (
            <div style={{ background: '#1E293B', borderRadius: 8, padding: '8px 12px', marginTop: 10 }}>
              <div style={{ fontSize: 11, color: '#818CF8', fontWeight: 700 }}>RECOMENDACIÓN CLAVE</div>
              <div style={{ fontSize: 12, color: '#E2E8F0', marginTop: 3 }}>{str(data.recomendacion_clave)}</div>
            </div>
          )}
          <button onClick={() => navigate('/app/customer-success')}
            style={{ marginTop: 10, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#1E3A5F', color: '#60A5FA', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ChevronRight size={12} /> Ver Customer Success
          </button>
        </div>
      );
    }

    case 'plan': {
      const acciones = (data.plan_semana as Array<Record<string,unknown>>) ?? [];
      return (
        <div>
          {acciones.map((a, i) => (
            <div key={i} style={{ background: '#0F172A', borderRadius: 8, padding: '10px 12px', marginBottom: 8, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: i === 0 ? '#DC2626' : i === 1 ? '#D97706' : '#2563EB', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#E2E8F0', marginBottom: 3 }}>{str(a.accion)}</div>
                <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#64748B' }}>
                  <span>{str(a.responsable)}</span>
                  <span>·</span>
                  <span style={{ color: URGENCY_COLOR[a.plazo as string] ?? '#94A3B8' }}>{str(a.plazo)}</span>
                  <span>·</span>
                  <span>Impacto {str(a.impacto)}</span>
                </div>
              </div>
            </div>
          ))}
          {!!data.mensaje_equipo && (
            <div style={{ background: '#1E3A5F', borderRadius: 10, padding: '10px 12px', marginTop: 6 }}>
              <div style={{ fontSize: 11, color: '#60A5FA', fontWeight: 700 }}>MENSAJE AL EQUIPO</div>
              <div style={{ fontSize: 12, color: '#BFDBFE', marginTop: 3, fontStyle: 'italic' }}>"{str(data.mensaje_equipo)}"</div>
            </div>
          )}
          {!!data.kpi_a_monitorear && (
            <div style={{ fontSize: 12, color: '#818CF8', marginTop: 10 }}>📊 KPI a monitorear mañana: <strong style={{ color: '#A5B4FC' }}>{str(data.kpi_a_monitorear)}</strong></div>
          )}
          <button onClick={() => navigate('/app/automatizaciones')}
            style={{ marginTop: 12, width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', background: '#6366F1', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Zap size={14} /> Crear automatizaciones del plan
          </button>
        </div>
      );
    }

    default:
      return null;
  }
}
