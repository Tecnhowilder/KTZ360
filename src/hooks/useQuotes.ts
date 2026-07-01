import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { listQuotes } from '../services/quotes';
import { listClients } from '../services/clients';
import { deriveQuote } from '../lib/calc';
import type { DerivedQuote } from '../lib/types';

export function useClients() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey:  ['clients', workspace.id],
    queryFn:   () => listClients(workspace.id),
    staleTime: 30_000,
  });
}

export function useQuotesRaw() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey:  ['quotes', workspace.id],
    queryFn:   () => listQuotes(workspace.id),
    staleTime: 30_000,
  });
}

export function useInvalidateQuotes() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  return () => queryClient.invalidateQueries({ queryKey: ['quotes', workspace.id] });
}

export function useInvalidateClients() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  return () => queryClient.invalidateQueries({ queryKey: ['clients', workspace.id] });
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
