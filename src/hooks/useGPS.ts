import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import {
  grantGpsConsent, recordCheckIn, recordCheckOut,
  updateOperationalStatus, updateLocationManual,
  getTeamMap, getMemberDetail, getOperationalDashboard,
  recordPausa, recordReanudacion, updateLocationIfActive,
} from '../services/gps';
import { useToast } from '../components/ui/Toast';
import type { OperationalStatus } from '../lib/database.types';

// ─── Consentimiento ───────────────────────────────────────────────────────────

export function useGrantGpsConsent() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: () => grantGpsConsent(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teamMembers', workspace.id] });
      showToast('GPS activado. Ahora puedes hacer check-in.');
    },
    onError: (e: Error) => showToast(e.message ?? 'Error al activar GPS'),
  });
}

// ─── Check In / Out ───────────────────────────────────────────────────────────

export function useCheckIn(opts: { orderId?: string | null; workOrderId?: string | null } = {}) {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: () => recordCheckIn(opts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teamMap', workspace.id] });
      queryClient.invalidateQueries({ queryKey: ['operationalDashboard', workspace.id] });
      showToast('¡Check In registrado! Tu ubicación fue guardada.');
    },
    onError: (e: Error) => showToast(e.message ?? 'Error en check-in'),
  });
}

export function useCheckOut(opts: { orderId?: string | null; workOrderId?: string | null } = {}) {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: () => recordCheckOut(opts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teamMap', workspace.id] });
      queryClient.invalidateQueries({ queryKey: ['operationalDashboard', workspace.id] });
      showToast('Check Out registrado. ¡Buen trabajo!');
    },
    onError: (e: Error) => showToast(e.message ?? 'Error en check-out'),
  });
}

// ─── Estado operativo ─────────────────────────────────────────────────────────

export function useUpdateOperationalStatus() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: (status: OperationalStatus) => updateOperationalStatus(status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teamMap', workspace.id] });
      queryClient.invalidateQueries({ queryKey: ['operationalDashboard', workspace.id] });
    },
    onError: (e: Error) => showToast(e.message ?? 'Error al actualizar estado'),
  });
}

export function useUpdateLocationManual() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: () => updateLocationManual(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teamMap', workspace.id] });
      showToast('Ubicación actualizada');
    },
    onError: (e: Error) => showToast(e.message ?? 'Error al actualizar ubicación'),
  });
}

// ─── Mapa y detalle ───────────────────────────────────────────────────────────

export function useTeamMap() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['teamMap', workspace.id],
    queryFn:  () => getTeamMap(workspace.id),
    staleTime: 30_000,
    retry: false,
  });
}

export function useMemberDetail(userId: string) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['memberDetail', workspace.id, userId],
    queryFn:  () => getMemberDetail(userId, workspace.id),
    enabled:  !!userId,
    staleTime: 60_000,
  });
}

// ─── Dashboard operativo ──────────────────────────────────────────────────────

export function useOperationalDashboard() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['operationalDashboard', workspace.id],
    queryFn:  () => getOperationalDashboard(workspace.id),
    staleTime: 30_000,
    retry: false,
  });
}

// ─── Pausa ────────────────────────────────────────────────────────────────────

export function usePausa(opts: {
  orderId?: string | null;
  workOrderId?: string | null;
} = {}) {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: (motivo?: string) => recordPausa({
      orderId:     opts.orderId,
      workOrderId: opts.workOrderId,
      motivo,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teamMap', workspace.id] });
      queryClient.invalidateQueries({ queryKey: ['operationalDashboard', workspace.id] });
      showToast('Pausa registrada');
    },
    onError: (e: Error) => showToast(e.message ?? 'Error al registrar pausa'),
  });
}

// ─── Reanudación ──────────────────────────────────────────────────────────────

export function useReanudacion(opts: {
  orderId?: string | null;
  workOrderId?: string | null;
} = {}) {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: () => recordReanudacion({
      orderId:     opts.orderId,
      workOrderId: opts.workOrderId,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teamMap', workspace.id] });
      queryClient.invalidateQueries({ queryKey: ['operationalDashboard', workspace.id] });
      showToast('Trabajo reanudado');
    },
    onError: (e: Error) => showToast(e.message ?? 'Error al reanudar'),
  });
}

// ─── Tracking automático mientras hay OT activa ───────────────────────────────
// Polling cada INTERVAL_MS. El RPC verifica en backend si hay OT activa y solo
// actualiza si es así. Protege la batería: sin watchPosition, sin gps_events.

const TRACKING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

export function useActiveTracking(enabled: boolean) {
  const { workspace } = useWorkspace();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled || !workspace?.id) return;

    const tick = () => { updateLocationIfActive().catch(() => {}); };

    // Primera actualización inmediata
    tick();

    intervalRef.current = setInterval(tick, TRACKING_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, workspace?.id]);
}
