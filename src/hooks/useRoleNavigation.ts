/**
 * useRoleNavigation — Hook que combina rol + feature flags → configuración de navegación
 *
 * CAPAS aplicadas:
 *   1. Rol del usuario (del JWT / profiles)
 *   2. Feature flags del plan (del backend via check_feature_access)
 *   3. Permisos personalizados (workspace_user_permissions — Capa 4)
 *
 * El resultado es la configuración de navegación ya filtrada y lista para renderizar.
 * NUNCA tomar decisiones de seguridad aquí — solo presentación.
 */
import { useMemo } from 'react';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useFeatureFlags } from './useFeatureFlags';
import {
  getNavForRole, filterNavByFeatures,
  type RoleNavConfig, type NavItem, type NavGroup,
} from '../lib/roleNavigation';

export interface ResolvedNavConfig extends RoleNavConfig {
  bottomTabs: NavItem[];
  moreGroups: NavGroup[];
  role: string;
}

export function useRoleNavigation(): ResolvedNavConfig {
  const { profile } = useWorkspace();
  const { flags }   = useFeatureFlags();
  const role        = profile.role as string;

  return useMemo(() => {
    const base = getNavForRole(role);

    const flagsRecord = flags as unknown as Partial<Record<string, boolean>>;

    // Filtrar bottomTabs por feature flags
    const bottomTabs = filterNavByFeatures(base.bottomTabs, flagsRecord);

    // Filtrar grupos del sheet "Más" por feature flags
    const moreGroups = base.moreGroups
      .map(group => ({
        ...group,
        items: filterNavByFeatures(group.items, flagsRecord),
      }))
      .filter(group => group.items.length > 0);

    return {
      ...base,
      bottomTabs,
      moreGroups,
      role,
    };
  }, [role, flags]);
}
