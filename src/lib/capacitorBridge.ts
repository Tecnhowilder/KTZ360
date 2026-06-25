/**
 * capacitorBridge.ts — Abstracción unificada Web + Capacitor
 *
 * Centraliza TODOS los usos de APIs nativas.
 * En web: usa window.open, navigator.geolocation, etc.
 * En app nativa: usa plugins de Capacitor.
 *
 * Nunca importar plugins de Capacitor directamente en componentes.
 * Siempre usar las funciones de este módulo.
 *
 * Sprint 22: Mobile Readiness
 */
import { Capacitor } from '@capacitor/core';

// ─── Detección de plataforma ─────────────────────────────────────────────────

export const isNative    = Capacitor.isNativePlatform();
export const isIOS       = Capacitor.getPlatform() === 'ios';
export const isAndroid   = Capacitor.getPlatform() === 'android';
export const isWeb       = !isNative;

/** URL base de la app según plataforma */
export function getAppBaseUrl(): string {
  if (isNative) return 'https://app.shelwi.com';
  return window.location.origin;
}

// ─── Browser — abrir URLs externas ───────────────────────────────────────────

/**
 * Abre una URL externa.
 * En native: usa Capacitor Browser (in-app browser con back button).
 * En web: usa window.open.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (isNative) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url, windowName: '_blank' });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Navega a una URL en la misma ventana (como window.location.href).
 * En native: usa Capacitor Browser para páginas de pago externas.
 * En web: usa window.location.href.
 */
export async function navigateToUrl(url: string): Promise<void> {
  if (isNative) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url, windowName: '_self' });
  } else {
    window.location.href = url;
  }
}

// ─── Comunicación — tel: y mailto: ───────────────────────────────────────────

/**
 * Abre el marcador de teléfono.
 * En native: usa App.openUrl con scheme tel://
 * En web: window.open('tel:...')
 */
/**
 * Abre el marcador de teléfono.
 * En native: Browser.open con scheme tel:// (WebView lo delega al OS).
 * En web: window.open('tel:...')
 */
export async function openPhone(phone: string): Promise<void> {
  const clean = phone.replace(/[\s\-()]/g, '');
  const url   = `tel:${clean}`;
  if (isNative) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } else {
    window.open(url, '_self');
  }
}

/**
 * Abre WhatsApp con número + código de país explícito.
 * HOTFIX: siempre requiere countryCode para evitar interpretación incorrecta.
 * Ejemplo: openWhatsApp('+57', '3154823475') → wa.me/573154823475
 */
export async function openWhatsApp(
  phoneOrCountryCode: string,
  phoneOrMessage?: string,
  message?: string
): Promise<void> {
  let cc: string;
  let phone: string;
  let msg: string | undefined;

  // Soporte legacy: openWhatsApp(phone, message) sin country code
  // Y nuevo: openWhatsApp(countryCode, phone, message)
  if (phoneOrCountryCode.startsWith('+') && phoneOrMessage && !message) {
    // Caso: openWhatsApp(countryCode, phone)
    cc    = phoneOrCountryCode.replace(/[^0-9]/g, '');
    phone = phoneOrMessage.replace(/[^0-9]/g, '');
    msg   = undefined;
  } else if (phoneOrCountryCode.startsWith('+') && phoneOrMessage && message) {
    // Caso: openWhatsApp(countryCode, phone, message)
    cc    = phoneOrCountryCode.replace(/[^0-9]/g, '');
    phone = phoneOrMessage.replace(/[^0-9]/g, '');
    msg   = message;
  } else {
    // Legacy: openWhatsApp(phone, message) — asume +57 Colombia
    cc    = '57';
    phone = phoneOrCountryCode.replace(/[^0-9]/g, '');
    msg   = phoneOrMessage;
  }

  const msgParam = msg ? `?text=${encodeURIComponent(msg)}` : '';
  const url = (cc && phone.length >= 7)
    ? `https://wa.me/${cc}${phone}${msgParam}`
    : `https://wa.me/${msgParam}`;
  await openExternalUrl(url);
}

/**
 * Abre el cliente de email.
 * En native: Browser.open con scheme mailto: → OS delega al app de correo.
 * En web: window.open con mailto: o navigator.share.
 */
export async function openEmail(email: string, subject?: string, body?: string): Promise<void> {
  let url = `mailto:${email}`;
  const params: string[] = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body)    params.push(`body=${encodeURIComponent(body)}`);
  if (params.length) url += `?${params.join('&')}`;

  if (isNative) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } else {
    window.open(url, '_self');
  }
}

// ─── GPS / Geolocation ────────────────────────────────────────────────────────

export interface GpsPosition {
  latitude:  number;
  longitude: number;
  accuracy:  number;
  timestamp: number;
}

/**
 * Obtiene la posición GPS actual (one-shot).
 * En native: usa @capacitor/geolocation (mejor precisión).
 * En web: usa navigator.geolocation.
 */
export async function getCurrentGpsPosition(): Promise<GpsPosition> {
  if (isNative) {
    const { Geolocation } = await import('@capacitor/geolocation');

    // Solicitar permisos si no están concedidos
    const perms = await Geolocation.checkPermissions();
    if (perms.location === 'denied') {
      throw new Error('GPS desactivado. Actívalo en Configuración > Shelwi > Ubicación.');
    }
    if (perms.location !== 'granted') {
      const req = await Geolocation.requestPermissions();
      if (req.location !== 'granted') {
        throw new Error('Permiso de ubicación denegado.');
      }
    }

    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout:            15_000,
      maximumAge:         30_000,
    });

    return {
      latitude:  pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy:  pos.coords.accuracy,
      timestamp: pos.timestamp,
    };
  } else {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        pos => resolve({
          latitude:  pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy:  pos.coords.accuracy,
          timestamp: pos.timestamp,
        }),
        err => {
          const msgs: Record<number, string> = {
            1: 'GPS desactivado. Actívalo en Configuración.',
            2: 'No se pudo obtener la ubicación.',
            3: 'Tiempo de espera agotado al obtener ubicación.',
          };
          reject(new Error(msgs[err.code] ?? 'Error de GPS'));
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 }
      );
    });
  }
}

// ─── Preferencias (reemplaza localStorage para datos críticos) ────────────────

/**
 * Guarda un valor en almacenamiento persistente.
 * En native: Capacitor Preferences (iOS Keychain / Android SharedPreferences).
 * En web: localStorage.
 */
export async function setPreference(key: string, value: string): Promise<void> {
  if (isNative) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key, value });
  } else {
    try { localStorage.setItem(key, value); } catch { /* noop */ }
  }
}

export async function getPreference(key: string): Promise<string | null> {
  if (isNative) {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key });
    return value;
  } else {
    try { return localStorage.getItem(key); } catch { return null; }
  }
}

export async function removePreference(key: string): Promise<void> {
  if (isNative) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key });
  } else {
    try { localStorage.removeItem(key); } catch { /* noop */ }
  }
}

// ─── Network — detección de conexión ─────────────────────────────────────────

export async function getNetworkStatus(): Promise<{ connected: boolean; type: string }> {
  if (isNative) {
    const { Network } = await import('@capacitor/network');
    const status = await Network.getStatus();
    return { connected: status.connected, type: status.connectionType };
  } else {
    return { connected: navigator.onLine, type: 'unknown' };
  }
}

// ─── Filesystem — para evidencias offline ────────────────────────────────────

export interface SavedFile {
  path: string;
  uri:  string;
}

/**
 * Guarda un blob/base64 en almacenamiento local para uso offline.
 * Solo disponible en Capacitor native.
 */
export async function saveFileOffline(
  filename: string,
  dataBase64: string,
): Promise<SavedFile> {
  if (!isNative) {
    throw new Error('saveFileOffline solo disponible en app nativa');
  }
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const result = await Filesystem.writeFile({
    path:      `shelwi_offline/${filename}`,
    data:      dataBase64,
    directory: Directory.Data,
    recursive: true,
  });
  return { path: `shelwi_offline/${filename}`, uri: result.uri };
}

export async function readFileOffline(path: string): Promise<string> {
  if (!isNative) throw new Error('readFileOffline solo en app nativa');
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const result = await Filesystem.readFile({
    path,
    directory: Directory.Data,
  });
  return result.data as string;
}

export async function deleteFileOffline(path: string): Promise<void> {
  if (!isNative) return;
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  await Filesystem.deleteFile({ path, directory: Directory.Data });
}
