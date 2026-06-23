/**
 * useAICredits — hook React Query para créditos IA.
 *
 * Sprint 16.3 Performance: Eliminado polling agresivo (antes: 60s interval).
 * Ahora: staleTime 5 min, sin polling automático.
 * La invalidación ocurre por eventos reales (post-llamada IA, navegación a /ia).
 *
 * Reducción estimada: -95% de queries DB a este endpoint.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { getAICreditsSnapshot, getAIUsageHistory } from '../services/aiCredits';

const AI_CREDITS_KEY = (workspaceId: string) => ['aiCredits', workspaceId] as const;
const AI_HISTORY_KEY = (workspaceId: string, days: number) => ['aiHistory', workspaceId, days] as const;

/** Resumen de créditos del mes actual — sin polling */
export function useAICredits() {
  const { workspace } = useWorkspace();

  return useQuery({
    queryKey:  AI_CREDITS_KEY(workspace.id),
    queryFn:   () => getAICreditsSnapshot(workspace.id),
    staleTime: 5 * 60_000,   // 5 minutos (antes: 1 min con polling)
    gcTime:    10 * 60_000,   // 10 minutos en caché
    enabled:   !!workspace.id,
    // Sin refetchInterval — solo actualiza por eventos o navegación
  });
}

/** Historial de consumo IA de los últimos N días */
export function useAIUsageHistory(days = 30) {
  const { workspace } = useWorkspace();

  return useQuery({
    queryKey:  AI_HISTORY_KEY(workspace.id, days),
    queryFn:   () => getAIUsageHistory(workspace.id, days),
    staleTime: 10 * 60_000,  // 10 minutos
    gcTime:    15 * 60_000,
    enabled:   !!workspace.id,
  });
}

/**
 * Hook para invalidar créditos IA tras una llamada real.
 * Llamar después de cada generate() exitoso.
 */
export function useInvalidateAICredits() {
  const qc = useQueryClient();
  const { workspace } = useWorkspace();

  return useCallback(() => {
    qc.invalidateQueries({ queryKey: AI_CREDITS_KEY(workspace.id) });
    qc.invalidateQueries({ queryKey: AI_HISTORY_KEY(workspace.id, 30) });
  }, [qc, workspace.id]);
}
