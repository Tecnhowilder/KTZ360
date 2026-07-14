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
import { useState } from 'react';
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
  type AIProviderScore,
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ok:           '#10B981',
    degraded:     '#F59E0B',
    down:         '#EF4444',
    unknown:      '#94A3B8',
    unconfigured: '#7C3AED',
    disabled:     '#CBD5E1',
  };
  const color = map[status] ?? '#94A3B8';
  return <span style={badge(color)}>{status.toUpperCase()}</span>;
}

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

// ─── Sección: Estado de Proveedores ──────────────────────────────────────────

function ProviderHealthSection() {
  const { data: scores, refetch, isFetching } = useQuery({
    queryKey: ['ai_provider_scores'],
    queryFn:  getAIProviderScores,
    staleTime: 60_000,
  });
  const { showToast } = useToast();
  const [checking, setChecking] = useState(false);

  async function handleCheck() {
    setChecking(true);
    try {
      const result = await triggerHealthCheck();
      console.log('[health-check] result:', result);
      await refetch();
      showToast('✓ Health check completado');
    } catch (e) {
      console.error('[health-check] error:', e);
      const msg = (e as Error)?.message ?? String(e);
      showToast(`Error: ${msg.slice(0, 120)}`);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#0F172A' }}>Estado de Proveedores IA</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Score compuesto = Calidad 35% + Disponibilidad 30% + Costo 20% + Prioridad 15%</div>
        </div>
        <button
          onClick={handleCheck} disabled={checking || isFetching}
          style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: '#7C3AED', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
        >
          {checking ? 'Verificando...' : '⚡ Verificar ahora'}
        </button>
      </div>

      {!scores?.length ? (
        <div style={{ color: '#94A3B8', fontSize: 13, padding: 12 }}>Cargando...</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Proveedor','Estado','Latencia','Disponibilidad','Calidad','Costo','Score','Circuito','Última verificación'].map(h =>
                <th key={h} style={th}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {scores.map((s: AIProviderScore) => (
              <tr key={s.provider_key} style={{ borderBottom: '1px solid #F8FAFC' }}>
                <td style={td}>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: '#94A3B8' }}>{s.provider_key}</div>
                </td>
                <td style={td}><StatusBadge status={s.status} /></td>
                <td style={td}>{s.latency_ms != null ? `${s.latency_ms}ms` : '—'}</td>
                <td style={{ ...td, minWidth: 100 }}><ScoreBar value={s.availability_score ?? 100} /></td>
                <td style={{ ...td, minWidth: 100 }}><ScoreBar value={s.quality_score} /></td>
                <td style={{ ...td, minWidth: 100 }}><ScoreBar value={s.cost_score} /></td>
                <td style={td}>
                  <span style={{ fontWeight: 800, color: '#7C3AED', fontSize: 15 }}>{(s.composite_score ?? 0).toFixed(1)}</span>
                </td>
                <td style={td}>
                  {s.is_circuit_open
                    ? <span style={badge('#EF4444')}>ABIERTO</span>
                    : <span style={badge('#10B981')}>CERRADO</span>}
                </td>
                <td style={{ ...td, fontSize: 11, color: '#94A3B8' }}>
                  {s.checked_at ? new Date(s.checked_at).toLocaleTimeString('es-CO') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

// ─── Tab principal ────────────────────────────────────────────────────────────

type SubTab = 'health' | 'providers' | 'pricing' | 'capabilities' | 'policies' | 'governance' | 'prompts' | 'observability' | 'simulator' | 'finops' | 'cache' | 'benchmark';

const SUB_TABS: Array<{ key: SubTab; label: string }> = [
  { key: 'health',       label: '🏥 Salud' },
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
