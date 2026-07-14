import { ArrowRightCircle, Lock } from 'lucide-react';
import { PricingBenefits, type PricingBenefitItem } from './PricingBenefits';
import type { BillingCycle } from './BillingToggle';

const ITEMS: PricingBenefitItem[] = [
  { label: 'Todo del plan PRO', included: true },
  { label: 'Shelwi IA completa', included: true },
  { label: 'Cotización desde fotografía', included: true },
  { label: '2.000 créditos IA al mes', included: true },
  { label: 'Reportes avanzados', included: true },
  { label: 'Dashboard avanzado', included: true },
  { label: 'Multiusuario (roles y permisos)', included: true },
  { label: '5 usuarios incluidos', included: true },
  { label: 'Usuarios adicionales $11.900/mes', included: true },
  { label: 'Soporte prioritario', included: true },
  { label: 'Pedidos y Órdenes de Trabajo', included: true },
  { label: 'GPS y evidencias fotográficas', included: true },
  { label: 'Portal del cliente', included: true },
  { label: 'Customer Success dedicado', included: true },
  { label: 'Programa de fidelización', included: true },
  { label: 'BI y análisis avanzado', included: true },
  { label: 'Módulo financiero', included: true },
  { label: 'Drive / OneDrive / Teams', included: true },
  { label: 'WhatsApp Business API', included: true },
  { label: 'Alegra Avanzado', included: true },
];

function money(n: number): string {
  return '$' + n.toLocaleString('es-CO');
}

export function PricingCardPremium({
  billing,
  isCurrent,
  onUpgrade,
}: {
  billing: BillingCycle;
  isCurrent: boolean;
  onUpgrade: () => void;
}) {
  const monthlyPrice = billing === 'yearly' ? 149900 : 179900;

  return (
    <article className="pricing-card pricing-card--premium">
      <span className="pricing-card-badge pricing-card-badge--premium">MEJOR PARA EMPRESAS</span>

      <div className="premium-hero">
        <div className="premium-hero-content">
          <div className="pricing-card-title">PREMIUM</div>
          <p className="pricing-card-description">Potencia tu empresa con IA y automatización.</p>
          <div className="pricing-price">
            <span className="pricing-price-value">
              {money(monthlyPrice)}<span className="pricing-price-period">/mes</span>
            </span>
            {billing === 'yearly' && <span className="pricing-price-annual">{money(1798800)} cobrado anual</span>}
            <span className="pricing-price-savings">Ahorra $360.000/año</span>
          </div>
        </div>

        <img className="premium-hero-image" src="/images/plans/premium.png" alt="Plan PREMIUM" />
        <div className="premium-hero-glow" />
        <div className="premium-hero-overlay" />
      </div>

      <div className="pricing-card-body">
        <PricingBenefits items={ITEMS} twoCol />

        <div className="pricing-card-actions">
          <button
            type="button"
            className={isCurrent ? 'pricing-button pricing-button--current' : 'pricing-button pricing-button--premium'}
            disabled={isCurrent}
            onClick={onUpgrade}
          >
            {isCurrent ? 'TU PLAN ACTUAL' : 'Actualizar a PREMIUM'}
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
