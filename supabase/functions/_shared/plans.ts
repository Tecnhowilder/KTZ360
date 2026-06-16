export type PlanCode = 'pro' | 'premium';
export type BillingCycle = 'monthly' | 'annual';

export const PLAN_PRICES: Record<PlanCode, Record<BillingCycle, number>> = {
  pro: { monthly: 39900, annual: 358800 },
  premium: { monthly: 69900, annual: 718800 },
};

export const PLAN_NAMES: Record<PlanCode, string> = {
  pro: 'PRO',
  premium: 'PREMIUM',
};

export function isPlanCode(value: unknown): value is PlanCode {
  return value === 'pro' || value === 'premium';
}

export function isBillingCycle(value: unknown): value is BillingCycle {
  return value === 'monthly' || value === 'annual';
}
