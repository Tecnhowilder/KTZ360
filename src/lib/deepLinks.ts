/**
 * deepLinks.ts — Configuración y manejo de Deep Links (Sprint 22)
 *
 * Soporta:
 *   shelwi://...       ← URL Scheme nativo (Android + iOS)
 *   https://app.shelwi.com/... ← Universal Links (iOS) + App Links (Android)
 *
 * Rutas cubiertas:
 *   /p/:token                → Portal de cotización (público)
 *   /portal/:token           → Portal cliente
 *   /invite/:token           → Aceptar invitación de equipo
 *   /recuperar-contrasena    → Reset password email
 *   /ref/:refCode            → Referral redirect
 *   /app/dashboard           → Dashboard (push notifications)
 *   /app/pedidos/:id         → Detalle de pedido (push)
 *   /app/ordenes-trabajo/:id → Detalle de OT (push)
 */
import { Capacitor } from '@capacitor/core';
import { isNative }   from './capacitorBridge';

/**
 * Convierte una URL (web o scheme) a una ruta interna de React Router.
 * Llamar desde el listener de App.addListener('appUrlOpen', ...)
 */
export function parseDeepLinkUrl(url: string): string | null {
  try {
    // Normalizar scheme nativo a URL estándar para parsear
    const normalized = url
      .replace(/^shelwi:\/\//, 'https://app.shelwi.com/')
      .replace(/^shelwi:\//, 'https://app.shelwi.com/');

    const parsed = new URL(normalized);
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    // URL inválida
    return null;
  }
}

/**
 * Registra el listener de deep links en Capacitor.
 * Llama a `navigate(path)` cuando llega un deep link mientras la app está abierta.
 *
 * Ejemplo de uso en App.tsx o main.tsx:
 *   registerDeepLinkHandler(navigate);
 */
export async function registerDeepLinkHandler(
  navigate: (path: string) => void,
): Promise<() => void> {
  if (!isNative) {
    // En web, los deep links son rutas del router normales. No necesita listener.
    return () => {};
  }

  const { App } = await import('@capacitor/app');

  const handle = App.addListener('appUrlOpen', ({ url }) => {
    const path = parseDeepLinkUrl(url);
    if (path && path !== '/') {
      navigate(path);
    }
  });

  return () => { handle.then(h => h.remove()); };
}

/**
 * Genera URLs de deep link para diferentes contextos.
 * Usar en notificaciones push, emails transaccionales, etc.
 */
export const DeepLinks = {
  /** Portal de cotización pública */
  quotePortal: (token: string) =>
    Capacitor.isNativePlatform()
      ? `shelwi://p/${token}`
      : `https://app.shelwi.com/p/${token}`,

  /** Portal del cliente */
  clientPortal: (token: string) =>
    Capacitor.isNativePlatform()
      ? `shelwi://portal/${token}`
      : `https://app.shelwi.com/portal/${token}`,

  /** Invitación de equipo */
  invite: (token: string) =>
    Capacitor.isNativePlatform()
      ? `shelwi://invite/${token}`
      : `https://app.shelwi.com/invite/${token}`,

  /** Recuperar contraseña */
  resetPassword: () =>
    `https://app.shelwi.com/recuperar-contrasena`,

  /** Dashboard principal (para push notifications) */
  dashboard: () =>
    Capacitor.isNativePlatform()
      ? `shelwi://app/dashboard`
      : `https://app.shelwi.com/app/dashboard`,

  /** Detalle de pedido */
  orderDetail: (orderId: string) =>
    Capacitor.isNativePlatform()
      ? `shelwi://app/pedidos/${orderId}`
      : `https://app.shelwi.com/app/pedidos/${orderId}`,

  /** Detalle de OT */
  workOrderDetail: (woId: string) =>
    Capacitor.isNativePlatform()
      ? `shelwi://app/ordenes-trabajo/${woId}`
      : `https://app.shelwi.com/app/ordenes-trabajo/${woId}`,
} as const;
