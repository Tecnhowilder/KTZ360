/**
 * IAOrchestratorTab — Backoffice: AI Orchestrator Admin
 *
 * Secciones:
 *   1. Estado de Proveedores (health en tiempo real + scores)
 *   2. Proveedores registrados (habilitar/deshabilitar/prioridad)
 *   3. Modelos por proveedor
 *   4. Pricing por operación (rentabilidad)
 *   5. FinOps (costos reales, márgenes, por proveedor/operación)
 *   6. Cache (estadísticas + purgar)
 *   7. Benchmark (resultados históricos)
 *
 * Acceso: solo super_admin
 */
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAIProviders,
  getAIProviderScores,
  getAIOperationPricing,
  getAIFinopsSummary,
  getAIBenchmarkSummary,
  getAICacheStats,
  updateAIProvider,
  updateAIOperationPricing,
  purgaAICache,
  triggerHealthCheck,
  // Enterprise
  getAIModelCapabilities,
  updateAIModelCapability,
  getAIRoutingPolicies,
  upsertAIRoutingPolicy,
  deleteAIRoutingPolicy,
  getAIGovernanceRules,
  toggleAIGovernanceRule,
  getAIPromptTemplates,
  publishPromptVersion,
  rollbackPromptVersion,
  getAILatencyPercentiles,
  getAIHealthScore,
  getAIDynamicRanking,
  simulateAICosts,
  triggerBenchmark,
  getAIRequestLogs,
  type AIProviderScore,
  type AIRequestLogEntry,
  type AIOperationPricing,
  type AIModelCapability,
  type AIRoutingPolicy,
  type AIGovernanceRule,
  type AIPromptTemplate,
  type AILatencyPercentiles,
  type AIHealthScore,
  type AIDynamicRanking,
  type CostSimulatorInput,
} from '../../services/aiProviders';
import { useToast } from '../ui/Toast';

// ─── Estilos ──────────────────────────────────────────────────────────────────
const card:  React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 18, marginBottom: 16 };
const th:    React.CSSProperties = { padding: '8px 12px', fontSize: 11, fontWeight: 800, color: '#94A3B8', borderBottom: '1.5px solid #EEF2F7', textAlign: 'left' as const, whiteSpace: 'nowrap' as const };
const td:    React.CSSProperties = { padding: '9px 12px', fontSize: 12.5, verticalAlign: 'middle' as const };
const badge = (color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '2px 8px', borderRadius: 20,
  fontSize: 11, fontWeight: 700, background: color + '20', color,
});


function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 80 ? '#10B981' : pct >= 60 ? '#F59E0B' : '#EF4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: '#EEF2F7', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .4s' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 32 }}>{value.toFixed(0)}</span>
    </div>
  );
}

// ─── Helpers: tiempo relativo ─────────────────────────────────────────────────

function useRelativeTick() {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 10)    return 'hace un momento';
  if (diff < 60)    return `hace ${diff}s`;
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

function getCheckedAt(score: AIProviderScore): string | null {
  return (score as unknown as Record<string,string>)['last_check'] ?? score.checked_at ?? null;
}

// ─── Dot animado de estado ────────────────────────────────────────────────────

function LiveDot({ status, checking }: { status: string; checking: boolean }) {
  const c = ({ ok:'#10B981', degraded:'#F59E0B', down:'#EF4444', unknown:'#94A3B8', unconfigured:'#7C3AED', disabled:'#CBD5E1' } as Record<string,string>)[status] ?? '#94A3B8';
  return (
    <span style={{ position:'relative', display:'inline-flex', width:10, height:10, flexShrink:0 }}>
      {status === 'ok' && !checking && (
        <span style={{ position:'absolute', inset:0, borderRadius:'50%', background:c, animation:'ping-live 2s ease-in-out infinite' }} />
      )}
      <span style={{ width:10, height:10, borderRadius:'50%', background: checking ? '#7C3AED' : c, display:'inline-block', position:'relative', transition:'background .4s' }} />
    </span>
  );
}

// ─── Tarjeta enterprise por proveedor ─────────────────────────────────────────

function ProviderCard({ score, checking }: { score: AIProviderScore; checking: boolean }) {
  const STATUS_MAP: Record<string, { label: string; color: string }> = {
    ok:           { label:'Online',        color:'#10B981' },
    degraded:     { label:'Degradado',     color:'#F59E0B' },
    down:         { label:'Offline',       color:'#EF4444' },
    unknown:      { label:'Sin datos',     color:'#94A3B8' },
    unconfigured: { label:'Sin API Key',   color:'#7C3AED' },
    disabled:     { label:'Deshabilitado', color:'#CBD5E1' },
  };
  const { label, color } = STATUS_MAP[score.status] ?? STATUS_MAP['unknown'];
  const composite = score.composite_score ?? 0;
  const scoreColor = composite >= 80 ? '#10B981' : composite >= 60 ? '#F59E0B' : '#EF4444';

  return (
    <div style={{
      position:'relative', overflow:'hidden',
      background:'#fff',
      border:'1.5px solid #E2E8F0',
      borderTop:`3px solid ${checking ? '#7C3AED' : color}`,
      borderRadius:14, padding:'18px 20px',
      flex:'1 1 260px', minWidth:260,
      boxShadow: checking ? '0 0 0 2px #7C3AED20, 0 4px 16px rgba(124,58,237,.08)' : '0 1px 4px rgba(0,0,0,.04)',
      transition:'border-color .4s ease, box-shadow .4s ease',
    }}>
      {/* Scanning line durante check */}
      {checking && (
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:'#7C3AED20', overflow:'hidden' }}>
          <div style={{ height:'100%', width:'55%', background:'#7C3AED', borderRadius:2, animation:'scan-bar 1.6s ease-in-out infinite' }} />
        </div>
      )}

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
        <div>
          <div style={{ fontWeight:800, fontSize:14, color:'#0F172A', marginBottom:2 }}>{score.name}</div>
          <div style={{ fontSize:11, color:'#94A3B8', fontFamily:'monospace' }}>{score.provider_key}</div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
          <div style={{
            display:'inline-flex', alignItems:'center', gap:5,
            padding:'3px 10px', borderRadius:20,
            background:(checking ? '#7C3AED' : color) + '18',
            color: checking ? '#7C3AED' : color,
            fontWeight:700, fontSize:11, transition:'all .3s',
          }}>
            <LiveDot status={score.status} checking={checking} />
            {checking ? 'Verificando...' : label}
          </div>
          {score.is_circuit_open && !checking && (
            <span style={{ fontSize:10, fontWeight:700, color:'#EF4444' }}>⚡ CIRCUITO ABIERTO</span>
          )}
        </div>
      </div>

      {/* Score compuesto */}
      <div style={{ marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
          <span style={{ fontSize:36, fontWeight:900, color: checking ? '#7C3AED60' : scoreColor, lineHeight:1, transition:'color .4s' }}>
            {composite.toFixed(1)}
          </span>
          <span style={{ fontSize:12, color:'#94A3B8' }}>/100</span>
        </div>
        <div style={{ fontSize:10, color:'#94A3B8', marginTop:1 }}>Score compuesto</div>
      </div>

      {/* Métricas 2×2 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 16px', marginBottom:12 }}>
        {[
          { label:'Latencia',         value: score.latency_ms != null ? `${score.latency_ms}ms` : '—',          ok: score.latency_ms == null || score.latency_ms < 2000 },
          { label:'Disponibilidad',   value:`${(score.availability_score ?? 100).toFixed(0)}%`,                  ok:(score.availability_score ?? 100) >= 95 },
          { label:'Calidad',          value:`${score.quality_score.toFixed(0)}/100`,                             ok: score.quality_score >= 80 },
          { label:'Costo-eficiencia', value:`${score.cost_score.toFixed(0)}/100`,                                ok: score.cost_score >= 70 },
        ].map(m => (
          <div key={m.label}>
            <div style={{ fontSize:10, color:'#94A3B8', marginBottom:1 }}>{m.label}</div>
            <div style={{ fontSize:13, fontWeight:800, color: checking ? '#94A3B8' : m.ok ? '#0F172A' : '#F59E0B', transition:'color .3s' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Barra de disponibilidad */}
      <div style={{ marginBottom:12 }}>
        <div style={{ height:5, background:'#EEF2F7', borderRadius:3, overflow:'hidden' }}>
          <div style={{
            height:'100%',
            width:`${score.availability_score ?? 100}%`,
            background:(score.availability_score ?? 100) >= 95 ? '#10B981' : (score.availability_score ?? 100) >= 80 ? '#F59E0B' : '#EF4444',
            borderRadius:3, transition:'width .6s ease',
          }} />
        </div>
      </div>

      {/* Footer */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:10, borderTop:'1px solid #F1F5F9', fontSize:11 }}>
        <span style={{ color:'#94A3B8' }}>
          {checking ? 'Verificando...' : relativeTime(getCheckedAt(score))}
        </span>
        <span style={{ color: score.is_circuit_open ? '#EF4444' : '#10B981', fontWeight:600 }}>
          {score.is_circuit_open ? '⚡ Circuito abierto' : '✓ Circuito OK'}
        </span>
      </div>
    </div>
  );
}

// ─── Sección: Estado de Proveedores (Enterprise) ──────────────────────────────

function ProviderHealthSection() {
  useRelativeTick();
  const qc = useQueryClient();
  const { data: scores, isFetching } = useQuery({
    queryKey:        ['ai_provider_scores'],
    queryFn:         getAIProviderScores,
    staleTime:       30_000,
    refetchInterval: 120_000,
  });
  const { showToast } = useToast();
  const [checking,     setChecking]     = useState(false);
  const [progress,     setProgress]     = useState(0);
  const [progressDone, setProgressDone] = useState(false);

  useEffect(() => {
    if (!checking) return;
    const start    = Date.now();
    const DURATION = 9_000;
    let raf: number;
    const tick = () => {
      setProgress(Math.min(88, ((Date.now() - start) / DURATION) * 100));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [checking]);

  async function handleCheck() {
    setChecking(true);
    setProgress(0);
    try {
      await triggerHealthCheck();
      setProgress(100);
      setProgressDone(true);
      await qc.invalidateQueries({ queryKey: ['ai_provider_scores'] });
      await qc.invalidateQueries({ queryKey: ['ai_health_score'] });
      showToast('✓ Health check completado');
    } catch (e) {
      const msg = (e as Error)?.message ?? 'Error desconocido';
      showToast(`Error: ${msg.slice(0, 80)}`);
    } finally {
      setChecking(false);
      setTimeout(() => { setProgress(0); setProgressDone(false); }, 2000);
    }
  }

  return (
    <div style={card}>
      {/* Animaciones CSS */}
      <style>{`
        @keyframes scan-bar   { 0%{transform:translateX(-120%)} 100%{transform:translateX(290%)} }
        @keyframes ping-live  { 0%,100%{transform:scale(1);opacity:.6} 60%{transform:scale(2.2);opacity:0} }
        @keyframes spin-fab   { to{transform:rotate(360deg)} }
        @keyframes fade-in-up { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* Encabezado */}
      <div style={{ marginBottom:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: (checking || progressDone) ? 10 : 14 }}>
          <div>
            <div style={{ fontWeight:800, fontSize:15, color:'#0F172A' }}>Estado de Proveedores IA</div>
            <div style={{ fontSize:11, color:'#64748B', marginTop:2 }}>
              Score = Calidad 35% + Disponibilidad 30% + Costo 20% + Prioridad 15% · Auto-refresca cada 2 min
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {isFetching && !checking && (
              <span style={{ fontSize:11, color:'#94A3B8' }}>Actualizando...</span>
            )}
            <button
              onClick={handleCheck}
              disabled={checking || isFetching}
              style={{
                padding:'8px 16px', borderRadius:10, border:'none',
                background: checking ? '#7C3AED99' : '#7C3AED',
                color:'#fff', fontWeight:700, fontSize:12,
                cursor: checking ? 'not-allowed' : 'pointer',
                display:'flex', alignItems:'center', gap:7,
                transition:'background .2s',
              }}
            >
              {checking && (
                <span style={{
                  width:12, height:12, borderRadius:'50%',
                  border:'2px solid #ffffff55', borderTopColor:'#fff',
                  display:'inline-block', animation:'spin-fab .7s linear infinite',
                }} />
              )}
              {checking ? 'Verificando...' : '⚡ Verificar ahora'}
            </button>
          </div>
        </div>

        {/* Barra de progreso */}
        {(checking || progressDone) && (
          <>
            <div style={{ height:4, background:'#EEF2F7', borderRadius:2, overflow:'hidden', marginBottom:4 }}>
              <div style={{
                height:'100%', width:`${progress}%`,
                background: progressDone ? '#10B981' : '#7C3AED',
                borderRadius:2,
                transition: progressDone ? 'width .3s ease, background .3s ease' : 'none',
              }} />
            </div>
            <div style={{ fontSize:11, textAlign:'center' as const, color: progressDone ? '#10B981' : '#7C3AED', animation:'fade-in-up .3s ease' }}>
              {progressDone ? '✓ Todos los proveedores verificados' : 'Haciendo ping a los proveedores IA...'}
            </div>
          </>
        )}
      </div>

      {/* Cards */}
      {!scores?.length ? (
        <div style={{ color:'#94A3B8', fontSize:13, padding:'24px 0', textAlign:'center' as const }}>
          {isFetching ? 'Cargando...' : 'Sin datos — haz clic en "Verificar ahora" para ejecutar el primer health check.'}
        </div>
      ) : (
        <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
          {scores.map((s: AIProviderScore) => (
            <ProviderCard key={s.provider_key} score={s} checking={checking} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sección: Proveedores registrados ─────────────────────────────────────────

function ProvidersSection() {
  const qc = useQueryClient();
  const { data: providers } = useQuery({ queryKey: ['ai_providers'], queryFn: getAIProviders });
  const { showToast } = useToast();

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateAIProvider(id, { enabled }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ai_providers'] }); qc.invalidateQueries({ queryKey: ['ai_provider_scores'] }); },
    onError: () => showToast('Error al actualizar proveedor'),
  });

  return (
    <div style={card}>
      <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A', marginBottom: 12 }}>Proveedores Registrados</div>
      <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14, background: '#FEF3C7', borderRadius: 8, padding: '8px 12px', border: '1px solid #FDE68A' }}>
        ⚠️ Para habilitar NVIDIA Build/NIM: configura el secret <code>NVIDIA_API_KEY</code> en Supabase → Edge Functions → Secrets, luego habilita el proveedor aquí.
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>{['Proveedor','API Key Secret','Visión','Principal','Prioridad','Habilitado'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {(providers ?? []).map(p => (
            <tr key={p.id} style={{ borderBottom: '1px solid #F8FAFC' }}>
              <td style={td}>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>{p.base_url.split('/')[2]}</div>
              </td>
              <td style={td}>
                <code style={{ fontSize: 11, background: '#F8FAFC', padding: '2px 6px', borderRadius: 4 }}>{p.api_key_secret}</code>
              </td>
              <td style={td}>{p.supports_vision ? '✓' : '—'}</td>
              <td style={td}>{p.is_primary ? <span style={badge('#10B981')}>PRIMARIO</span> : '—'}</td>
              <td style={td}><span style={{ fontWeight: 700 }}>{p.priority}</span></td>
              <td style={td}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    onChange={e => toggleMut.mutate({ id: p.id, enabled: e.target.checked })}
                    disabled={toggleMut.isPending}
                    style={{ width: 16, height: 16, accentColor: '#7C3AED', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 12, color: p.enabled ? '#10B981' : '#94A3B8', fontWeight: 600 }}>
                    {p.enabled ? 'Activo' : 'Inactivo'}
                  </span>
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Sección: Pricing por Operación ──────────────────────────────────────────

function OperationPricingSection() {
  const qc = useQueryClient();
  const { data: pricing } = useQuery({ queryKey: ['ai_operation_pricing'], queryFn: getAIOperationPricing });
  const { showToast } = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState<Partial<AIOperationPricing>>({});

  const updateMut = useMutation({
    mutationFn: ({ op, updates }: { op: string; updates: Partial<AIOperationPricing> }) =>
      updateAIOperationPricing(op, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai_operation_pricing'] });
      setEditing(null);
      showToast('✓ Pricing actualizado');
    },
    onError: () => showToast('Error al actualizar pricing'),
  });

  const qualityColors: Record<string, string> = { economy: '#94A3B8', standard: '#7C3AED', premium: '#F59E0B' };

  return (
    <div style={card}>
      <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A', marginBottom: 4 }}>Motor de Rentabilidad por Operación</div>
      <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>Haz clic en una fila para editar. Los cambios son inmediatos.</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr>{['Operación','Créditos','Costo USD est.','Margen mín.','Calidad','Proveedor pref.','Fallback','Cache','Estado'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {(pricing ?? []).map((p: AIOperationPricing) => {
              const isEditing = editing === p.operation;
              return (
                <tr
                  key={p.operation}
                  onClick={() => { if (!isEditing) { setEditing(p.operation); setEditVal({ ...p }); } }}
                  style={{ borderBottom: '1px solid #F8FAFC', cursor: 'pointer', background: isEditing ? '#F8F4FF' : undefined }}
                >
                  <td style={{ ...td, fontWeight: 600 }}>
                    <code style={{ fontSize: 11 }}>{p.operation}</code>
                  </td>
                  <td style={td}>
                    {isEditing ? (
                      <input type="number" value={editVal.credits_cost ?? p.credits_cost} min={1} max={20}
                        onChange={e => setEditVal(v => ({ ...v, credits_cost: +e.target.value }))}
                        onClick={e => e.stopPropagation()}
                        style={{ width: 52, border: '1.5px solid #7C3AED', borderRadius: 6, padding: '3px 6px', fontSize: 12 }}
                      />
                    ) : (
                      <span style={{ fontWeight: 800, color: '#7C3AED' }}>{p.credits_cost} cr</span>
                    )}
                  </td>
                  <td style={td}>${(p.estimated_usd_cost * 1000).toFixed(2)}‰</td>
                  <td style={td}>{p.minimum_margin_pct.toFixed(0)}%</td>
                  <td style={td}>
                    <span style={badge(qualityColors[p.quality_level] ?? '#94A3B8')}>{p.quality_level}</span>
                  </td>
                  <td style={{ ...td, fontSize: 11 }}>{p.preferred_provider ?? '—'} / {p.preferred_model?.split('/').pop() ?? '—'}</td>
                  <td style={{ ...td, fontSize: 11 }}>{p.fallback_provider ?? '—'}</td>
                  <td style={td}>
                    {isEditing ? (
                      <input type="checkbox" checked={editVal.cache_enabled ?? p.cache_enabled}
                        onChange={e => setEditVal(v => ({ ...v, cache_enabled: e.target.checked }))}
                        onClick={e => e.stopPropagation()}
                        style={{ accentColor: '#7C3AED' }}
                      />
                    ) : (
                      p.cache_enabled ? <span style={badge('#10B981')}>ON</span> : <span style={{ fontSize: 11, color: '#94A3B8' }}>—</span>
                    )}
                  </td>
                  <td style={td}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => updateMut.mutate({ op: p.operation, updates: editVal })}
                          disabled={updateMut.isPending}
                          style={{ padding: '4px 10px', background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                        >Guardar</button>
                        <button
                          onClick={() => setEditing(null)}
                          style={{ padding: '4px 10px', background: '#EEF2F7', color: '#64748B', border: 'none', borderRadius: 7, fontSize: 11, cursor: 'pointer' }}
                        >Cancelar</button>
                      </div>
                    ) : (
                      p.enabled
                        ? <span style={badge('#10B981')}>Activo</span>
                        : <span style={badge('#EF4444')}>Inactivo</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Sección: FinOps ──────────────────────────────────────────────────────────

function FinOpsSection() {
  const [days, setDays] = useState(30);
  const { data: finops, isLoading } = useQuery({
    queryKey: ['ai_finops', days],
    queryFn:  () => getAIFinopsSummary(days),
    staleTime: 300_000,
  });

  const statCard = (label: string, value: string | number, sub?: string) => (
    <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '12px 16px', flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: '#0F172A' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>FinOps IA — Costos Reales</div>
        <select value={days} onChange={e => setDays(+e.target.value)}
          style={{ border: '1.5px solid #E2E8F0', borderRadius: 8, padding: '5px 10px', fontSize: 12 }}>
          {[7,14,30,60,90].map(d => <option key={d} value={d}>Últimos {d} días</option>)}
        </select>
      </div>

      {isLoading ? <div style={{ color: '#94A3B8', fontSize: 13 }}>Cargando...</div> : finops && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            {statCard('Total Requests', (finops.total_requests ?? 0).toLocaleString())}
            {statCard('Créditos consumidos', (finops.total_credits_consumed ?? 0).toLocaleString())}
            {statCard('Costo real', `$${(finops.total_real_cost_usd ?? 0).toFixed(4)} USD`)}
            {statCard('Latencia promedio', `${finops.avg_latency_ms ?? 0}ms`)}
            {statCard('Tasa de éxito', `${finops.success_rate_pct ?? 0}%`)}
            {statCard('Cache hit rate', `${finops.cache_hit_rate_pct ?? 0}%`, 'créditos ahorrados')}
            {statCard('Fallback rate', `${finops.fallback_rate_pct ?? 0}%`)}
          </div>

          {/* Por proveedor */}
          {finops.by_provider?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#475569', marginBottom: 8 }}>Por Proveedor</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Proveedor','Requests','Créditos','Costo USD','Latencia','Éxito'].map(h => <th key={h} style={{ ...th, background: '#F8FAFC' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {finops.by_provider.map((r: typeof finops.by_provider[0]) => (
                    <tr key={r.provider} style={{ borderBottom: '1px solid #F8FAFC' }}>
                      <td style={{ ...td, fontWeight: 600 }}>{r.provider}</td>
                      <td style={td}>{r.requests.toLocaleString()}</td>
                      <td style={td}>{r.credits.toLocaleString()}</td>
                      <td style={td}>${r.cost_usd.toFixed(6)}</td>
                      <td style={td}>{r.avg_latency}ms</td>
                      <td style={td}>{r.success_rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Top operaciones por costo */}
          {finops.by_operation?.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#475569', marginBottom: 8 }}>Top Operaciones por Créditos</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Operación','Requests','Créditos','Costo USD'].map(h => <th key={h} style={{ ...th, background: '#F8FAFC' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {finops.by_operation.slice(0, 10).map((r: typeof finops.by_operation[0]) => (
                    <tr key={r.operation} style={{ borderBottom: '1px solid #F8FAFC' }}>
                      <td style={{ ...td, fontSize: 11 }}><code>{r.operation}</code></td>
                      <td style={td}>{r.requests.toLocaleString()}</td>
                      <td style={{ ...td, fontWeight: 700, color: '#7C3AED' }}>{r.credits.toLocaleString()}</td>
                      <td style={td}>${r.cost_usd.toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Sección: Cache ───────────────────────────────────────────────────────────

function CacheSection() {
  const qc = useQueryClient();
  const { data: stats } = useQuery({ queryKey: ['ai_cache_stats'], queryFn: getAICacheStats, staleTime: 60_000 });
  const { showToast } = useToast();

  const purgeMut = useMutation({
    mutationFn: purgaAICache,
    onSuccess:  (count) => { qc.invalidateQueries({ queryKey: ['ai_cache_stats'] }); showToast(`✓ ${count} entradas purgadas`); },
    onError:    () => showToast('Error al purgar cache'),
  });

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>Cache Inteligente IA</div>
        <button
          onClick={() => purgeMut.mutate()} disabled={purgeMut.isPending}
          style={{ padding: '6px 12px', border: 'none', background: '#EEF2F7', color: '#475569', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >
          {purgeMut.isPending ? 'Purgando...' : '🗑️ Purgar expiradas'}
        </button>
      </div>
      {stats && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {[
            ['Entradas activas', stats.total_entries],
            ['Total hits', stats.total_hits.toLocaleString()],
            ['Créditos ahorrados', stats.credits_saved.toLocaleString()],
            ['Vencen pronto (<2h)', stats.expires_soon],
          ].map(([l, v]) => (
            <div key={l as string} style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 16px', flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>{l}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#0F172A' }}>{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sección: Capability Registry ────────────────────────────────────────────

function CapabilitiesSection() {
  const qc = useQueryClient();
  const { data: capabilities } = useQuery({
    queryKey: ['ai_capabilities'],
    queryFn:  () => getAIModelCapabilities(),
    staleTime: 120_000,
  });
  const { showToast } = useToast();

  const verifyMut = useMutation({
    mutationFn: ({ id, verified }: { id: string; verified: boolean }) =>
      updateAIModelCapability(id, { verified }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai_capabilities'] });
      showToast('✓ Capacidad actualizada');
    },
    onError: () => showToast('Error al actualizar'),
  });

  const levelColor: Record<string, string> = {
    full:         '#10B981',
    partial:      '#F59E0B',
    experimental: '#7C3AED',
    none:         '#EF4444',
  };

  const grouped = (capabilities ?? []).reduce<Record<string, AIModelCapability[]>>((acc, c) => {
    const key = `${c.provider_key}/${c.model_id}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  return (
    <div style={card}>
      <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A', marginBottom: 4 }}>Registry de Capacidades por Modelo</div>
      <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
        El Orchestrator selecciona proveedores por capacidad requerida, no por nombre. Marca como "verificado" tras un benchmark exitoso.
      </div>
      {Object.entries(grouped).map(([modelKey, caps]) => (
        <div key={modelKey} style={{ marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#475569', marginBottom: 6 }}>
            <code style={{ background: '#F1F5F9', padding: '2px 7px', borderRadius: 5 }}>{modelKey}</code>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {caps.map(c => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: '#F8FAFC', borderRadius: 8, padding: '4px 10px',
                border: `1px solid ${levelColor[c.level]}40`,
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: levelColor[c.level] }}>{c.capability}</span>
                <span style={{ fontSize: 10, color: '#94A3B8' }}>{c.level}</span>
                <button
                  title={c.verified ? 'Verificado — clic para desmarcar' : 'Marcar como verificado'}
                  onClick={() => verifyMut.mutate({ id: c.id, verified: !c.verified })}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 12, opacity: verifyMut.isPending ? 0.5 : 1,
                  }}
                >
                  {c.verified ? '✅' : '⬜'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Sección: Provider Policies ───────────────────────────────────────────────

function PoliciesSection() {
  const qc = useQueryClient();
  const { data: policies } = useQuery({ queryKey: ['ai_policies'], queryFn: getAIRoutingPolicies });
  const { showToast } = useToast();

  const toggleMut = useMutation({
    mutationFn: (p: AIRoutingPolicy) => upsertAIRoutingPolicy({ ...p, enabled: !p.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai_policies'] }),
    onError: () => showToast('Error al actualizar política'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAIRoutingPolicy(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ai_policies'] }); showToast('✓ Política eliminada'); },
    onError: () => showToast('Error al eliminar'),
  });

  const conditionLabel: Record<string, string> = {
    always_use_provider:  'Siempre usar',
    never_use_provider:   'Nunca usar',
    fallback_only:        'Solo fallback',
    require_capability:   'Requiere capacidad',
    max_cost_usd:         'Costo máximo',
    min_availability_pct: 'Disponibilidad mínima',
    prefer_provider:      'Preferir',
  };

  return (
    <div style={card}>
      <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A', marginBottom: 4 }}>Políticas de Enrutamiento Administrables</div>
      <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
        Reglas que el Orchestrator aplica antes de seleccionar el proveedor. Prioridad 1 = más alto.
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>{['P.','Nombre','Tipo','Proveedor','Capacidad','Umbral','Operación','Estado','Acciones'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {(policies ?? []).map(p => (
            <tr key={p.id} style={{ borderBottom: '1px solid #F8FAFC', opacity: p.enabled ? 1 : 0.55 }}>
              <td style={{ ...td, fontWeight: 800, color: '#7C3AED' }}>{p.priority}</td>
              <td style={td}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>{p.name}</div>
                {p.notes && <div style={{ fontSize: 10, color: '#94A3B8' }}>{p.notes}</div>}
              </td>
              <td style={td}><span style={badge('#7C3AED')}>{conditionLabel[p.condition_type] ?? p.condition_type}</span></td>
              <td style={{ ...td, fontSize: 11 }}>{p.provider_key ?? '—'}</td>
              <td style={{ ...td, fontSize: 11 }}>{p.capability ?? '—'}</td>
              <td style={{ ...td, fontSize: 11 }}>{p.threshold_value != null ? p.threshold_value : '—'}</td>
              <td style={{ ...td, fontSize: 11 }}>{p.operation ?? <span style={{ color: '#94A3B8' }}>todas</span>}</td>
              <td style={td}>
                {p.enabled ? <span style={badge('#10B981')}>Activa</span> : <span style={badge('#94A3B8')}>Inactiva</span>}
              </td>
              <td style={td}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => toggleMut.mutate(p)}
                    style={{ padding: '3px 8px', fontSize: 10, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: p.enabled ? '#FEE2E2' : '#D1FAE5', color: p.enabled ? '#EF4444' : '#10B981' }}
                  >
                    {p.enabled ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    onClick={() => { if (confirm('¿Eliminar esta política?')) deleteMut.mutate(p.id); }}
                    style={{ padding: '3px 8px', fontSize: 10, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: '#FEE2E2', color: '#EF4444' }}
                  >
                    ×
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Sección: AI Governance ───────────────────────────────────────────────────

function GovernanceSection() {
  const qc = useQueryClient();
  const { data: rules } = useQuery({ queryKey: ['ai_governance'], queryFn: getAIGovernanceRules });
  const { showToast } = useToast();

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => toggleAIGovernanceRule(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai_governance'] }),
    onError: () => showToast('Error al actualizar regla'),
  });

  const actionColor: Record<string, string> = { block: '#EF4444', alert: '#F59E0B', log: '#10B981', anonymize: '#7C3AED', require_confirmation: '#3B82F6' };
  const ruleTypeLabel: Record<string, string> = { pii_detection: 'Detección PII', output_filter: 'Filtro salida', data_classification: 'Clasificación', audit_required: 'Auditoría', consent_required: 'Consentimiento' };

  return (
    <div style={card}>
      <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A', marginBottom: 4 }}>Gobernanza IA — GDPR / LGPD / Habeas Data</div>
      <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
        Reglas que se aplican a cada llamada IA antes/después del proveedor. El usuario nunca ve estas reglas.
      </div>
      {(rules ?? []).map((r: AIGovernanceRule) => (
        <div key={r.id} style={{
          border: `1px solid ${r.enabled ? '#E2E8F0' : '#F1F5F9'}`,
          borderRadius: 10, padding: '12px 16px', marginBottom: 10,
          opacity: r.enabled ? 1 : 0.6,
          background: r.enabled ? '#fff' : '#FAFAFA',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{r.name}</span>
                <span style={badge(actionColor[r.action] ?? '#94A3B8')}>{r.action.toUpperCase()}</span>
                <span style={badge('#64748B')}>{ruleTypeLabel[r.rule_type] ?? r.rule_type}</span>
                {r.framework && <span style={{ fontSize: 10, color: '#7C3AED', fontWeight: 700 }}>{r.framework}</span>}
              </div>
              {r.description && <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>{r.description}</div>}
              {r.pattern_keywords?.length && (
                <div style={{ fontSize: 11, color: '#475569' }}>
                  Keywords: {r.pattern_keywords.map(k => (
                    <code key={k} style={{ background: '#FEF3C7', padding: '1px 5px', borderRadius: 4, marginRight: 4 }}>{k}</code>
                  ))}
                </div>
              )}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginLeft: 12 }}>
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={e => toggleMut.mutate({ id: r.id, enabled: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: '#7C3AED', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 11, fontWeight: 600, color: r.enabled ? '#10B981' : '#94A3B8' }}>
                {r.enabled ? 'Activa' : 'Inactiva'}
              </span>
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Sección: Prompt Versioning ───────────────────────────────────────────────

function PromptVersioningSection() {
  const qc = useQueryClient();
  const { data: templates } = useQuery({ queryKey: ['ai_prompts'], queryFn: () => getAIPromptTemplates() });
  const { showToast } = useToast();

  const publishMut = useMutation({
    mutationFn: (id: string) => publishPromptVersion(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ai_prompts'] }); showToast('✓ Versión publicada'); },
    onError: () => showToast('Error al publicar'),
  });

  const rollbackMut = useMutation({
    mutationFn: (id: string) => rollbackPromptVersion(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ai_prompts'] }); showToast('✓ Rollback completado'); },
    onError: () => showToast('Error al hacer rollback'),
  });

  const [expanded, setExpanded] = useState<string | null>(null);

  const statusColor: Record<string, string> = { published: '#10B981', draft: '#F59E0B', archived: '#94A3B8' };

  const grouped = (templates ?? []).reduce<Record<string, AIPromptTemplate[]>>((acc, t) => {
    if (!acc[t.operation]) acc[t.operation] = [];
    acc[t.operation].push(t);
    return acc;
  }, {});

  return (
    <div style={card}>
      <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A', marginBottom: 4 }}>Prompt Versioning por Operación</div>
      <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
        draft → published → archived. Publica una versión para activarla. Rollback = re-publicar versión archivada.
      </div>
      {!Object.keys(grouped).length ? (
        <div style={{ color: '#94A3B8', fontSize: 13, padding: '16px 0', textAlign: 'center' as const }}>
          Sin templates creados aún. Los templates personalizados override los prompts hardcodeados en el Edge Function.
        </div>
      ) : Object.entries(grouped).map(([op, versions]) => (
        <div key={op} style={{ marginBottom: 14, border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
          <div
            style={{ padding: '10px 16px', background: '#F8FAFC', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            onClick={() => setExpanded(expanded === op ? null : op)}
          >
            <div style={{ fontWeight: 700, fontSize: 13 }}><code>{op}</code></div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {versions.filter(v => v.status === 'published').length > 0 && <span style={badge('#10B981')}>LIVE v{versions.find(v => v.status === 'published')?.version}</span>}
              <span style={{ fontSize: 12, color: '#94A3B8' }}>{versions.length} versiones</span>
              <span>{expanded === op ? '▲' : '▼'}</span>
            </div>
          </div>
          {expanded === op && (
            <div style={{ padding: '12px 16px' }}>
              {versions.map(v => (
                <div key={v.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  padding: '8px 0', borderBottom: '1px solid #F1F5F9',
                }}>
                  <div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontWeight: 700, fontSize: 12 }}>v{v.version}</span>
                      <span style={badge(statusColor[v.status])}>{v.status}</span>
                      {v.ab_test_pct > 0 && <span style={badge('#3B82F6')}>A/B {v.ab_test_pct}%</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>{v.name}</div>
                    {v.change_notes && <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{v.change_notes}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {v.status === 'draft' && (
                      <button
                        onClick={() => publishMut.mutate(v.id)}
                        disabled={publishMut.isPending}
                        style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer', background: '#10B981', color: '#fff' }}
                      >Publicar</button>
                    )}
                    {v.status === 'archived' && (
                      <button
                        onClick={() => rollbackMut.mutate(v.id)}
                        disabled={rollbackMut.isPending}
                        style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer', background: '#7C3AED', color: '#fff' }}
                      >Rollback</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Sección: Observabilidad P50/P95/P99 ─────────────────────────────────────

function ObservabilitySection() {
  const [days, setDays] = useState(7);
  const [filterProvider, setFilterProvider] = useState('');

  const { data: percentiles, isLoading: loadingP } = useQuery({
    queryKey: ['ai_percentiles', days, filterProvider],
    queryFn:  () => getAILatencyPercentiles(days, filterProvider || undefined),
    staleTime: 120_000,
  });
  const { data: healthScore } = useQuery({
    queryKey: ['ai_health_score'],
    queryFn:  getAIHealthScore,
    staleTime: 60_000,
  });
  const { data: ranking } = useQuery({
    queryKey: ['ai_dynamic_ranking', days],
    queryFn:  () => getAIDynamicRanking(days),
    staleTime: 120_000,
  });

  return (
    <div>
      {/* Health Score compuesto */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A', marginBottom: 12 }}>Health Score Compuesto</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(healthScore ?? []).map((h: AIHealthScore) => (
            <div key={h.provider_key} style={{
              background: '#F8FAFC', borderRadius: 12, padding: '14px 18px', flex: 1, minWidth: 160,
              borderTop: `3px solid ${h.health_score >= 80 ? '#10B981' : h.health_score >= 60 ? '#F59E0B' : '#EF4444'}`,
            }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{h.name}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: h.health_score >= 80 ? '#10B981' : h.health_score >= 60 ? '#F59E0B' : '#EF4444' }}>
                {h.health_score.toFixed(0)}
              </div>
              <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
                Disponibilidad {h.availability.toFixed(0)}% · Errores {h.error_rate_pct.toFixed(1)}%
                {h.latency_ms != null && ` · ${h.latency_ms}ms`}
              </div>
              {h.circuit_open && <div style={{ fontSize: 10, color: '#EF4444', fontWeight: 700, marginTop: 4 }}>CIRCUIT OPEN</div>}
            </div>
          ))}
        </div>
      </div>

      {/* P50/P95/P99 */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>Latencia Real P50 / P95 / P99</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={filterProvider} onChange={e => setFilterProvider(e.target.value)}
              style={{ border: '1.5px solid #E2E8F0', borderRadius: 8, padding: '5px 10px', fontSize: 12 }}>
              <option value="">Todos los proveedores</option>
              <option value="gemini">Gemini</option>
              <option value="nvidia">NVIDIA</option>
            </select>
            <select value={days} onChange={e => setDays(+e.target.value)}
              style={{ border: '1.5px solid #E2E8F0', borderRadius: 8, padding: '5px 10px', fontSize: 12 }}>
              {[7,14,30].map(d => <option key={d} value={d}>Últimos {d} días</option>)}
            </select>
          </div>
        </div>
        {loadingP ? <div style={{ color: '#94A3B8', fontSize: 13 }}>Calculando percentiles...</div>
         : !percentiles?.length ? (
           <div style={{ color: '#94A3B8', fontSize: 13, padding: '16px 0', textAlign: 'center' as const }}>
             Sin datos suficientes aún. Los percentiles se calculan desde ai_request_log.
           </div>
         ) : (
           <table style={{ width: '100%', borderCollapse: 'collapse' }}>
             <thead>
               <tr>{['Proveedor','Operación','N','P50','P95','P99','Éxito%','Fallback%','Cache%'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
             </thead>
             <tbody>
               {(percentiles as AILatencyPercentiles[]).map((r, i) => (
                 <tr key={i} style={{ borderBottom: '1px solid #F8FAFC' }}>
                   <td style={{ ...td, fontWeight: 600 }}>{r.provider}</td>
                   <td style={{ ...td, fontSize: 11 }}><code>{r.operation}</code></td>
                   <td style={{ ...td, fontSize: 11, color: '#94A3B8' }}>{r.sample_count}</td>
                   <td style={{ ...td, fontWeight: 700, color: r.p50_ms < 1500 ? '#10B981' : '#F59E0B' }}>{r.p50_ms}ms</td>
                   <td style={{ ...td, color: r.p95_ms < 3000 ? '#F59E0B' : '#EF4444' }}>{r.p95_ms}ms</td>
                   <td style={{ ...td, color: r.p99_ms < 5000 ? '#EF4444' : '#94A3B8' }}>{r.p99_ms}ms</td>
                   <td style={td}>{r.success_rate_pct}%</td>
                   <td style={td}>{r.fallback_rate_pct}%</td>
                   <td style={td}>{r.cache_hit_pct}%</td>
                 </tr>
               ))}
             </tbody>
           </table>
         )}
      </div>

      {/* Dynamic Ranking */}
      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A', marginBottom: 12 }}>Ranking Dinámico de Proveedores</div>
        <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
          Score dinámico = Calidad 25% + Tasa de éxito real 30% + Costo 20% + Latencia P50 15% + Benchmark 10%
        </div>
        {!(ranking?.length) ? (
          <div style={{ color: '#94A3B8', fontSize: 13 }}>Sin datos aún — se generarán con el primer tráfico IA.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['#','Proveedor','Score dinámico','Éxito real','P50 real','Costo/req','Requests','Benchmark Q'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {(ranking as AIDynamicRanking[]).map((r, i) => (
                <tr key={r.provider_key} style={{ borderBottom: '1px solid #F8FAFC' }}>
                  <td style={{ ...td, fontWeight: 900, color: '#7C3AED', fontSize: 15 }}>{i + 1}</td>
                  <td style={td}>
                    <div style={{ fontWeight: 700 }}>{r.name}</div>
                    {!r.enabled && <span style={badge('#EF4444')}>DISABLED</span>}
                  </td>
                  <td style={{ ...td, minWidth: 120 }}><ScoreBar value={r.dynamic_score} /></td>
                  <td style={td}>{r.real_success_rate.toFixed(1)}%</td>
                  <td style={td}>{r.real_p50_ms ? `${r.real_p50_ms}ms` : '—'}</td>
                  <td style={td}>{r.real_avg_cost_usd ? `$${r.real_avg_cost_usd.toFixed(8)}` : '—'}</td>
                  <td style={{ ...td, color: '#94A3B8' }}>{r.total_requests.toLocaleString()}</td>
                  <td style={td}>{r.benchmark_quality != null ? <ScoreBar value={r.benchmark_quality} /> : <span style={{ color: '#94A3B8' }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Sección: Cost Simulator ──────────────────────────────────────────────────

const DEFAULT_OPS: CostSimulatorInput[] = [
  { operation: 'ia_photo_interpret', count: 100 },
  { operation: 'ia_voice_interpret', count: 50  },
  { operation: 'ia_full_create',     count: 30  },
  { operation: 'forecast',           count: 20  },
];

function CostSimulatorSection() {
  const [users, setUsers] = useState(100);
  const [ops, setOps] = useState<CostSimulatorInput[]>(DEFAULT_OPS);
  const [result, setResult] = useState<Awaited<ReturnType<typeof simulateAICosts>> | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  async function runSimulation() {
    setLoading(true);
    try {
      const res = await simulateAICosts(users, ops.filter(o => o.count > 0));
      setResult(res);
    } catch {
      showToast('Error al simular costos');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={card}>
      <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A', marginBottom: 4 }}>Simulador de Costos IA</div>
      <div style={{ fontSize: 12, color: '#64748B', marginBottom: 16 }}>
        Estima créditos y costo USD dado un mix de operaciones. Útil para planificación y pricing de planes.
      </div>

      <div style={{ display: 'flex', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Usuarios</div>
          <input
            type="number" value={users} min={1} max={100000}
            onChange={e => setUsers(+e.target.value)}
            style={{ width: 100, border: '1.5px solid #E2E8F0', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 8 }}>Operaciones por usuario</div>
        {ops.map((op, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'center' }}>
            <input
              value={op.operation}
              onChange={e => setOps(prev => prev.map((o, j) => j === i ? { ...o, operation: e.target.value } : o))}
              placeholder="operación"
              style={{ width: 220, border: '1.5px solid #E2E8F0', borderRadius: 8, padding: '5px 10px', fontSize: 12 }}
            />
            <input
              type="number" value={op.count} min={0} max={10000}
              onChange={e => setOps(prev => prev.map((o, j) => j === i ? { ...o, count: +e.target.value } : o))}
              style={{ width: 80, border: '1.5px solid #E2E8F0', borderRadius: 8, padding: '5px 10px', fontSize: 12 }}
            />
            <button
              onClick={() => setOps(prev => prev.filter((_, j) => j !== i))}
              style={{ padding: '4px 8px', border: 'none', background: '#FEE2E2', color: '#EF4444', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
            >×</button>
          </div>
        ))}
        <button
          onClick={() => setOps(prev => [...prev, { operation: '', count: 10 }])}
          style={{ padding: '5px 12px', border: '1.5px dashed #CBD5E1', borderRadius: 8, background: 'none', color: '#64748B', fontSize: 12, cursor: 'pointer' }}
        >+ Agregar operación</button>
      </div>

      <button
        onClick={runSimulation} disabled={loading}
        style={{ padding: '9px 20px', background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: 'pointer', marginBottom: 16 }}
      >
        {loading ? 'Calculando...' : '🧮 Simular'}
      </button>

      {result && (
        <div style={{ background: '#F8FAFC', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            {[
              ['Usuarios', result.users.toLocaleString()],
              ['Créditos totales', result.total_credits.toLocaleString()],
              ['Costo USD total', `$${result.total_cost_usd}`],
              ['Costo por usuario', `$${result.cost_per_user_usd}`],
            ].map(([l, v]) => (
              <div key={l as string} style={{ background: '#fff', borderRadius: 8, padding: '10px 14px', border: '1px solid #E2E8F0', flex: 1, minWidth: 130 }}>
                <div style={{ fontSize: 10, color: '#64748B', marginBottom: 3 }}>{l}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#0F172A' }}>{v}</div>
              </div>
            ))}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Operación','Cant.','Créd. c/u','Créd. total','USD c/u','USD total','Calidad','Proveedor'].map(h => <th key={h} style={{ ...th, background: '#F1F5F9' }}>{h}</th>)}</tr></thead>
            <tbody>
              {result.breakdown.map((b, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ ...td, fontSize: 11 }}><code>{b.operation}</code></td>
                  <td style={td}>{b.count}</td>
                  <td style={{ ...td, fontWeight: 700, color: '#7C3AED' }}>{b.credits_each}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{b.credits_total.toLocaleString()}</td>
                  <td style={{ ...td, fontSize: 11 }}>${b.cost_usd_each.toFixed(6)}</td>
                  <td style={td}>${b.cost_usd_total.toFixed(4)}</td>
                  <td style={td}><span style={badge('#7C3AED')}>{b.quality_level}</span></td>
                  <td style={{ ...td, fontSize: 11 }}>{b.provider}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Sección: Benchmark mejorado (con trigger manual) ────────────────────────

function BenchmarkSection() {
  const qc = useQueryClient();
  const { data: results, isLoading } = useQuery({
    queryKey: ['ai_benchmark'],
    queryFn:  getAIBenchmarkSummary,
    staleTime: 300_000,
  });
  const { showToast } = useToast();
  const [running, setRunning] = useState(false);

  async function handleRunBenchmark() {
    setRunning(true);
    try {
      const res = await triggerBenchmark();
      if (res.ok) {
        showToast(`✓ Benchmark completado: ${res.total_runs} tests en ${(res.providers_tested ?? []).join(', ')}`);
        qc.invalidateQueries({ queryKey: ['ai_benchmark'] });
      } else {
        showToast('Benchmark no pudo ejecutarse — sin proveedores con API key');
      }
    } catch {
      showToast('Error al ejecutar benchmark');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>Benchmark de Proveedores</div>
        <button
          onClick={handleRunBenchmark} disabled={running}
          style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: '#1E293B', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
        >
          {running ? 'Ejecutando...' : '▶ Ejecutar ahora'}
        </button>
      </div>
      <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
        Resultados de los últimos 30 días. Usa los mismos prompts de referencia en todos los proveedores.
      </div>
      {isLoading ? <div style={{ color: '#94A3B8', fontSize: 13 }}>Cargando...</div>
       : !results?.length ? (
         <div style={{ color: '#94A3B8', fontSize: 13, padding: '16px 0', textAlign: 'center' as const }}>
           Sin datos de benchmark aún. Haz clic en "Ejecutar ahora" para lanzar el primer benchmark.
         </div>
       ) : (
         <table style={{ width: '100%', borderCollapse: 'collapse' }}>
           <thead>
             <tr>{['Proveedor','Modelo','Operación','Calidad','Latencia','Costo USD','Éxito','Muestras','Último run'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
           </thead>
           <tbody>
             {results.map((r, i) => (
               <tr key={i} style={{ borderBottom: '1px solid #F8FAFC' }}>
                 <td style={{ ...td, fontWeight: 600 }}>{r.provider_key}</td>
                 <td style={{ ...td, fontSize: 11 }}>{r.model_id.split('/').pop()}</td>
                 <td style={{ ...td, fontSize: 11 }}><code>{r.operation}</code></td>
                 <td style={{ ...td, minWidth: 90 }}><ScoreBar value={r.avg_quality ?? 0} /></td>
                 <td style={td}>{r.avg_latency_ms ?? 0}ms</td>
                 <td style={td}>${(r.avg_cost_usd ?? 0).toFixed(8)}</td>
                 <td style={td}>{r.success_rate ?? 0}%</td>
                 <td style={td}>{r.sample_count}</td>
                 <td style={{ ...td, fontSize: 11, color: '#94A3B8' }}>
                   {r.last_run ? new Date(r.last_run).toLocaleDateString('es-CO') : '—'}
                 </td>
               </tr>
             ))}
           </tbody>
         </table>
       )}
    </div>
  );
}

// ─── Panel de diagnóstico automático ─────────────────────────────────────────

interface DiagIssue {
  id:       string;
  severity: 'critical' | 'error' | 'warning' | 'info' | 'ok';
  title:    string;
  desc:     string;
  impact:   string;
  action?:  string;
  tab?:     SubTab;
}

const SEV_STYLE: Record<string, { bg: string; border: string; text: string; tag: string }> = {
  critical: { bg:'#FEF2F2', border:'#FECACA', text:'#DC2626', tag:'CRÍTICO'     },
  error:    { bg:'#FEF2F2', border:'#FCA5A5', text:'#EF4444', tag:'ERROR'       },
  warning:  { bg:'#FFFBEB', border:'#FDE68A', text:'#D97706', tag:'ADVERTENCIA' },
  info:     { bg:'#EFF6FF', border:'#BFDBFE', text:'#2563EB', tag:'INFO'        },
  ok:       { bg:'#F0FDF4', border:'#BBF7D0', text:'#16A34A', tag:'OK'          },
};

function DiagnosticsSection({ onNav }: { onNav: (tab: SubTab) => void }) {
  const { data: providers }  = useQuery({ queryKey:['ai_providers'],         queryFn: getAIProviders,        staleTime:120_000 });
  const { data: scores }     = useQuery({ queryKey:['ai_provider_scores'],   queryFn: getAIProviderScores,   staleTime:30_000  });
  const { data: pricing }    = useQuery({ queryKey:['ai_operation_pricing'], queryFn: getAIOperationPricing, staleTime:120_000 });
  const { data: governance } = useQuery({ queryKey:['ai_governance'],        queryFn: getAIGovernanceRules,  staleTime:120_000 });
  const { data: policies }   = useQuery({ queryKey:['ai_policies'],          queryFn: getAIRoutingPolicies,  staleTime:120_000 });

  const issues = useMemo<DiagIssue[]>(() => {
    const list: DiagIssue[] = [];

    const enabled = (providers ?? []).filter(p => p.enabled);
    if (enabled.length === 0) {
      list.push({ id:'no-providers', severity:'critical',
        title:'Sin proveedores habilitados',
        desc:'El Orchestrator no tiene ningún proveedor activo.',
        impact:'Ninguna operación IA puede ejecutarse.',
        action:'Ir a Proveedores', tab:'providers' });
    }

    const down = (scores ?? []).filter(s => s.status === 'down');
    if (down.length > 0) {
      list.push({ id:'down', severity:'error',
        title:`${down.length} proveedor(es) sin respuesta`,
        desc:`${down.map(s => s.name).join(', ')} reporta estado "down".`,
        impact:'El Orchestrator usará fallback o fallará si no hay alternativa.',
        action:'Ver salud', tab:'health' });
    }

    const unconfigured = (scores ?? []).filter(s => s.status === 'unconfigured');
    if (unconfigured.length > 0) {
      const keys = unconfigured.map(s => {
        const p = (providers ?? []).find(p2 => p2.provider_key === s.provider_key);
        return p?.api_key_secret ?? s.provider_key;
      });
      list.push({ id:'secrets', severity:'warning',
        title:'API Key(s) no configuradas en Deno Secrets',
        desc:`Secrets faltantes: ${keys.join(', ')}. Configurar en Supabase → Edge Functions → Secrets.`,
        impact:'Los proveedores sin key no pueden procesar llamadas.',
        action:'Ver proveedores', tab:'providers' });
    }

    const circuitOpen = (scores ?? []).filter(s => s.is_circuit_open);
    if (circuitOpen.length > 0) {
      list.push({ id:'circuit', severity:'warning',
        title:'Circuit breaker activado',
        desc:`${circuitOpen.map(s => s.name).join(', ')} tiene el circuit breaker abierto por errores repetidos.`,
        impact:'El Orchestrator omite ese proveedor automáticamente hasta que se recupere.',
        action:'Verificar salud', tab:'health' });
    }

    const stale = (scores ?? []).filter(s => {
      const ts = getCheckedAt(s);
      if (!ts) return true;
      return Date.now() - new Date(ts).getTime() > 30 * 60_000;
    });
    if (stale.length > 0 && (scores ?? []).length > 0) {
      list.push({ id:'stale', severity:'info',
        title:'Health check desactualizado (>30 min)',
        desc:`${stale.length} proveedor(es) sin verificación reciente.`,
        impact:'El estado mostrado puede no reflejar la realidad actual.',
        action:'Verificar ahora', tab:'health' });
    }

    const degraded = (scores ?? []).filter(s => s.status === 'degraded');
    if (degraded.length > 0) {
      list.push({ id:'degraded', severity:'warning',
        title:`${degraded.length} proveedor(es) degradado(s)`,
        desc:`${degraded.map(s => s.name).join(', ')} responde con latencia elevada (>5s).`,
        impact:'Los usuarios experimentarán tiempos de respuesta mayores en operaciones IA.',
        action:'Ver observabilidad', tab:'observability' });
    }

    if ((governance ?? []).length > 0 && !(governance ?? []).some(r => r.enabled)) {
      list.push({ id:'gov', severity:'info',
        title:'Sin reglas de gobernanza activas',
        desc:'Todas las reglas GDPR/LGPD están desactivadas.',
        impact:'Datos sensibles (PII) no son filtrados automáticamente.',
        action:'Ver gobernanza', tab:'governance' });
    }

    if ((pricing ?? []).length > 0 && !(pricing ?? []).some(p => p.cache_enabled)) {
      list.push({ id:'cache-off', severity:'info',
        title:'Cache IA deshabilitada en todas las operaciones',
        desc:'Ninguna operación tiene cache activo.',
        impact:'Cada prompt consume créditos aunque el contenido sea idéntico al anterior.',
        action:'Ver rentabilidad', tab:'pricing' });
    }

    if ((policies ?? []).length === 0) {
      list.push({ id:'no-policies', severity:'info',
        title:'Sin políticas de routing configuradas',
        desc:'El Orchestrator usa scoring dinámico sin restricciones adicionales.',
        impact:'Configuración válida — sin control granular por operación o workspace.',
        action:'Ver políticas', tab:'policies' });
    }

    if (!list.some(i => ['critical','error','warning'].includes(i.severity))) {
      list.push({ id:'ok', severity:'ok',
        title:'✅ Sistema AI Orchestrator operando correctamente',
        desc:'Todos los checks pasan. Sin problemas detectados.',
        impact:'' });
    }

    const ORDER: Record<string,number> = { critical:0, error:1, warning:2, info:3, ok:4 };
    return list.sort((a, b) => (ORDER[a.severity] ?? 9) - (ORDER[b.severity] ?? 9));
  }, [providers, scores, pricing, governance, policies]);

  return (
    <div style={card}>
      <div style={{ fontWeight:800, fontSize:15, color:'#0F172A', marginBottom:4 }}>🔬 Diagnóstico Automático</div>
      <div style={{ fontSize:12, color:'#64748B', marginBottom:16 }}>
        Detección automática de problemas en el AI Orchestrator. Se recalcula con los datos en caché.
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {issues.map(issue => {
          const s = SEV_STYLE[issue.severity] ?? SEV_STYLE['info'];
          return (
            <div key={issue.id} style={{
              background:s.bg, border:`1px solid ${s.border}`,
              borderRadius:10, padding:'12px 16px',
              display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12,
            }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <span style={{ padding:'1px 7px', borderRadius:20, fontSize:10, fontWeight:800, color:s.text, background:s.text+'20' }}>{s.tag}</span>
                  <span style={{ fontWeight:700, fontSize:13, color:'#0F172A' }}>{issue.title}</span>
                </div>
                <div style={{ fontSize:12, color:'#475569', marginBottom: issue.impact ? 4 : 0 }}>{issue.desc}</div>
                {issue.impact && (
                  <div style={{ fontSize:11, color:'#64748B', fontStyle:'italic' }}>Impacto: {issue.impact}</div>
                )}
              </div>
              {issue.action && issue.tab && (
                <button
                  onClick={() => onNav(issue.tab!)}
                  style={{ padding:'5px 12px', borderRadius:8, border:'none', background:s.text, color:'#fff', fontWeight:700, fontSize:11, cursor:'pointer', flexShrink:0, whiteSpace:'nowrap' as const }}
                >
                  {issue.action} →
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Visor de logs filtrable ──────────────────────────────────────────────────

function LogsSection() {
  const [filterProvider, setFilterProvider] = useState('');
  const [filterOp,       setFilterOp]       = useState('');
  const [filterSuccess,  setFilterSuccess]  = useState<''|'true'|'false'>('');
  const [limit,          setLimit]          = useState(50);

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['ai_request_logs', filterProvider, filterOp, filterSuccess, limit],
    queryFn:  () => getAIRequestLogs({
      provider:  filterProvider  || undefined,
      operation: filterOp        || undefined,
      success:   filterSuccess === '' ? undefined : filterSuccess === 'true',
      limit,
    }),
    staleTime: 30_000,
  });

  const fStyle: React.CSSProperties = {
    border:'1.5px solid #E2E8F0', borderRadius:8, padding:'6px 10px',
    fontSize:12, outline:'none', background:'#fff',
  };

  return (
    <div style={card}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <div>
          <div style={{ fontWeight:800, fontSize:15, color:'#0F172A' }}>📋 Visor de Logs IA</div>
          <div style={{ fontSize:12, color:'#64748B', marginTop:2 }}>
            Historial de llamadas al AI Orchestrator. Sin credenciales expuestas.
          </div>
        </div>
        <button
          onClick={() => refetch()}
          style={{ padding:'6px 12px', border:'1.5px solid #E2E8F0', borderRadius:8, background:'#fff', fontSize:12, cursor:'pointer', fontWeight:600 }}
        >
          ↻ Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
        <select value={filterProvider} onChange={e => setFilterProvider(e.target.value)} style={fStyle}>
          <option value="">Todos los proveedores</option>
          <option value="gemini">Gemini</option>
          <option value="nvidia">NVIDIA</option>
        </select>
        <input
          value={filterOp} onChange={e => setFilterOp(e.target.value)}
          placeholder="Filtrar por operación..."
          style={{ ...fStyle, width:200 }}
        />
        <select value={filterSuccess} onChange={e => setFilterSuccess(e.target.value as ''|'true'|'false')} style={fStyle}>
          <option value="">Todos los estados</option>
          <option value="true">Solo éxitos</option>
          <option value="false">Solo errores</option>
        </select>
        <select value={limit} onChange={e => setLimit(+e.target.value)} style={fStyle}>
          {[25, 50, 100, 200].map(l => <option key={l} value={l}>Últimos {l}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div style={{ color:'#94A3B8', fontSize:13, padding:'24px 0', textAlign:'center' as const }}>Cargando logs...</div>
      ) : !(logs?.length) ? (
        <div style={{ color:'#94A3B8', fontSize:13, padding:'24px 0', textAlign:'center' as const }}>
          Sin logs. Se generan con el primer tráfico IA procesado por el Orchestrator.
        </div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:860 }}>
            <thead>
              <tr>
                {['Proveedor','Operación','Estado','Latencia','Tokens','Créditos','Cache','Fallback','Error','Hora'].map(h =>
                  <th key={h} style={th}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {(logs as AIRequestLogEntry[]).map(log => (
                <tr key={log.id} style={{ borderBottom:'1px solid #F8FAFC', opacity: log.success ? 1 : .88 }}>
                  <td style={td}>
                    <div style={{ fontWeight:600, fontSize:12 }}>{log.provider_selected}</div>
                    {log.model_selected && <div style={{ fontSize:10, color:'#94A3B8' }}>{log.model_selected.split('/').pop()}</div>}
                  </td>
                  <td style={{ ...td, fontSize:11 }}><code>{log.operation}</code></td>
                  <td style={td}>
                    {log.success
                      ? <span style={badge('#10B981')}>✓ OK</span>
                      : <span style={badge('#EF4444')}>✗ Error</span>}
                  </td>
                  <td style={td}>
                    {log.latency_ms != null
                      ? <span style={{ fontWeight:700, color: log.latency_ms < 2000 ? '#10B981' : log.latency_ms < 5000 ? '#F59E0B' : '#EF4444' }}>
                          {log.latency_ms}ms
                        </span>
                      : '—'}
                  </td>
                  <td style={{ ...td, color:'#64748B' }}>{log.tokens_total?.toLocaleString() ?? '—'}</td>
                  <td style={{ ...td, fontWeight:700, color:'#7C3AED' }}>{log.credits_consumed}</td>
                  <td style={td}>{log.cache_hit ? <span style={badge('#10B981')}>HIT</span> : <span style={{ color:'#CBD5E1', fontSize:11 }}>—</span>}</td>
                  <td style={td}>{log.fallback_used ? <span style={badge('#F59E0B')}>sí</span> : <span style={{ color:'#CBD5E1', fontSize:11 }}>—</span>}</td>
                  <td style={{ ...td, maxWidth:160 }}>
                    {log.error_code && (
                      <span title={log.error_message ?? ''} style={{ fontSize:10, color:'#EF4444', cursor:'help', wordBreak:'break-all' as const }}>
                        {log.error_code}
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, fontSize:11, color:'#94A3B8', whiteSpace:'nowrap' as const }}>
                    {new Date(log.created_at).toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab principal ────────────────────────────────────────────────────────────

type SubTab = 'health' | 'providers' | 'pricing' | 'capabilities' | 'policies' | 'governance' | 'prompts' | 'observability' | 'simulator' | 'finops' | 'cache' | 'benchmark' | 'diagnostics' | 'logs';

const SUB_TABS: Array<{ key: SubTab; label: string }> = [
  { key: 'health',       label: '🏥 Salud' },
  { key: 'diagnostics',  label: '🔬 Diagnóstico' },
  { key: 'logs',         label: '📋 Logs' },
  { key: 'providers',    label: '🔌 Proveedores' },
  { key: 'pricing',      label: '💰 Rentabilidad' },
  { key: 'capabilities', label: '🧩 Capacidades' },
  { key: 'policies',     label: '📋 Políticas' },
  { key: 'governance',   label: '🛡️ Gobernanza' },
  { key: 'prompts',      label: '📝 Prompts' },
  { key: 'observability',label: '📡 Observabilidad' },
  { key: 'simulator',    label: '🧮 Simulador' },
  { key: 'finops',       label: '📊 FinOps' },
  { key: 'cache',        label: '⚡ Cache' },
  { key: 'benchmark',    label: '🏁 Benchmark' },
];

export function IAOrchestratorTab() {
  const [sub, setSub] = useState<SubTab>('health');
  const navigate = setSub; // alias semántico para onNav

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#0F172A' }}>AI Orchestrator — Enterprise</div>
        <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
          Motor de orquestación multi-proveedor con gobernanza, capacidades, políticas y observabilidad. El usuario siempre ve "Shelwi AI".
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {SUB_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            style={{
              padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 12,
              background: sub === t.key ? '#7C3AED' : '#EEF2F7',
              color:      sub === t.key ? '#fff' : '#475569',
              transition: 'background .15s, color .15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {sub === 'health'        && <ProviderHealthSection />}
      {sub === 'diagnostics'   && <DiagnosticsSection onNav={navigate} />}
      {sub === 'logs'          && <LogsSection />}
      {sub === 'providers'     && <ProvidersSection />}
      {sub === 'pricing'       && <OperationPricingSection />}
      {sub === 'capabilities'  && <CapabilitiesSection />}
      {sub === 'policies'      && <PoliciesSection />}
      {sub === 'governance'    && <GovernanceSection />}
      {sub === 'prompts'       && <PromptVersioningSection />}
      {sub === 'observability' && <ObservabilitySection />}
      {sub === 'simulator'     && <CostSimulatorSection />}
      {sub === 'finops'        && <FinOpsSection />}
      {sub === 'cache'         && <CacheSection />}
      {sub === 'benchmark'     && <BenchmarkSection />}
    </div>
  );
}
