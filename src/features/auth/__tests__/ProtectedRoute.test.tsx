/**
 * ProtectedRoute — end-to-end de la UI real (no solo el estado del contexto).
 *
 * Prueba lo que el usuario realmente ve en pantalla para cada escenario:
 * el spinner ("startup-spinner") debe desaparecer SIEMPRE y dar paso a un
 * estado determinado (contenido protegido, pantalla de bloqueo, o de no
 * encontrado) — nunca debe quedar visible indefinidamente.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProtectedRoute } from '../ProtectedRoute';

const { tableResponses, rpcResponses, authState } = vi.hoisted(() => {
  const tableResponses: Record<string, { data: unknown; error: unknown }> = {};
  const rpcResponses: Record<string, { data: unknown; error: unknown }> = {};
  const authState: { userId: string | null } = { userId: 'user-1' };
  return { tableResponses, rpcResponses, authState };
});

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => tableResponses[table] ?? { data: null, error: null },
          single:      async () => tableResponses[table] ?? { data: null, error: null },
        }),
      }),
    }),
    rpc: async (fn: string) => rpcResponses[fn] ?? { data: null, error: null },
    auth: {
      signOut: async () => ({ error: null }),
    },
  },
}));

vi.mock('../AuthProvider', () => ({
  useAuth: () => ({
    user:    authState.userId ? { id: authState.userId } : null,
    session: authState.userId ? {} : null,
    loading: false,
  }),
}));

function renderProtected() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={['/app/dashboard']}>
      <QueryClientProvider client={client}>
        <ProtectedRoute>
          <div data-testid="protected-content">CONTENIDO PROTEGIDO</div>
        </ProtectedRoute>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function setProfile(p: Record<string, unknown> | null) {
  tableResponses.profiles = { data: p, error: null };
}
function setWorkspace(w: Record<string, unknown> | null) {
  tableResponses.workspaces = { data: w, error: null };
}
function setCompanySettings(c: Record<string, unknown> | null) {
  tableResponses.company_settings = { data: c, error: null };
}
function setPlanCode(code: string) {
  rpcResponses.get_effective_plan_code = { data: code, error: null };
}

const baseProfile = {
  id: 'user-1',
  workspace_id: 'ws-1',
  role: 'owner',
  full_name: 'Test User',
  email: 'user@test.com',
  status: 'active',
  onboarding_seen: true,
};
const baseWorkspace = { id: 'ws-1', name: 'Test Workspace' };
const baseCompany   = { workspace_id: 'ws-1', terms_conditions: [] };

beforeEach(() => {
  for (const k of Object.keys(tableResponses)) delete tableResponses[k];
  for (const k of Object.keys(rpcResponses)) delete rpcResponses[k];
  authState.userId = 'user-1';
});

// Aserción central de todos los tests: el spinner debe desaparecer.
async function waitForSpinnerToResolve() {
  await waitFor(() => {
    expect(screen.queryByTestId('startup-spinner')).not.toBeInTheDocument();
  });
}

describe('ProtectedRoute — el spinner siempre se resuelve a un estado final', () => {

  it('ACTIVE: muestra el contenido protegido', async () => {
    setProfile(baseProfile);
    setWorkspace(baseWorkspace);
    setCompanySettings(baseCompany);
    setPlanCode('premium');

    renderProtected();
    await waitForSpinnerToResolve();

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.queryByTestId('startup-forbidden')).not.toBeInTheDocument();
    expect(screen.queryByTestId('startup-notfound')).not.toBeInTheDocument();
    expect(screen.queryByTestId('startup-error')).not.toBeInTheDocument();
  });

  it('INVITED: muestra pantalla de bloqueo "Invitación pendiente", no el contenido protegido', async () => {
    setProfile({ ...baseProfile, status: 'invited' });

    renderProtected();
    await waitForSpinnerToResolve();

    expect(screen.getByTestId('startup-forbidden')).toBeInTheDocument();
    expect(screen.getByText('Invitación pendiente')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('REMOVED: muestra pantalla de bloqueo "Tu acceso fue eliminado", no el contenido protegido', async () => {
    setProfile({ ...baseProfile, status: 'removed' });

    renderProtected();
    await waitForSpinnerToResolve();

    expect(screen.getByTestId('startup-forbidden')).toBeInTheDocument();
    expect(screen.getByText('Tu acceso fue eliminado')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('SIN PERFIL: muestra "No encontramos tu perfil", no el contenido protegido', async () => {
    setProfile(null);

    renderProtected();
    await waitForSpinnerToResolve();

    expect(screen.getByTestId('startup-notfound')).toBeInTheDocument();
    expect(screen.getByText('No encontramos tu perfil')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('OTRO WORKSPACE (cross-tenant): muestra "No encontramos tu empresa", nunca expone datos ajenos', async () => {
    setProfile(baseProfile);
    setWorkspace(null);
    setCompanySettings(baseCompany);
    setPlanCode('free');

    renderProtected();
    await waitForSpinnerToResolve();

    expect(screen.getByTestId('startup-notfound')).toBeInTheDocument();
    expect(screen.getByText('No encontramos tu empresa')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });
});
