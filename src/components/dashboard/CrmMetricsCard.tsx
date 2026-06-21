/**
 * CrmMetricsCard — Indicadores CRM en el Dashboard Mobile.
 * Solo visible para PRO/PREMIUM con pipeline_enabled.
 * Free: muestra upsell card.
 */
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Lock, AlertTriangle, Clock } from 'lucide-react';
import { useCrmDashboard } from '../../hooks/useCRM';
import { useFeatureAccess } from '../../hooks/usePermissions';
import { useUI } from '../../features/app/UIProvider';
import { formatCurrencyCOPCompact } from '../../lib/currency';

const CARD: React.CSSProperties = {
  background: '#fff',
  borderRadius: 18,
  padding: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,.06)',
};

export function CrmMetricsCard() {
  const navigate = useNavigate();
  const { openUpgradeModal } = useUI();
  const featureQ  = useFeatureAccess('pipeline_enabled');
  const dashQ     = useCrmDashboard();

  // Mientras carga feature
  if (featureQ.isLoading) return null;

  // Sin acceso — FREE
  if (!featureQ.data) {
    return (
      <div
        onClick={() => openUpgradeModal({
          title: 'Pipeline CRM',
          message: 'Visualiza tus cotizaciones por etapa y aumenta tu tasa de cierre.',
          targetPlan: 'pro',
          ctaLabel: 'Activar PRO',
          bullets: ['Pipeline visual Kanban','Seguimientos y recordatorios','Timeline por cliente'],
        })}
        style={{
          ...CARD, margin: '0 16px', cursor: 'pointer',
          background: 'linear-gradient(135deg, #F5F3FF 0%, #EEF2FF 100%)',
          border: '1px solid #DDD6FE',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11,
            background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <TrendingUp size={18} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#4C1D95' }}>Pipeline CRM</div>
            <div style={{ fontSize: 11.5, color: '#7C3AED' }}>Disponible en plan PRO →</div>
          </div>
          <Lock size={16} color="#7C3AED" />
        </div>
      </div>
    );
  }

  // Sin datos todavía
  if (dashQ.isLoading || !dashQ.data) return null;

  const d = dashQ.data;
  const hasAlerts = d.without_followup > 0 || d.expiring_soon > 0;

  return (
    <div style={{ ...CARD, margin: '0 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <TrendingUp size={14} color="#fff" />
          </div>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Pipeline CRM</span>
        </div>
        <button
          onClick={() => navigate('/app/pipeline')}
          style={{
            border: 'none', background: '#F1F5F9', borderRadius: 8,
            padding: '4px 10px', cursor: 'pointer',
            fontSize: 11.5, fontWeight: 700, color: '#2563EB',
          }}
        >
          Ver Pipeline
        </button>
      </div>

      {/* KPI Grid 2x2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: hasAlerts ? 12 : 0 }}>
        <KpiBox label="Tasa de conversión" value={`${d.conversion_rate}%`} color="#16A34A" />
        <KpiBox label="Aprobadas (90d)" value={formatCurrencyCOPCompact(d.total_value_approved)} color="#2563EB" />
        <KpiBox label="En negociación" value={String(d.in_negotiation)} color="#D97706" />
        <KpiBox label="Tiempo cierre" value={d.avg_close_days > 0 ? `${d.avg_close_days}d` : '-'} color="#64748B" />
      </div>

      {/* Alertas */}
      {hasAlerts && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {d.without_followup > 0 && (
            <AlertBadge
              icon={Clock}
              color="#D97706"
              bg="#FFFBEB"
              label={`${d.without_followup} cotización${d.without_followup > 1 ? 'es' : ''} sin seguimiento (+3d)`}
              onClick={() => navigate('/app/pipeline')}
            />
          )}
          {d.expiring_soon > 0 && (
            <AlertBadge
              icon={AlertTriangle}
              color="#DC2626"
              bg="#FEF2F2"
              label={`${d.expiring_soon} ${d.expiring_soon > 1 ? 'cotizaciones vencen' : 'cotización vence'} en 3 días`}
              onClick={() => navigate('/app/pipeline')}
            />
          )}
        </div>
      )}
    </div>
  );
}

function KpiBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#F8FAFC', borderRadius: 12, padding: '10px 12px' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10.5, color: '#94A3B8', fontWeight: 600, marginTop: 1 }}>{label}</div>
    </div>
  );
}

function AlertBadge({
  icon: Icon, color, bg, label, onClick,
}: { icon: React.ComponentType<{ size?: number; color?: string }>; color: string; bg: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 12px', borderRadius: 10, border: 'none',
        background: bg, cursor: 'pointer', textAlign: 'left',
      }}
    >
      <Icon size={13} color={color} />
      <span style={{ fontSize: 12, fontWeight: 600, color }}>{label}</span>
    </button>
  );
}
