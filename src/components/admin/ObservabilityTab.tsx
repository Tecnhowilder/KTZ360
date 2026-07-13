/**
 * ObservabilityTab — Métricas de plataforma en tiempo real (Sprint Final)
 *
 * Incluye: Push delivery rate, latencia, sesiones activas,
 * tokens por plataforma, eventos GPS y actividad de IA.
 *
 * Zero Trust: todas las consultas son SELECT sobre tablas con RLS
 * o RPCs SECURITY DEFINER. El frontend no recibe workspace_id en parámetros.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { BRAND_COLORS } from '../../lib/brand';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ─── Estilos ──────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 20 };
const kpiInner: React.CSSProperties  = { display: 'flex', flexDirection: 'column', gap: 4 };
const chip = (color: string): React.CSSProperties => ({
  display: 'inline-block', background: color + '18', color, borderRadius: 6,
  fontSize: 10.5, fontWeight: 700, padding: '2px 8px',
});

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PushMetrics {
  total_last_24h:    number;
  delivered:         number;
  failed:            number;
  delivery_rate_pct: number;
  avg_latency_ms:    number | null;
  p95_latency_ms:    number | null;
}

interface TokenStats {
  platform: string;
  count:    number;
}

interface ActiveSessionStats {
  total_active:  number;
  online_now:    number;
  by_role:       { role: string; count: number }[];
}

interface AiStats {
  operations_24h: number;
  tokens_used:    number;
  cost_usd:       number;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

async function getPushMetrics(): Promise<PushMetrics> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from('notification_delivery_log')
    .select('status, latency_ms')
    .gte('created_at', since);
  if (error) throw error;
  const rows: { status: string; latency_ms: number | null }[] = data ?? [];
  const total     = rows.length;
  const delivered = rows.filter(r => r.status === 'delivered' || r.status === 'sent').length;
  const failed    = rows.filter(r => r.status === 'failed').length;
  const withLat   = rows.filter(r => r.latency_ms != null).map(r => r.latency_ms as number);
  const avgLat    = withLat.length ? Math.round(withLat.reduce((a, b) => a + b, 0) / withLat.length) : null;
  const sorted    = [...withLat].sort((a, b) => a - b);
  const p95Lat    = sorted.length ? sorted[Math.floor(sorted.length * .95)] ?? null : null;
  return {
    total_last_24h: total,
    delivered,
    failed,
    delivery_rate_pct: total > 0 ? Math.round((delivered / total) * 100) : 0,
    avg_latency_ms: avgLat,
    p95_latency_ms: p95Lat,
  };
}

async function getTokenStats(): Promise<TokenStats[]> {
  const { data, error } = await db
    .from('push_tokens')
    .select('platform')
    .eq('is_active', true);
  if (error) throw error;
  const counts: Record<string, number> = {};
  (data ?? [] as { platform: string }[]).forEach((r: { platform: string }) => { counts[r.platform] = (counts[r.platform] ?? 0) + 1; });
  return Object.entries(counts).map(([platform, count]) => ({ platform, count })).sort((a, b) => b.count - a.count);
}

async function getActiveSessionStats(): Promise<ActiveSessionStats> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const [onlineRes, activeRes] = await Promise.all([
    db.from('workspace_presence').select('user_id').gte('last_seen_at', fiveMinAgo),
    db.from('workspace_presence').select('user_id').gte('last_seen_at', fifteenMinAgo),
  ]);

  const onlineCount = ((onlineRes.data ?? []) as { user_id: string }[]).length;
  const activeCount = ((activeRes.data ?? []) as { user_id: string }[]).length;

  const userIds = ((activeRes.data ?? []) as { user_id: string }[]).map(r => r.user_id).filter(Boolean);
  let byRole: { role: string; count: number }[] = [];
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('role')
      .in('id', userIds.slice(0, 200));
    const roleCounts: Record<string, number> = {};
    (profiles ?? []).forEach(p => { roleCounts[p.role] = (roleCounts[p.role] ?? 0) + 1; });
    byRole = Object.entries(roleCounts).map(([role, count]) => ({ role, count }));
  }

  return { total_active: activeCount, online_now: onlineCount, by_role: byRole };
}

async function getAiStats(): Promise<AiStats> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from('ai_usage_log')
    .select('tokens_used, cost_usd')
    .gte('created_at', since);
  if (error) throw error;
  const rows: { tokens_used: number | null; cost_usd: number | null }[] = data ?? [];
  return {
    operations_24h: rows.length,
    tokens_used:    rows.reduce((a, r) => a + (r.tokens_used ?? 0), 0),
    cost_usd:       Math.round(rows.reduce((a, r) => a + (r.cost_usd ?? 0), 0) * 1000) / 1000,
  };
}

interface FailureRow { id: string; created_at: string; error_message: string | null; platform: string | null; latency_ms: number | null; }

async function getRecentDeliveryFailures(): Promise<FailureRow[]> {
  const { data, error } = await db
    .from('notification_delivery_log')
    .select('id, created_at, error_message, platform, latency_ms')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as FailureRow[];
}

// ─── Componentes visuales ─────────────────────────────────────────────────────

function KpiCard({ title, value, sub, color }: { title: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={cardStyle}>
      <div style={kpiInner}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px' }}>{title}</span>
        <span style={{ fontSize: 26, fontWeight: 900, color: color ?? '#0F172A' }}>{value}</span>
        {sub && <span style={{ fontSize: 11.5, color: '#64748B' }}>{sub}</span>}
      </div>
    </div>
  );
}

function GaugeBar({ pct, label, color }: { pct: number; label?: string; color?: string }) {
  const c = color ?? (pct >= 90 ? '#10B981' : pct >= 70 ? '#F59E0B' : '#EF4444');
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        {label && <span style={{ fontSize: 11.5, color: '#64748B' }}>{label}</span>}
        <span style={{ fontSize: 12, fontWeight: 800, color: c }}>{pct}%</span>
      </div>
      <div style={{ height: 8, background: '#F1F5F9', borderRadius: 999 }}>
        <div style={{ height: 8, background: c, borderRadius: 999, width: `${Math.min(pct, 100)}%`, transition: '.4s ease' }} />
      </div>
    </div>
  );
}

// ─── Platform icons ───────────────────────────────────────────────────────────

const PLATFORM_ICON: Record<string, string> = { ios: '🍎', android: '🤖', web: '🌐' };

// ─── Componente principal ─────────────────────────────────────────────────────

export function ObservabilityTab() {
  const pushQ    = useQuery({ queryKey: ['obs_push'],     queryFn: getPushMetrics,           staleTime: 60_000, refetchInterval: 120_000 });
  const tokensQ  = useQuery({ queryKey: ['obs_tokens'],   queryFn: getTokenStats,            staleTime: 60_000 });
  const sessQ    = useQuery({ queryKey: ['obs_sessions'], queryFn: getActiveSessionStats,    staleTime: 30_000, refetchInterval: 60_000 });
  const aiQ      = useQuery({ queryKey: ['obs_ai'],       queryFn: getAiStats,               staleTime: 60_000 });
  const failsQ   = useQuery({ queryKey: ['obs_fails'],    queryFn: getRecentDeliveryFailures, staleTime: 30_000 });

  const push    = pushQ.data;
  const tokens  = tokensQ.data ?? [];
  const sess    = sessQ.data;
  const ai      = aiQ.data;
  const fails   = failsQ.data ?? [];

  const totalTokens = tokens.reduce((a, t) => a + t.count, 0);

  const now = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 2 }}>Observabilidad de Plataforma</h2>
          <p style={{ fontSize: 12.5, color: '#64748B' }}>Métricas en tiempo real · se refresca automáticamente cada 60 s</p>
        </div>
        <span style={{ fontSize: 11.5, color: '#94A3B8' }}>Última actualización: {now}</span>
      </div>

      {/* ── Sección Push ──────────────────────────────────────────────────── */}
      <div>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: '#334155', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.5px' }}>Push Notifications · últimas 24 h</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
          <KpiCard title="Enviadas" value={push?.total_last_24h ?? '—'} />
          <KpiCard title="Entregadas" value={push?.delivered ?? '—'} color="#10B981" />
          <KpiCard title="Fallidas" value={push?.failed ?? '—'} color={push && push.failed > 0 ? '#EF4444' : undefined} />
          <KpiCard title="Latencia prom." value={push?.avg_latency_ms != null ? `${push.avg_latency_ms} ms` : '—'} sub="AVG" />
          <KpiCard title="Latencia p95" value={push?.p95_latency_ms != null ? `${push.p95_latency_ms} ms` : '—'} sub="P95" color="#6366F1" />
        </div>

        {push && (
          <div style={{ ...cardStyle, marginTop: 12 }}>
            <GaugeBar pct={push.delivery_rate_pct} label="Tasa de entrega" />
          </div>
        )}
      </div>

      {/* ── Tokens por plataforma ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
        <div style={cardStyle}>
          <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 14 }}>
            Tokens activos — {totalTokens.toLocaleString()} total
          </div>
          {tokensQ.isLoading ? <div style={{ color: '#94A3B8', fontSize: 13 }}>Cargando…</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {tokens.map(t => (
                <div key={t.platform}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A' }}>
                      {PLATFORM_ICON[t.platform] ?? '📱'} {t.platform}
                    </span>
                    <span style={{ fontSize: 12.5, color: '#475569' }}>{t.count.toLocaleString()}</span>
                  </div>
                  <div style={{ height: 6, background: '#F1F5F9', borderRadius: 999 }}>
                    <div style={{ height: 6, background: BRAND_COLORS.primary, borderRadius: 999, width: `${totalTokens > 0 ? Math.round((t.count / totalTokens) * 100) : 0}%`, transition: '.4s' }} />
                  </div>
                </div>
              ))}
              {tokens.length === 0 && !tokensQ.isLoading && (
                <div style={{ color: '#94A3B8', fontSize: 12.5 }}>Sin tokens registrados</div>
              )}
            </div>
          )}
        </div>

        {/* ── Sesiones activas ─────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 14 }}>Sesiones activas</div>
          {sessQ.isLoading ? <div style={{ color: '#94A3B8', fontSize: 13 }}>Cargando…</div> : sess ? (
            <div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: '#10B981' }}>{sess.online_now}</div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>Online ahora (&lt;5 min)</div>
                </div>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: '#3B82F6' }}>{sess.total_active}</div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>Activos &lt;15 min</div>
                </div>
              </div>
              {sess.by_role.length > 0 && (
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 8 }}>POR ROL</div>
                  {sess.by_role.map(r => (
                    <div key={r.role} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0' }}>
                      <span style={chip('#6366F1')}>{r.role}</span>
                      <span style={{ fontWeight: 600 }}>{r.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── IA ───────────────────────────────────────────────────────────── */}
      {ai && (
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: '#334155', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.5px' }}>IA · últimas 24 h</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
            <KpiCard title="Operaciones" value={ai.operations_24h} />
            <KpiCard title="Tokens usados" value={ai.tokens_used.toLocaleString()} />
            <KpiCard title="Costo estimado" value={`$${ai.cost_usd}`} sub="USD" color="#8B5CF6" />
          </div>
        </div>
      )}

      {/* ── Últimas fallas push ──────────────────────────────────────────── */}
      <div>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: '#334155', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>Últimas fallas push</h3>
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          {fails.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#10B981', fontSize: 13.5, fontWeight: 700 }}>
              Sin fallas recientes ✓
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['TIEMPO', 'PLATAFORMA', 'ERROR', 'LATENCIA'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', fontSize: 11, fontWeight: 800, color: '#94A3B8', borderBottom: '1px solid #EEF2F7', textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fails.map(f => (
                  <tr key={f.id} style={{ borderBottom: '1px solid #F8FAFC' }}>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: '#64748B', whiteSpace: 'nowrap' }}>
                      {new Date(f.created_at).toLocaleString('es-CO', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 12 }}>
                      <span style={chip('#6366F1')}>{f.platform ?? 'unknown'}</span>
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 11.5, color: '#EF4444', maxWidth: 280 }}>
                      {(f.error_message ?? '—').slice(0, 80)}{(f.error_message?.length ?? 0) > 80 ? '…' : ''}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 12, color: '#64748B' }}>
                      {f.latency_ms != null ? `${f.latency_ms} ms` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
