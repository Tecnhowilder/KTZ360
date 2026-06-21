/**
 * whatsapp.ts — Servicio unificado de WhatsApp Sprint 11
 *
 * FUENTE DE VERDAD ÚNICA para toda la lógica de WhatsApp.
 * Reemplaza las implementaciones fragmentadas en:
 *   - lib/calc.ts: openWhats(), followMessage()
 *   - lib/shareUtils.ts: buildWhatsAppMessage(), openWhatsAppShare()
 *
 * Arquitectura preparada para Sprint 12:
 *   - Actualmente: flujo manual enriquecido (wa.me + mensaje generado)
 *   - Sprint 12: reemplazar con Meta WhatsApp Business API sin cambiar la interfaz
 *
 * Zero Trust: los mensajes se generan en backend via RPC get_whatsapp_message().
 * El frontend solo recibe la URL final.
 */
import { supabase } from '../lib/supabaseClient';

// ─── Tipos de evento soportados ───────────────────────────────────────────────

export type WhatsAppEventType =
  | 'quote_sent'
  | 'followup'
  | 'order_created'
  | 'work_order_scheduled'
  | 'work_order_completed'
  | 'review_request';

export interface WhatsAppMessageResult {
  message:    string;
  phone:      string | null;
  wa_url:     string;
  event_type: WhatsAppEventType;
}

// ─── Servicio backend-first ───────────────────────────────────────────────────

/**
 * Genera el mensaje y URL de WhatsApp via backend (RPC).
 * Los mensajes se construyen en Postgres con datos reales del workspace.
 * Zero Trust: workspace_id viene del JWT, nunca del cliente.
 */
export async function getWhatsAppMessage(
  workspaceId: string,
  eventType:   WhatsAppEventType,
  entityId?:   string | null,
  extraParams?: Record<string, unknown>
): Promise<WhatsAppMessageResult> {
  const { data, error } = await supabase.rpc('get_whatsapp_message', {
    p_workspace_id: workspaceId,
    p_event_type:   eventType,
    p_entity_id:    entityId ?? null,
    p_extra_params: (extraParams ?? {}) as never,
  });

  if (error) throw error;
  const result = data as unknown as { ok: boolean; error?: string; message: string; phone?: string | null; wa_url: string };
  if (!result.ok) throw new Error(result.error ?? 'Error al generar mensaje de WhatsApp');

  return {
    message:    result.message,
    phone:      result.phone ?? null,
    wa_url:     result.wa_url,
    event_type: eventType,
  };
}

/**
 * Genera el URL y abre WhatsApp directamente (one-tap).
 * Para usar en botones "Enviar por WhatsApp".
 */
export async function openWhatsApp(
  workspaceId: string,
  eventType:   WhatsAppEventType,
  entityId?:   string | null,
  extraParams?: Record<string, unknown>
): Promise<void> {
  try {
    const result = await getWhatsAppMessage(workspaceId, eventType, entityId, extraParams);
    window.open(result.wa_url, '_blank', 'noopener,noreferrer');
  } catch (err) {
    console.error('[whatsapp] Error:', err);
    // Fallback: abrir WhatsApp sin mensaje si falla el backend
    window.open('https://wa.me/', '_blank', 'noopener,noreferrer');
  }
}

/**
 * Fallback: construir URL directa sin RPC.
 * Usar SOLO cuando no haya conexión al backend.
 */
export function buildWhatsAppUrlDirect(phone: string | null | undefined, message: string): string {
  const cleanPhone = phone?.replace(/\D/g, '') ?? '';
  const base = cleanPhone.length >= 7 ? `https://wa.me/${cleanPhone}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(message)}`;
}

/**
 * Helper legacy: compatibilidad con código antiguo que usaba openWhats().
 * @deprecated Usar openWhatsApp() con el workspaceId.
 */
export function openWhatsLegacy(message: string): void {
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export const WHATSAPP_EVENT_LABELS: Record<WhatsAppEventType, string> = {
  quote_sent:           'Cotización enviada',
  followup:             'Seguimiento comercial',
  order_created:        'Pedido creado',
  work_order_scheduled: 'OT programada',
  work_order_completed: 'OT finalizada',
  review_request:       'Solicitud de reseña',
};
