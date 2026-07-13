/**
 * pushNotifications.ts — Integración FCM/APNs vía @capacitor/push-notifications
 *
 * Arquitectura Zero Trust:
 *   • El token del dispositivo se sube al backend vía RPC autenticada.
 *   • La edge function send-push usa las credenciales Firebase del secret
 *     FIREBASE_SERVICE_ACCOUNT_JSON — nunca expuestas al frontend.
 *   • Sin claves FCM en variables VITE_.
 *
 * Flujo:
 *   1. App abre → initPushNotifications()
 *   2. Pide permiso al usuario
 *   3. Obtiene token FCM/APNs
 *   4. Llama register_push_token RPC → guardado en push_tokens
 *   5. Al cerrar sesión → unregister_push_token RPC → token desactivado
 */
import { isNative } from '../lib/capacitorBridge';
import { supabase } from '../lib/supabaseClient';
import { getStoredDeviceId } from './auth';

// Handles de listeners activos — se limpian al re-inicializar o en logout
let _activeHandles: Array<{ remove: () => Promise<void> }> = [];

// ─── Tipos de notificación push ───────────────────────────────────────────────

export type PushNotificationType =
  | 'order_created'
  | 'work_order_assigned'
  | 'work_order_completed'
  | 'check_in_reminder'
  | 'quote_viewed'
  | 'quote_approved'
  | 'ai_credits_80'
  | 'ai_credits_100'
  | 'general';

export interface PushPayload {
  type:        PushNotificationType;
  title:       string;
  body:        string;
  deepLink?:   string;
  entityId?:   string;
  entityType?: string;
  metadata?:   Record<string, unknown>;
}

// ─── Registro de token en backend ────────────────────────────────────────────

async function registerTokenInBackend(token: string, platform: 'ios' | 'android' | 'web'): Promise<void> {
  const deviceId = getStoredDeviceId();
  if (!deviceId) return;

  const appVersion: string | undefined = undefined; // versión inyectada por CI en builds nativos

  const { error } = await supabase.rpc('register_push_token' as never, {
    p_token:       token,
    p_platform:    platform,
    p_device_id:   deviceId,
    p_app_version: appVersion ?? null,
  } as never);

  if (error) {
    console.warn('[push] Error al registrar token:', error.message);
  }
}

export async function unregisterDeviceToken(): Promise<void> {
  // Remover listeners activos antes de desregistrar el token
  if (_activeHandles.length > 0) {
    await Promise.all(_activeHandles.map(h => h.remove()));
    _activeHandles = [];
  }

  const deviceId = getStoredDeviceId();
  if (!deviceId) return;

  await supabase.rpc('unregister_push_token' as never, {
    p_device_id: deviceId,
  } as never);
}

// ─── Inicialización (solo native) ────────────────────────────────────────────

export async function initPushNotifications(
  onNotificationReceived?: (payload: PushPayload) => void,
  onNotificationTapped?:   (payload: PushPayload) => void,
): Promise<void> {
  if (!isNative) {
    return; // Web Push: no implementado — Realtime cubre notificaciones en foreground
  }

  // Limpiar listeners anteriores antes de re-inicializar
  if (_activeHandles.length > 0) {
    await Promise.all(_activeHandles.map(h => h.remove()));
    _activeHandles = [];
  }

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const { Capacitor } = await import('@capacitor/core');

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') {
      console.log('[push] Permiso denegado por el usuario');
      return;
    }

    await PushNotifications.register();

    // Guardar handles para poder remover listeners en cleanup/logout
    const h1 = await PushNotifications.addListener('registration', async ({ value: token }) => {
      const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
      await registerTokenInBackend(token, platform);
    });
    const h2 = await PushNotifications.addListener('registrationError', (err) => {
      console.error('[push] Error de registro FCM/APNs:', err);
    });
    const h3 = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const payload = parsePushPayload(notification.data);
      onNotificationReceived?.(payload);
    });
    const h4 = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const payload = parsePushPayload(action.notification.data);
      onNotificationTapped?.(payload);
    });

    _activeHandles = [h1, h2, h3, h4];

  } catch (err) {
    console.warn('[push] initPushNotifications error:', err);
  }
}

// ─── Helper: parsear payload FCM ─────────────────────────────────────────────

function parsePushPayload(data: Record<string, unknown>): PushPayload {
  let metadata: Record<string, unknown> | undefined;
  if (data.metadata && typeof data.metadata === 'string') {
    try { metadata = JSON.parse(data.metadata); } catch { /* noop */ }
  }
  return {
    type:       (data.type as PushNotificationType) ?? 'general',
    title:      String(data.title ?? ''),
    body:       String(data.body  ?? ''),
    deepLink:   data.deepLink   as string | undefined,
    entityId:   data.entityId   as string | undefined,
    entityType: data.entityType as string | undefined,
    metadata,
  };
}

// ─── Envío desde backend (solo para tests internos, no usar desde UI) ─────────

export async function sendPushViaEdgeFunction(
  notificationId: string,
  userId:         string,
  workspaceId:    string,
): Promise<{ ok: boolean; sent?: number }> {
  const { data, error } = await supabase.functions.invoke('send-push', {
    body: { notification_id: notificationId, user_id: userId, workspace_id: workspaceId },
  });
  if (error) throw error;
  return data as { ok: boolean; sent?: number };
}
