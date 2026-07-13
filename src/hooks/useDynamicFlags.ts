/**
 * useDynamicFlags — Hook para Feature Flags dinámicos (Capa 2).
 *
 * Complementa useFeatureFlags() (Capa 1, basada en plan).
 * Los dynamic flags son independientes del plan y se activan/desactivan
 * desde el Backoffice sin deploy de código.
 *
 * Uso:
 *   const { flags, isEnabled } = useDynamicFlags();
 *   if (isEnabled('new_dashboard_v2')) { ... }
 *
 * Zero Trust: evaluación ocurre en backend (SECURITY DEFINER RPC).
 */
import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { getDynamicFlags, type DynamicFlags } from '../services/featureFlags';

const EMPTY: DynamicFlags = {};

export function useDynamicFlags() {
  const { workspace } = useWorkspace();

  const query = useQuery({
    queryKey:  ['dynamicFlags', workspace.id],
    queryFn:   () => getDynamicFlags(),
    staleTime: 5 * 60_000,
    gcTime:    10 * 60_000,
  });

  const flags = query.data ?? EMPTY;

  return {
    flags,
    isLoading: query.isLoading,
    /** Verifica si un dynamic flag está activo para el contexto actual. */
    isEnabled: (key: string): boolean => Boolean(flags[key]),
  };
}
