import { PricingBenefits, type PricingBenefitItem } from './PricingBenefits';

const ITEMS: PricingBenefitItem[] = [
  { label: '10 cotizaciones por mes', included: true },
  { label: '20 clientes', included: true },
  { label: 'PDF básico KTZ360', included: true },
  { label: 'Portal público de cotización', included: true },
  { label: 'Historial de cotizaciones', included: true },
  { label: 'Compartir por WhatsApp', included: true },
  { label: 'Plantillas', included: false },
  { label: 'Branding corporativo', included: false },
  { label: 'Edición de cotizaciones', included: false },
  { label: 'Reportes', included: false },
  { label: 'Multiusuario', included: false },
  { label: 'KTZ360 IA', included: false },
];

export function PricingCardFree({ isCurrent }: { isCurrent: boolean }) {
  return (
    <article className="pricing-card pricing-card--free">
      <div className="free-hero">
        <div className="free-hero-content">
          <div className="pricing-card-title">FREE</div>
          <p className="pricing-card-description">Para empezar de forma simple y profesional.</p>
        </div>
        <img className="free-hero-image" src="/images/plans/free.png" alt="Plan FREE" />
      </div>

      <div className="pricing-card-body">
        <div className="pricing-price">
          <span className="pricing-price-value">$0</span>
          <span className="pricing-price-annual">Para siempre</span>
        </div>

        <PricingBenefits items={ITEMS} />

        <div className="pricing-card-actions">
          <button type="button" className="pricing-button pricing-button--disabled" disabled>
            {isCurrent ? 'TU PLAN ACTUAL' : 'Plan actual'}
          </button>
        </div>
      </div>
    </article>
  );
}
