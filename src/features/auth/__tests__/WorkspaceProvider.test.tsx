/**
 * WorkspaceProvider — regresión del bug "spinner infinito" (login bloqueado).
 *
 * Causa raíz original: getProfile() usaba .single(), que lanza 406 cuando
 * RLS filtra todas las filas (perfil con status != 'active'). El provider
 * no distinguía error de loading → quedaba en { loading: true } para siempre.
 *
 * Estos tests prueban, para 5 escenarios de usuario, que el estado del
 * contexto SIEMPRE resuelve a un valor determinado (loading: false) y
 * nunca queda atascado — usando los datos exactos que produciría Supabase
 * en cada caso (maybeSingle() → null es un resultado válido, no una excepción).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkspaceProvider, useWorkspaceMaybe } from '../WorkspaceProvider';

// ─── Mocks (vi.hoisted: el factory de vi.mock se ejecuta antes que el resto
// del módulo, así que el estado mutable que necesita debe declararse aquí) ───

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
  },
}));

vi.mock('../AuthProvider', () => ({
  useAuth: () => ({
    user:    authState.userId ? { id: authState.userId } : null,
    session: authState.userId ? {} : null,
    loading: false,
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Probe() {
  const ws = useWorkspaceMaybe();
  // Serializamos el estado completo del contexto para poder hacer asserts
  // sobre loading/error/notFound/forbidden/profile sin acoplarnos a la UI.
  return <div data-testid="state">{JSON.stringify(ws)}</div>;
}

function renderProvider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>
    </QueryClientProvider>,
  );
}

async function getState() {
  await waitFor(() => {
    const state = JSON.parse(screen.getByTestId('state').textContent!);
    expect(state.loading).toBe(false); // ← la aserción central: nunca queda en loading
  });
  return JSON.parse(screen.getByTestId('state').textContent!);
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WorkspaceProvider — nunca queda en loading infinito', () => {

  it('ACTIVE: resuelve a estado ready con profile/workspace/company/plan', async () => {
    setProfile(baseProfile);
    setWorkspace(baseWorkspace);
    setCompanySettings(baseCompany);
    setPlanCode('premium');

    renderProvider();
    const state = await getState();

    expect(state.error).toBeUndefined();
    expect(state.notFound).toBeUndefined();
    expect(state.forbidden).toBeUndefined();
    expect(state.profile.id).toBe('user-1');
    expect(state.workspace.id).toBe('ws-1');
    expect(state.planName).toBe('Premium');
  });

  it('INVITED: perfil existe pero status≠active → forbidden, nunca loading', async () => {
    setProfile({ ...baseProfile, status: 'invited' });
    // workspace/company/plan NO deben consultarse para un perfil no activo —
    // si la query disparara igual y tableResponses estuviera vacío, el estado
    // quedaría inconsistente; al no configurarlos, este test también verifica
    // implícitamente el gating por profileActive.

    renderProvider();
    const state = await getState();

    expect(state.forbidden).toBe(true);
    expect(state.profileStatus).toBe('invited');
    expect(state.notFound).toBeUndefined();
    expect(state.error).toBeUndefined();
  });

  it('REMOVED: perfil eliminado → forbidden, nunca loading (la fila SÍ es legible vía profiles_select_own)', async () => {
    setProfile({ ...baseProfile, status: 'removed' });

    renderProvider();
    const state = await getState();

    expect(state.forbidden).toBe(true);
    expect(state.profileStatus).toBe('removed');
  });

  it('SIN PERFIL: maybeSingle() → null → notFound:"profile", nunca loading, nunca un throw 406', async () => {
    setProfile(null);

    renderProvider();
    const state = await getState();

    expect(state.notFound).toBe('profile');
    expect(state.error).toBeUndefined();
  });

  it('OTRO WORKSPACE (RLS cross-tenant): perfil activo pero workspace resuelve null → notFound:"workspace", sin fuga de datos', async () => {
    setProfile(baseProfile);
    setWorkspace(null); // simula que RLS no devuelve el workspace de otro tenant
    setCompanySettings(baseCompany);
    setPlanCode('free');

    renderProvider();
    const state = await getState();

    expect(state.notFound).toBe('workspace');
    // Zero Trust: jamás debe exponerse un workspace que no es del usuario
    expect(state.workspace).toBeUndefined();
  });

  it('Sin usuario autenticado: nunca dispara queries de perfil, no queda en loading', async () => {
    authState.userId = null;

    renderProvider();
    const state = await getState();

    expect(state.notFound).toBe('profile');
  });
});
