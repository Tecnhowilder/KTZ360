/**
 * webhooks.ts — Servicio de Webhooks Salientes
 * Zero Trust: workspace_id del JWT.
 * Secret: generado server-side, mostrado una vez, nunca retornado.
 */
import { supabase } from '../lib/supabaseClient';

export const WEBHOOK_EVENTS = [
  { value: 'quote_created',      label: 'Cotización creada',   icon: '📝', group: 'Cotizaciones' },
  { value: 'quote_sent',         label: 'Cotización enviada',  icon: '✉️', group: 'Cotizaciones' },
  { value: 'quote_approved',     label: 'Cotización aprobada', icon: '✅', group: 'Cotizaciones' },
  { value: 'quote_rejected',     label: 'Cotización rechazada',icon: '❌', group: 'Cotizaciones' },
  { value: 'order_created',      label: 'Pedido creado',       icon: '📦', group: 'Pedidos' },
  { value: 'order_completed',    label: 'Pedido finalizado',   icon: '🎯', group: 'Pedidos' },
  { value: 'work_order_created', label: 'OT creada',           icon: '🔧', group: 'OTs' },
  { value: 'work_order_completed','label': 'OT finalizada',    icon: '🏁', group: 'OTs' },
  { value: 'client_created',     label: 'Cliente nuevo',       icon: '👤', group: 'Clientes' },
] as const;

export const PROVIDER_LABELS: Record<string, { label: string; icon: string; color: string; docsUrl: string }> = {
  webhook: { label: 'URL personalizada', icon: '🔗', color: '#374151', docsUrl: '' },
  zapier:  { label: 'Zapier',            icon: '⚡', color: '#FF4A00', docsUrl: 'https://zapier.com/developer/documentation/v2/rest-hooks/' },
  make:    { label: 'Make',              icon: '🔄', color: '#6E42CE', docsUrl: 'https://www.make.com/en/help/tools/webhooks' },
  n8n:     { label: 'n8n',              icon: '🔀', color: '#E24328', docsUrl: 'https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/' },
};

export type WebhookEndpoint = {
  id:                   string;
  label:                string;
  url:                  string;
  provider_type:        'webhook' | 'zapier' | 'make' | 'n8n';
  events:               string[];
  is_active:            boolean;
  failure_count:        number;
  consecutive_failures: number;
  last_success_at:      string | null;
  last_failure_at:      string | null;
  disabled_at:          string | null;
  disabled_reason:      string | null;
  created_at:           string;
  deliveries_last_24h:  number;
  success_rate_7d:      number | null;
};

export type WebhookDelivery = {
  id:              string;
  endpoint_id:     string;
  endpoint_label:  string;
  event_type:      string;
  event_id:        string;
  status:          'pending' | 'delivered' | 'failed' | 'retrying';
  response_status: number | null;
  duration_ms:     number | null;
  attempt:         number;
  max_attempts:    number;
  delivered_at:    string | null;
  next_retry_at:   string | null;
  created_at:      string;
};

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  const r = data as { ok?: boolean; error?: string } & T;
  if (r && typeof r === 'object' && 'ok' in r && r.ok === false)
    throw new Error(r.error ?? `Error en ${name}`);
  return r as T;
}

export async function getWebhookEndpoints(workspaceId: string): Promise<WebhookEndpoint[]> {
  const r = await rpc<{ endpoints: WebhookEndpoint[] }>('get_webhook_endpoints', { p_workspace_id: workspaceId });
  return r.endpoints ?? [];
}

export async function registerWebhookEndpoint(
  workspaceId: string,
  label: string,
  url: string,
  providerType: string,
  events: string[],
): Promise<{ endpoint_id: string; secret: string; message: string }> {
  return rpc('register_webhook_endpoint', {
    p_workspace_id: workspaceId,
    p_label:        label,
    p_url:          url,
    p_provider_type: providerType,
    p_events:       events,
  });
}

export async function updateWebhookEndpoint(
  workspaceId: string,
  endpointId: string,
  updates: { label?: string; url?: string; events?: string[]; is_active?: boolean },
): Promise<void> {
  await rpc('update_webhook_endpoint', {
    p_workspace_id: workspaceId,
    p_endpoint_id:  endpointId,
    p_label:        updates.label      ?? null,
    p_url:          updates.url        ?? null,
    p_events:       updates.events     ?? null,
    p_is_active:    updates.is_active  ?? null,
  });
}

export async function deleteWebhookEndpoint(workspaceId: string, endpointId: string): Promise<void> {
  await rpc('delete_webhook_endpoint', { p_workspace_id: workspaceId, p_endpoint_id: endpointId });
}

export async function rotateWebhookSecret(
  workspaceId: string,
  endpointId: string,
): Promise<{ secret: string; message: string }> {
  return rpc('rotate_webhook_secret', { p_workspace_id: workspaceId, p_endpoint_id: endpointId });
}

export async function testWebhookEndpoint(workspaceId: string, endpointId: string): Promise<{ test_id: string }> {
  return rpc('test_webhook_endpoint', { p_workspace_id: workspaceId, p_endpoint_id: endpointId });
}

export async function getWebhookDeliveries(
  workspaceId: string,
  endpointId?: string,
): Promise<WebhookDelivery[]> {
  const r = await rpc<{ deliveries: WebhookDelivery[] }>('get_webhook_deliveries', {
    p_workspace_id: workspaceId,
    p_endpoint_id:  endpointId ?? null,
    p_limit:        100,
  });
  return r.deliveries ?? [];
}

export async function redeliverWebhook(workspaceId: string, deliveryId: string): Promise<void> {
  await rpc('redeliver_webhook', { p_workspace_id: workspaceId, p_delivery_id: deliveryId });
}
