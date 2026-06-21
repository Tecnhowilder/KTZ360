import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import {
  grantGpsConsent, recordCheckIn, recordCheckOut,
  updateOperationalStatus, updateLocationManual,
  getTeamMap, getMemberDetail, getOperationalDashboard,
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
    staleTime: 20_000,
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
