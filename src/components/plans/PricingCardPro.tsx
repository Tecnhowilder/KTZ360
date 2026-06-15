import { ArrowRightCircle, Lock } from 'lucide-react';
import { PricingBenefits, type PricingBenefitItem } from './PricingBenefits';
import type { BillingCycle } from './BillingToggle';

const ITEMS: PricingBenefitItem[] = [
  { label: 'Cotizaciones ilimitadas', included: true },
  { label: 'Clientes ilimitados', included: true },
  { label: 'Plantillas ilimitadas', included: true },
  { label: 'Branding corporativo (logo, colores)', included: true },
  { label: 'QR personalizado', included: true },
  { label: 'Portal personalizado', included: true },
  { label: 'Seguimiento de cotizaciones', included: true },
  { label: 'Reportes básicos', included: true },
  { label: 'PDF profesional', included: true },
  { label: 'Edición de cotizaciones', included: true },
];

function money(n: number): string {
  return '$' + n.toLocaleString('es-CO');
}

export function PricingCardPro({
  billing,
  isCurrent,
  onUpgrade,
}: {
  billing: BillingCycle;
  isCurrent: boolean;
  onUpgrade: () => void;
}) {
  const monthlyPrice = billing === 'yearly' ? 29900 : 39900;

  return (
    <article className="pricing-card pricing-card--pro">
      <span className="pricing-card-badge pricing-card-badge--pro">PLAN MÁS POPULAR</span>

      <div className="pro-hero">
        <div className="pro-hero-content">
          <div className="pricing-card-title">PRO</div>
          <p className="pricing-card-description" style={{ color: 'rgba(255,255,255,0.92)' }}>
            Lleva tu negocio al siguiente nivel.
          </p>
          <div className="pricing-price">
            <span className="pricing-price-value pro-price">
              {money(monthlyPrice)}<span className="pricing-price-period">/mes</span>
            </span>
            {billing === 'yearly' && <span className="pricing-price-annual">{money(358800)} cobrado anual</span>}
            <span className="pricing-price-savings">Ahorra $120.000/año</span>
          </div>
        </div>

        <img className="pro-hero-image" src="/images/plans/pro.png" alt="Plan PRO" />
        <div className="pro-hero-glow" />
        <div className="pro-hero-overlay" />

        <svg className="pro-wave" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,50 C200,120 400,0 600,50 C800,100 1000,0 1200,50 L1200,120 L0,120Z" />
        </svg>
      </div>

      <div className="pricing-card-body">
        <PricingBenefits items={ITEMS} twoCol />

        <div className="pricing-card-actions">
          <button
            type="button"
            className={isCurrent ? 'pricing-button pricing-button--current' : 'pricing-button pricing-button--pro'}
            disabled={isCurrent}
            onClick={onUpgrade}
          >
            {isCurrent ? 'TU PLAN ACTUAL' : 'Actualizar a PRO'}
            {!isCurrent && <ArrowRightCircle size={18} />}
          </button>

          <p className="pricing-card-footnote">
            <Lock size={14} />
            Activa al instante. Puedes cancelar cuando quieras.
          </p>
        </div>
      </div>
    </article>
  );
}
