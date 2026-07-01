/**
 * workOrders.ts — Servicio de Órdenes de Trabajo (Sprint 6)
 * Zero Trust: workspace_id desde JWT. Feature gated: work_orders_enabled (PREMIUM)
 */
import { supabase } from '../lib/supabaseClient';
import type { WorkOrderWithRelations, WorkLogWithUser } from '../lib/database.types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (supabase as any).rpc.bind(supabase as any);

// ─── Crear OT ─────────────────────────────────────────────────────────────────

export interface CreateWorkOrderInput {
  orderId:       string;
  title:         string;
  description?:  string;
  priority?:     'baja' | 'media' | 'alta' | 'urgente';
  assignedTo?:   string;
  scheduledAt?:  string;
  sequenceNum?:  number;
  notes?:        string;
}

export async function createWorkOrder(input: CreateWorkOrderInput): Promise<{ workOrderId: string }> {
  const { data, error } = await rpc('create_work_order', {
    p_order_id:     input.orderId,
    p_title:        input.title,
    p_description:  input.description  ?? null,
    p_priority:     input.priority     ?? 'media',
    p_assigned_to:  input.assignedTo   ?? null,
    p_scheduled_at: input.scheduledAt  ?? null,
    p_sequence_num: input.sequenceNum  ?? null,
    p_notes:        input.notes        ?? null,
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error ?? 'Error al crear OT');
  return { workOrderId: data.work_order_id };
}

// ─── Listar OT ────────────────────────────────────────────────────────────────

export async function listWorkOrders(opts?: {
  orderId?:  string;
  status?:   string;
  priority?: string;
}): Promise<WorkOrderWithRelations[]> {
  const { data, error } = await rpc('list_work_orders', {
    p_order_id: opts?.orderId  ?? null,
    p_status:   opts?.status   ?? null,
    p_priority: opts?.priority ?? null,
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error ?? 'Error al listar OT');
  return (data.work_orders ?? []) as WorkOrderWithRelations[];
}

// ─── Actualizar estado OT ─────────────────────────────────────────────────────

export async function updateWorkOrderStatus(
  workOrderId: string,
  newStatus:   string,
  note?:       string,
): Promise<void> {
  const { data, error } = await rpc('update_work_order_status', {
    p_work_order_id: workOrderId,
    p_new_status:    newStatus,
    p_note:          note ?? null,
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error ?? 'Error al actualizar estado de OT');
}

// ─── Asignar OT ───────────────────────────────────────────────────────────────

export async function assignWorkOrder(workOrderId: string, assignedTo: string): Promise<void> {
  const { data, error } = await rpc('assign_work_order', {
    p_work_order_id: workOrderId,
    p_assigned_to:   assignedTo,
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error ?? 'Error al asignar OT');
}

// ─── Agregar comentario a bitácora ────────────────────────────────────────────

export async function addWorkLogComment(opts: {
  orderId?:      string;
  workOrderId?:  string;
  note:          string;
}): Promise<void> {
  const { data, error } = await rpc('add_work_log_comment', {
    p_order_id:      opts.orderId     ?? null,
    p_work_order_id: opts.workOrderId ?? null,
    p_note:          opts.note,
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error ?? 'Error al agregar comentario');
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pendiente:    'Pendiente',
  asignado:     'Asignado',
  programado:   'Programado',
  en_ruta:      'En ruta',
  en_sitio:     'En sitio',
  en_ejecucion: 'En ejecución',
  pausado:      'Pausado',
  finalizado:   'Finalizado',
  facturado:    'Facturado',
  cancelado:    'Cancelado',
};

export const WO_STATUS_LABELS: Record<string, string> = {
  pendiente:  'Pendiente',
  asignada:   'Asignada',
  en_progreso:'En progreso',
  pausada:    'Pausada',
  finalizada: 'Finalizada',
  cancelada:  'Cancelada',
};

export const PRIORITY_LABELS: Record<string, string> = {
  baja:    'Baja',
  media:   'Media',
  alta:    'Alta',
  urgente: 'Urgente',
};

export const ORDER_STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  pendiente:    { color: '#92400E', bg: '#FEF3C7' },
  asignado:     { color: '#0E7490', bg: '#CFFAFE' },
  programado:   { color: '#1E40AF', bg: '#DBEAFE' },
  en_ruta:      { color: '#B45309', bg: '#FEF3C7' },
  en_sitio:     { color: '#6D28D9', bg: '#EDE9FE' },
  en_ejecucion: { color: '#166534', bg: '#DCFCE7' },
  pausado:      { color: '#6B21A8', bg: '#F3E8FF' },
  finalizado:   { color: '#065F46', bg: '#D1FAE5' },
  facturado:    { color: '#14532D', bg: '#BBF7D0' },
  cancelado:    { color: '#9F1239', bg: '#FFE4E6' },
};

export const WO_STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  pendiente:   { color: '#92400E', bg: '#FEF3C7' },
  asignada:    { color: '#1E40AF', bg: '#DBEAFE' },
  en_progreso: { color: '#166534', bg: '#DCFCE7' },
  pausada:     { color: '#6B21A8', bg: '#F3E8FF' },
  finalizada:  { color: '#065F46', bg: '#D1FAE5' },
  cancelada:   { color: '#9F1239', bg: '#FFE4E6' },
};

export const PRIORITY_COLORS: Record<string, { color: string; bg: string }> = {
  baja:    { color: '#166534', bg: '#DCFCE7' },
  media:   { color: '#1E40AF', bg: '#DBEAFE' },
  alta:    { color: '#92400E', bg: '#FEF3C7' },
  urgente: { color: '#9F1239', bg: '#FFE4E6' },
};

export type { WorkLogWithUser };
