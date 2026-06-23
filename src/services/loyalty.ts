/**
 * loyalty.ts — Servicio de Fidelización Sprint 16
 * Zero Trust: workspace_id siempre del JWT. Tokens validados en backend.
 */
import { supabase } from '../lib/supabaseClient';

export interface LoyaltyLevel {
  name: string; min: number; max: number | null; color: string; icon: string;
}
export interface LoyaltyReward {
  id: string; name: string; description: string | null; points_required: number;
  can_redeem: boolean; available: boolean;
}
export interface LoyaltyTransaction {
  points: number; type: string; description: string | null; created_at: string;
}
export interface ClientLoyaltyData {
  total_points: number;
  current_level: LoyaltyLevel | null;
  next_level: LoyaltyLevel | null;
  points_to_next: number;
  transactions: LoyaltyTransaction[];
  rewards: LoyaltyReward[];
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  const r = data as { ok: boolean; error?: string } & T;
  if (!r.ok) throw new Error(r.error ?? `Error en ${name}`);
  return r as T;
}

export async function getClientLoyalty(token: string): Promise<ClientLoyaltyData> {
  return rpc<ClientLoyaltyData>('get_client_loyalty', { p_token: token });
}

export async function getLoyaltyProgram(workspaceId: string) {
  const { data, error } = await supabase
    .from('loyalty_programs' as never)
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateLoyaltyProgram(workspaceId: string, updates: Record<string, unknown>) {
  const { error } = await supabase
    .from('loyalty_programs' as never)
    .upsert({ workspace_id: workspaceId, ...updates } as never, { onConflict: 'workspace_id' });
  if (error) throw error;
}

export const LOYALTY_TYPE_LABELS: Record<string, string> = {
  earned_order:  '💰 Pedido completado',
  earned_ot:     '🔧 OT finalizada',
  earned_review: '⭐ Reseña dejada',
  redeemed:      '🎁 Recompensa canjeada',
  adjustment:    '🔄 Ajuste',
  bonus:         '🎉 Bonus especial',
  expiration:    '⏰ Expiración',
};
