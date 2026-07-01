import { supabase } from '../lib/supabaseClient';
import { logEvent } from './audit';
import { navigateToUrl } from '../lib/capacitorBridge';

interface CreateCheckoutResponse {
  preferenceId: string;
  initPoint:    string;
  amount?:      number;
  currency?:    string;
  isFounder?:   boolean;
}

/**
 * Inicia el Checkout de Mercado Pago para upgrade de plan.
 *
 * ZERO TRUST: workspaceId y userId NO se envían en el body.
 * La edge function los obtiene del JWT en el backend.
 * Los precios se calculan consultando la tabla `plans` en DB.
 *
 * @param targetPlan   'pro' | 'premium'
 * @param billingCycle 'monthly' | 'annual'
 * @param isFounder    true para precio Founder especial (ej. $29.900 PRO)
 */
export async function startSubscriptionCheckout(
  targetPlan:   'pro' | 'premium',
  billingCycle: 'monthly' | 'annual',
  isFounder     = false,
): Promise<void> {
  // Obtener workspace del contexto autenticado para log de auditoría
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile }  = user
    ? await supabase.from('profiles').select('workspace_id').eq('id', user.id).single()
    : { data: null };

  if (profile?.workspace_id) {
    await logEvent(
      profile.workspace_id,
      user?.id ?? null,
      'subscription_upgrade_click',
      'subscription',
      null,
      { targetPlan, billingCycle, isFounder },
    );
  }

  // Invocar edge function — workspaceId se extrae del JWT en el backend
  const { data, error } = await supabase.functions.invoke<CreateCheckoutResponse>('create-checkout', {
    body: {
      planCode:     targetPlan,
      billingCycle,
      isFounder,
      // workspaceId y userId se omiten intencionalmente (Zero Trust)
    },
  });

  if (error) throw error;
  if (!data?.initPoint) throw new Error('No se pudo iniciar el checkout de Mercado Pago.');

  // Sprint 22: Capacitor-safe — usa in-app browser en native, window.location.href en web
  await navigateToUrl(data.initPoint);
}

/**
 * Inicia checkout de Mercado Pago para comprar usuarios adicionales.
 * Zero Trust: workspaceId se extrae del JWT en el backend.
 * Precio: $11.900/usuario/mes (configurado en la edge function).
 */
export async function startAdditionalLicensesCheckout(quantity: number): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile }  = user
    ? await supabase.from('profiles').select('workspace_id').eq('id', user.id).single()
    : { data: null };

  if (profile?.workspace_id) {
    await logEvent(
      profile.workspace_id,
      user?.id ?? null,
      'additional_licenses_checkout_click',
      'subscription',
      null,
      { quantity, unit_price: 11900 },
    );
  }

  const { data, error } = await supabase.functions.invoke<CreateCheckoutResponse>('create-checkout', {
    body: {
      productType: 'additional_licenses',
      quantity,
      unitPrice: 11900,
      // workspaceId y userId se omiten — Zero Trust
    },
  });

  if (error) throw error;
  if (!data?.initPoint) throw new Error('No se pudo iniciar el checkout de Mercado Pago.');

  await navigateToUrl(data.initPoint);
}

/** Obtiene el estado de suscripción Founder si aplica. */
export async function getFounderInfo(workspaceId: string) {
  const { data } = await supabase
    .from('subscriptions')
    .select('is_founder, founder_expires_at, founder_price, founder_promotion_id')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  return data;
}
