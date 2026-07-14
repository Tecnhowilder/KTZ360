/**
 * orders.ts — Servicio de Pedidos (Sprint 6)
 * Zero Trust: workspace_id desde JWT en backend. Frontend nunca lo envía.
 * Feature gated: orders_enabled (PREMIUM only)
 */
import { supabase } from '../lib/supabaseClient';
import type {
  OrderWithRelations, WorkLogWithUser, WorkOrderWithRelations, OperationsDashboard,
} from '../lib/database.types';

// ─── Helpers RPC ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (supabase as any).rpc.bind(supabase as any);

// ─── Crear pedido ─────────────────────────────────────────────────────────────

export interface CreateOrderInput {
  quoteId:      string;
  title?:       string;
  description?: string;
  assignedTo?:  string;
  scheduledAt?: string;
  notes?:       string;
}

export async function createOrder(input: CreateOrderInput): Promise<{ orderId: string }> {
  const { data, error } = await rpc('create_order', {
    p_quote_id:     input.quoteId,
    p_title:        input.title       ?? null,
    p_description:  input.description ?? null,
    p_assigned_to:  input.assignedTo  ?? null,
    p_scheduled_at: input.scheduledAt ?? null,
    p_notes:        input.notes       ?? null,
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error ?? 'Error al crear pedido');
  return { orderId: data.order_id };
}

// ─── Listar pedidos ───────────────────────────────────────────────────────────

export interface ListOrdersResult {
  orders:      OrderWithRelations[];
  has_more:    boolean;
  next_cursor: string | null;
}

export async function listOrders(
  status?:  string,
  search?:  string,
  cursor?:  string,
  limit?:   number,
): Promise<ListOrdersResult> {
  const { data, error } = await rpc('list_orders', {
    p_status: status ?? null,
    p_search: search?.trim() || null,
    p_cursor: cursor ?? null,
    p_limit:  limit  ?? 50,
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error ?? 'Error al listar pedidos');
  return {
    orders:      (data.orders ?? []) as OrderWithRelations[],
    has_more:    data.has_more  ?? false,
    next_cursor: data.next_cursor ?? null,
  };
}

// ─── Obtener detalle de pedido ────────────────────────────────────────────────

export interface OrderDetail {
  order:       OrderWithRelations;
  work_orders: WorkOrderWithRelations[];
  logs:        WorkLogWithUser[];
}

export async function getOrder(orderId: string): Promise<OrderDetail> {
  const { data, error } = await rpc('get_order', { p_order_id: orderId });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error ?? 'Pedido no encontrado');
  return {
    order:       data.order,
    work_orders: data.work_orders ?? [],
    logs:        data.logs ?? [],
  };
}

// ─── Actualizar estado de pedido ──────────────────────────────────────────────

export async function updateOrderStatus(
  orderId: string,
  newStatus: string,
  note?: string,
): Promise<void> {
  const { data, error } = await rpc('update_order_status', {
    p_order_id:   orderId,
    p_new_status: newStatus,
    p_note:       note ?? null,
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error ?? 'Error al actualizar estado');
}

// ─── Dashboard operativo ──────────────────────────────────────────────────────

export async function getOperationsDashboard(): Promise<OperationsDashboard> {
  const { data, error } = await rpc('get_operations_dashboard', {});
  if (error) throw error;
  if (!data.ok) throw new Error(data.error ?? 'Error al cargar dashboard');
  return data as OperationsDashboard;
}
