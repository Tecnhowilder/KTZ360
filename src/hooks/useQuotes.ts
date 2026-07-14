import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { listQuotes, updateQuoteStatus } from '../services/quotes';
import { listClients } from '../services/clients';
import { deriveQuote } from '../lib/calc';
import { queryKeys } from '../lib/queryKeys';
import { STALE } from '../lib/queryConfig';
import type { DerivedQuote, QuoteStatus } from '../lib/types';

export function useClients() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey:  queryKeys.clients.list(workspace.id),
    queryFn:   () => listClients(workspace.id),
    staleTime: STALE.BUSINESS,
  });
}

export function useQuotesRaw() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey:  queryKeys.quotes.list(workspace.id),
    queryFn:   () => listQuotes(workspace.id),
    staleTime: STALE.BUSINESS,
  });
}

export function useInvalidateQuotes() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.quotes.list(workspace.id) });
}

export function useInvalidateClients() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.clients.list(workspace.id) });
}

/**
 * Mutación optimista para cambiar el estado de una cotización.
 * El cambio se refleja en UI antes de que el servidor confirme.
 * Si el servidor falla, revierte al estado anterior automáticamente.
 */
export function useUpdateQuoteStatus() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const listKey = queryKeys.quotes.list(workspace.id);

  return useMutation({
    mutationFn: ({ quoteId, status }: { quoteId: string; status: QuoteStatus }) =>
      updateQuoteStatus(quoteId, status),

    onMutate: async ({ quoteId, status }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData(listKey);

      queryClient.setQueryData(listKey, (old: Record<string, unknown>[]) =>
        old?.map(q => q.id === quoteId ? { ...q, status } : q) ?? []
      );

      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(listKey, context.previous);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
    },
  });
}

/** Cotizaciones enriquecidas (catálogo + cliente resuelto), ordenadas por fecha desc. */
export function useDerivedQuotes(): { quotes: DerivedQuote[]; isLoading: boolean } {
  const quotesQuery = useQuotesRaw();
  const clientsQuery = useClients();

  const isLoading = quotesQuery.isLoading || clientsQuery.isLoading;
  if (isLoading || !quotesQuery.data || !clientsQuery.data) return { quotes: [], isLoading: true };

  const clientsById = new Map(clientsQuery.data.map((c) => [c.id, c]));
  const quotes = quotesQuery.data.map((q) => deriveQuote(q, q.client_id ? clientsById.get(q.client_id) : undefined));
  return { quotes, isLoading: false };
}
