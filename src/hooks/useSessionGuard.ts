/**
 * useSessionGuard — Sprint 24 Session Security (IT-5: session_heartbeat)
 * Valida sesión activa via heartbeat cada 30s usando session_heartbeat().
 * session_heartbeat() fusiona update_presence() + check_session_valid() en
 * una sola llamada RPC, reduciendo 4 ops/30s → 1 RPC/30s por usuario.
 * Zero Trust: workspace_id del contexto, device_id del localStorage.
 * Si la sesión fue revocada → signOut forzado.
 */
import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { signOut, getStoredDeviceId } from '../services/auth';

const HEARTBEAT_INTERVAL_MS = 30_000;
const GRACE_PERIOD_MS       = 5_000;

export function useSessionGuard(workspaceId?: string) {
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const isForcingOut = useRef(false);

  const runHeartbeat = useCallback(async () => {
    if (isForcingOut.current || !workspaceId) return;

    const deviceId = getStoredDeviceId();
    if (!deviceId) return; // usuario con login previo a Sprint 24 → no-op

    try {
      const { data } = await supabase.rpc('session_heartbeat' as never, {
        p_workspace_id: workspaceId,
        p_device_id:    deviceId,
      } as never);

      const result = data as { valid?: boolean; reason?: string } | null;
      if (result && result.valid === false && result.reason === 'session_revoked') {
        if (!isForcingOut.current) {
          isForcingOut.current = true;
          setTimeout(async () => {
            try { await signOut(); }
            catch { window.location.href = '/'; }
          }, GRACE_PERIOD_MS);
        }
      }
    } catch {
      // Error de red → no forzar logout, esperar próximo heartbeat
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    runHeartbeat();
    intervalRef.current = setInterval(runHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [runHeartbeat, workspaceId]);
}
