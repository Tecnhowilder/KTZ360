import { Navigate } from 'react-router-dom';
import { useWorkspace } from './WorkspaceProvider';
import { getHomeForRole } from '../../lib/navigation';

/**
 * Ruta índice de /app: redirige a home por rol.
 * Fuente de verdad: getHomeForRole() en src/lib/navigation.ts
 */
export function AppIndexRedirect() {
  const { profile } = useWorkspace();
  return <Navigate to={getHomeForRole(profile.role)} replace />;
}
