/**
 * useSessionGuard — Sprint 24 Session Security
 * Valida sesión activa via heartbeat cada 30s usando check_session_valid().
 * Zero Trust: workspace_id del contexto, device_id del localStorage.
 * Si la sesión fue revocada (nuevo login en otro dispositivo) → signOut forzado.
 */
import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { signOut } from '../services/auth';
import { getStoredDeviceId } from '../services/auth';

const HEARTBEAT_INTERVAL_MS = 30_000;
const GRACE_PERIOD_MS       = 5_000;

export function useSessionGuard(workspaceId?: string) {
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const isForcingOut = useRef(false);

  const runHeartbeat = useCallback(async () => {
    if (isForcingOut.current || !workspaceId) return;

    const deviceId = getStoredDeviceId();
    if (!deviceId) return; // usuario que hizo login antes de Sprint 24 → no-op

    try {
      const { data } = await supabase.rpc('check_session_valid' as never, {
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
