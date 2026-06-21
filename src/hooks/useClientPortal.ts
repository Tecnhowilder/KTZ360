import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import {
  getClientPortal, getPortalQuotes, getPortalOrders, getPortalWorkOrders,
  getPortalEvidences, getPortalTimeline, getPortalAnalytics,
  createClientPortalToken, revokeClientPortalToken,
} from '../services/clientPortal';
import { useToast } from '../components/ui/Toast';

const STALE = 30_000;

// ─── Portal público (sin auth, usa token) ─────────────────────────────────────

export function useClientPortal(token: string) {
  return useQuery({
    queryKey: ['clientPortal', token],
    queryFn:  () => getClientPortal(token),
    enabled:  !!token,
    staleTime: STALE,
    retry: false,
  });
}

export function usePortalQuotes(token: string) {
  return useQuery({
    queryKey: ['portalQuotes', token],
    queryFn:  () => getPortalQuotes(token),
    enabled:  !!token,
    staleTime: STALE,
  });
}

export function usePortalOrders(token: string) {
  return useQuery({
    queryKey: ['portalOrders', token],
    queryFn:  () => getPortalOrders(token),
    enabled:  !!token,
    staleTime: STALE,
  });
}

export function usePortalWorkOrders(token: string, orderId: string) {
  return useQuery({
    queryKey: ['portalWorkOrders', token, orderId],
    queryFn:  () => getPortalWorkOrders(token, orderId),
    enabled:  !!token && !!orderId,
    staleTime: STALE,
  });
}

export function usePortalEvidences(token: string, orderId?: string | null) {
  return useQuery({
    queryKey: ['portalEvidences', token, orderId],
    queryFn:  () => getPortalEvidences(token, orderId),
    enabled:  !!token,
    staleTime: STALE,
  });
}

export function usePortalTimeline(token: string) {
  return useQuery({
    queryKey: ['portalTimeline', token],
    queryFn:  () => getPortalTimeline(token),
    enabled:  !!token,
    staleTime: STALE,
  });
}

// ─── Gestión de tokens (requiere auth) ────────────────────────────────────────

export function usePortalAnalytics() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['portalAnalytics', workspace.id],
    queryFn:  () => getPortalAnalytics(workspace.id),
    staleTime: 60_000,
    retry: false,
  });
}

export function useCreatePortalToken() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: (clientId: string) => createClientPortalToken(workspace.id, clientId, 90),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['portalAnalytics', workspace.id] });
      showToast('Acceso al portal creado');
      return data;
    },
    onError: (e: Error) => showToast(e.message ?? 'Error al crear token'),
  });
}

export function useRevokePortalToken() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: (clientId: string) => revokeClientPortalToken(workspace.id, clientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portalAnalytics', workspace.id] });
      showToast('Acceso revocado');
    },
    onError: (e: Error) => showToast(e.message ?? 'Error al revocar'),
  });
}
