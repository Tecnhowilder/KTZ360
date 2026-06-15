import { useNavigate } from 'react-router-dom';
import { Icon, KPI_ICONS, COPY_ICON_PATH } from '../lib/icons';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useUI, defaultQConfig } from '../features/app/UIProvider';
import { useDerivedQuotes } from '../hooks/useQuotes';
import { usePlanLimit } from '../hooks/usePermissions';
import { fmtM, statusStyle, daysAgo, TODAY } from '../lib/calc';
import { MONTHS_LONG } from '../lib/data';
import type { DerivedQuote } from '../lib/types';

export function Dashboard() {
  const navigate = useNavigate();
  const { profile, company } = useWorkspace();
  const { openQuoteFlow, openQuoteDetail, openUpgradeModal } = useUI();
  const { quotes, isLoading } = useDerivedQuotes();
  const quotesLimitQuery = usePlanLimit('quotes_month');

  if (isLoading) return null;

  const quotesLimit = quotesLimitQuery.data;
  const remainingQuotes = quotesLimit?.max != null ? quotesLimit.max - quotesLimit.current : null;
  const showQuotaWarning = remainingQuotes != null && remainingQuotes > 0 && remainingQuotes <= 2;

  const firstName = (profile.full_name || '').split(' ')[0] || '';

  const now = TODAY();
  const monthLabel = MONTHS_LONG[now.getMonth()].toUpperCase();
  const monthTotal = quotes
    .filter((q) => {
      const c = new Date(q.created_at);
      return c.getFullYear() === now.getFullYear() && c.getMonth() === now.getMonth();
    })
    .reduce((a, q) => a + q.calc.total, 0);

  const cnt = (st: string) => quotes.filter((q) => q.status === st).length;
  const kpis = [
    { value: String(quotes.length), label: 'Cotizaciones', icon: KPI_ICONS.doc, iconBg: '#EEF2FF', iconColor: '#2563EB' },
    { value: String(cnt('Aprobada')), label: 'Aprobadas', icon: KPI_ICONS.users, iconBg: '#F0FDF4', iconColor: '#22C55E' },
    { value: String(cnt('Enviada')), label: 'Por seguir', icon: KPI_ICONS.clock, iconBg: '#FFFBEB', iconColor: '#F59E0B' },
  ];

  const recentQuotes = quotes.slice(0, 4);
  const followUps = quotes.filter((q) => q.status === 'Enviada').slice(0, 2);

  const statusBreakdown = (['Aprobada', 'Enviada', 'Borrador', 'Rechazada', 'Vencida'] as const)
    .map((st) => {
      const c = cnt(st);
      const pct = quotes.length ? Math.round((c / quotes.length) * 100) : 0;
      const s = statusStyle(st);
      return { label: st + (st.endsWith('a') ? 's' : 'es'), count: c, pct, dot: s.dot };
    })
    .filter((s) => s.count > 0);

  function duplicate(e: React.MouseEvent, q: DerivedQuote) {
    e.stopPropagation();
    openQuoteFlow({
      step: 4,
      cfg: {
        clientId: q.client_id,
        proj: q.title + ' (copia)',
        loc: q.location || '',
        serviceLines: q.cfg.serviceLines,
        adminPct: q.cfg.adminPct,
        imprevistosPct: q.cfg.imprevistosPct,
        util: q.cfg.util,
        taxMode: q.cfg.taxMode,
        taxRate: q.cfg.taxRate,
        advancePct: q.cfg.advancePct,
        docDetailLevel: q.cfg.docDetailLevel,
        includeTechnicalAnnex: q.cfg.includeTechnicalAnnex,
        validDays: q.cfg.validDays,
        discount: q.cfg.discount,
        discountOn: q.cfg.discountOn,
      },
    });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14, marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 14, color: '#64748B' }}>Buenos días,</div>
          <h1 style={{ fontSize: 'clamp(24px,4vw,32px)', fontWeight: 800, letterSpacing: '-1px' }}>{firstName} 👋</h1>
        </div>
        <button
          onClick={() => openQuoteFlow({ cfg: defaultQConfig(company) })}
          style={{ border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 14, padding: '12px 18px', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 18px -8px rgba(37,99,235,.6)' }}
        >
          <span style={{ fontSize: 17 }}>+</span> Nueva cotización
        </button>
      </div>

      {showQuotaWarning && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 14, padding: '12px 16px', marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: '#92400E', fontWeight: 600 }}>
            Te queda{remainingQuotes === 1 ? '' : 'n'} {remainingQuotes} cotización{remainingQuotes === 1 ? '' : 'es'} este mes en tu plan FREE.
          </div>
          <button
            onClick={() =>
              openUpgradeModal({
                title: 'Cotizaciones ilimitadas con PRO',
                message: 'Tu plan FREE permite hasta 10 cotizaciones por mes. Actualiza a PRO por $39.900/mes y elimina este límite.',
                targetPlan: 'pro',
                ctaLabel: 'Actualizar a PRO',
              })
            }
            style={{ border: 'none', background: '#F59E0B', color: '#fff', fontWeight: 700, fontSize: 12.5, padding: '8px 14px', borderRadius: 10, cursor: 'pointer' }}
          >
            Actualizar a PRO
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
        <div style={{ background: 'linear-gradient(150deg,#2563EB,#1D4ED8)', borderRadius: 20, padding: 22, color: '#fff', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -30, top: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,.1)' }} />
          <div style={{ fontSize: 11.5, color: '#BFD3FF', fontWeight: 600, letterSpacing: '.3px' }}>VALOR COTIZADO · {monthLabel}</div>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-1.5px', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{fmtM(monthTotal)}</div>
        </div>
        {kpis.map((k) => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 20, padding: 22 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: k.iconBg, color: k.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <span style={{ width: 20, height: 20, display: 'flex' }}>
                <Icon path={k.icon} />
              </span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14, marginTop: 14 }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 20, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Cotizaciones recientes</h3>
            <button onClick={() => navigate('/app/cotizaciones')} style={{ border: 'none', background: 'none', color: '#2563EB', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              Ver todas →
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {recentQuotes.map((q) => {
              const st = statusStyle(q.status);
              return (
                <div
                  key={q.id}
                  onClick={() => openQuoteDetail(q.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 11, border: '1px solid #EEF2F7', borderRadius: 13, cursor: 'pointer' }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB', fontWeight: 800, flexShrink: 0 }}>
                    {q.initial}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.title}</div>
                    <div style={{ fontSize: 11.5, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.clientName}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtM(q.calc.total)}</div>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: st.c, background: st.b, padding: '2px 7px', borderRadius: 6 }}>{q.status}</span>
                  </div>
                  <button
                    onClick={(e) => duplicate(e, q)}
                    title="Duplicar"
                    style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <span style={{ width: 16, height: 16, display: 'flex' }}>
                      <Icon path={COPY_ICON_PATH} />
                    </span>
                  </button>
                </div>
              );
            })}
            {recentQuotes.length === 0 && <div style={{ fontSize: 12.5, color: '#94A3B8', padding: '4px 0' }}>Aún no tienes cotizaciones.</div>}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 20, padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} />
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Seguimiento sugerido</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {followUps.map((q) => (
                <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 13, padding: 11 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.title}</div>
                    <div style={{ fontSize: 11, color: '#B45309' }}>Enviada hace {q.sent_at ? daysAgo(q.sent_at) : daysAgo(q.created_at)} días</div>
                  </div>
                  <button onClick={() => openQuoteDetail(q.id)} style={{ border: 'none', background: '#0F172A', color: '#fff', fontWeight: 700, fontSize: 12, padding: '8px 12px', borderRadius: 9, cursor: 'pointer', flexShrink: 0 }}>
                    Mensaje
                  </button>
                </div>
              ))}
              {followUps.length === 0 && <div style={{ fontSize: 12.5, color: '#94A3B8', padding: '4px 0' }}>Sin seguimientos pendientes. ¡Vas al día!</div>}
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 20, padding: 22 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Estado de cotizaciones</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {statusBreakdown.map((s) => (
                <div key={s.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
                    <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot }} />
                      {s.label} · {s.count}
                    </span>
                    <span style={{ color: '#64748B' }}>{s.pct}%</span>
                  </div>
                  <div style={{ height: 8, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${s.pct}%`, background: s.dot, borderRadius: 99 }} />
                  </div>
                </div>
              ))}
              {statusBreakdown.length === 0 && <div style={{ fontSize: 12.5, color: '#94A3B8' }}>Sin datos todavía.</div>}
            </div>
          </div>

          <div style={{ background: '#0F172A', borderRadius: 20, padding: 22, color: '#fff', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', right: -20, bottom: -20, width: 90, height: 90, borderRadius: '50%', background: 'rgba(34,197,94,.2)' }} />
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.3)', padding: '4px 10px', borderRadius: 99, fontSize: 10, fontWeight: 800, color: '#7CFFB0', letterSpacing: '.5px' }}>
              ✦ KTZ360 IA
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.5, marginTop: 12, color: '#E2E8F0' }}>Describe el trabajo y la IA calcula materiales y mano de obra.</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button onClick={() => navigate('/app/ia')} style={{ border: 'none', background: '#fff', color: '#0F172A', fontWeight: 700, fontSize: 13, padding: '10px 16px', borderRadius: 11, cursor: 'pointer' }}>
                ✍️ Describir
              </button>
              <button onClick={() => navigate('/app/ia')} style={{ border: '1.5px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.1)', color: '#fff', fontWeight: 700, fontSize: 13, padding: '10px 16px', borderRadius: 11, cursor: 'pointer' }}>
                📷 Desde foto
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
