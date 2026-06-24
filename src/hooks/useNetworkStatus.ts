/**
 * useNetworkStatus — Detecta estado de red (online/offline/poor) (Sprint 22)
 *
 * En native Capacitor: usa @capacitor/network (más confiable que navigator.onLine).
 * En web: usa navigator.onLine + eventos online/offline + Connection API.
 *
 * También expone:
 * - pendingCount: cuántos ítems hay en la cola offline
 * - lastSyncAt: cuándo fue la última sincronización
 * - triggerSync: fuerza sincronización manual
 */
import { useState, useEffect, useCallback } from 'react';
import { isNative } from '../lib/capacitorBridge';
import { getPendingCount } from '../lib/offlineDB';
import { runSync } from '../services/offlineSync';

export type NetworkQuality = 'online' | 'poor' | 'offline';

export interface NetworkStatus {
  quality:      NetworkQuality;
  isOnline:     boolean;
  connectionType: string;
  pendingCount: number;
  lastSyncAt:   Date | null;
  isSyncing:    boolean;
  triggerSync:  () => Promise<void>;
}

function getWebConnectionType(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  return conn?.effectiveType ?? (navigator.onLine ? 'unknown' : 'none');
}

function detectPoorConnection(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conn = (navigator as any).connection;
  if (!conn) return false;
  const slowTypes = ['slow-2g', '2g'];
  return slowTypes.includes(conn.effectiveType) || (conn.downlink != null && conn.downlink < 0.5);
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline,       setIsOnline]       = useState(navigator.onLine);
  const [connectionType, setConnectionType] = useState(getWebConnectionType());
  const [pendingCount,   setPendingCount]   = useState(0);
  const [lastSyncAt,     setLastSyncAt]     = useState<Date | null>(null);
  const [isSyncing,      setIsSyncing]      = useState(false);

  // Refrescar pendingCount
  const refreshPending = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

  // Sincronizar
  const triggerSync = useCallback(async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);
    try {
      await runSync();
      setLastSyncAt(new Date());
      await refreshPending();
    } catch (e) {
      console.error('[sync] Error en sincronización:', e);
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing, refreshPending]);

  // Web: eventos online/offline
  useEffect(() => {
    const handleOnline  = () => { setIsOnline(true);  setConnectionType(getWebConnectionType()); };
    const handleOffline = () => { setIsOnline(false); setConnectionType('none'); };

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    // Connection change (Chrome/Android)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn = (navigator as any).connection;
    conn?.addEventListener('change', () => setConnectionType(getWebConnectionType()));

    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
      conn?.removeEventListener('change', () => {});
    };
  }, []);

  // Capacitor: Network plugin
  useEffect(() => {
    if (!isNative) return;

    let cleanup: (() => void) | null = null;

    (async () => {
      const { Network } = await import('@capacitor/network');

      // Estado inicial
      const status = await Network.getStatus();
      setIsOnline(status.connected);
      setConnectionType(status.connectionType);

      // Listener de cambios
      const handle = await Network.addListener('networkStatusChange', s => {
        setIsOnline(s.connected);
        setConnectionType(s.connectionType);
      });

      cleanup = () => handle.remove();
    })();

    return () => { cleanup?.(); };
  }, []);

  // Sincronizar automáticamente al recuperar conexión
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      triggerSync();
    }
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refrescar contador periódicamente
  useEffect(() => {
    refreshPending();
    const interval = setInterval(refreshPending, 30_000);
    return () => clearInterval(interval);
  }, [refreshPending]);

  const quality: NetworkQuality = !isOnline
    ? 'offline'
    : detectPoorConnection()
      ? 'poor'
      : 'online';

  return {
    quality,
    isOnline,
    connectionType,
    pendingCount,
    lastSyncAt,
    isSyncing,
    triggerSync,
  };
}
