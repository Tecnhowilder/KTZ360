import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from './WorkspaceProvider';
import { isSuperAdmin } from '../../lib/permissions';
import { supabase } from '../../lib/supabaseClient';

/**
 * Restringe rutas a OWNER o SUPER_ADMIN. SUPPORT_ADMIN queda fuera a propósito:
 * su visibilidad de workspaces/usuarios/suscripciones es exclusivamente vía
 * /app/admin (CMS), nunca vía Mi Empresa, Suscripción o Equipo y Usuarios.
 */
export function RequireOwner({ children }: { children: ReactNode }) {
  const { profile } = useWorkspace();
  const location = useLocation();

  const superAdminQuery = useQuery({
    queryKey: ['isSuperAdmin'],
    queryFn: isSuperAdmin,
  });

  const allowed = profile.role === 'owner' || superAdminQuery.data === true;

  useEffect(() => {
    if (superAdminQuery.isLoading) return;
    if (!allowed) {
      supabase.rpc('log_access_denied', { p_route: location.pathname }).then(() => {});
    }
  }, [allowed, superAdminQuery.isLoading, location.pathname]);

  if (superAdminQuery.isLoading) return null;
  if (!allowed) return <Navigate to="/app/dashboard" replace />;

  return <>{children}</>;
}
