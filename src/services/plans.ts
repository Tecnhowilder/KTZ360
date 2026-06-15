import { supabase } from '../lib/supabaseClient';
import type { PlanRow, PlanFeaturesRow, PlanLimitsRow } from '../lib/database.types';

export interface PlanCatalogEntry {
  plan: PlanRow;
  features: PlanFeaturesRow;
  limits: PlanLimitsRow;
}

export async function listPlanCatalog(): Promise<PlanCatalogEntry[]> {
  const [plansRes, featuresRes, limitsRes] = await Promise.all([
    supabase.from('plans').select('*').eq('active', true).order('price', { ascending: true }),
    supabase.from('plan_features').select('*'),
    supabase.from('plan_limits').select('*'),
  ]);
  if (plansRes.error) throw plansRes.error;
  if (featuresRes.error) throw featuresRes.error;
  if (limitsRes.error) throw limitsRes.error;

  return (plansRes.data ?? []).map((plan) => ({
    plan,
    features: featuresRes.data!.find((f) => f.plan_code === plan.code)!,
    limits: limitsRes.data!.find((l) => l.plan_code === plan.code)!,
  }));
}
