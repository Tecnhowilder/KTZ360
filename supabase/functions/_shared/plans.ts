/**
 * _shared/plans.ts — Shelwi
 *
 * ZERO TRUST: Los precios NUNCA están hardcodeados aquí.
 * La única fuente de verdad es la tabla `plans` en Supabase.
 *
 * Este módulo solo define tipos y helpers de validación.
 * Los precios se resuelven desde DB en runtime.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export type PlanCode    = 'pro' | 'premium' | 'enterprise';
export type BillingCycle = 'monthly' | 'annual';

/** Validadores de tipo (no implican precio) */
export function isPlanCode(value: unknown): value is PlanCode {
  return value === 'pro' || value === 'premium' || value === 'enterprise';
}

export function isBillingCycle(value: unknown): value is BillingCycle {
  return value === 'monthly' || value === 'annual';
}

export function isFounderCheckout(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/** Nombres de visualización */
export const PLAN_NAMES: Record<PlanCode, string> = {
  pro:        'PRO',
  premium:    'PREMIUM',
  enterprise: 'ENTERPRISE',
};

/**
 * PriceResolver — obtiene precio desde la DB (única fuente de verdad).
 *
 * Soporta:
 *   - Precio regular (mensual)
 *   - Precio anual (mensual × 10.5 si no existe columna annual_price)
 *   - Precio Founder (desde founder_promotions)
 */
export interface ResolvedPrice {
  amount:           number;
  currency:         string;
  planName:         string;
  isFounder:        boolean;
  founderPromoId?:  string;
  regularPrice:     number;  // precio sin descuento (para metadata)
}

export async function resolvePrice(
  supabaseUrl:     string,
  serviceRoleKey:  string,
  planCode:        PlanCode,
  billingCycle:    BillingCycle,
  isFounder:       boolean,
): Promise<ResolvedPrice> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // 1. Obtener precio base del plan desde DB
  const { data: plan, error: planErr } = await supabase
    .from('plans')
    .select('id, name, price, currency_code')
    .eq('code', planCode)
    .single();

  if (planErr || !plan) {
    throw new Error(`Plan "${planCode}" not found in database`);
  }

  const regularMonthly = plan.price as number;
  const regularAnnual  = Math.round(regularMonthly * 10.5); // 10.5 meses = 12.5% descuento
  const regularPrice   = billingCycle === 'annual' ? regularAnnual : regularMonthly;

  // 2. Si es Founder, obtener precio desde founder_promotions
  if (isFounder) {
    const { data: promo } = await supabase
      .from('founder_promotions')
      .select('id, founder_price, regular_price, max_redemptions, current_redemptions')
      .eq('plan_code', planCode)
      .eq('active', true)
      .maybeSingle();

    if (promo) {
      // Precio founder es mensual; no hay descuento adicional por anual en el período Founder
      const founderAmount = billingCycle === 'annual'
        ? Math.round((promo.founder_price as number) * 10.5)
        : (promo.founder_price as number);

      return {
        amount:          founderAmount,
        currency:        plan.currency_code ?? 'COP',
        planName:        plan.name ?? planCode,
        isFounder:       true,
        founderPromoId:  promo.id,
        regularPrice,
      };
    }
    // Si no hay promo activa, caer en precio regular sin error
    console.warn(`[resolvePrice] Founder promo not found for ${planCode}, using regular price`);
  }

  return {
    amount:       regularPrice,
    currency:     plan.currency_code ?? 'COP',
    planName:     plan.name ?? planCode,
    isFounder:    false,
    regularPrice,
  };
}

/**
 * validatePaymentAmount — verifica que el monto recibido del webhook
 * coincide con el precio esperado (desde DB, no hardcoded).
 *
 * Tolerancia de ±1 peso por redondeos de MP.
 */
export async function validatePaymentAmount(
  supabaseUrl:    string,
  serviceRoleKey: string,
  planCode:       PlanCode,
  billingCycle:   BillingCycle,
  isFounder:      boolean,
  receivedAmount: number,
): Promise<{ valid: boolean; expected: number; received: number; delta: number }> {
  const resolved = await resolvePrice(supabaseUrl, serviceRoleKey, planCode, billingCycle, isFounder);
  const delta = Math.abs(Math.round(receivedAmount) - resolved.amount);

  return {
    valid:    delta <= 1,     // tolerancia de 1 peso COP
    expected: resolved.amount,
    received: Math.round(receivedAmount),
    delta,
  };
}
