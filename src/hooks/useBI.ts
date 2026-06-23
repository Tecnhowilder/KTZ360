/**
 * useBI.ts — React Query hooks para el KPI Engine Sprint 19
 * 1 hook = 1 llamada al backend. El frontend no llama múltiples RPCs.
 */
import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import {
  getBIExecutiveKPIs, getBISalesKPIs, getBIOperationsKPIs,
  getBIMarketingKPIs, getBICustomerKPIs, getFullFunnel, getClientCohorts,
} from '../services/bi';

const STALE = 120_000; // 2 minutos — BI data no cambia en segundos

export function useBIExecutiveKPIs(periodStart?: string, periodEnd?: string) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['biExecutive', workspace.id, periodStart, periodEnd],
    queryFn:  () => getBIExecutiveKPIs(workspace.id, periodStart, periodEnd),
    staleTime: STALE, retry: false,
  });
}

export function useBISalesKPIs(periodStart?: string, periodEnd?: string) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['biSales', workspace.id, periodStart, periodEnd],
    queryFn:  () => getBISalesKPIs(workspace.id, periodStart, periodEnd),
    staleTime: STALE, retry: false,
  });
}

export function useBIOperationsKPIs(periodStart?: string, periodEnd?: string) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['biOperations', workspace.id, periodStart, periodEnd],
    queryFn:  () => getBIOperationsKPIs(workspace.id, periodStart, periodEnd),
    staleTime: STALE, retry: false,
  });
}

export function useBIMarketingKPIs(periodStart?: string, periodEnd?: string) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['biMarketing', workspace.id, periodStart, periodEnd],
    queryFn:  () => getBIMarketingKPIs(workspace.id, periodStart, periodEnd),
    staleTime: STALE, retry: false,
  });
}

export function useBICustomerKPIs(periodStart?: string, periodEnd?: string) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['biCustomer', workspace.id, periodStart, periodEnd],
    queryFn:  () => getBICustomerKPIs(workspace.id, periodStart, periodEnd),
    staleTime: STALE, retry: false,
  });
}

export function useFullFunnel(periodStart?: string, periodEnd?: string) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['biFullFunnel', workspace.id, periodStart, periodEnd],
    queryFn:  () => getFullFunnel(workspace.id, periodStart, periodEnd),
    staleTime: STALE, retry: false,
  });
}

export function useClientCohorts(months = 6) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['biCohorts', workspace.id, months],
    queryFn:  () => getClientCohorts(workspace.id, months),
    staleTime: STALE * 5, retry: false,
  });
}
