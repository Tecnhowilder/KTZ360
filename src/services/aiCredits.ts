/**
 * aiCredits.ts — Shelwi
 * Servicio para consultar el estado de créditos IA del workspace.
 * ZERO TRUST: workspace_id se obtiene del JWT en el backend via RPC.
 */
import { supabase } from '../lib/supabaseClient';

export interface AICreditsSnapshot {
  plan_code:         string;
  credits_max:       number | null;
  credits_used:      number;
  credits_remaining: number | null;
  pct_used:          number;
  period_start:      string;
  period_end:        string;
  by_operation:      Record<string, number>;
  ai_enabled:        boolean;
}

export interface AIUsageEntry {
  date:            string;
  operation:       string;
  credits_used:    number;
  tokens_used:     number;
  estimated_cost:  number;
}

/**
 * Obtiene el resumen de créditos IA del workspace autenticado.
 * Llama a get_ai_credits_summary RPC — valida ownership en backend.
 */
export async function getAICreditsSnapshot(workspaceId: string): Promise<AICreditsSnapshot | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_ai_credits_summary', {
    p_workspace_id: workspaceId,
  });

  if (error) {
    console.error('[aiCredits] get_ai_credits_summary error:', error);
    return null;
  }

  return data as unknown as AICreditsSnapshot;
}

/**
 * Obtiene el historial de consumo IA de los últimos N días.
 */
export async function getAIUsageHistory(
  workspaceId: string,
  days = 30,
): Promise<AIUsageEntry[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_ai_usage_history', {
    p_workspace_id: workspaceId,
    p_days:         days,
  });

  if (error) {
    console.error('[aiCredits] get_ai_usage_history error:', error);
    return [];
  }

  return (data ?? []) as AIUsageEntry[];
}

/** Labels de operaciones IA para mostrar en UI */
export const AI_OPERATION_LABELS: Record<string, string> = {
  generate_description: 'Generar descripción',
  improve_proposal:     'Mejorar propuesta',
  ai_summary:           'Resumen del negocio',
  close_probability:    'Probabilidad de cierre',
  recommendations:      'Recomendaciones',
  photo_quote:          'Cotización desde foto',
  forecast:             'Forecast de ventas',
  risk_analysis:        'Análisis de riesgo',
};
