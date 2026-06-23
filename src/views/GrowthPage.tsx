/**
 * GrowthPage — Dashboard Growth Sprint 17
 * /app/growth — Mobile-first
 * Reutiliza: CustomerSuccess (Sprint 15), automation_rules (Sprint 13), loyalty (Sprint 16).
 * No duplica: lead scoring, campañas, IA comercial.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Gift, Zap, BarChart2, Share2, Copy, CheckCircle } from 'lucide-react';
import { useGrowthDashboard, useReferralDashboard, useCreateReferralLink,
  useUpsertReferralProgram, useActivePromotions, useUtmAnalytics } from '../hooks/useGrowth';
import { useToast } from '../components/ui/Toast';
import { formatCurrencyCOPCompact } from '../lib/currency';
import { UTM_SOURCE_LABELS, PROMO_TYPE_LABELS } from '../services/growth';

type Tab = 'resumen' | 'referidos' | 'campanas' | 'cupones' | 'utm';

// ─── Componente principal ─────────────────────────────────────────────────────

export function GrowthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('resumen');
  const dashQ    = useGrowthDashboard();
  const d = dashQ.data;

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'resumen',  label: 'Resumen',  icon: <TrendingUp size={13} /> },
    { key: 'referidos',label: 'Referidos',icon: <Share2 size={13} /> },
    { key: 'campanas', label: 'Campañas', icon: <Zap size={13} /> },
    { key: 'cupones',  label: 'Cupones',  icon: <Gift size={13} /> },
    { key: 'utm',      label: 'Fuentes',  icon: <BarChart2 size={13} /> },
  ];

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px 0', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#0F172A' }}><ArrowLeft size={20} /></button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={18} color="#6366F1" /> Growth
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 1 }}>Adquisición · Referidos · Campañas · ROI</div>
          </div>
        </div>
        <div style={{ display: 'flex', overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
              padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: tab === t.key ? 700 : 500,
              color: tab === t.key ? '#6366F1' : '#94A3B8',
              borderBottom: tab === t.key ? '2px solid #6366F1' : '2px solid transparent',
            }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        {dashQ.isLoading ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#94A3B8' }}>Cargando...</div>
        ) : (
          <>
            {tab === 'resumen'  && <TabResumen data={d} />}
            {tab === 'referidos'&& <TabReferidos />}
            {tab === 'campanas' && <TabCampanas />}
            {tab === 'cupones'  && <TabCupones />}
            {tab === 'utm'      && <TabUtm />}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tab Resumen ──────────────────────────────────────────────────────────────

function TabResumen({ data }: { data: ReturnType<typeof useGrowthDashboard>['data'] }) {
  if (!data) return null;
  const { acquisition, referrals, promotions, health_summary, growth_automations } = data;

  const kpis = [
    { label: 'Clientes nuevos (30d)', value: acquisition.new_clients,      color: '#2563EB', bg: '#EFF6FF' },
    { label: 'Referidos convertidos', value: referrals.total_conversions,  color: '#7C3AED', bg: '#F5F3FF' },
    { label: 'Cupones usados (30d)',  value: promotions.total_used,         color: '#D97706', bg: '#FFFBEB' },
    { label: 'Clientes VIP',          value: health_summary.vip,            color: '#16A34A', bg: '#F0FDF4' },
    { label: 'Clientes en riesgo',    value: health_summary.at_risk,        color: '#DC2626', bg: '#FEF2F2' },
    { label: 'Automatiz. growth',     value: growth_automations,            color: '#6366F1', bg: '#EEF2FF' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 14, padding: '12px 12px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 10.5, color: '#64748B', fontWeight: 600, marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Descuento total */}
      <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
        <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 4 }}>Descuentos aplicados (30d)</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: '#D97706' }}>
          {formatCurrencyCOPCompact(promotions.total_discount)}
        </div>
        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{promotions.total_used} cupones usados</div>
      </div>

      {/* Adquisición por fuente */}
      {Object.keys(acquisition.by_source ?? {}).length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Clientes nuevos por fuente</div>
          {Object.entries(acquisition.by_source).map(([src, cnt]) => {
            const meta = UTM_SOURCE_LABELS[src] ?? UTM_SOURCE_LABELS.direct;
            return (
              <div key={src} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>{meta.icon}</span>
                <span style={{ flex: 1, fontSize: 13, color: '#374151', fontWeight: 600 }}>{meta.label}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: meta.color }}>{cnt}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tab Referidos ────────────────────────────────────────────────────────────

function TabReferidos() {
  const refQ   = useReferralDashboard();
  const createMut = useCreateReferralLink();
  const programMut = useUpsertReferralProgram();
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function handleCreateLink() {
    const result = await createMut.mutateAsync();
    setLink(window.location.origin + result.ref_url);
  }

  function copyLink() {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      showToast('Link copiado');
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const d = refQ.data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Estado del programa */}
      {d?.program ? (
        <div style={{ background: 'linear-gradient(135deg, #7C3AED, #8B5CF6)', borderRadius: 16, padding: '16px 20px', color: '#fff' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.7)', marginBottom: 4 }}>Programa activo</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{d.program.name}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', marginTop: 6 }}>
            Referidor: +{d.program.referrer_points} pts · Referido: +{d.program.referee_points} pts
          </div>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🤝</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Sin programa de referidos</div>
          <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>Activa un programa para que tus clientes refieran nuevos clientes</div>
          <button
            onClick={() => programMut.mutate({ name: 'Programa de Referidos', referrer_points: 200, referee_points: 100, active: true })}
            disabled={programMut.isPending}
            style={{ background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {programMut.isPending ? 'Activando...' : 'Activar programa'}
          </button>
        </div>
      )}

      {/* Generar link */}
      {d?.program && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Mi link de referido</div>
          {link ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, background: '#F8FAFC', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</div>
              <button onClick={copyLink} style={{ border: 'none', background: copied ? '#F0FDF4' : '#EFF6FF', borderRadius: 10, padding: '0 12px', cursor: 'pointer' }}>
                {copied ? <CheckCircle size={16} color="#16A34A" /> : <Copy size={16} color="#2563EB" />}
              </button>
            </div>
          ) : (
            <button onClick={handleCreateLink} disabled={createMut.isPending}
              style={{ width: '100%', padding: '11px 0', borderRadius: 12, border: 'none', background: '#EFF6FF', color: '#2563EB', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Share2 size={15} /> {createMut.isPending ? 'Generando...' : 'Generar mi link'}
            </button>
          )}
        </div>
      )}

      {/* Métricas */}
      {d?.summary && d.summary.total_links > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          <div style={{ background: '#EFF6FF', borderRadius: 14, padding: '10px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB' }}>{d.summary.total_visits}</div>
            <div style={{ fontSize: 10, color: '#64748B' }}>Visitas</div>
          </div>
          <div style={{ background: '#F5F3FF', borderRadius: 14, padding: '10px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#7C3AED' }}>{d.summary.total_conversions}</div>
            <div style={{ fontSize: 10, color: '#64748B' }}>Convertidos</div>
          </div>
          <div style={{ background: '#F0FDF4', borderRadius: 14, padding: '10px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#16A34A' }}>{d.summary.rewarded}</div>
            <div style={{ fontSize: 10, color: '#64748B' }}>Recompensados</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab Campañas (usa automation_rules existentes) ───────────────────────────

function TabCampanas() {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: '#EEF2FF', borderRadius: 12, padding: '12px 14px', fontSize: 13, color: '#4338CA', lineHeight: 1.5 }}>
        <span style={{ fontWeight: 700 }}>Campañas via Automatizaciones</span> — Las campañas se gestionan con el motor de automatizaciones de Shelwi. Sin motor duplicado.
      </div>
      <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Templates de Growth disponibles</div>
        <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>Instala y activa campañas automáticas desde el centro de automatizaciones</div>
        <button onClick={() => navigate('/app/automatizaciones')}
          style={{ background: '#6366F1', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={14} /> Ir a Automatizaciones
        </button>
      </div>
      <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>Templates Growth incluidos</div>
        {[
          { icon: '👋', name: 'Bienvenida a referido', trigger: 'Cliente creado' },
          { icon: '🔄', name: 'Recuperación 60 días', trigger: 'Cliente inactivo' },
          { icon: '💡', name: 'Upsell post-aprobación', trigger: 'Cotización aprobada' },
        ].map(t => (
          <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #F1F5F9' }}>
            <span style={{ fontSize: 20 }}>{t.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{t.name}</div>
              <div style={{ fontSize: 11.5, color: '#94A3B8' }}>Trigger: {t.trigger}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab Cupones ──────────────────────────────────────────────────────────────

function TabCupones() {
  const promosQ = useActivePromotions();
  const promos = (promosQ.data ?? []) as Array<Record<string, unknown>>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {promos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎫</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#64748B' }}>Sin cupones activos</div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>Crea cupones para incentivar cotizaciones</div>
        </div>
      ) : promos.map((p) => (
        <div key={p.id as string} style={{ background: '#fff', borderRadius: 14, padding: '13px 14px', boxShadow: '0 1px 4px rgba(0,0,0,.06)', border: '1px dashed #E2E8F0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#0F172A', letterSpacing: 1 }}>{p.code as string}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{p.description as string ?? PROMO_TYPE_LABELS[p.type as string]}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#D97706' }}>
                {p.type === 'percentage' ? `${p.value}%` : `$ ${(p.value as number).toLocaleString('es-CO')}`}
              </div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>{(p.current_redemptions as number)} usos</div>
            </div>
          </div>
          {!!p.valid_until && (
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>
              Válido hasta: {new Date(p.valid_until as string).toLocaleDateString('es-CO')}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Tab UTM ──────────────────────────────────────────────────────────────────

function TabUtm() {
  const utmQ = useUtmAnalytics(30);
  const d = utmQ.data;

  if (utmQ.isLoading) return <div style={{ padding: 24, textAlign: 'center', color: '#94A3B8' }}>Cargando...</div>;
  if (!d || d.total_visits === 0) return (
    <div style={{ textAlign: 'center', padding: '32px 0' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#64748B' }}>Sin datos UTM todavía</div>
      <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>Los datos aparecen cuando llegan visitantes por links de referido o campañas con UTM</div>
    </div>
  );

  const maxVisits = Math.max(1, ...d.by_source.map(s => s.visits));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Fuentes de adquisición (30d)</div>
        <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 10 }}>{d.total_visits} visitas totales</div>
        {d.by_source.map(s => {
          const meta = UTM_SOURCE_LABELS[s.source] ?? UTM_SOURCE_LABELS.direct;
          const pct  = Math.round((s.visits / maxVisits) * 100);
          return (
            <div key={s.source} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{meta.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{meta.label}</span>
                </div>
                <div style={{ fontSize: 12, color: '#94A3B8' }}>
                  {s.visits} visitas · {s.clients} clientes
                </div>
              </div>
              <div style={{ height: 6, background: '#F1F5F9', borderRadius: 99 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: meta.color, borderRadius: 99 }} />
              </div>
            </div>
          );
        })}
      </div>

      {d.by_campaign.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 10 }}>Top campañas</div>
          {d.by_campaign.map((c, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F1F5F9' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{c.campaign}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>{c.source}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#2563EB' }}>{c.visits}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
