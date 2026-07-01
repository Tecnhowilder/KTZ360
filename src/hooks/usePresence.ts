/**
 * usePresence — Presencia en tiempo real via Supabase Realtime
 *
 * Cuando el usuario abre la app:
 *   → Se une al canal de presencia del workspace
 *   → Emite heartbeat automático cada 30s (update_presence RPC)
 *   → Retorna mapa de userId → { online, last_seen }
 *
 * Cuando otro usuario cambia su estado:
 *   → El canal notifica en tiempo real (< 500ms)
 *
 * Zero Trust: workspace_id del contexto JWT, nunca del frontend.
 * No hace polling. Supabase Realtime maneja la reconexión.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface PresenceEntry {
  online:    boolean;
  online_at: string | null;
}

export type PresenceMap = Record<string, PresenceEntry>;

interface UsePresenceOptions {
  workspaceId: string;
  userId:      string;
  enabled?:    boolean;
}

export function usePresence({ workspaceId, userId, enabled = true }: UsePresenceOptions): PresenceMap {
  const [presenceMap, setPresenceMap] = useState<PresenceMap>({});
  const channelRef  = useRef<RealtimeChannel | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const syncPresence = useCallback((state: Record<string, { user_id: string; online_at: string }[]>) => {
    const map: PresenceMap = {};
    for (const [, presences] of Object.entries(state)) {
      for (const p of presences) {
        if (p.user_id) {
          map[p.user_id] = { online: true, online_at: p.online_at };
        }
      }
    }
    setPresenceMap(map);
  }, []);

  useEffect(() => {
    if (!enabled || !workspaceId || !userId) return;

    const channelName = `presence:${workspaceId}`;

    const channel = supabase.channel(channelName, {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        syncPresence(channel.presenceState() as any);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        setPresenceMap(prev => {
          const next = { ...prev };
          for (const p of newPresences as any[]) {
            if (p.user_id) next[p.user_id] = { online: true, online_at: p.online_at };
          }
          return next;
        });
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        setPresenceMap(prev => {
          const next = { ...prev };
          for (const p of leftPresences as any[]) {
            if (p.user_id) next[p.user_id] = { online: false, online_at: p.online_at };
          }
          return next;
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id:   userId,
            online_at: new Date().toISOString(),
          });
        }
      });

    channelRef.current = channel;

    // Heartbeat: actualizar last_seen_at en DB cada 30s
    async function sendHeartbeat() {
      try {
        await (supabase as any).rpc('update_presence');
      } catch {
        // Silencioso — no romper la UI por un heartbeat fallido
      }
    }

    sendHeartbeat();
    heartbeatRef.current = setInterval(sendHeartbeat, 30_000);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      channel.unsubscribe();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [workspaceId, userId, enabled, syncPresence]);

  return presenceMap;
}

/**
 * Determina el estado de presencia de un usuario.
 * Prioriza presencia Realtime; fallback a last_seen_at o updated_at.
 */
export function resolvePresenceStatus(
  userId: string,
  presenceMap: PresenceMap,
  lastSeenAt?: string | null,
  updatedAt?: string | null,
): { label: string; color: string; dot: string } {
  const entry = presenceMap[userId];

  if (entry?.online) {
    return { label: 'En línea',    color: '#16A34A', dot: '#22C55E' };
  }

  // Fallback a last_seen_at o updated_at
  const reference = lastSeenAt ?? updatedAt;
  if (!reference) return { label: 'Desconectado', color: '#94A3B8', dot: '#64748B' };

  const minutesAgo = (Date.now() - new Date(reference).getTime()) / 60_000;

  if (minutesAgo < 5)   return { label: 'En línea',          color: '#16A34A', dot: '#22C55E' };
  if (minutesAgo < 60)  return { label: `Hace ${Math.round(minutesAgo)}min`, color: '#D97706', dot: '#F59E0B' };

  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24)   return { label: `Hace ${hoursAgo}h`,         color: '#D97706', dot: '#F59E0B' };

  const daysAgo = Math.floor(hoursAgo / 24);
  return { label: `Hace ${daysAgo} días`, color: '#94A3B8', dot: '#64748B' };
}
