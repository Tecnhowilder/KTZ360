import { useQuery } from '@tanstack/react-query';
import { listPlanCatalog, type PlanCatalogEntry } from '../services/plans';
import { useSubscriptionStatus } from '../hooks/usePermissions';
import { fmt } from '../lib/calc';
import { BRAND_COLORS } from '../lib/brand';

const FEATURE_LABELS: { key: keyof PlanCatalogEntry['features']; label: string }[] = [
  { key: 'templates_enabled', label: 'Plantillas ilimitadas' },
  { key: 'branding_enabled', label: 'Branding corporativo (logo, colores, QR personalizado)' },
  { key: 'custom_qr_enabled', label: 'QR personalizado en PDF y portal' },
  { key: 'advanced_reports_enabled', label: 'Reportes avanzados' },
  { key: 'ai_enabled', label: 'KTZ360 IA' },
  { key: 'photo_quote_enabled', label: 'Cotización desde fotografía' },
  { key: 'multiuser_enabled', label: 'Multiusuario (roles y permisos)' },
];

const PLAN_COLORS: Record<string, string> = {
  free: '#64748B',
  pro: BRAND_COLORS.primary,
  premium: '#7C3AED',
};

export function Planes() {
  const catalogQuery = useQuery({ queryKey: ['planCatalog'], queryFn: listPlanCatalog });
  const statusQuery = useSubscriptionStatus();

  if (!catalogQuery.data) return null;

  const currentPlan = statusQuery.data?.plan_code ?? null;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>Planes KTZ360</h1>
      <p style={{ fontSize: 13.5, color: '#64748B', marginBottom: 24 }}>Cotiza · Planifica · Construye — elige el plan que mejor se adapte a tu negocio.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {catalogQuery.data.map(({ plan, features, limits }) => {
          const isCurrent = plan.code === currentPlan;
          const color = PLAN_COLORS[plan.code] ?? BRAND_COLORS.primary;

          return (
            <div
              key={plan.code}
              style={{
                background: '#fff',
                border: isCurrent ? `2px solid ${color}` : '1.5px solid #E2E8F0',
                borderRadius: 18,
                padding: 22,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                position: 'relative',
              }}
            >
              {isCurrent && (
                <div style={{ position: 'absolute', top: -12, right: 18, background: color, color: '#fff', fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 999 }}>
                  TU PLAN ACTUAL
                </div>
              )}
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.06em', color, textTransform: 'uppercase' }}>{plan.name}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                  {plan.price === 0 ? 'Gratis' : fmt(plan.price)}
                  {plan.price > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8' }}> COP/mes</span>}
                </div>
              </div>

              <p style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.5, margin: 0 }}>{plan.description}</p>

              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, color: '#0F172A' }}>
                <li>
                  {limits.max_quotes_month == null ? 'Cotizaciones ilimitadas' : `${limits.max_quotes_month} cotizaciones / mes`}
                </li>
                <li>{limits.max_clients == null ? 'Clientes ilimitados' : `Hasta ${limits.max_clients} clientes`}</li>
                <li>
                  {limits.included_users} usuario{limits.included_users > 1 ? 's' : ''} incluido{limits.included_users > 1 ? 's' : ''}
                  {limits.extra_user_price > 0 && ` · adicional ${fmt(limits.extra_user_price)}/mes`}
                </li>
                {FEATURE_LABELS.filter((f) => features[f.key] === true).map((f) => (
                  <li key={f.key}>{f.label}</li>
                ))}
              </ul>

              {isCurrent ? (
                <div style={{ marginTop: 'auto', textAlign: 'center', fontSize: 12.5, fontWeight: 700, color, padding: 10, borderRadius: 12, background: `${color}14` }}>
                  Plan vigente
                </div>
              ) : (
                <button
                  disabled
                  title="La pasarela de pagos se habilitará próximamente"
                  style={{ marginTop: 'auto', border: 'none', background: '#F1F5F9', color: '#94A3B8', fontWeight: 700, fontSize: 13, padding: 12, borderRadius: 12, cursor: 'not-allowed' }}
                >
                  Próximamente
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
