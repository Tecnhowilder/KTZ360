/**
 * useAICredits — hook React Query para el dashboard de créditos IA.
 * Refresca cada 60 segundos para mostrar consumo actualizado.
 */
import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { getAICreditsSnapshot, getAIUsageHistory } from '../services/aiCredits';

/** Resumen de créditos del mes actual */
export function useAICredits() {
  const { workspace } = useWorkspace();

  return useQuery({
    queryKey:  ['aiCredits', workspace.id],
    queryFn:   () => getAICreditsSnapshot(workspace.id),
    staleTime: 60_000,    // 1 minuto
    refetchInterval: 60_000,
    enabled: !!workspace.id,
  });
}

/** Historial de consumo IA de los últimos N días */
export function useAIUsageHistory(days = 30) {
  const { workspace } = useWorkspace();

  return useQuery({
    queryKey:  ['aiHistory', workspace.id, days],
    queryFn:   () => getAIUsageHistory(workspace.id, days),
    staleTime: 5 * 60_000,  // 5 minutos
    enabled:   !!workspace.id,
  });
}
