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
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, animation: 'fadeIn .18s ease-out' }}
      onClick={closeUpgradeModal}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 18, padding: 26, maxWidth: 420, width: '100%', boxShadow: '0 24px 60px rgba(15,23,42,.25)', animation: 'popIn .22s ease-out' }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: accentColor, textTransform: 'uppercase', marginBottom: 8 }}>
          {upgradeModal.targetPlan === 'premium' ? 'Shelwi PREMIUM' : 'Shelwi PRO'}
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginBottom: 10 }}>{upgradeModal.title}</div>
        <p style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.6, marginBottom: upgradeModal.bullets?.length ? 14 : 20, whiteSpace: 'pre-line' }}>{upgradeModal.message}</p>

        {upgradeModal.bullets && upgradeModal.bullets.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'flex', flexDirection: 'column', gap: 7 }}>
            {upgradeModal.bullets.map((bullet) => (
              <li key={bullet} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#334155', fontWeight: 600 }}>
                <span style={{ color: accentColor, fontWeight: 800, flexShrink: 0 }}>✓</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={closeUpgradeModal}
            style={{ flex: 1, border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 13.5, padding: 12, borderRadius: 12, cursor: 'pointer' }}
          >
            {upgradeModal.secondaryLabel ?? 'Ahora no'}
          </button>
          <button
            onClick={goToPlanes}
            style={{ flex: 1, border: 'none', background: accentColor, color: '#fff', fontWeight: 700, fontSize: 13.5, padding: 12, borderRadius: 12, cursor: 'pointer' }}
          >
            {upgradeModal.ctaLabel}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes popIn { from { opacity: 0; transform: scale(.96) translateY(8px) } to { opacity: 1; transform: scale(1) translateY(0) } }
      `}</style>
    </div>
  );
}
