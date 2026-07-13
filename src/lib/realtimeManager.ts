/**
 * realtimeManager — Singleton para suscripciones Realtime de Supabase.
 *
 * Garantías:
 *   • Un solo canal por (channelKey) — sin duplicados aunque múltiples
 *     componentes se suscriban con el mismo key.
 *   • Reference counting: el canal se destruye solo cuando el último
 *     suscriptor se da de baja.
 *   • Reconexión exponencial con backoff hasta MAX_RETRY intentos.
 *   • Fan-out de callbacks — cada suscriptor recibe su propio callback.
 *
 * Uso:
 *   const unsub = realtimeManager.subscribe(
 *     `notifications:${workspaceId}`,
 *     { table: 'notifications', event: 'INSERT', filter: `workspace_id=eq.${workspaceId}` },
 *     (payload) => { ... }
 *   );
 *   // cleanup
 *   unsub();
 *
 * Zero Trust: los filtros en postgres_changes son verificados por el servidor
 * (RLS se aplica antes de emitir el evento). El frontend no recibe filas que
 * RLS no permitiría ver con SELECT.
 */

import { useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type ChangeEvent = '*' | 'INSERT' | 'UPDATE' | 'DELETE';

export interface SubscribeConfig {
  schema?: string;
  table:   string;
  event?:  ChangeEvent;
  filter?: string;
}

export type ChangeCallback = (
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>
) => void;

// ─── Internos ────────────────────────────────────────────────────────────────

const MAX_RETRY     = 6;
const RETRY_BASE_MS = 1_000;

interface ChannelRecord {
  channel:    RealtimeChannel;
  config:     SubscribeConfig;
  callbacks:  Set<ChangeCallback>;
  refCount:   number;
  retryCount: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
}

const registry = new Map<string, ChannelRecord>();

function backoffMs(n: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** n, 60_000);
}

function buildChannel(key: string, record: ChannelRecord): void {
  const { schema = 'public', table, event = '*', filter } = record.config;

  const ch = supabase.channel(key);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase .on() overloads no aceptan filtro dinámico sin cast
  (ch as any).on(
    'postgres_changes',
    { event, schema, table, ...(filter ? { filter } : {}) },
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      for (const cb of record.callbacks) {
        try { cb(payload); } catch { /* noop */ }
      }
    }
  ).subscribe((status: string, err?: Error) => {
    if (status === 'SUBSCRIBED') {
      record.retryCount = 0;
      if (record.retryTimer) { clearTimeout(record.retryTimer); record.retryTimer = null; }
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      if (record.retryCount < MAX_RETRY && record.callbacks.size > 0) {
        record.retryTimer = setTimeout(() => {
          record.retryTimer = null;
          supabase.removeChannel(record.channel);
          buildChannel(key, record);
        }, backoffMs(record.retryCount++));
      } else {
        // MAX_RETRY agotado o sin suscriptores — limpiar para evitar canal zombie
        supabase.removeChannel(record.channel);
        registry.delete(key);
      }
    }
    if (err) {
      console.warn('[RealtimeManager]', key, status, err);
    }
  });

  record.channel = ch;
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Suscribe un callback a cambios Realtime.
 * @returns función de limpieza (llama para darse de baja)
 */
export function subscribe(
  channelKey: string,
  config: SubscribeConfig,
  callback: ChangeCallback,
): () => void {
  let record = registry.get(channelKey);

  if (!record) {
    record = {
      channel:    null!,
      config,
      callbacks:  new Set(),
      refCount:   0,
      retryCount: 0,
      retryTimer: null,
    };
    registry.set(channelKey, record);
    buildChannel(channelKey, record);
  }

  record.callbacks.add(callback);
  record.refCount++;

  return () => {
    const r = registry.get(channelKey);
    if (!r) return;
    r.callbacks.delete(callback);
    r.refCount = Math.max(0, r.refCount - 1);
    if (r.refCount === 0) {
      if (r.retryTimer) clearTimeout(r.retryTimer);
      supabase.removeChannel(r.channel);
      registry.delete(channelKey);
    }
  };
}

// ─── Hook React ──────────────────────────────────────────────────────────────

/**
 * Hook conveniente para suscribirse a Realtime en componentes React.
 * Se limpia automáticamente en el unmount.
 *
 * @param channelKey  Clave única para el canal (e.g. `notifications:${workspaceId}`)
 * @param config      Configuración de la suscripción
 * @param callback    Función llamada en cada evento (debe ser estable — usar useCallback)
 * @param enabled     Si false no se suscribe (útil para gates de features)
 */
export function useRealtimeSubscription(
  channelKey: string | null,
  config: SubscribeConfig,
  callback: ChangeCallback,
  enabled = true,
): void {
  // Mantener referencia estable del callback sin recrear el canal
  const callbackRef = useRef<ChangeCallback>(callback);
  useEffect(() => { callbackRef.current = callback; });

  const stableCallback: ChangeCallback = useRef((payload: Parameters<ChangeCallback>[0]) => {
    callbackRef.current(payload);
  }).current;

  useEffect(() => {
    if (!enabled || !channelKey) return;
    return subscribe(channelKey, config, stableCallback);
    // config is expected to be stable (literal object or useMemo) — eslint-disable-next-line
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey, enabled]);
}
