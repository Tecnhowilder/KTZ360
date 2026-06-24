/**
 * pushNotifications.ts — Arquitectura de Push Notifications (Sprint 22)
 *
 * Estado: PREPARADO, sin Firebase todavía.
 * Solo tipos, interfaces y abstracciones.
 *
 * Cuando se integre Firebase (FCM para Android / APNs para iOS):
 *   1. Instalar @capacitor-firebase/messaging
 *   2. Configurar google-services.json (Android) y GoogleService-Info.plist (iOS)
 *   3. Descomentar el código de registro en initPushNotifications()
 *   4. Crear edge function 'send-push' que llame a FCM REST API
 *
 * Zero Trust: el token de dispositivo se sube al backend autenticado.
 * El backend valida workspace membership antes de enviar push.
 */
import { isNative } from '../lib/capacitorBridge';

// ─── Tipos de notificación push ───────────────────────────────────────────────

export type PushNotificationType =
  | 'order_created'        // Nuevo pedido creado
  | 'work_order_assigned'  // OT asignada al usuario
  | 'work_order_completed' // OT finalizada
  | 'check_in_reminder'    // Recordatorio de Check In
  | 'quote_viewed'         // Cliente abrió cotización
  | 'quote_approved'       // Cotización aprobada
  | 'ai_credits_80'        // Créditos IA al 80%
  | 'ai_credits_100'       // Créditos IA agotados
  | 'general';             // Notificación genérica del admin

export interface PushPayload {
  type:        PushNotificationType;
  title:       string;
  body:        string;
  deepLink?:   string;        // URL para navegar al abrir (deeplink)
  entityId?:   string;        // ID de la entidad relacionada
  entityType?: string;        // 'order' | 'work_order' | 'quote' etc.
  metadata?:   Record<string, unknown>;
}

export interface DeviceToken {
  token:        string;
  platform:     'ios' | 'android' | 'web';
  appVersion?:  string;
  registeredAt: string;
}

// ─── Registro de dispositivo ──────────────────────────────────────────────────

/**
 * Registra el token FCM/APNs del dispositivo en el backend.
 * El backend lo usa para enviar push notifications dirigidas.
 *
 * @future Llamar después de que el usuario autorice notificaciones push.
 */
export async function registerDeviceToken(deviceToken: DeviceToken): Promise<void> {
  // TODO cuando Firebase esté configurado:
  // const { error } = await supabase.rpc('register_push_token', { p_token: deviceToken.token, p_platform: deviceToken.platform });
  // if (error) throw error;
  console.log('[push] Device token registrado (stub):', deviceToken.token.slice(0, 10) + '...');
}

/**
 * Des-registra el token del dispositivo al cerrar sesión.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function unregisterDeviceToken(_token: string): Promise<void> {
  // TODO cuando Firebase esté configurado:
  // const { error } = await supabase.rpc('unregister_push_token', { p_token: _token });
  console.log('[push] Device token des-registrado (stub)');
}

// ─── Inicialización ───────────────────────────────────────────────────────────

/**
 * Inicializa el sistema de push notifications.
 * En native: solicita permisos + obtiene token + lo registra en backend.
 * En web: usa la Web Push API (preparado, no implementado).
 *
 * @param onNotificationReceived Callback cuando llega una notificación con la app abierta.
 * @param onNotificationTapped   Callback cuando el usuario toca una notificación (app en background).
 */
export async function initPushNotifications(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _onNotificationReceived?: (payload: PushPayload) => void,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _onNotificationTapped?:   (payload: PushPayload) => void,
): Promise<void> {
  if (!isNative) {
    // Web Push preparado para futuro
    console.log('[push] Web Push: preparado para integración futura');
    return;
  }

  // TODO: descomentar cuando Firebase esté configurado
  /*
  const { PushNotifications } = await import('@capacitor/push-notifications');

  // Solicitar permiso
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') {
    console.log('[push] Permiso denegado');
    return;
  }

  // Registrar con FCM/APNs
  await PushNotifications.register();

  // Recibir token
  PushNotifications.addListener('registration', async (token) => {
    const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
    await registerDeviceToken({ token: token.value, platform, registeredAt: new Date().toISOString() });
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('[push] Error de registro:', err);
  });

  // Notificación recibida con app abierta
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    const payload = _parsePushPayload(notification.data);
    onNotificationReceived?.(payload);
  });

  // Usuario tocó la notificación
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const payload = _parsePushPayload(action.notification.data);
    onNotificationTapped?.(payload);
  });
  */

  console.log('[push] Native push: preparado para Firebase (FCM/APNs). Ver pushNotifications.ts para activar.');
}

// ─── Helper para parsear payload de FCM ──────────────────────────────────────

// @ts-expect-error used inside commented-out Capacitor listener code
function _parsePushPayload(data: Record<string, unknown>): PushPayload {
  return {
    type:       (data.type as PushNotificationType) ?? 'general',
    title:      String(data.title ?? ''),
    body:       String(data.body ?? ''),
    deepLink:   data.deepLink as string | undefined,
    entityId:   data.entityId as string | undefined,
    entityType: data.entityType as string | undefined,
    metadata:   data.metadata as Record<string, unknown> | undefined,
  };
}

// ─── Envío desde admin (preparado) ───────────────────────────────────────────

/**
 * Envía una push notification a un workspace específico.
 * @future Requiere edge function 'send-push' y Firebase Admin SDK.
 */
export async function sendPushToWorkspace(
  workspaceId: string,
  payload: Omit<PushPayload, 'type'> & { type: PushNotificationType },
): Promise<void> {
  // TODO: cuando Firebase esté configurado:
  // await supabase.functions.invoke('send-push', { body: { workspaceId, ...payload } });
  console.log('[push] sendPushToWorkspace (stub):', workspaceId, payload.type);
}
