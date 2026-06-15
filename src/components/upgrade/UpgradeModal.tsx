import { useNavigate } from 'react-router-dom';
import { useUI } from '../../features/app/UIProvider';
import { BRAND_COLORS } from '../../lib/brand';

export function UpgradeModal() {
  const { upgradeModal, closeUpgradeModal } = useUI();
  const navigate = useNavigate();

  if (!upgradeModal) return null;

  const accentColor = upgradeModal.targetPlan === 'premium' ? '#7C3AED' : BRAND_COLORS.primary;

  function goToPlanes() {
    closeUpgradeModal();
    navigate('/app/planes');
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={closeUpgradeModal}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: 26, maxWidth: 420, width: '100%', boxShadow: '0 24px 60px rgba(15,23,42,.25)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: accentColor, textTransform: 'uppercase', marginBottom: 8 }}>
          {upgradeModal.targetPlan === 'premium' ? 'KTZ360 PREMIUM' : 'KTZ360 PRO'}
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginBottom: 10 }}>{upgradeModal.title}</div>
        <p style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.6, marginBottom: 20, whiteSpace: 'pre-line' }}>{upgradeModal.message}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={closeUpgradeModal}
            style={{ flex: 1, border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 13.5, padding: 12, borderRadius: 12, cursor: 'pointer' }}
          >
            Ahora no
          </button>
          <button
            onClick={goToPlanes}
            style={{ flex: 1, border: 'none', background: accentColor, color: '#fff', fontWeight: 700, fontSize: 13.5, padding: 12, borderRadius: 12, cursor: 'pointer' }}
          >
            {upgradeModal.ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
