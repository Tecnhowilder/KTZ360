import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import {
  getPipeline, updateCommercialStatus, createSeguimiento, listSeguimientos,
  createRecordatorio, listRecordatorios, completeRecordatorio,
  getClientTimeline, getQuoteCommercialDetail, getCrmDashboard,
} from '../services/crm';
import type { CommercialStatus, SeguimientoType } from '../lib/database.types';

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export function usePipeline() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['pipeline', workspace.id],
    queryFn: () => getPipeline(workspace.id),
    staleTime: 30_000,
  });
}

export function useUpdateCommercialStatus() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  return useMutation({
    mutationFn: ({
      quoteId, newStatus, observacion,
    }: { quoteId: string; newStatus: CommercialStatus; observacion?: string }) =>
      updateCommercialStatus(quoteId, newStatus, observacion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline', workspace.id] });
      queryClient.invalidateQueries({ queryKey: ['quotes', workspace.id] });
      queryClient.invalidateQueries({ queryKey: ['crmDashboard', workspace.id] });
    },
  });
}

// ─── Seguimientos ─────────────────────────────────────────────────────────────

export function useSeguimientos(quoteId?: string, clientId?: string) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['seguimientos', workspace.id, quoteId, clientId],
    queryFn: () => listSeguimientos(workspace.id, quoteId, clientId),
    staleTime: 20_000,
  });
}

export function useCreateSeguimiento() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  return useMutation({
    mutationFn: (opts: {
      quoteId?: string | null;
      clientId?: string | null;
      type: SeguimientoType;
      resultado?: string | null;
      comentario?: string | null;
    }) => createSeguimiento(workspace.id, opts),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['seguimientos', workspace.id] });
      if (vars.quoteId) {
        queryClient.invalidateQueries({ queryKey: ['quoteCommercialDetail', vars.quoteId] });
        queryClient.invalidateQueries({ queryKey: ['pipeline', workspace.id] });
      }
      if (vars.clientId) {
        queryClient.invalidateQueries({ queryKey: ['clientTimeline', workspace.id, vars.clientId] });
      }
    },
  });
}

// ─── Recordatorios ────────────────────────────────────────────────────────────

export function useRecordatorios() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['recordatorios', workspace.id],
    queryFn: () => listRecordatorios(workspace.id),
    staleTime: 30_000,
  });
}

export function useCreateRecordatorio() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  return useMutation({
    mutationFn: (opts: {
      scheduledAt: Date;
      type?: SeguimientoType;
      note?: string | null;
      quoteId?: string | null;
      clientId?: string | null;
    }) => createRecordatorio(workspace.id, opts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recordatorios', workspace.id] });
    },
  });
}

export function useCompleteRecordatorio() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  return useMutation({
    mutationFn: (recordatorioId: string) => completeRecordatorio(recordatorioId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recordatorios', workspace.id] });
    },
  });
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export function useClientTimeline(clientId: string) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['clientTimeline', workspace.id, clientId],
    queryFn: () => getClientTimeline(workspace.id, clientId),
    enabled: !!clientId,
    staleTime: 20_000,
  });
}

// ─── Historial de cotización ──────────────────────────────────────────────────

export function useQuoteCommercialDetail(quoteId: string) {
  return useQuery({
    queryKey: ['quoteCommercialDetail', quoteId],
    queryFn: () => getQuoteCommercialDetail(quoteId),
    enabled: !!quoteId,
    staleTime: 20_000,
  });
}

// ─── Dashboard CRM ────────────────────────────────────────────────────────────

export function useCrmDashboard() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['crmDashboard', workspace.id],
    queryFn: () => getCrmDashboard(workspace.id),
    staleTime: 60_000,
  });
}
