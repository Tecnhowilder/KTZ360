import { PricingFeaturesGrid } from './PricingBenefits';

const INCLUDED = [
  '10 cotizaciones por mes',
  '20 clientes',
  'PDF básico KTZ360',
  'Portal público de cotización',
  'Historial de cotizaciones',
  'Compartir por WhatsApp',
];

const EXCLUDED = ['Plantillas', 'Branding corporativo', 'Edición de cotizaciones', 'Reportes', 'Multiusuario', 'KTZ360 IA'];

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

        <PricingFeaturesGrid included={INCLUDED} excluded={EXCLUDED} />

        <div className="pricing-card-actions">
          <button type="button" className="pricing-button pricing-button--disabled" disabled>
            {isCurrent ? 'TU PLAN ACTUAL' : 'Plan actual'}
          </button>
        </div>
      </div>
    </article>
  );
}
