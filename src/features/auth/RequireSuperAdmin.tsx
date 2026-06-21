/**
 * RequireSuperAdmin — Guard exclusivo para super_admin y support_admin.
 * Owner y otros roles son redirigidos al dashboard. NO al "Acceso restringido" anterior.
 * Sprint 9: separar /app/admin de RequireOwner.
 */
import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { isSuperAdmin } from '../../lib/permissions';

export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const q = useQuery({ queryKey: ['isSuperAdmin'], queryFn: isSuperAdmin });

  if (q.isLoading) return null;

  // Solo super_admin y support_admin pasan — owners van al dashboard comercial
  if (!q.data) return <Navigate to="/app/dashboard" replace />;

  return <>{children}</>;
}
