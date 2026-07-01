/**
 * services/workspaces.ts — verifica que getProfile/getWorkspace/getCompanySettings
 * usan maybeSingle() correctamente: ausencia de fila → null, NUNCA un throw.
 * Antes usaban .single(), que lanza una excepción (406 PGRST116) ante 0 filas
 * — exactamente la causa raíz del bug de login bloqueado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { tableResponses } = vi.hoisted(() => ({
  tableResponses: {} as Record<string, { data: unknown; error: unknown }>,
}));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => tableResponses[table] ?? { data: null, error: null },
        }),
      }),
    }),
  },
}));

import { getProfile, getWorkspace, getCompanySettings } from '../workspaces';

beforeEach(() => {
  for (const k of Object.keys(tableResponses)) delete tableResponses[k];
});

describe('getProfile', () => {
  it('devuelve el perfil cuando existe', async () => {
    tableResponses.profiles = { data: { id: 'u1', status: 'active' }, error: null };
    const result = await getProfile('u1');
    expect(result).toEqual({ id: 'u1', status: 'active' });
  });

  it('devuelve null cuando no existe la fila — NO lanza excepción', async () => {
    tableResponses.profiles = { data: null, error: null };
    await expect(getProfile('inexistente')).resolves.toBeNull();
  });

  it('sigue propagando errores reales (red, permisos)', async () => {
    tableResponses.profiles = { data: null, error: new Error('network down') };
    await expect(getProfile('u1')).rejects.toThrow('network down');
  });
});

describe('getWorkspace', () => {
  it('devuelve null cuando RLS no expone el workspace (cross-tenant) — NO lanza', async () => {
    tableResponses.workspaces = { data: null, error: null };
    await expect(getWorkspace('ws-de-otro-tenant')).resolves.toBeNull();
  });
});

describe('getCompanySettings', () => {
  it('devuelve null cuando no existe configuración — NO lanza', async () => {
    tableResponses.company_settings = { data: null, error: null };
    await expect(getCompanySettings('ws-1')).resolves.toBeNull();
  });

  it('normaliza terms_conditions a array cuando existe la fila', async () => {
    tableResponses.company_settings = { data: { workspace_id: 'ws-1', terms_conditions: null }, error: null };
    const result = await getCompanySettings('ws-1');
    expect(result?.terms_conditions).toEqual([]);
  });
});
