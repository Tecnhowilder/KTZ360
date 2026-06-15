import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useSubscriptionStatus } from '../hooks/usePermissions';
import { useAuth } from '../features/auth/AuthProvider';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useToast } from '../components/ui/Toast';
import { startSubscriptionCheckout } from '../services/billing';
import { BillingToggle, type BillingCycle } from '../components/plans/BillingToggle';
import { PricingCardFree } from '../components/plans/PricingCardFree';
import { PricingCardPro } from '../components/plans/PricingCardPro';
import { PricingCardPremium } from '../components/plans/PricingCardPremium';
import { PricingFooter } from '../components/plans/PricingFooter';
import '../styles/plans.css';

export function Planes() {
  const [billing, setBilling] = useState<BillingCycle>('monthly');
  const statusQuery = useSubscriptionStatus();
  const currentPlan = statusQuery.data?.plan_code ?? 'free';
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();

  async function handleUpgrade(planCode: 'pro' | 'premium') {
    const cycle = billing === 'yearly' ? 'annual' : 'monthly';
    await startSubscriptionCheckout(workspace.id, user?.id ?? null, planCode, cycle);
    showToast('Pagos con Mercado Pago próximamente. Te avisaremos cuando esté disponible.');
  }

  return (
    <div className="pricing-page">
      <div className="pricing-container">
        <section className="pricing-header">
          <div className="pricing-header-trust">
            <div className="pricing-header-trust-icon">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="pricing-header-trust-title">Pago 100% seguro</div>
              <div className="pricing-header-trust-subtitle">Datos protegidos</div>
            </div>
          </div>

          <h1 className="pricing-header-title">
            Elige el plan que <span className="pricing-header-highlight">impulsa tu negocio</span>
          </h1>
          <p className="pricing-header-subtitle">Más herramientas, más control y mejores resultados con KTZ360.</p>
        </section>

        <BillingToggle value={billing} onChange={setBilling} />

        <section className="pricing-grid">
          <PricingCardFree isCurrent={currentPlan === 'free'} />
          <PricingCardPro billing={billing} isCurrent={currentPlan === 'pro'} onUpgrade={() => handleUpgrade('pro')} />
          <PricingCardPremium billing={billing} isCurrent={currentPlan === 'premium'} onUpgrade={() => handleUpgrade('premium')} />
        </section>

        <PricingFooter />

        <p className="pricing-terms">Al actualizar tu plan aceptas nuestros Términos de servicio y Política de privacidad.</p>
      </div>
    </div>
  );
}
