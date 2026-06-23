/**
 * CustomerSuccessPage — Sprint 15
 * /app/customer-success — Mobile-first 390/430px
 * Todo desde backend — Zero Trust.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, ArrowLeft, RefreshCw, Star, AlertTriangle, TrendingUp, MessageSquare } from 'lucide-react';
import { getNpsSummary, getReviews, starLabel } from '../services/reviews';
import {
  useCustomerSuccessDashboard, useClientsAtRisk,
  useVipClients, useRepurchaseOpportunities, useRecalculateHealthScores,
} from '../hooks/useCustomerSuccess';
import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useUI } from '../features/app/UIProvider';
import {
  HEALTH_STATUS_META, RISK_CATEGORY_META, formatCurrencyCompact,
  type HealthStatus,
} from '../services/customerSuccess';
import { formatCurrencyCOP } from '../lib/currency';

// ─── Score ring visual ────────────────────────────────────────────────────────

function ScoreRing({ score, status }: { score: number; status: HealthStatus }) {
  const meta  = HEALTH_STATUS_META[status];
  const R = 28; const C = 2 * Math.PI * R;
  const dash = (score / 100) * C;
  return (
    <div style={{ position: 'relative', width: 72, height: 72 }}>
      <svg width={72} height={72} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={36} cy={36} r={R} fill="none" stroke="#F1F5F9" strokeWidth={6} />
        <circle cx={36} cy={36} r={R} fill="none" stroke={meta.dotColor} strokeWidth={6}
          strokeDasharray={`${dash} ${C - dash}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: meta.color, lineHeight: 1 }}>{Math.round(score)}</div>
        <div style={{ fontSize: 9, color: '#94A3B8', fontWeight: 700 }}>/ 100</div>
      </div>
    </div>
  );
}

// ─── Client card ──────────────────────────────────────────────────────────────

function ClientCard({ name, email, score, status, badge, sub }: {
  name: string; email: string | null; score: number; status: HealthStatus;
  badge?: string; sub?: string;
}) {
  const meta = HEALTH_STATUS_META[status];
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
      <ScoreRing score={score} status={status} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        {email && <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 1 }}>{email}</div>}
        {sub && <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{sub}</div>}
      </div>
      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: meta.bg, color: meta.color, flexShrink: 0 }}>
        {badge ?? meta.icon + ' ' + meta.label}
      </span>
    </div>
  );
}

// ─── Sin acceso ───────────────────────────────────────────────────────────────

function NoAccess() {
  const { openUpgradeModal } = useUI();
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(135deg, #FFF1F2, #FFE4E6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <Heart size={28} color="#E11D48" />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: '0 0 8px' }}>Customer Success</h2>
      <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 24px', lineHeight: 1.6 }}>
        Detecta clientes VIP, en riesgo y oportunidades de recompra. Disponible en PRO y PREMIUM.
      </p>
      <button onClick={() => openUpgradeModal({ title: 'Customer Success', message: 'Detecta y recupera clientes automáticamente.', targetPlan: 'pro', ctaLabel: 'Ver planes PRO' })}
        style={{ background: '#E11D48', color: '#fff', border: 'none', borderRadius: 14, padding: '13px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
        Activar PRO
      </button>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'resumen' | 'riesgo' | 'vip' | 'recompra' | 'nps';

// ─── Componente principal ─────────────────────────────────────────────────────

export function CustomerSuccessPage() {
  const navigate    = useNavigate();
  const [tab, setTab] = useState<Tab>('resumen');
  const { workspace } = useWorkspace();
  const dashQ       = useCustomerSuccessDashboard();
  const riskQ       = useClientsAtRisk();
  const vipQ        = useVipClients();
  const repQ        = useRepurchaseOpportunities();
  const recalcMut   = useRecalculateHealthScores();
  const npsQ        = useQuery({
    queryKey: ['nps', workspace.id],
    queryFn:  () => getNpsSummary(workspace.id),
    staleTime: 60_000, retry: false, enabled: tab === 'nps',
  });
  const reviewsQ    = useQuery({
    queryKey: ['reviews', workspace.id],
    queryFn:  () => getReviews(workspace.id),
    staleTime: 60_000, retry: false, enabled: tab === 'nps',
  });

  const isError     = dashQ.isError;

  if (isError) {
    return (
      <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 80 }}>
        <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><ArrowLeft size={20} /></button>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>Customer Success</div>
        </div>
        <NoAccess />
      </div>
    );
  }

  const d = dashQ.data?.summary;

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'resumen',  label: 'Resumen',   icon: <TrendingUp size={14} /> },
    { key: 'riesgo',   label: `Riesgo (${(d?.riesgo ?? 0) + (d?.critico ?? 0) + (d?.perdido ?? 0)})`, icon: <AlertTriangle size={14} /> },
    { key: 'vip',      label: `VIP (${d?.vip ?? 0})`,   icon: <Star size={14} /> },
    { key: 'recompra', label: 'Recompra', icon: <RefreshCw size={14} /> },
    { key: 'nps',      label: 'Reseñas',  icon: <MessageSquare size={14} /> },
  ];

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px 0', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#0F172A' }}><ArrowLeft size={20} /></button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Heart size={18} color="#E11D48" /> Customer Success
            </div>
            {d?.last_updated && (
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>
                Actualizado {new Date(d.last_updated).toLocaleString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
          <button onClick={() => recalcMut.mutate()} disabled={recalcMut.isPending}
            style={{ border: 'none', background: '#F1F5F9', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            title="Recalcular scores">
            <RefreshCw size={16} color="#374151" style={{ animation: recalcMut.isPending ? 'spin .8s linear infinite' : 'none' }} />
          </button>
        </div>
        <div style={{ display: 'flex', overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
              padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? '#E11D48' : '#94A3B8',
              borderBottom: tab === t.key ? '2px solid #E11D48' : '2px solid transparent',
            }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {dashQ.isLoading ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#94A3B8' }}>Calculando scores...</div>
        ) : (
          <>
            {/* TAB RESUMEN */}
            {tab === 'resumen' && d && (
              <>
                {/* Score promedio */}
                <div style={{ background: 'linear-gradient(135deg, #881337 0%, #E11D48 100%)', borderRadius: 18, padding: '16px 20px', color: '#fff' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.7)', marginBottom: 4 }}>SALUD PROMEDIO DEL NEGOCIO</div>
                  <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-1px' }}>{d.avg_score}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.7)' }}>de 100 puntos · {d.total_clients} clientes analizados</div>
                </div>

                {/* KPI grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                  {([
                    { key: 'vip',      label: 'VIP',        value: d.vip,      meta: HEALTH_STATUS_META.vip },
                    { key: 'saludable',label: 'Saludables', value: d.saludable, meta: HEALTH_STATUS_META.saludable },
                    { key: 'riesgo',   label: 'En riesgo',  value: d.riesgo + d.critico + d.perdido, meta: HEALTH_STATUS_META.riesgo },
                  ] as const).map(k => (
                    <div key={k.key} style={{ background: k.meta.bg, borderRadius: 14, padding: '12px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: k.meta.color }}>{k.value}</div>
                      <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 2 }}>{k.label}</div>
                    </div>
                  ))}
                </div>

                {/* Distribución de scores */}
                <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Distribución de salud</div>
                  {dashQ.data?.score_distribution && Object.entries(dashQ.data.score_distribution).map(([range, cnt]) => {
                    const total = d.total_clients || 1;
                    const pct = Math.round((cnt / total) * 100);
                    const colors: Record<string, string> = { '0_20':'#DC2626','20_40':'#EF4444','40_60':'#F59E0B','60_80':'#22C55E','80_100':'#7C3AED' };
                    const labels: Record<string, string> = { '0_20':'0-20','20_40':'20-40','40_60':'40-60','60_80':'60-80','80_100':'80-100' };
                    return (
                      <div key={range} style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 3 }}>
                          <span style={{ color: '#64748B', fontWeight: 600 }}>{labels[range]} pts</span>
                          <span style={{ color: '#94A3B8' }}>{cnt} · {pct}%</span>
                        </div>
                        <div style={{ height: 6, background: '#F1F5F9', borderRadius: 99 }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: colors[range], borderRadius: 99 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Top 5 en riesgo */}
                {(dashQ.data?.top_at_risk?.length ?? 0) > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 10 }}>Atención urgente</div>
                    {(dashQ.data?.top_at_risk ?? []).map(c => (
                      <ClientCard key={c.client_id} name={c.name} email={null} score={c.score}
                        status={c.risk_level === 'critico' ? 'critico' : 'riesgo'}
                        sub={`${c.days_inactive} días sin actividad`} />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* TAB RIESGO */}
            {tab === 'riesgo' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {riskQ.isLoading ? <div style={{ textAlign: 'center', padding: 24, color: '#94A3B8' }}>Cargando...</div> :
                riskQ.data?.clients_at_risk?.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#16A34A' }}>Sin clientes en riesgo</div>
                  </div>
                ) : riskQ.data?.clients_at_risk.map(c => (
                  <ClientCard key={c.client_id} name={c.name} email={c.email} score={c.score} status={c.status}
                    badge={RISK_CATEGORY_META[c.risk_category]?.label}
                    sub={`${formatCurrencyCompact(c.total_value)} histórico · ${c.total_approved} compras`} />
                ))}
              </div>
            )}

            {/* TAB VIP */}
            {tab === 'vip' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {vipQ.isLoading ? <div style={{ textAlign: 'center', padding: 24, color: '#94A3B8' }}>Cargando...</div> :
                vipQ.data?.vip_clients?.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>⭐</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#64748B' }}>Aún no hay clientes VIP</div>
                    <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>Los clientes con 2+ compras aprobadas y score alto llegarán aquí</div>
                  </div>
                ) : vipQ.data?.vip_clients.map(c => (
                  <ClientCard key={c.client_id} name={c.name} email={c.email} score={c.score} status="vip"
                    sub={`${formatCurrencyCOP(c.total_value)} · ${c.conversion_rate}% conversión`} />
                ))}
              </div>
            )}

            {/* TAB RECOMPRA */}
            {tab === 'recompra' && (
              <div>
                <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5, background: '#EFF6FF', borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>
                  <span style={{ fontWeight: 700, color: '#2563EB' }}>Patrón detectado</span> — clientes con historial de recompra que están próximos a volver según su ciclo habitual.
                </div>
                {repQ.isLoading ? <div style={{ textAlign: 'center', padding: 24, color: '#94A3B8' }}>Analizando patrones...</div> :
                repQ.data?.opportunities?.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#64748B' }}>Sin oportunidades detectadas</div>
                    <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>Se necesitan mínimo 2 compras por cliente para detectar patrones</div>
                  </div>
                ) : repQ.data?.opportunities.map(c => (
                  <div key={c.client_id} style={{ background: '#fff', borderRadius: 14, padding: '13px 14px', marginBottom: 10, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{c.total_approved} compras · ciclo ~{c.avg_days_between}d</div>
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: c.overdue_days > 0 ? '#FEF2F2' : '#EFF6FF', color: c.overdue_days > 0 ? '#DC2626' : '#2563EB' }}>
                        {c.overdue_days > 0 ? `${c.overdue_days}d vencido` : 'Próximo'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B' }}>
                      Último pedido hace {c.days_since_last} días · {formatCurrencyCOP(c.total_value)} histórico
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAB NPS + RESEÑAS */}
            {tab === 'nps' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* NPS Score */}
                {npsQ.data && (
                  <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Net Promoter Score</div>
                    {npsQ.data.nps_total_responses < 5 ? (
                      <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '16px 0' }}>
                        Se necesitan mínimo 5 respuestas para calcular el NPS.<br />
                        ({npsQ.data.nps_total_responses} respuestas hasta ahora)
                      </div>
                    ) : (
                      <>
                        <div style={{ textAlign: 'center', marginBottom: 14 }}>
                          <div style={{ fontSize: 56, fontWeight: 900, color: (npsQ.data.nps ?? 0) >= 50 ? '#16A34A' : (npsQ.data.nps ?? 0) >= 0 ? '#D97706' : '#DC2626' }}>
                            {npsQ.data.nps}
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#64748B' }}>{npsQ.data.nps_label}</div>
                          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>{npsQ.data.nps_total_responses} respuestas</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                          <div style={{ textAlign: 'center', background: '#F0FDF4', borderRadius: 12, padding: '10px 0' }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: '#16A34A' }}>{npsQ.data.promoters}</div>
                            <div style={{ fontSize: 10, color: '#64748B' }}>Promotores</div>
                          </div>
                          <div style={{ textAlign: 'center', background: '#FFFBEB', borderRadius: 12, padding: '10px 0' }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: '#D97706' }}>{npsQ.data.passives}</div>
                            <div style={{ fontSize: 10, color: '#64748B' }}>Pasivos</div>
                          </div>
                          <div style={{ textAlign: 'center', background: '#FEF2F2', borderRadius: 12, padding: '10px 0' }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: '#DC2626' }}>{npsQ.data.detractors}</div>
                            <div style={{ fontSize: 10, color: '#64748B' }}>Detractores</div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Reseñas */}
                {reviewsQ.data?.stats && (
                  <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A' }}>Reseñas</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: '#D97706' }}>
                        ★ {reviewsQ.data.stats.avg ?? '—'}
                      </div>
                    </div>
                    {[5,4,3,2,1].map(s => {
                      const count = reviewsQ.data!.stats[`stars_${s}` as keyof typeof reviewsQ.data.stats] as number;
                      const pct   = reviewsQ.data!.stats.total > 0 ? Math.round((count / reviewsQ.data!.stats.total) * 100) : 0;
                      return (
                        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 12, color: '#64748B', width: 16 }}>{s}</span>
                          <span style={{ color: '#F59E0B', fontSize: 12 }}>★</span>
                          <div style={{ flex: 1, height: 6, background: '#F1F5F9', borderRadius: 99 }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: '#F59E0B', borderRadius: 99 }} />
                          </div>
                          <span style={{ fontSize: 11, color: '#94A3B8', width: 24 }}>{count}</span>
                        </div>
                      );
                    })}
                    {/* Lista de reseñas recientes */}
                    {(reviewsQ.data.reviews ?? []).slice(0, 5).map(r => (
                      <div key={r.id} style={{ borderTop: '1px solid #F1F5F9', marginTop: 12, paddingTop: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{r.client_name ?? 'Cliente'}</span>
                          <span style={{ color: '#F59E0B', fontSize: 13 }}>{starLabel(r.rating)}</span>
                        </div>
                        {r.comment && <div style={{ fontSize: 12.5, color: '#64748B', lineHeight: 1.5 }}>{r.comment}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
