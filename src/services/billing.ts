import { supabase } from '../lib/supabaseClient';
import { logEvent } from './audit';

interface CreateCheckoutResponse {
  preferenceId: string;
  initPoint: string;
}

/**
 * Inicia el Checkout Pro de Mercado Pago para un upgrade de plan. La
 * preferencia (y el precio) se calculan en la Edge Function `create-checkout`
 * a partir del plan/ciclo solicitados; el frontend nunca maneja precios ni
 * credenciales de Mercado Pago.
 */
export async function startSubscriptionCheckout(
  workspaceId: string,
  userId: string | null,
  targetPlan: 'pro' | 'premium',
  billingCycle: 'monthly' | 'annual',
): Promise<void> {
  await logEvent(workspaceId, userId, 'subscription_upgrade_click', 'subscription', null, { targetPlan, billingCycle });

  const { data, error } = await supabase.functions.invoke<CreateCheckoutResponse>('create-checkout', {
    body: { workspaceId, userId, planCode: targetPlan, billingCycle },
  });

  if (error) throw error;
  if (!data?.initPoint) throw new Error('No se pudo iniciar el checkout de Mercado Pago.');

  window.location.href = data.initPoint;
}
