export type BillingCycle = 'monthly' | 'yearly';

export function BillingToggle({ value, onChange }: { value: BillingCycle; onChange: (cycle: BillingCycle) => void }) {
  return (
    <div className="billing-toggle-wrap">
      <div className="billing-toggle">
        <button
          type="button"
          className={value === 'monthly' ? 'billing-toggle-option billing-toggle-option--active' : 'billing-toggle-option'}
          onClick={() => onChange('monthly')}
        >
          <span className="billing-toggle-title">Mensual</span>
          <span className="billing-toggle-note">Paga cada mes</span>
        </button>
        <button
          type="button"
          className={value === 'yearly' ? 'billing-toggle-option billing-toggle-option--active' : 'billing-toggle-option'}
          onClick={() => onChange('yearly')}
        >
          <span className="billing-toggle-title">Anual</span>
          <span className="billing-toggle-note">Paga 12 meses, 2 gratis</span>
          <span className="billing-toggle-badge">Ahorra hasta 17%</span>
        </button>
      </div>
      <div className="billing-toggle-hint">
        <svg className="billing-toggle-arrow" width="32" height="28" viewBox="0 0 32 28" fill="none">
          <path d="M28 24C26 12 16 4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M11 3L4 4L6 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
        <div className="billing-toggle-hint-text">
          <strong>Ahorra 17%</strong>
          <span>eligiendo el plan anual</span>
        </div>
      </div>
    </div>
  );
}
