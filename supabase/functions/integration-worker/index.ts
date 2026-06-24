/**
 * integration-worker — Edge Function Shelwi Sprint 11
 * Sprint 16.3 Performance: batch size reducido + timeout safety guard.
 *
 * Adapters:
 *   - WhatsAppAdapter: generates wa.me URL (manual enriched flow)
 *   - GoogleCalendarAdapter: creates/updates/deletes events via Google Calendar API
 *   - OutlookCalendarAdapter: creates/updates/deletes events via Microsoft Graph API
 *
 * Called:
 *   - Manually from frontend (trigger sync)
 *   - Via automation-scheduler (cada minuto)
 *   - POST /functions/v1/integration-worker
 *
 * Zero Trust: workspace_id always from DB, never from request body.
 *
 * Performance (Sprint 16.3):
 *   - MAX_EVENTS_PER_RUN: 20 → 5 (evita timeout en eventos pesados Drive/Alegra)
 *   - EXECUTION_BUDGET_MS: 25s safety guard (timeout Supabase = 30s)
 *   - Procesa incrementalmente: el scheduler llama cada 1 min, cubre el resto
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SVC_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ENCRYPTION_KEY   = Deno.env.get('INTEGRATION_ENCRYPTION_KEY') ?? Deno.env.get('ENCRYPTION_KEY') ?? '';

// Sprint 24 D2: Batch dinámico por prioridad de provider.
// Webhooks y shelwi_internal son rápidos (~50ms) → pueden procesarse más.
// Drive/OneDrive/Teams/Alegra son lentos (~3-8s) → máximo 3 por run.
//
// Estrategia por nivel de usuarios:
//   <1K ws activos:  MAX_EVENTS_PER_RUN = 5  (actual)
//   1K-3K ws:        MAX_EVENTS_PER_RUN = 10 (ajustar env var MAX_BATCH)
//   3K-5K ws:        Múltiples instancias del worker (diferentes providers)
//   5K+ ws:          Worker dedicado por provider type
//
// Para ajustar sin redeploy: env var WORKER_MAX_BATCH (override dinámico)
const ENV_MAX_BATCH = parseInt(Deno.env.get('WORKER_MAX_BATCH') ?? '5');
const MAX_EVENTS_PER_RUN = isNaN(ENV_MAX_BATCH) ? 5 : Math.min(ENV_MAX_BATCH, 50);

// Safety budget: si llevamos >25s ejecutando, cortamos el loop (timeout Supabase = 30s)
const EXECUTION_BUDGET_MS = 25_000;

// Providers que pueden procesarse en lote mayor (rápidos, sin timeout riesgo)
const FAST_PROVIDERS = new Set(['webhook', 'zapier', 'make', 'n8n', 'shelwi_internal', 'whatsapp']);
// Providers lentos: limitados a MAX_SLOW = 2 por run para no saturar el budget
const MAX_SLOW_PROVIDERS_PER_RUN = 2;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Decryption ───────────────────────────────────────────────────────────────

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  return bytes;
}

async function decryptData(encrypted: string, iv: string): Promise<Record<string, unknown>> {
  if (!ENCRYPTION_KEY) throw new Error('INTEGRATION_ENCRYPTION_KEY not set');
  const keyBytes = hexToBytes(ENCRYPTION_KEY.padEnd(64, '0').slice(0, 64));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(iv) },
    key,
    base64ToBytes(encrypted)
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

// ─── Token refresh helpers ────────────────────────────────────────────────────

async function refreshGoogleToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
      grant_type: 'refresh_token',
    }),
  });
  if (!resp.ok) throw new Error('Google token refresh failed');
  return resp.json();
}

async function refreshOutlookToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const resp = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: Deno.env.get('OUTLOOK_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('OUTLOOK_CLIENT_SECRET') ?? '',
      grant_type: 'refresh_token',
      scope: 'Calendars.ReadWrite offline_access',
    }),
  });
  if (!resp.ok) throw new Error('Outlook token refresh failed');
  return resp.json();
}

// ─── Get valid access token ───────────────────────────────────────────────────

async function getAccessToken(
  admin: ReturnType<typeof createClient>,
  workspaceId: string,
  provider: string
): Promise<string> {
  const { data: creds } = await admin
    .from('integration_credentials')
    .select('encrypted_data, encryption_iv, expires_at')
    .eq('workspace_id', workspaceId)
    .eq('provider', provider)
    .single();

  if (!creds) throw new Error(`No credentials for ${provider}`);

  const tokens = await decryptData(creds.encrypted_data, creds.encryption_iv);
  const expiresAt = new Date(creds.expires_at ?? 0);
  const now = new Date();

  // Refresh if expired or expiring in < 5 minutes
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    let newTokens: { access_token: string; expires_in: number };
    if (provider === 'google_calendar') {
      newTokens = await refreshGoogleToken(tokens.refresh_token as string);
    } else {
      newTokens = await refreshOutlookToken(tokens.refresh_token as string);
    }

    // Re-encrypt and store
    const { createClient: cc } = await import('https://esm.sh/@supabase/supabase-js@2');
    void cc; // already imported above

    const updatedTokens = { ...tokens, access_token: newTokens.access_token };
    const { default: encModule } = { default: null }; // inline encrypt
    // Simple re-encryption
    const keyBytes = hexToBytes(ENCRYPTION_KEY.padEnd(64, '0').slice(0, 64));
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(updatedTokens))
    );
    const encrypted = btoa(String.fromCharCode(...new Uint8Array(enc)));
    const ivB64 = btoa(String.fromCharCode(...iv));

    await admin.from('integration_credentials').update({
      encrypted_data: encrypted,
      encryption_iv: ivB64,
      expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('workspace_id', workspaceId).eq('provider', provider);

    return newTokens.access_token;
  }

  return tokens.access_token as string;
}

// ─── WhatsApp Adapter ─────────────────────────────────────────────────────────

async function processWhatsAppEvent(
  admin: ReturnType<typeof createClient>,
  event: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // WhatsApp enriched = generate wa.me URL via RPC
  const { data, error } = await admin.rpc('get_whatsapp_message', {
    p_workspace_id: event.workspace_id,
    p_event_type:   event.event_type,
    p_entity_id:    (event.payload as Record<string, unknown>)?.quote_id
                 ?? (event.payload as Record<string, unknown>)?.order_id
                 ?? (event.payload as Record<string, unknown>)?.work_order_id
                 ?? (event.payload as Record<string, unknown>)?.client_id,
    p_extra_params: event.payload as Record<string, unknown>,
  });

  if (error) throw error;
  if (!data.ok) throw new Error(data.error);

  return {
    wa_url:  data.wa_url,
    message: data.message,
    phone:   data.phone,
  };
}

// ─── Google Calendar Adapter ──────────────────────────────────────────────────

async function processGoogleCalendarEvent(
  admin: ReturnType<typeof createClient>,
  event: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const accessToken = await getAccessToken(admin, event.workspace_id as string, 'google_calendar');
  const payload = event.payload as Record<string, unknown>;
  const { data: intRow } = await admin
    .from('integrations').select('config')
    .eq('workspace_id', event.workspace_id).eq('provider', 'google_calendar').single();
  const calendarId = (intRow?.config as Record<string, string>)?.calendar_id ?? 'primary';

  if (event.event_type === 'calendar_create') {
    const eventDate = new Date(payload.event_date as string);
    const endDate   = new Date(eventDate.getTime() + 60 * 60 * 1000); // +1 hora

    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary:     payload.event_title ?? 'Evento Shelwi',
          description: payload.comentario ?? payload.title ?? '',
          start: { dateTime: eventDate.toISOString(), timeZone: 'America/Bogota' },
          end:   { dateTime: endDate.toISOString(),   timeZone: 'America/Bogota' },
        }),
      }
    );
    if (!resp.ok) throw new Error(`Google Calendar API error: ${await resp.text()}`);
    const created = await resp.json();
    return { calendar_event_id: created.id, html_link: created.htmlLink };
  }

  // Update/Delete: need stored calendar_event_id from previous event
  return { skipped: true, reason: 'calendar_update/delete requires stored event_id (Sprint 12)' };
}

// ─── Outlook Calendar Adapter ─────────────────────────────────────────────────

async function processOutlookCalendarEvent(
  admin: ReturnType<typeof createClient>,
  event: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const accessToken = await getAccessToken(admin, event.workspace_id as string, 'outlook_calendar');
  const payload = event.payload as Record<string, unknown>;

  if (event.event_type === 'calendar_create') {
    const eventDate = new Date(payload.event_date as string);
    const endDate   = new Date(eventDate.getTime() + 60 * 60 * 1000);

    const resp = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: payload.event_title ?? 'Evento Shelwi',
        body: { contentType: 'text', content: payload.comentario ?? payload.title ?? '' },
        start: { dateTime: eventDate.toISOString(), timeZone: 'America/Bogota' },
        end:   { dateTime: endDate.toISOString(),   timeZone: 'America/Bogota' },
      }),
    });
    if (!resp.ok) throw new Error(`Outlook Calendar API error: ${await resp.text()}`);
    const created = await resp.json();
    return { calendar_event_id: created.id, web_link: created.webLink };
  }

  return { skipped: true, reason: 'calendar_update/delete requires stored event_id (Sprint 12)' };
}

// ─── ShelwiInternal Adapter — acciones internas del motor de automatizaciones ─

async function processShelwiInternalEvent(
  admin: ReturnType<typeof createClient>,
  event: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const eventType   = event.event_type as string;
  const payload     = event.payload as Record<string, unknown>;
  const wsId        = event.workspace_id as string;
  const entityId    = payload.entity_id as string | undefined;
  const entityType  = payload.entity_type as string | undefined;
  const conditions  = payload.conditions as unknown[] ?? [];
  const actionPay   = payload.action_payload as Record<string, unknown> ?? {};
  const depth       = (event.execution_depth as number ?? 0) + 1;

  // Re-evaluar condiciones diferidas (si delay_hours > 0, el estado puede haber cambiado)
  if (conditions.length > 0 && entityId && entityType) {
    const { data: condResult } = await admin.rpc('evaluate_automation_conditions', {
      p_conditions:  JSON.stringify(conditions),
      p_entity_type: entityType,
      p_entity_id:   entityId,
      p_extra_data:  payload,
    } as never);
    if (condResult === false) {
      return { skipped: true, reason: 'Conditions no longer met at execution time' };
    }
  }

  switch (eventType) {

    case 'create_followup_and_notify': {
      const quoteId  = payload.quote_id as string | null ?? null;
      const clientId = payload.client_id as string | null ?? null;
      const type     = actionPay.followup_type as string ?? 'llamada';
      const msg      = actionPay.notify_message as string ?? 'Acción automática requerida';

      // Crear seguimiento
      if (quoteId || clientId) {
        const { data: createdBy } = await admin
          .from('profiles')
          .select('id')
          .eq('workspace_id', wsId)
          .in('role', ['owner','admin'])
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();

        if (createdBy) {
          await admin.rpc('create_seguimiento' as never, {
            p_workspace_id: wsId,
            p_quote_id:     quoteId ?? null,
            p_client_id:    clientId ?? null,
            p_type:         type,
            p_resultado:    null,
            p_comentario:   'Creado automáticamente por: ' + (actionPay.rule_name ?? 'automatización'),
          } as never);
        }
      }

      // Crear notificación
      const clientName = payload.client_name as string ?? 'Cliente';
      const interpolated = msg.replace('{{client_name}}', clientName)
        .replace('{{days_inactive}}', String(payload.days_inactive ?? ''))
        .replace('{{view_count}}', String(payload.view_count ?? ''));

      await admin.from('notifications').insert({
        workspace_id: wsId,
        title:        '🤖 Automatización: seguimiento creado',
        message:      interpolated,
        type:         'info',
      } as never);

      // Encolar más automatizaciones desde esta acción (con depth+1)
      if (entityId && entityType) {
        await admin.rpc('evaluate_and_queue_automations' as never, {
          p_workspace_id:    wsId,
          p_trigger_event:   'followup_created',
          p_entity_type:     entityType,
          p_entity_id:       entityId,
          p_payload:         payload,
          p_execution_depth: depth,
          p_parent_event_id: event.id,
        } as never);
      }

      return { action: 'create_followup_and_notify', client_name: clientName, notified: true };
    }

    case 'notify_user':
    case 'notify_supervisor': {
      const title   = (actionPay.title as string ?? '🤖 Automatización');
      const msgTmpl = actionPay.message_template as string ?? '';
      const type    = actionPay.type as string ?? 'info';

      const interpolated = msgTmpl
        .replace('{{client_name}}', String(payload.client_name ?? ''))
        .replace('{{work_order_number}}', String(payload.work_order_number ?? ''))
        .replace('{{hours_overdue}}', String(Math.round(payload.hours_overdue as number ?? 0)))
        .replace('{{view_count}}', String(payload.view_count ?? ''));

      // Para notify_supervisor: buscar supervisors del workspace
      const targetRoles = eventType === 'notify_supervisor'
        ? ['owner','admin','supervisor']
        : ['owner','admin'];

      const { data: targets } = await admin
        .from('profiles')
        .select('id')
        .eq('workspace_id', wsId)
        .in('role', targetRoles)
        .eq('status', 'active');

      for (const t of (targets ?? [])) {
        await admin.from('notifications').insert({
          workspace_id: wsId,
          user_id:      t.id,
          title,
          message:      interpolated || undefined,
          type,
        } as never);
      }

      return { action: eventType, targets_notified: targets?.length ?? 0 };
    }

    case 'send_whatsapp': {
      const waEventType = actionPay.event_type as string ?? 'followup';
      const quoteId  = payload.quote_id as string ?? entityId;
      const clientId = payload.client_id as string ?? null;
      const orderId  = payload.order_id as string ?? null;

      // Queue a real WhatsApp event (goes through WhatsApp provider)
      await admin.rpc('queue_integration_event' as never, {
        p_workspace_id: wsId,
        p_provider:     'whatsapp',
        p_event_type:   waEventType,
        p_payload:      payload,
      } as never);

      return { action: 'send_whatsapp', event_type: waEventType, queued: true };
    }

    case 'send_email': {
      const provider = actionPay.email_provider as string ?? 'gmail';
      if (entityType === 'quote' && entityId) {
        await admin.rpc('queue_email_send' as never, {
          p_quote_id: entityId,
          p_provider: provider,
        } as never);
      }
      return { action: 'send_email', provider, queued: true };
    }

    case 'change_commercial_status': {
      const newStatus = actionPay.status as string ?? 'negociacion';
      if (entityType === 'quote' && entityId) {
        await admin.rpc('update_commercial_status' as never, {
          p_quote_id:   entityId,
          p_new_status: newStatus,
          p_observacion:'Cambio automático por automatización',
        } as never);
      }
      return { action: 'change_commercial_status', status: newStatus };
    }

    default:
      return { skipped: true, reason: `ShelwiInternal event type '${eventType}' not implemented` };
  }
}

// ─── Alegra Adapter ───────────────────────────────────────────────────────────

const ALEGRA_BASE = 'https://app.alegra.com/api/r1';

async function getAlegraAuth(admin: ReturnType<typeof createClient>, workspaceId: string): Promise<string> {
  const { data: creds } = await admin
    .from('integration_credentials')
    .select('encrypted_data, encryption_iv')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'alegra')
    .single();
  if (!creds) throw new Error('No Alegra credentials found');
  const tokens = await decryptData(creds.encrypted_data, creds.encryption_iv);
  return btoa(`${tokens.email}:${tokens.api_token}`);
}

async function processAlegraInvoice(
  admin: ReturnType<typeof createClient>,
  event: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const payload    = event.payload as Record<string, unknown>;
  const orderId    = payload.order_id as string;
  const wsId       = event.workspace_id as string;
  const authHeader = await getAlegraAuth(admin, wsId);

  // Obtener datos del pedido + cliente
  const { data: orderRow } = await admin
    .from('orders')
    .select('*, clients(name, email, phone, document_number, address, city)')
    .eq('id', orderId)
    .single();

  if (!orderRow) throw new Error('Order not found');

  const client = orderRow.clients as Record<string, unknown>;

  // Buscar o crear contacto en Alegra
  let alegraContactId: string | null = null;
  if (orderRow.client_id) {
    // Check if we already have an Alegra contact ref
    const { data: ref } = await admin.from('integration_entity_refs')
      .select('external_id').eq('workspace_id', wsId).eq('entity_type', 'client')
      .eq('entity_id', orderRow.client_id).eq('provider', 'alegra').maybeSingle();

    if (ref) {
      alegraContactId = ref.external_id;
    } else if (client?.name) {
      // Create contact in Alegra
      const contactResp = await fetch(`${ALEGRA_BASE}/contacts`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${authHeader}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:           client.name,
          email:          client.email,
          identification: client.document_number ?? null,
          type:           ['client'],
          settings:       { sendEmail: !!client.email },
        }),
      });
      if (contactResp.ok) {
        const contact = await contactResp.json() as Record<string, unknown>;
        alegraContactId = String(contact.id);
        // Store ref for future
        await admin.rpc('upsert_entity_ref', {
          p_workspace_id: wsId, p_entity_type: 'client',
          p_entity_id: orderRow.client_id, p_provider: 'alegra',
          p_external_id: alegraContactId,
        });
      }
    }
  }

  // Crear factura en Alegra
  const snapshot = orderRow.order_snapshot as Record<string, unknown> ?? {};
  const items = [
    {
      id: 1,
      name: orderRow.title,
      description: orderRow.title,
      quantity: 1,
      price: orderRow.total_amount,
    }
  ];

  const invoiceBody: Record<string, unknown> = {
    date:     new Date().toISOString().slice(0, 10),
    dueDate:  new Date().toISOString().slice(0, 10),
    items,
    currency: { code: 'COP' },
    notes:    `Generada desde Shelwi · Pedido ${orderRow.order_number}`,
  };
  if (alegraContactId) invoiceBody.client = { id: alegraContactId };

  const invResp = await fetch(`${ALEGRA_BASE}/invoices`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${authHeader}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(invoiceBody),
  });

  if (!invResp.ok) {
    const errText = await invResp.text();
    throw new Error(`Alegra invoice creation failed: ${errText}`);
  }

  const invoice = await invResp.json() as Record<string, unknown>;
  const invoiceId     = String(invoice.id);
  const invoiceNumber = String(invoice.numberTemplate?.number ?? invoice.id);

  // Guardar en integration_invoices (trazabilidad Shelwi)
  await admin.from('integration_invoices').insert({
    workspace_id:        wsId,
    provider:            'alegra',
    order_id:            orderId,
    client_id:           orderRow.client_id ?? null,
    external_invoice_id: invoiceId,
    invoice_number:      invoiceNumber,
    invoice_status:      'issued',
    total:               orderRow.total_amount,
    currency:            'COP',
    issued_at:           new Date().toISOString(),
  } as never).on('conflict', { columns: ['workspace_id','provider','external_invoice_id'], action: 'update' });

  // Guardar ref
  if (orderId) {
    await admin.rpc('upsert_entity_ref', {
      p_workspace_id: wsId, p_entity_type: 'order', p_entity_id: orderId,
      p_provider: 'alegra', p_external_id: invoiceId,
      p_external_url: invoice.url as string ?? null,
    });
  }

  return { invoice_id: invoiceId, invoice_number: invoiceNumber, status: 'issued' };
}

// ─── Alegra: Anular factura ───────────────────────────────────────────────────

async function processAlegraVoidInvoice(
  admin: ReturnType<typeof createClient>,
  event: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const payload    = event.payload as Record<string, unknown>;
  const wsId       = event.workspace_id as string;
  const externalId = payload.external_invoice_id as string;

  const authHeader = await getAlegraAuth(admin, wsId);

  // DELETE /invoices/:id en Alegra
  const voidResp = await fetch(`${ALEGRA_BASE}/invoices/${externalId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Basic ${authHeader}`, 'Content-Type': 'application/json' },
  });

  if (!voidResp.ok) {
    const errText = await voidResp.text();
    // Alegra devuelve 404 si ya está anulada — tratar como éxito
    if (voidResp.status === 404) {
      await admin.rpc('update_invoice_status', {
        p_workspace_id: wsId, p_external_invoice_id: externalId,
        p_new_status: 'void',
      });
      return { status: 'void', note: 'already_void_in_alegra' };
    }
    throw new Error(`Alegra void invoice failed ${voidResp.status}: ${errText}`);
  }

  // Actualizar estado local
  await admin.rpc('update_invoice_status', {
    p_workspace_id: wsId, p_external_invoice_id: externalId,
    p_new_status: 'void',
  });

  return { external_invoice_id: externalId, status: 'void' };
}

// ─── Webhook Adapter — HMAC-SHA256 signed delivery ───────────────────────────
// Handles: webhook | zapier | make | n8n (same delivery mechanism)
// Security: HMAC-SHA256(secret, timestamp + "." + body) → X-Shelwi-Signature
// Idempotency: event_id included in payload header + body
// Resilience: auto-disable endpoint after max_consecutive_failures

async function processWebhookDelivery(
  admin: ReturnType<typeof createClient>,
  event: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const wsId      = event.workspace_id as string;
  const eventType = event.event_type as string;
  const payload   = event.payload as Record<string, unknown>;
  const endpointId = payload.endpoint_id as string;

  // 1. Obtener endpoint y su secret (solo service_role puede)
  const { data: secretData } = await admin
    .rpc('get_webhook_endpoint_secret', { p_endpoint_id: endpointId });

  if (!secretData) {
    return { skipped: true, reason: `Endpoint ${endpointId} not found or has no secret` };
  }
  const secret = secretData as string;

  // 2. Construir payload estándar
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const eventId   = crypto.randomUUID();
  const deliveryPayload = {
    event:           eventType,
    event_id:        eventId,
    workspace_id:    wsId,
    timestamp:       new Date().toISOString(),
    shelwi_version:  '1.0',
    data:            payload.event_data ?? payload,
  };
  const body = JSON.stringify(deliveryPayload);

  // 3. Firmar con HMAC-SHA256: signature = HMAC(secret, timestamp + "." + body)
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const signatureBytes = await crypto.subtle.sign(
    'HMAC', key, encoder.encode(timestamp + '.' + body)
  );
  const signature = 'sha256=' + Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  // 4. Obtener URL del endpoint
  const { data: ep } = await admin
    .from('webhook_endpoints')
    .select('url, is_active, disabled_at, failure_count')
    .eq('id', endpointId)
    .maybeSingle();

  if (!ep || !ep.is_active || ep.disabled_at) {
    return { skipped: true, reason: 'Endpoint disabled or not found' };
  }

  // 5. Enviar request con timeout
  const startMs = Date.now();
  let responseStatus = 0;
  let responseBody = '';
  let status: 'delivered' | 'failed' | 'retrying' = 'failed';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout

    const res = await fetch(ep.url, {
      method:  'POST',
      headers: {
        'Content-Type':         'application/json',
        'X-Shelwi-Signature':   signature,
        'X-Shelwi-Event':       eventType,
        'X-Shelwi-Delivery':    eventId,
        'X-Shelwi-Timestamp':   timestamp,
        'User-Agent':           'Shelwi-Webhooks/1.0',
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    responseStatus = res.status;
    responseBody   = await res.text().catch(() => '');
    status = (res.status >= 200 && res.status < 300) ? 'delivered' : 'failed';

  } catch (err: unknown) {
    responseBody = err instanceof Error ? err.message : String(err);
    status = 'failed';
  }

  const durationMs = Date.now() - startMs;

  // 6. Determinar si hay reintento
  const attempt = (payload.attempt as number) ?? 1;
  const maxAttempts = 3;
  let nextRetryAt: string | null = null;
  if (status === 'failed' && attempt < maxAttempts) {
    // Backoff exponencial: 1min, 5min, 30min
    const delays = [60, 300, 1800];
    const delaySeconds = delays[attempt - 1] ?? 1800;
    nextRetryAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
    status = 'retrying' as 'delivered' | 'failed' | 'retrying';
  }

  // 7. Registrar resultado de entrega
  await admin.rpc('record_webhook_delivery', {
    p_endpoint_id:    endpointId,
    p_workspace_id:   wsId,
    p_event_type:     eventType,
    p_payload:        deliveryPayload,
    p_status:         status === 'retrying' ? 'failed' : status,
    p_response_status: responseStatus || null,
    p_response_body:  responseBody || null,
    p_duration_ms:    durationMs,
    p_attempt:        attempt,
    p_next_retry_at:  nextRetryAt,
  });

  // 8. Si hay reintento, re-encolar
  if (status === 'retrying' && nextRetryAt) {
    await admin.from('integration_events').insert({
      workspace_id: wsId,
      provider:     event.provider as string,
      event_type:   eventType,
      payload:      {
        ...payload,
        attempt:  attempt + 1,
        event_id: eventId,
      },
      execute_after: nextRetryAt,
    });
  }

  console.log(`[webhook] ${eventType} → ${ep.url} | ${responseStatus} | ${durationMs}ms | ${status}`);

  return {
    endpoint_id:     endpointId,
    event_type:      eventType,
    response_status: responseStatus,
    duration_ms:     durationMs,
    status,
    signature,
  };
}

// ─── Gmail Adapter ────────────────────────────────────────────────────────────

async function processGmailEmail(
  admin: ReturnType<typeof createClient>,
  event: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const payload   = event.payload as Record<string, unknown>;
  const wsId      = event.workspace_id as string;
  const accessToken = await getAccessToken(admin, wsId, 'gmail');

  const { data: company } = await admin.from('company_settings').select('name').eq('workspace_id', wsId).maybeSingle();
  const companyName = (company as Record<string, string> | null)?.name ?? 'El equipo';

  const recipient     = payload.recipient as string;
  const subject       = `Propuesta para ${payload.quote_title ?? 'tu proyecto'}`;
  const portalUrl     = payload.portal_url ? `https://shelwi.com${payload.portal_url}` : '';
  const bodyHtml      = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
      <p>Hola ${payload.client_name ?? 'cliente'},</p>
      <p>Hemos preparado una propuesta para <strong>${payload.quote_title ?? 'tu proyecto'}</strong>.</p>
      ${portalUrl ? `<p><a href="${portalUrl}" style="background:#2563EB;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Ver propuesta →</a></p>` : ''}
      <p>Quedamos atentos a cualquier consulta.</p>
      <p>${companyName}</p>
    </div>
  `;

  // Build RFC 2822 email
  const email = [
    `To: ${recipient}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    bodyHtml,
  ].join('\r\n');

  const raw = btoa(unescape(encodeURIComponent(email)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });

  if (!resp.ok) throw new Error(`Gmail API error: ${await resp.text()}`);
  const sent = await resp.json() as Record<string, unknown>;

  // Log comunicación
  if (payload.quote_id) {
    await admin.rpc('log_communication', {
      p_workspace_id:   wsId,
      p_entity_type:    'quote',
      p_entity_id:      payload.quote_id,
      p_provider:       'gmail',
      p_channel:        'email',
      p_recipient:      recipient,
      p_subject:        subject,
      p_content_preview:bodyHtml.replace(/<[^>]*>/g, '').slice(0, 200),
      p_status:         'sent',
      p_metadata:       { message_id: sent.id },
    } as never);
  }

  return { message_id: sent.id, recipient, status: 'sent' };
}

// ─── Outlook Mail Adapter ─────────────────────────────────────────────────────

async function processOutlookMail(
  admin: ReturnType<typeof createClient>,
  event: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const payload     = event.payload as Record<string, unknown>;
  const wsId        = event.workspace_id as string;
  const accessToken = await getAccessToken(admin, wsId, 'outlook_mail');

  const { data: company } = await admin.from('company_settings').select('name').eq('workspace_id', wsId).maybeSingle();
  const companyName = (company as Record<string, string> | null)?.name ?? 'El equipo';

  const recipient   = payload.recipient as string;
  const subject     = `Propuesta para ${payload.quote_title ?? 'tu proyecto'}`;
  const portalUrl   = payload.portal_url ? `https://shelwi.com${payload.portal_url}` : '';
  const bodyHtml    = `<div style="font-family:Arial,sans-serif">
    <p>Hola ${payload.client_name ?? 'cliente'},</p>
    <p>Hemos preparado una propuesta para <strong>${payload.quote_title}</strong>.</p>
    ${portalUrl ? `<p><a href="${portalUrl}">Ver propuesta →</a></p>` : ''}
    <p>${companyName}</p>
  </div>`;

  const resp = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'html', content: bodyHtml },
        toRecipients: [{ emailAddress: { address: recipient } }],
      },
      saveToSentItems: true,
    }),
  });

  if (!resp.ok) throw new Error(`Outlook Mail API error: ${await resp.text()}`);

  // Log comunicación
  if (payload.quote_id) {
    await admin.rpc('log_communication', {
      p_workspace_id:   wsId,
      p_entity_type:    'quote',
      p_entity_id:      payload.quote_id,
      p_provider:       'outlook_mail',
      p_channel:        'email',
      p_recipient:      recipient,
      p_subject:        subject,
      p_content_preview:bodyHtml.replace(/<[^>]*>/g, '').slice(0, 200),
      p_status:         'sent',
    } as never);
  }

  return { recipient, status: 'sent' };
}

// ─── Store calendar event ref (Sprint 12 fix) ─────────────────────────────────

async function storeCalendarRef(
  admin: ReturnType<typeof createClient>,
  event: Record<string, unknown>,
  result: Record<string, unknown>
): Promise<void> {
  const payload = event.payload as Record<string, unknown>;
  const entityId = payload.work_order_id ?? payload.order_id ?? payload.seguimiento_id ?? payload.recordatorio_id;
  const entityType = payload.work_order_id ? 'work_order'
    : payload.order_id ? 'order'
    : payload.seguimiento_id ? 'seguimiento'
    : payload.recordatorio_id ? 'recordatorio'
    : null;

  if (!entityId || !entityType || !result.calendar_event_id) return;

  await admin.rpc('upsert_entity_ref', {
    p_workspace_id: event.workspace_id,
    p_entity_type:  entityType,
    p_entity_id:    entityId,
    p_provider:     event.provider,
    p_external_id:  result.calendar_event_id,
    p_external_url: result.html_link ?? result.web_link ?? null,
  } as never);
}

// ─── Google Drive Adapter ─────────────────────────────────────────────────────
// Shelwi es la fuente de verdad. Drive es respaldo/colaboración.

const DRIVE_BASE = 'https://www.googleapis.com/upload/drive/v3/files';

async function processDriveSync(
  admin: ReturnType<typeof createClient>,
  event: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const payload     = event.payload as Record<string, unknown>;
  const wsId        = event.workspace_id as string;
  const evidenceId  = payload.evidence_id as string;
  const storagePath = payload.storage_path as string;
  const fileName    = payload.file_name as string;
  const mimeType    = payload.mime_type as string;
  const entityType  = payload.work_order_id ? 'work_order' : 'order';
  const entityId    = (payload.work_order_id ?? payload.order_id) as string;

  const accessToken = await getAccessToken(admin, wsId, 'google_calendar');
  // Note: Drive uses same Google OAuth token but requires drive.file scope

  // 1. Download file from Supabase Storage
  const { data: fileData, error: dlErr } = await (admin.storage as ReturnType<typeof admin.storage>)
    .from('evidences')
    .download(storagePath);

  if (dlErr || !fileData) {
    throw new Error(`Cannot download evidence from Shelwi storage: ${dlErr?.message}`);
  }

  // 2. Get integration config (folder_id)
  const { data: intRow } = await admin
    .from('integrations').select('config')
    .eq('workspace_id', wsId).eq('provider', 'drive').single();
  const folderId = (intRow?.config as Record<string, string>)?.folder_id;

  // 3. Upload to Drive (multipart)
  const meta = JSON.stringify({ name: fileName, ...(folderId ? { parents: [folderId] } : {}) });
  const boundary = '---shelwi_boundary';
  const body = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}`,
    `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  ].join('');

  // Use Drive simple upload for reliability
  const uploadResp = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: new Blob([body, await fileData.arrayBuffer(), `\r\n--${boundary}--`]),
    }
  );

  if (!uploadResp.ok) throw new Error(`Drive upload failed: ${await uploadResp.text()}`);
  const driveFile = await uploadResp.json() as Record<string, string>;

  // 4. Store Drive file ID in integration_entity_refs
  await admin.rpc('upsert_entity_ref' as never, {
    p_workspace_id: wsId,
    p_entity_type: 'evidence',
    p_entity_id: evidenceId,
    p_provider: 'drive',
    p_external_id: driveFile.id,
    p_external_url: `https://drive.google.com/file/d/${driveFile.id}/view`,
  } as never);

  return { drive_file_id: driveFile.id, drive_url: `https://drive.google.com/file/d/${driveFile.id}/view` };
}

// ─── OneDrive Adapter ─────────────────────────────────────────────────────────
// Shelwi es la fuente de verdad. OneDrive es respaldo/colaboración.

async function processOneDriveSync(
  admin: ReturnType<typeof createClient>,
  event: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const payload     = event.payload as Record<string, unknown>;
  const wsId        = event.workspace_id as string;
  const evidenceId  = payload.evidence_id as string;
  const storagePath = payload.storage_path as string;
  const fileName    = payload.file_name as string;

  const accessToken = await getAccessToken(admin, wsId, 'outlook_calendar');
  // Note: OneDrive uses same Microsoft Graph token but requires Files.ReadWrite scope

  // 1. Download from Shelwi Storage
  const { data: fileData, error: dlErr } = await (admin.storage as ReturnType<typeof admin.storage>)
    .from('evidences')
    .download(storagePath);

  if (dlErr || !fileData) throw new Error(`Cannot download: ${dlErr?.message}`);

  // 2. Get target folder path from config
  const { data: intRow } = await admin
    .from('integrations').select('config')
    .eq('workspace_id', wsId).eq('provider', 'onedrive').single();
  const folderPath = (intRow?.config as Record<string, string>)?.folder_path ?? 'Shelwi Evidencias';

  // 3. Upload to OneDrive via Graph simple upload
  const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${folderPath}/${fileName}:/content`;
  const uploadResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
    },
    body: await fileData.arrayBuffer(),
  });

  if (!uploadResp.ok) throw new Error(`OneDrive upload failed: ${await uploadResp.text()}`);
  const odFile = await uploadResp.json() as Record<string, unknown>;

  // 4. Store OneDrive file ID
  const fileId  = String(odFile.id);
  const webUrl  = String((odFile as Record<string, Record<string, string>>).webUrl ?? '');

  await admin.rpc('upsert_entity_ref' as never, {
    p_workspace_id: wsId,
    p_entity_type: 'evidence',
    p_entity_id: evidenceId,
    p_provider: 'onedrive',
    p_external_id: fileId,
    p_external_url: webUrl,
  } as never);

  return { onedrive_file_id: fileId, web_url: webUrl };
}

// ─── Microsoft Teams Adapter ──────────────────────────────────────────────────
// Teams solo recibe notificaciones. NUNCA almacena datos críticos de Shelwi.

async function processTeamsNotification(
  admin: ReturnType<typeof createClient>,
  event: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const payload    = event.payload as Record<string, unknown>;
  const wsId       = event.workspace_id as string;
  const eventType  = event.event_type as string;
  const accessToken = await getAccessToken(admin, wsId, 'outlook_calendar');
  // Teams uses same Microsoft Graph token but requires ChannelMessage.Send scope

  // Get Teams channel from config
  const { data: intRow } = await admin
    .from('integrations').select('config')
    .eq('workspace_id', wsId).eq('provider', 'teams').single();

  const config    = (intRow?.config ?? {}) as Record<string, string>;
  const teamId    = config.team_id;
  const channelId = config.channel_id;

  if (!teamId || !channelId) {
    return { skipped: true, reason: 'Teams team_id or channel_id not configured' };
  }

  // Build message body
  const eventTitle = (payload.event_title as string) ?? eventType;
  const details    = Object.entries(payload)
    .filter(([k]) => !['event_title', 'workspace_id'].includes(k))
    .map(([k, v]) => `**${k}:** ${v}`)
    .join('<br>');

  const messageBody = {
    body: {
      contentType: 'html',
      content: `<h3>🤖 Shelwi — ${eventTitle}</h3><p>${details}</p>`,
    },
  };

  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messageBody),
    }
  );

  if (!resp.ok) throw new Error(`Teams API error: ${await resp.text()}`);
  const msg = await resp.json() as Record<string, string>;

  await admin.rpc('upsert_entity_ref' as never, {
    p_workspace_id: wsId,
    p_entity_type: 'teams_message',
    p_entity_id: event.id ?? wsId,
    p_provider: 'teams',
    p_external_id: msg.id,
  } as never);

  return { teams_message_id: msg.id, event_type: eventType };
}

// ─── Event router ─────────────────────────────────────────────────────────────

async function processEvent(
  admin: ReturnType<typeof createClient>,
  event: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const eventType = event.event_type as string;
  switch (event.provider as string) {
    case 'whatsapp':
      return processWhatsAppEvent(admin, event);
    case 'google_calendar': {
      const result = await processGoogleCalendarEvent(admin, event);
      if (result.calendar_event_id) await storeCalendarRef(admin, event, result);
      return result;
    }
    case 'outlook_calendar': {
      const result = await processOutlookCalendarEvent(admin, event);
      if (result.calendar_event_id) await storeCalendarRef(admin, event, result);
      return result;
    }
    case 'alegra':
      if (eventType === 'invoice_create') return processAlegraInvoice(admin, event);
      if (eventType === 'invoice_void')   return processAlegraVoidInvoice(admin, event);
      return { skipped: true, reason: `Alegra event type ${eventType} not yet supported` };
    case 'gmail':
      if (eventType === 'email_send') return processGmailEmail(admin, event);
      return { skipped: true, reason: `Gmail event type ${eventType} not yet supported` };
    case 'outlook_mail':
      if (eventType === 'email_send') return processOutlookMail(admin, event);
      return { skipped: true, reason: `Outlook Mail event type ${eventType} not yet supported` };
    case 'shelwi_internal':
      return processShelwiInternalEvent(admin, event);
    case 'webhook':
    case 'zapier':
    case 'make':
    case 'n8n':
      return processWebhookDelivery(admin, event);
    case 'drive':
      if (eventType === 'drive_sync') return processDriveSync(admin, event);
      return { skipped: true, reason: `Drive event type ${eventType} not supported` };
    case 'onedrive':
      if (eventType === 'onedrive_sync') return processOneDriveSync(admin, event);
      return { skipped: true, reason: `OneDrive event type ${eventType} not supported` };
    case 'teams':
      return processTeamsNotification(admin, event);
    default:
      return { skipped: true, reason: `Provider ${event.provider} not yet supported` };
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const admin = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

  // Optional: filter by workspace_id from authenticated request
  let workspaceFilter: string | null = null;
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(SUPABASE_URL, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (user) {
      const { data: profile } = await admin.from('profiles').select('workspace_id').eq('id', user.id).single();
      workspaceFilter = profile?.workspace_id ?? null;
    }
  }

  try {
    // Fetch pending events
    let query = admin
      .from('integration_events')
      .select('*')
      .in('status', ['pending', 'failed'])
      .filter('retries', 'lt', 3)  // max_retries
      .or('next_retry_at.is.null,next_retry_at.lte.' + new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(MAX_EVENTS_PER_RUN);

    if (workspaceFilter) {
      query = query.eq('workspace_id', workspaceFilter);
    }

    const { data: events, error } = await query;
    if (error) throw error;

    const results = { processed: 0, failed: 0, skipped: 0, total: events?.length ?? 0 };

    // Sprint 16.3: timeout safety guard
    const startTime = Date.now();

    for (const event of (events ?? [])) {
      // Safety: si llevamos más de 25s, salir del loop para evitar timeout
      if (Date.now() - startTime > EXECUTION_BUDGET_MS) {
        console.warn(`[integration-worker] Budget ${EXECUTION_BUDGET_MS}ms exceeded, stopping loop. Processed: ${results.processed}/${results.total}`);
        break;
      }

      // Mark as processing
      await admin.from('integration_events').update({
        status: 'processing', updated_at: new Date().toISOString()
      } as never).eq('id', event.id);

      try {
        const result = await processEvent(admin, event);

        const isSkipped = result.skipped === true;
        await admin.from('integration_events').update({
          status:       isSkipped ? 'skipped' : 'processed',
          result:       result,
          processed_at: new Date().toISOString(),
        } as never).eq('id', event.id);

        // Update integration last_sync_at
        await admin.from('integrations').update({
          last_sync_at: new Date().toISOString(),
          last_error:   null,
        } as never).eq('workspace_id', event.workspace_id).eq('provider', event.provider);

        if (isSkipped) results.skipped++; else results.processed++;

      } catch (err) {
        const errMsg = String(err);
        const newRetries = (event.retries ?? 0) + 1;
        const maxRetries = event.max_retries ?? 3;
        const nextRetry  = new Date(Date.now() + Math.pow(2, newRetries) * 60_000); // exponential backoff

        await admin.from('integration_events').update({
          status:          newRetries >= maxRetries ? 'failed' : 'pending',
          retries:         newRetries,
          last_error:      errMsg,
          next_retry_at:   newRetries < maxRetries ? nextRetry.toISOString() : null,
        } as never).eq('id', event.id);

        // Update integration error status
        await admin.from('integrations').update({
          last_error: errMsg, status: 'error',
        } as never).eq('workspace_id', event.workspace_id).eq('provider', event.provider);

        results.failed++;
        console.error(`[integration-worker] Event ${event.id} failed:`, errMsg);
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[integration-worker] Fatal error:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
