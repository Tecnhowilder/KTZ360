/**
 * reviews.ts — Servicio de Reseñas Sprint 16
 */
import { supabase } from '../lib/supabaseClient';

export interface ReviewStats {
  total: number; avg: number | null;
  stars_5: number; stars_4: number; stars_3: number; stars_2: number; stars_1: number;
}
export interface Review {
  id: string; rating: number; comment: string | null; created_at: string;
  client_name: string | null; order_number: string | null;
  response: string | null; responded_at: string | null;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  const r = data as { ok: boolean; error?: string } & T;
  if (!r.ok) throw new Error(r.error ?? `Error en ${name}`);
  return r as T;
}

export async function submitReview(
  token: string, orderId: string, rating: number, comment?: string
): Promise<{ review_id: string; rating: number }> {
  return rpc('submit_review', {
    p_token: token, p_order_id: orderId, p_rating: rating, p_comment: comment ?? null,
  });
}

export async function respondToReview(reviewId: string, response: string): Promise<void> {
  await rpc('respond_to_review', { p_review_id: reviewId, p_response: response });
}

export async function getReviews(workspaceId: string): Promise<{ stats: ReviewStats; reviews: Review[] }> {
  return rpc('get_reviews', { p_workspace_id: workspaceId, p_limit: 100 });
}

export async function getNpsSummary(workspaceId: string): Promise<{
  nps: number | null; nps_total_responses: number; promoters: number; passives: number; detractors: number;
  avg_rating: number | null; total_reviews: number; nps_label: string;
}> {
  return rpc('get_nps_summary', { p_workspace_id: workspaceId });
}

export function starLabel(rating: number): string {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}
