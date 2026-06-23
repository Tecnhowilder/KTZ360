/**
 * useFinance.ts — React Query hooks para Sprint 18 Finanzas
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useToast } from '../components/ui/Toast';
import {
  getFinanceDashboard, getWorkspaceProfitability, getOrderProfit,
  getServiceProfit, getOrderCostEntries, addOrderCostEntry, getAdminFinanceSummary,
} from '../services/finance';

const STALE = 120_000;

export function useFinanceDashboard(periodStart?: string, periodEnd?: string) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['financeDashboard', workspace.id, periodStart, periodEnd],
    queryFn:  () => getFinanceDashboard(workspace.id, periodStart, periodEnd),
    staleTime: STALE, retry: false,
  });
}

export function useWorkspaceProfitability(periodStart?: string, periodEnd?: string) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['workspaceProfitability', workspace.id, periodStart, periodEnd],
    queryFn:  () => getWorkspaceProfitability(workspace.id, periodStart, periodEnd),
    staleTime: STALE, retry: false,
  });
}

export function useOrderProfit(orderId: string | null) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['orderProfit', workspace.id, orderId],
    queryFn:  () => getOrderProfit(workspace.id, orderId!),
    enabled:  !!orderId,
    staleTime: STALE,
  });
}

export function useServiceProfit(periodStart?: string, periodEnd?: string) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['serviceProfit', workspace.id, periodStart, periodEnd],
    queryFn:  () => getServiceProfit(workspace.id, periodStart, periodEnd),
    staleTime: STALE, retry: false,
  });
}

export function useOrderCostEntries(orderId: string | null) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['orderCostEntries', workspace.id, orderId],
    queryFn:  () => getOrderCostEntries(workspace.id, orderId!),
    enabled:  !!orderId,
    staleTime: 30_000,
  });
}

export function useAddCostEntry(orderId: string) {
  const { workspace } = useWorkspace();
  const { showToast } = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, description, amount }: { type: string; description: string; amount: number }) =>
      addOrderCostEntry(workspace.id, orderId, type, description, amount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orderCostEntries', workspace.id, orderId] });
      qc.invalidateQueries({ queryKey: ['financeDashboard', workspace.id] });
      qc.invalidateQueries({ queryKey: ['workspaceProfitability', workspace.id] });
      showToast('Costo registrado');
    },
    onError: (e: Error) => showToast(e.message ?? 'Error al registrar costo'),
  });
}

export function useAdminFinanceSummary() {
  return useQuery({
    queryKey: ['adminFinanceSummary'],
    queryFn:  getAdminFinanceSummary,
    staleTime: 180_000,
  });
}
