/**
 * featureFlags.ts — Servicio para Feature Flags dinámicos (Capa 2)
 *
 * Arquitectura:
 *   Capa 1: plan_features (por plan) — gestionado en PlansEditor del backoffice
 *   Capa 2: feature_flags (runtime) — gestionado en FeatureFlagsTab del backoffice
 *
 * Zero Trust:
 *   • Toda evaluación ocurre en backend via SECURITY DEFINER RPC
 *   • El frontend NUNCA evalúa lógica de targeting
 *   • workspace_id siempre del JWT
 */
import { supabase } from '../lib/supabaseClient';
import type { FeatureFlagRow } from '../lib/database.types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (supabase as any).rpc.bind(supabase as any);

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface DynamicFlags {
  [key: string]: boolean;
}

export interface UpsertFeatureFlagInput {
  key:          string;
  name:         string;
  description?: string;
  enabled:      boolean;
  planCodes?:   string[];
  workspaceIds?: string[];
  userIds?:     string[];
  roles?:       string[];
  rolloutPct?:  number | null;
  category?:    string;
  tags?:        string[];
}

// ─── Lectura del estado evaluado ──────────────────────────────────────────────

/** Obtiene todos los dynamic flags evaluados para el contexto actual del usuario. */
export async function getDynamicFlags(): Promise<DynamicFlags> {
  const { data, error } = await rpc('get_all_dynamic_flags', {});
  if (error) throw error;
  return (data as DynamicFlags) ?? {};
}

/** Evalúa un único dynamic flag para el contexto actual. */
export async function isDynamicFlagEnabled(key: string): Promise<boolean> {
  const { data, error } = await rpc('is_dynamic_flag_enabled', { p_key: key });
  if (error) return false;
  return Boolean(data);
}

// ─── Admin: gestión desde backoffice ──────────────────────────────────────────

/** Lista todos los feature flags (solo super/support admin). */
export async function listFeatureFlags(): Promise<FeatureFlagRow[]> {
  const { data, error } = await rpc('admin_list_feature_flags', {});
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
  return (data.data as FeatureFlagRow[]) ?? [];
}

/** Crea o actualiza un feature flag. */
export async function upsertFeatureFlag(input: UpsertFeatureFlagInput): Promise<void> {
  const { data, error } = await rpc('admin_upsert_feature_flag', {
    p_key:           input.key,
    p_name:          input.name,
    p_description:   input.description ?? null,
    p_enabled:       input.enabled,
    p_plan_codes:    input.planCodes   ?? null,
    p_workspace_ids: input.workspaceIds ?? null,
    p_user_ids:      input.userIds     ?? null,
    p_roles:         input.roles       ?? null,
    p_rollout_pct:   input.rolloutPct  ?? null,
    p_category:      input.category    ?? 'general',
    p_tags:          input.tags        ?? [],
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
}

/** Activa o desactiva un feature flag por key. */
export async function toggleFeatureFlag(key: string, enabled: boolean): Promise<void> {
  const { data, error } = await rpc('admin_toggle_feature_flag', {
    p_key:     key,
    p_enabled: enabled,
  });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
}

/** Elimina un feature flag por key. */
export async function deleteFeatureFlag(key: string): Promise<void> {
  const { data, error } = await rpc('admin_delete_feature_flag', { p_key: key });
  if (error) throw error;
  if (!data.ok) throw new Error(data.error);
}
