import { supabase } from '../lib/supabaseClient';

/**
 * Operaciones IA disponibles — deben coincidir con ai_operation_costs en DB.
 * Cada operación tiene un costo de créditos diferente (configurado en DB).
 */
export type AIOperation =
  | 'generate_description'  // 1 crédito
  | 'improve_proposal'      // 2 créditos
  | 'ai_summary'            // 2 créditos
  | 'close_probability'     // 3 créditos
  | 'recommendations'       // 3 créditos
  | 'photo_quote'           // 5 créditos
  | 'forecast'              // 3 créditos
  | 'forecast_finance'       // 3 créditos — Sprint 18
  | 'risk_analysis'          // 3 créditos
  | 'bi_executive_summary'   // 3 créditos — Sprint 19
  | 'bi_business_forecast'   // 3 créditos — Sprint 19
  | 'bi_risk_assessment'     // 3 créditos — Sprint 19
  | 'bi_growth_recs';        // 3 créditos — Sprint 19

export type AIRequest = {
  prompt:      string;
  operation:   AIOperation;  // OBLIGATORIO — determina costo de créditos
  images?:     unknown[];
  model?:      string;
  max_tokens?: number;
  temperature?: number;
};

export type AIResponse = {
  text:              string;
  tokens_used:       number;
  credits_consumed:  number;
  credits_remaining: number | null;
};

/** Helper para crear errores tipados sin extends Error (compatible con erasableSyntaxOnly) */
function makeAIError(name: string, message: string, extra?: Record<string, unknown>): Error {
  const e = new Error(message);
  e.name  = name;
  Object.assign(e, extra ?? {});
  return e;
}

export function isAICreditsExhausted(e: unknown): boolean {
  return (e as Error)?.name === 'AICreditsExhaustedError';
}

export function isAIPlanNotIncluded(e: unknown): boolean {
  return (e as Error)?.name === 'AIPlanNotIncludedError';
}

export async function callAistudio(req: AIRequest): Promise<AIResponse> {
  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  if (error) {
    throw error;
  }

  // Manejar errores de negocio retornados por ai-proxy
  if (data?.error === 'ai_credits_exhausted') {
    throw makeAIError('AICreditsExhaustedError',
      `Créditos IA agotados este mes (${data.credits_used ?? 0}/${data.credits_max ?? 0}).`,
      { credits_used: data.credits_used, credits_max: data.credits_max });
  }
  if (data?.error === 'ai_not_included') {
    throw makeAIError('AIPlanNotIncludedError',
      `La IA no está incluida en el plan ${data.plan ?? 'free'}. Actualiza a PRO o PREMIUM.`,
      { plan: data.plan });
  }
  if (data?.error === 'rate_limit_exceeded') {
    throw new Error(`Límite de llamadas IA alcanzado. Intenta en ${data.retry_after_minutes ?? 60} minutos.`);
  }
  if (data?.error) {
    throw new Error(data.error);
  }

  return {
    text:              data?.text ?? '',
    tokens_used:       data?.tokens_used ?? 0,
    credits_consumed:  data?.credits_consumed ?? 0,
    credits_remaining: data?.credits_remaining ?? null,
  };
}

export default { callAistudio };
