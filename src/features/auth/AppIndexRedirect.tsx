import { Navigate } from 'react-router-dom';
import { useWorkspace } from './WorkspaceProvider';

/**
 * Ruta índice de /app: el super_admin aterriza en el CMS (/app/admin), nunca
 * en el dashboard comercial. El resto de roles van al dashboard normal.
 */
export function AppIndexRedirect() {
  const { profile } = useWorkspace();

  if (profile.role === 'super_admin') {
    return <Navigate to="/app/admin" replace />;
  }

  return <Navigate to="/app/dashboard" replace />;
}
