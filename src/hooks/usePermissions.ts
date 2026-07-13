import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import {
  checkFeatureAccess,
  checkPlanLimit,
  checkSubscriptionStatus,
  getPdfTier,
  type PlanFeature,
  type PlanLimitKey,
} from '../lib/permissions';
import {
  getTeamSeats, getTeamState, listTeamMembers,
  listPendingInvitations, listInvitationHistory,
  getInvitationHistory,
} from '../services/team';
import type { TeamState } from '../services/team';

// staleTime mínimo en todos los hooks de permisos/features.
// Sin staleTime los hooks refetchean en cada render → waterfall de queries.
const PERM_STALE = 5 * 60_000; // 5 minutos — permisos cambian raramente

export function usePlanLimit(limit: PlanLimitKey) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey:  ['planLimit', workspace.id, limit],
    queryFn:   () => checkPlanLimit(workspace.id, limit),
    staleTime: PERM_STALE,
  });
}

export function useFeatureAccess(feature: PlanFeature) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey:  ['featureAccess', workspace.id, feature],
    queryFn:   () => checkFeatureAccess(workspace.id, feature),
    staleTime: PERM_STALE,
  });
}

export function useSubscriptionStatus() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey:  ['subscriptionStatus', workspace.id],
    queryFn:   () => checkSubscriptionStatus(workspace.id),
    staleTime: PERM_STALE,
  });
}

export function usePdfTier() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey:  ['pdfTier', workspace.id],
    queryFn:   () => getPdfTier(workspace.id),
    staleTime: PERM_STALE,
  });
}

// ─── HOOK PRINCIPAL — ÚNICA FUENTE DE VERDAD ─────────────────────────────────
// useTeamState llama a get_team_state() UNA SOLA VEZ y devuelve todo.
// Todos los contadores (seats, members, pending) provienen de la MISMA respuesta.
// Un solo queryKey = invalidar uno invalida todo = siempre consistente.

export function useTeamState() {
  const { workspace } = useWorkspace();
  return useQuery<TeamState>({
    queryKey: ['teamState', workspace.id],
    queryFn:  getTeamState,
    staleTime: 30_000,
    retry: 2,
  });
}

// ─── Hooks legacy (mantenidos para compatibilidad con otras partes del app) ───

export function useTeamSeats() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['teamSeats', workspace.id],
    queryFn:  () => getTeamSeats(workspace.id),
    staleTime: 30_000,
  });
}

export function useTeamMembers() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['teamMembers', workspace.id],
    queryFn:  () => listTeamMembers(workspace.id),
    staleTime: 30_000,
  });
}

export function usePendingInvitations() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['pendingInvitations', workspace.id],
    queryFn:  () => listPendingInvitations(workspace.id),
    staleTime: 30_000,
  });
}

export function useInvitationHistory() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['invitationHistory', workspace.id],
    queryFn:  () => listInvitationHistory(workspace.id),
    staleTime: 60_000,
  });
}

/** Historial completo: todas las invitaciones (pending, accepted, revoked, expired) */
export function useFullInvitationHistory() {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: ['invitationFullHistory', workspace.id],
    queryFn:  () => getInvitationHistory(workspace.id),
    staleTime: 60_000,
  });
}
