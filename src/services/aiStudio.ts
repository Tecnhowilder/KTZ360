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
  | 'bi_executive_summary'        // 3 créditos — Sprint 19
  | 'bi_business_forecast'        // 3 créditos — Sprint 19
  | 'bi_risk_assessment'          // 3 créditos — Sprint 19
  | 'bi_growth_recs'              // 3 créditos — Sprint 19
  // Agente IA Operativo (crear)
  | 'ia_voice_interpret'          // 2 créditos — interpreta voz/texto → cotización/pedido
  | 'ia_photo_interpret'          // 3 créditos — interpreta foto → cotización
  | 'ia_full_create'              // 4 créditos — generación completa
  // IA Operativa
  | 'ops_risk_detection'          // 3 créditos — IA Operativa
  | 'ops_delay_analysis'          // 3 créditos — IA Operativa
  | 'ops_productivity_analysis'   // 3 créditos — IA Operativa
  | 'ops_cost_analysis'           // 3 créditos — IA Operativa
  | 'ops_project_risk'            // 3 créditos — IA Operativa
  | 'ops_recommendations';        // 3 créditos — IA Operativa

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
    // Cuando la edge function retorna 4xx/5xx, el SDK pone null en data.
    // El body real viene en error.context (FunctionsHttpError de Supabase JS v2).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (error as any)?.context;
    let errBody: Record<string, unknown> | null = null;
    try {
      if (ctx && typeof ctx.json === 'function') errBody = await ctx.json();
    } catch { /* ignorar errores de parse */ }

    const errCode = errBody?.error as string | undefined;

    if (errCode === 'ai_credits_exhausted') {
      throw makeAIError('AICreditsExhaustedError',
        `Créditos IA agotados este mes (${errBody?.credits_used ?? 0}/${errBody?.credits_max ?? 0}).`,
        { credits_used: errBody?.credits_used, credits_max: errBody?.credits_max });
    }
    if (errCode === 'ai_not_included') {
      throw makeAIError('AIPlanNotIncludedError',
        `La IA no está incluida en el plan ${errBody?.plan ?? 'free'}. Actualiza a PRO o PREMIUM.`,
        { plan: errBody?.plan });
    }
    if (errCode === 'rate_limit_exceeded') {
      throw new Error(`Límite de llamadas IA alcanzado. Intenta en ${errBody?.retry_after_minutes ?? 60} minutos.`);
    }
    if (errCode === 'GEMINI_API_KEY is not configured') {
      throw new Error('La clave de API de Gemini no está configurada en el servidor. Contacta al administrador.');
    }
    if (errCode) {
      throw new Error(errBody?.message as string ?? errCode);
    }
    throw error;
  }

  return {
    text:              data?.text ?? '',
    tokens_used:       data?.tokens_used ?? 0,
    credits_consumed:  data?.credits_consumed ?? 0,
    credits_remaining: data?.credits_remaining ?? null,
  };
}

export default { callAistudio };
