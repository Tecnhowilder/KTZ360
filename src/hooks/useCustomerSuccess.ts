import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import {
  getCustomerSuccessDashboard, getClientsAtRisk,
  getVipClients, getRepurchaseOpportunities, recalculateHealthScores,
} from '../services/customerSuccess';
import { useToast } from '../components/ui/Toast';

const STALE = 60_000;

export function useCustomerSuccessDashboard() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['customerSuccessDashboard', workspace.id],
    queryFn:  () => getCustomerSuccessDashboard(workspace.id),
    staleTime: STALE,
    retry: false,
  });
}

export function useClientsAtRisk() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['clientsAtRisk', workspace.id],
    queryFn:  () => getClientsAtRisk(workspace.id),
    staleTime: STALE,
    retry: false,
  });
}

export function useVipClients() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['vipClients', workspace.id],
    queryFn:  () => getVipClients(workspace.id),
    staleTime: STALE,
    retry: false,
  });
}

export function useRepurchaseOpportunities() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['repurchaseOpportunities', workspace.id],
    queryFn:  () => getRepurchaseOpportunities(workspace.id),
    staleTime: STALE,
    retry: false,
  });
}

export function useRecalculateHealthScores() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  return useMutation({
    mutationFn: () => recalculateHealthScores(workspace.id),
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['customerSuccessDashboard', workspace.id] });
      queryClient.invalidateQueries({ queryKey: ['clientsAtRisk', workspace.id] });
      queryClient.invalidateQueries({ queryKey: ['vipClients', workspace.id] });
      queryClient.invalidateQueries({ queryKey: ['repurchaseOpportunities', workspace.id] });
      showToast(`Health scores actualizados (${count} clientes)`);
    },
    onError: (e: Error) => showToast(e.message ?? 'Error al recalcular'),
  });
}
