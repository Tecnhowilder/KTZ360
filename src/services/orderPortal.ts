/**
 * orderPortal.ts — Servicio de portal público para Pedidos.
 *
 * Espejo de publicPortal.ts para el módulo Pedidos.
 * publicPortal.ts NO se modifica.
 *
 * Zero Trust: todas las operaciones validadas en RPC SECURITY DEFINER.
 */
import { supabase } from '../lib/supabaseClient';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (supabase as any).rpc.bind(supabase as any);

export interface PublicOrderData {
  order:   Record<string, unknown>;
  client:  Record<string, unknown> | null;
  company: Record<string, unknown> | null;
  token:   string;
}

export async function getOrCreateOrderToken(orderId: string): Promise<string> {
  const { data, error } = await rpc('get_or_create_order_token', { p_order_id: orderId });
  if (error) throw error;
  return data as string;
}

export async function getPublicOrder(token: string): Promise<PublicOrderData> {
  const { data, error } = await rpc('get_public_order', { p_token: token });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'Pedido no encontrado');
  return data as PublicOrderData;
}

export async function registerOrderEvent(token: string, event: string, metadata?: Record<string, unknown>): Promise<void> {
  await rpc('register_order_event', {
    p_token:    token,
    p_event:    event,
    p_metadata: metadata ?? null,
  });
}
