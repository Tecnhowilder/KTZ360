import { logEvent } from './audit';

/**
 * Placeholder de checkout de suscripción. Por ahora solo registra la
 * intención de upgrade (subscription_upgrade_click) para métricas; la
 * integración real con Mercado Pago se conecta más adelante.
 */
export async function startSubscriptionCheckout(
  workspaceId: string,
  userId: string | null,
  targetPlan: 'pro' | 'premium',
  billingCycle: 'monthly' | 'annual',
): Promise<void> {
  await logEvent(workspaceId, userId, 'subscription_upgrade_click', 'subscription', null, { targetPlan, billingCycle });
}
