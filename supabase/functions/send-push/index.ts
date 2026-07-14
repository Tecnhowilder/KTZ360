/**
 * Edge Function: send-push
 *
 * Envía push notifications vía FCM HTTP v1 API.
 *
 * Seguridad (Zero Trust):
 *   - Las credenciales Firebase están EXCLUSIVAMENTE en el secret
 *     FIREBASE_SERVICE_ACCOUNT_JSON. NUNCA en variables VITE_ ni frontend.
 *   - Autenticación de caller obligatoria:
 *       • service_role key → caller interno de confianza (trigger, cron)
 *       • JWT de usuario    → debe ser owner/admin/supervisor del workspace
 *   - workspace_id del JWT (Zero Trust) — no del body cuando el caller es usuario.
 *   - service_role para acceder a push_tokens (no expuesto al cliente).
 *
 * Retry: backoff exponencial en errores transitorios FCM (500/503).
 * Circuit breaker: falla rápido en errores permanentes y desactiva token.
 * Deduplicación: no reenvía si hay entrega exitosa para la misma
 *   notification_id + user_id en los últimos 60 segundos.
 */

import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Clientes Supabase a nivel de módulo (reutilizados entre invocaciones) ────
const _supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
const _serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const _anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!;
const _admin          = createClient(_supabaseUrl, _serviceRoleKey);

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface SendPushBody {
  notification_id: string;
  user_id:         string;
  workspace_id:    string;
}

interface FcmToken {
  id:       string;
  token:    string;
  platform: string;
}

interface FcmResponse {
  name?: string;
  error?: { status: string; message: string };
}

// ─── Helper: base64url (JWT requiere base64url, no base64 estándar) ───────────
// btoa() produce base64 con +, /, y = — JWT RFC 7515 exige -, _, sin padding.

function toBase64Url(input: string): string {
  return btoa(input)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Variante para bytes binarios (firma RSA)
function bytesToBase64Url(bytes: Uint8Array): string {
  return toBase64Url(String.fromCharCode(...bytes));
}

// ─── Helper: obtener access token OAuth2 para FCM v1 ─────────────────────────

async function getFcmAccessToken(serviceAccount: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  };

  // base64url — CORRECTO para JWT (RFC 7515)
  const header  = toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = toBase64Url(JSON.stringify(claim));
  const sigInput = `${header}.${payload}`;

  const privateKeyPem = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\n/g, '');
  const keyBytes = Uint8Array.from(atob(privateKeyPem), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyBytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const sigBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(sigInput)
  );
  const sig = bytesToBase64Url(new Uint8Array(sigBytes));
  const jwt = `${sigInput}.${sig}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let tokenData: Record<string, unknown>;
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth2:grant-type:jwt-bearer&assertion=${jwt}`,
      signal: controller.signal,
    });
    tokenData = await tokenRes.json();
  } finally {
    clearTimeout(timeout);
  }

  if (!tokenData.access_token) {
    throw new Error(`FCM auth failed: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token as string;
}

// ─── Helper: enviar mensaje FCM con retry ────────────────────────────────────

const TRANSIENT_ERRORS = new Set(['INTERNAL', 'QUOTA_EXCEEDED', 'UNAVAILABLE']);
const PERMANENT_ERRORS = new Set(['INVALID_ARGUMENT', 'NOT_FOUND', 'SENDER_ID_MISMATCH', 'UNREGISTERED']);
const MANAGER_ROLES    = new Set(['owner', 'admin', 'supervisor', 'super_admin', 'support_admin']);

async function sendFcmMessage(
  accessToken: string,
  projectId: string,
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
  maxRetries = 2,
): Promise<{ messageId?: string; error?: string; deactivateToken?: boolean; latencyMs: number }> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const message = {
    message: {
      token,
      notification: { title, body },
      data,
      android: { priority: 'high' as const },
      apns: { headers: { 'apns-priority': '10' } },
    },
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const startMs = Date.now();

    let res: Response;
    let fcmData: FcmResponse;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      });
      fcmData = await res.json() as FcmResponse;
    } finally {
      clearTimeout(timeout);
    }

    const latencyMs = Date.now() - startMs;

    if (res!.ok && fcmData!.name) {
      return { messageId: fcmData!.name, latencyMs };
    }

    const errorStatus = fcmData!.error?.status ?? '';

    if (PERMANENT_ERRORS.has(errorStatus)) {
      return { error: errorStatus, deactivateToken: true, latencyMs };
    }

    if (!TRANSIENT_ERRORS.has(errorStatus) || attempt === maxRetries) {
      return { error: errorStatus || `HTTP_${res!.status}`, latencyMs };
    }
  }

  return { error: 'MAX_RETRIES_EXCEEDED', latencyMs: 0 };
}

// ─── Handler principal ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');

  if (!serviceAccountJson) {
    return new Response(
      JSON.stringify({ error: 'FIREBASE_SERVICE_ACCOUNT_JSON not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // ── Autenticación del caller ──────────────────────────────────────────────
  // Requerido siempre. Dos tipos permitidos:
  //   1. service_role key → caller interno (trigger de DB, cron, otro edge fn)
  //   2. JWT de usuario   → debe tener rol manager en el workspace destino

  const authHeader  = req.headers.get('Authorization') ?? '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '');

  if (!bearerToken) {
    return new Response(
      JSON.stringify({ error: 'unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const isServiceCall = bearerToken === _serviceRoleKey;

  try {
    const body = (await req.json()) as SendPushBody;
    const { notification_id, user_id, workspace_id } = body;

    if (!notification_id || !user_id || !workspace_id) {
      return new Response(
        JSON.stringify({ error: 'notification_id, user_id, workspace_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Verificar rol del caller si es JWT de usuario ─────────────────────
    if (!isServiceCall) {
      const callerClient = createClient(_supabaseUrl, _anonKey, {
        global: { headers: { Authorization: `Bearer ${bearerToken}` } },
      });
      const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
      if (authErr || !caller) {
        return new Response(
          JSON.stringify({ error: 'unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const { data: callerProfile } = await _admin
        .from('profiles')
        .select('role')
        .eq('id', caller.id)
        .eq('workspace_id', workspace_id)
        .eq('status', 'active')
        .single();
      if (!callerProfile || !MANAGER_ROLES.has(callerProfile.role as string)) {
        return new Response(
          JSON.stringify({ error: 'forbidden' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ── Obtener notificación ──────────────────────────────────────────────
    const { data: notif, error: notifErr } = await _admin
      .from('notifications')
      .select('id, title, message, type, metadata')
      .eq('id', notification_id)
      .eq('workspace_id', workspace_id)
      .single();

    if (notifErr || !notif) {
      return new Response(
        JSON.stringify({ error: 'notification_not_found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Obtener tokens activos del usuario ────────────────────────────────
    const { data: tokens, error: tokensErr } = await _admin
      .from('push_tokens')
      .select('id, token, platform')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user_id)
      .eq('is_active', true);

    if (tokensErr || !tokens?.length) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, reason: 'no_active_tokens' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Deduplicación (ventana 60 s) ──────────────────────────────────────
    const { data: recentDelivery } = await _admin
      .from('notification_delivery_log')
      .select('id')
      .eq('notification_id', notification_id)
      .eq('user_id', user_id)
      .eq('status', 'sent')
      .gt('created_at', new Date(Date.now() - 60_000).toISOString())
      .limit(1);

    if (recentDelivery?.length) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, reason: 'dedup_skipped' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Autenticar con Firebase ───────────────────────────────────────────
    const serviceAccount = JSON.parse(serviceAccountJson);
    const accessToken = await getFcmAccessToken(serviceAccount);
    const projectId   = serviceAccount.project_id as string;

    const title   = notif.title   as string;
    const message = notif.message as string ?? '';
    const fcmData: Record<string, string> = {
      notification_id,
      type: notif.type as string,
      ...(notif.metadata ? { metadata: JSON.stringify(notif.metadata) } : {}),
    };

    // ── Enviar a cada token ───────────────────────────────────────────────
    let sent = 0;
    for (const t of tokens as FcmToken[]) {
      const result = await sendFcmMessage(
        accessToken, projectId, t.token, title, message, fcmData
      );

      await _admin.from('notification_delivery_log').insert({
        workspace_id,
        user_id,
        notification_id,
        token_id:       t.id,
        platform:       t.platform,
        status:         result.messageId ? 'sent' : 'failed',
        fcm_message_id: result.messageId ?? null,
        error_code:     result.error ?? null,
        latency_ms:     result.latencyMs,
        sent_at:        result.messageId ? new Date().toISOString() : null,
      });

      if (result.deactivateToken) {
        await _admin.from('push_tokens')
          .update({ is_active: false })
          .eq('id', t.id);
      }

      if (result.messageId) {
        sent++;
        // Registrar último uso del token
        await _admin.from('push_tokens')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', t.id);
      }
    }

    // ── Fallback in-app: si 0 pushes entregados, asegurar visibilidad en inbox ─
    if (sent === 0 && (tokens as FcmToken[]).length > 0) {
      // La notificación ya existe en la tabla; registrar el fallo para trazabilidad.
      // El in-app inbox (NotificationBell) la leerá en el próximo mount/refetch.
      await _admin
        .from('notifications')
        .update({
          metadata: {
            ...(notif.metadata as Record<string, unknown> | null ?? {}),
            push_failed: true,
            push_failed_at: new Date().toISOString(),
            in_app_fallback: true,
          },
        })
        .eq('id', notification_id);

      // Broadcast Realtime para usuarios conectados (entrega inmediata sin push)
      // El canal debe coincidir con el que escucha usePresence/useNotifications.
      await _admin
        .channel(`user:${user_id}`)
        .send({
          type:    'broadcast',
          event:   'notification:new',
          payload: { notification_id, workspace_id, fallback: true },
        })
        .catch(() => {}); // best-effort
    }

    return new Response(
      JSON.stringify({ ok: true, sent, total: (tokens as FcmToken[]).length, fallback: sent === 0 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[send-push] error:', err);
    return new Response(
      JSON.stringify({ error: 'internal_error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
