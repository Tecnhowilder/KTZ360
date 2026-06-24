import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useToast } from '../components/ui/Toast';
import {
  getWebhookEndpoints, registerWebhookEndpoint, updateWebhookEndpoint,
  deleteWebhookEndpoint, rotateWebhookSecret, testWebhookEndpoint,
  getWebhookDeliveries, redeliverWebhook,
} from '../services/webhooks';

const KEY = (wid: string) => ['webhookEndpoints', wid];

export function useWebhookEndpoints() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: Key(workspace.id),
    queryFn:  () => getWebhookEndpoints(workspace.id),
    staleTime: 30_000,
  });
}

// Fix the case issue
function Key(wid: string) { return KEY(wid); }

export function useRegisterWebhook() {
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { label: string; url: string; providerType: string; events: string[] }) =>
      registerWebhookEndpoint(workspace.id, v.label, v.url, v.providerType, v.events),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(workspace.id) }),
    onError: (e: Error) => showToast(e.message ?? 'Error'),
  });
}

export function useUpdateWebhook() {
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; updates: Parameters<typeof updateWebhookEndpoint>[2] }) =>
      updateWebhookEndpoint(workspace.id, v.id, v.updates),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY(workspace.id) }); showToast('Guardado'); },
    onError: (e: Error) => showToast(e.message ?? 'Error'),
  });
}

export function useDeleteWebhook() {
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWebhookEndpoint(workspace.id, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY(workspace.id) }); showToast('Eliminado'); },
    onError: (e: Error) => showToast(e.message ?? 'Error'),
  });
}

export function useRotateSecret() {
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: (id: string) => rotateWebhookSecret(workspace.id, id),
    onError: (e: Error) => showToast(e.message ?? 'Error'),
  });
}

export function useTestWebhook() {
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: (id: string) => testWebhookEndpoint(workspace.id, id),
    onSuccess: () => showToast('Evento de prueba enviado'),
    onError: (e: Error) => showToast(e.message ?? 'Error'),
  });
}

export function useWebhookDeliveries(endpointId?: string) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['webhookDeliveries', workspace.id, endpointId],
    queryFn:  () => getWebhookDeliveries(workspace.id, endpointId),
    staleTime: 15_000,
  });
}

export function useRedeliverWebhook() {
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) => redeliverWebhook(workspace.id, deliveryId),
    onSuccess: () => { showToast('Reintento encolado'); qc.invalidateQueries({ queryKey: ['webhookDeliveries', workspace.id] }); },
    onError: (e: Error) => showToast(e.message ?? 'Error'),
  });
}
