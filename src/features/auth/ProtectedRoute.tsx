import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { WorkspaceProvider, useWorkspaceMaybe } from './WorkspaceProvider';

function FullScreenSpinner() {
  return (
    <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '3px solid #E2E8F0',
          borderTopColor: '#2563EB',
          animation: 'spin .8s linear infinite',
        }}
      />
    </div>
  );
}

function WorkspaceGate({ children }: { children: ReactNode }) {
  const ws = useWorkspaceMaybe();
  if (ws.loading) return <FullScreenSpinner />;
  return <>{children}</>;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) return <FullScreenSpinner />;
  if (!session) return <Navigate to="/login" replace />;

  return (
    <WorkspaceProvider>
      <WorkspaceGate>{children}</WorkspaceGate>
    </WorkspaceProvider>
  );
}
