/**
 * surveys.ts — Servicio de Encuestas Sprint 16
 */
import { supabase } from '../lib/supabaseClient';

export interface SurveyQuestion {
  id: string; type: 'rating' | 'text' | 'nps' | 'select'; label: string; required: boolean;
  options?: string[];
}
export interface SurveyInfo {
  id: string; title: string; description: string | null; questions: SurveyQuestion[];
  include_nps: boolean;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  const r = data as { ok: boolean; error?: string } & T;
  if (!r.ok) throw new Error(r.error ?? `Error en ${name}`);
  return r as T;
}

export async function submitSurveyResponse(opts: {
  token: string; surveyId: string; answers: Record<string, unknown>;
  npsScore?: number | null; orderId?: string | null;
}): Promise<{ response_id: string }> {
  return rpc('submit_survey_response', {
    p_token:     opts.token,
    p_survey_id: opts.surveyId,
    p_answers:   opts.answers,
    p_nps_score: opts.npsScore ?? null,
    p_order_id:  opts.orderId ?? null,
  });
}

export async function getSurveyResponses(workspaceId: string, surveyId?: string) {
  return rpc('get_survey_responses', { p_workspace_id: workspaceId, p_survey_id: surveyId ?? null });
}
