/**
 * aiProviders.ts — Servicio de administración de proveedores IA
 * Solo para Super Admins (Backoffice).
 * Zero Trust: todas las operaciones van al backend via RPC.
 */
import { supabase } from '../lib/supabaseClient';

// Las tablas y RPCs enterprise (ai_model_capabilities, ai_routing_policies, etc.) no están en
// los tipos generados de Supabase porque las migraciones son locales. Se usa 'db' para eludir
// el tipo generado sin afectar la operación en runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AIProvider {
  id:                 string;
  provider_key:       string;
  name:               string;
  base_url:           string;
  api_key_secret:     string;
  enabled:            boolean;
  priority:           number;
  is_primary:         boolean;
  supports_vision:    boolean;
  quality_score:      number;
  cost_score:         number;
  notes:              string | null;
  updated_at:         string;
}

export interface AIProviderModel {
  id:                 string;
  provider_key:       string;
  model_id:           string;
  model_alias:        string;
  supports_vision:    boolean;
  quality_score:      number;
  cost_per_1m_tokens: number;
  max_tokens_output:  number;
  is_default:         boolean;
  is_default_vision:  boolean;
  enabled:            boolean;
}

export interface AIProviderHealth {
  provider_key:       string;
  status:             'ok' | 'degraded' | 'down' | 'unknown' | 'unconfigured' | 'disabled';
  latency_ms:         number | null;
  error_rate_pct:     number;
  availability_score: number;
  is_circuit_open:    boolean;
  last_error:         string | null;
  checked_at:         string | null;
  composite_score:    number;
}

export interface AIProviderScore extends AIProviderHealth {
  name:              string;
  enabled:           boolean;
  priority:          number;
  quality_score:     number;
  cost_score:        number;
  supports_vision:   boolean;
}

export interface AIOperationPricing {
  operation:          string;
  credits_cost:       number;
  estimated_usd_cost: number;
  max_allowed_usd:    number;
  minimum_margin_pct: number;
  quality_level:      'economy' | 'standard' | 'premium';
  preferred_provider: string | null;
  preferred_model:    string | null;
  fallback_provider:  string | null;
  fallback_model:     string | null;
  requires_vision:    boolean;
  cache_enabled:      boolean;
  cache_ttl_minutes:  number;
  enabled:            boolean;
}

export interface AIFinopsSummary {
  period_days:             number;
  total_requests:          number;
  total_credits_consumed:  number;
  total_real_cost_usd:     number;
  avg_latency_ms:          number;
  success_rate_pct:        number;
  fallback_rate_pct:       number;
  cache_hit_rate_pct:      number;
  by_provider:             Array<{ provider: string; requests: number; credits: number; cost_usd: number; avg_latency: number; success_rate: number }>;
  by_operation:            Array<{ operation: string; requests: number; credits: number; cost_usd: number }>;
  by_workspace:            Array<{ workspace_id: string; requests: number; credits: number; cost_usd: number }>;
}

export interface AIBenchmarkSummary {
  provider_key:  string;
  model_id:      string;
  operation:     string;
  avg_latency_ms: number;
  avg_quality:    number;
  avg_cost_usd:   number;
  success_rate:   number;
  sample_count:   number;
  last_run:       string;
}

export interface AIRoleLimit {
  id:               string;
  workspace_id:     string;
  role:             string;
  daily_credits:    number | null;
  monthly_credits:  number | null;
  per_operation_max: number | null;
  enabled:          boolean;
}

export interface AICacheStats {
  total_entries:  number;
  total_hits:     number;
  credits_saved:  number;
  expires_soon:   number; // expiran en las próximas 2h
}

// ─── Providers ───────────────────────────────────────────────────────────────

export async function getAIProviders(): Promise<AIProvider[]> {
  const { data, error } = await supabase
    .from('ai_providers')
    .select('*')
    .order('priority');
  if (error) throw error;
  return (data ?? []) as AIProvider[];
}

export async function updateAIProvider(id: string, updates: Partial<AIProvider>): Promise<void> {
  const { error } = await db.from('ai_providers').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function getAIProviderModels(providerKey?: string): Promise<AIProviderModel[]> {
  let q = supabase.from('ai_provider_models').select('*').order('quality_score', { ascending: false });
  if (providerKey) q = q.eq('provider_key', providerKey);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AIProviderModel[];
}

export async function updateAIProviderModel(id: string, updates: Partial<AIProviderModel>): Promise<void> {
  const { error } = await db.from('ai_provider_models').update(updates).eq('id', id);
  if (error) throw error;
}

// ─── Health / Scores ──────────────────────────────────────────────────────────

export async function getAIProviderScores(): Promise<AIProviderScore[]> {
  const { data, error } = await db.rpc('get_ai_provider_scores');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as AIProviderScore[];
}

export async function triggerHealthCheck(): Promise<{ ok: boolean; results: AIProviderHealth[] }> {
  const { data, error } = await supabase.functions.invoke('ai-health-check', { method: 'POST' });
  if (error) throw error;
  if (data && !data.ok) throw new Error(data.error ?? 'Health check falló sin detalles');
  return data as { ok: boolean; results: AIProviderHealth[] };
}

// ─── Operation Pricing ────────────────────────────────────────────────────────

export async function getAIOperationPricing(): Promise<AIOperationPricing[]> {
  const { data, error } = await supabase
    .from('ai_operation_pricing')
    .select('*')
    .order('operation');
  if (error) throw error;
  return (data ?? []) as AIOperationPricing[];
}

export async function updateAIOperationPricing(operation: string, updates: Partial<AIOperationPricing>): Promise<void> {
  const { error } = await db.from('ai_operation_pricing').update({ ...updates, updated_at: new Date().toISOString() }).eq('operation', operation);
  if (error) throw error;
}

// ─── FinOps ───────────────────────────────────────────────────────────────────

export async function getAIFinopsSummary(days = 30): Promise<AIFinopsSummary> {
  const { data, error } = await db.rpc('get_ai_finops_summary', { p_days: days });
  if (error) throw error;
  return data as AIFinopsSummary;
}

// ─── Benchmark ────────────────────────────────────────────────────────────────

export async function getAIBenchmarkSummary(): Promise<AIBenchmarkSummary[]> {
  const { data, error } = await db.rpc('get_ai_benchmark_summary');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as AIBenchmarkSummary[];
}

// ─── Cache ────────────────────────────────────────────────────────────────────

export async function getAICacheStats(): Promise<AICacheStats> {
  const { data, error } = await supabase
    .from('ai_cache')
    .select('id, hit_count, credits_saved, expires_at');
  if (error) throw error;
  const rows = (data ?? []) as Array<{ hit_count: number; credits_saved: number; expires_at: string }>;
  const now  = new Date();
  const in2h = new Date(Date.now() + 2 * 3600 * 1000);
  return {
    total_entries: rows.length,
    total_hits:    rows.reduce((s, r) => s + r.hit_count, 0),
    credits_saved: rows.reduce((s, r) => s + r.credits_saved, 0),
    expires_soon:  rows.filter(r => {
      const exp = new Date(r.expires_at);
      return exp > now && exp < in2h;
    }).length,
  };
}

export async function purgaAICache(): Promise<number> {
  const { data, error } = await db.rpc('purge_ai_cache');
  if (error) throw error;
  return (data as number) ?? 0;
}

// ─── Role Limits ─────────────────────────────────────────────────────────────

export async function getAIRoleLimits(workspaceId: string): Promise<AIRoleLimit[]> {
  const { data, error } = await supabase
    .from('ai_role_limits')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('role');
  if (error) throw error;
  return (data ?? []) as AIRoleLimit[];
}

export async function upsertAIRoleLimit(limit: Omit<AIRoleLimit, 'id'>): Promise<void> {
  const { error } = await db.from('ai_role_limits').upsert({ ...limit, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id,role' });
  if (error) throw error;
}

// ─── Capability Registry ──────────────────────────────────────────────────────

export interface AIModelCapability {
  id:           string;
  provider_key: string;
  model_id:     string;
  capability:   string;
  level:        'full' | 'partial' | 'experimental' | 'none';
  notes:        string | null;
  verified:     boolean;
  created_at:   string;
}

export async function getAIModelCapabilities(providerKey?: string): Promise<AIModelCapability[]> {
  let q = db.from('ai_model_capabilities').select('*').order('provider_key').order('model_id').order('capability');
  if (providerKey) q = q.eq('provider_key', providerKey);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AIModelCapability[];
}

export async function updateAIModelCapability(id: string, updates: Partial<AIModelCapability>): Promise<void> {
  const { error } = await db.from('ai_model_capabilities').update(updates).eq('id', id);
  if (error) throw error;
}

export async function findModelsByCapability(capability: string, level = 'full'): Promise<unknown[]> {
  const { data, error } = await db.rpc('find_models_by_capability', { p_capability: capability, p_level: level });
  if (error) throw error;
  return Array.isArray(data) ? data : (data ?? []);
}

// ─── Routing Policies ─────────────────────────────────────────────────────────

export interface AIRoutingPolicy {
  id:              string;
  name:            string;
  description:     string | null;
  priority:        number;
  operation:       string | null;
  condition_type:  string;
  provider_key:    string | null;
  capability:      string | null;
  threshold_value: number | null;
  enabled:         boolean;
  notes:           string | null;
  created_at:      string;
  updated_at:      string;
}

export async function getAIRoutingPolicies(): Promise<AIRoutingPolicy[]> {
  const { data, error } = await db.from('ai_routing_policies').select('*').order('priority');
  if (error) throw error;
  return (data ?? []) as AIRoutingPolicy[];
}

export async function upsertAIRoutingPolicy(policy: Omit<AIRoutingPolicy, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<void> {
  const { error } = await db.from('ai_routing_policies').upsert({ ...policy, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function deleteAIRoutingPolicy(id: string): Promise<void> {
  const { error } = await db.from('ai_routing_policies').delete().eq('id', id);
  if (error) throw error;
}

// ─── Governance Rules ─────────────────────────────────────────────────────────

export interface AIGovernanceRule {
  id:                    string;
  name:                  string;
  description:           string | null;
  rule_type:             string;
  action:                string;
  applies_to_operations: string[] | null;
  pattern_keywords:      string[] | null;
  regex_pattern:         string | null;
  enabled:               boolean;
  framework:             string | null;
  notes:                 string | null;
  created_at:            string;
  updated_at:            string;
}

export async function getAIGovernanceRules(): Promise<AIGovernanceRule[]> {
  const { data, error } = await db.from('ai_governance_rules').select('*').order('rule_type').order('name');
  if (error) throw error;
  return (data ?? []) as AIGovernanceRule[];
}

export async function upsertAIGovernanceRule(rule: Omit<AIGovernanceRule, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<void> {
  const { error } = await db.from('ai_governance_rules').upsert({ ...rule, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function toggleAIGovernanceRule(id: string, enabled: boolean): Promise<void> {
  const { error } = await db.from('ai_governance_rules').update({ enabled, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

// ─── Prompt Templates ─────────────────────────────────────────────────────────

export interface AIPromptTemplate {
  id:              string;
  operation:       string;
  version:         number;
  status:          'draft' | 'published' | 'archived';
  name:            string;
  system_prompt:   string | null;
  prompt_template: string | null;
  variables:       Record<string, string> | null;
  ab_test_pct:     number;
  quality_notes:   string | null;
  change_notes:    string | null;
  published_at:    string | null;
  archived_at:     string | null;
  created_at:      string;
  updated_at:      string;
}

export async function getAIPromptTemplates(operation?: string): Promise<AIPromptTemplate[]> {
  let q = db.from('ai_prompt_templates').select('*').order('operation').order('version', { ascending: false });
  if (operation) q = q.eq('operation', operation);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AIPromptTemplate[];
}

export async function saveAIPromptTemplate(tpl: Omit<AIPromptTemplate, 'id' | 'created_at' | 'updated_at' | 'published_at' | 'archived_at'> & { id?: string }): Promise<void> {
  const { error } = await db.from('ai_prompt_templates').upsert({ ...tpl, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function publishPromptVersion(id: string): Promise<void> {
  const { error } = await db.rpc('publish_prompt_version', { p_template_id: id });
  if (error) throw error;
}

export async function rollbackPromptVersion(id: string): Promise<void> {
  const { error } = await db.rpc('rollback_prompt_version', { p_template_id: id });
  if (error) throw error;
}

// ─── Observabilidad (P50/P95/P99, Health Score, Dynamic Ranking) ──────────────

export interface AILatencyPercentiles {
  provider:          string;
  operation:         string;
  sample_count:      number;
  p50_ms:            number;
  p95_ms:            number;
  p99_ms:            number;
  avg_ms:            number;
  min_ms:            number;
  max_ms:            number;
  success_rate_pct:  number;
  fallback_rate_pct: number;
  cache_hit_pct:     number;
}

export async function getAILatencyPercentiles(days = 7, provider?: string): Promise<AILatencyPercentiles[]> {
  const args: Record<string, unknown> = { p_days: days };
  if (provider) args['p_provider'] = provider;
  const { data, error } = await db.rpc('get_ai_latency_percentiles', args);
  if (error) throw error;
  return (Array.isArray(data) ? data : (data ?? [])) as AILatencyPercentiles[];
}

export interface AIHealthScore {
  provider_key:    string;
  name:            string;
  health_score:    number;
  availability:    number;
  error_rate_pct:  number;
  latency_ms:      number | null;
  status:          string;
  circuit_open:    boolean;
  enabled:         boolean;
  last_check:      string | null;
}

export async function getAIHealthScore(): Promise<AIHealthScore[]> {
  const { data, error } = await db.rpc('get_ai_health_score');
  if (error) throw error;
  return (Array.isArray(data) ? data : (data ?? [])) as AIHealthScore[];
}

export interface AIDynamicRanking {
  provider_key:       string;
  name:               string;
  enabled:            boolean;
  quality_score:      number;
  cost_score:         number;
  real_success_rate:  number;
  real_p50_ms:        number;
  real_p95_ms:        number;
  real_avg_cost_usd:  number;
  total_requests:     number;
  benchmark_quality:  number | null;
  benchmark_latency:  number | null;
  dynamic_score:      number;
}

export async function getAIDynamicRanking(days = 7): Promise<AIDynamicRanking[]> {
  const { data, error } = await db.rpc('get_ai_dynamic_ranking', { p_days: days });
  if (error) throw error;
  return (Array.isArray(data) ? data : (data ?? [])) as AIDynamicRanking[];
}

// ─── Cost Simulator ───────────────────────────────────────────────────────────

export interface CostSimulatorInput {
  operation: string;
  count:     number;
}

export interface CostSimulatorResult {
  users:            number;
  total_credits:    number;
  total_cost_usd:   number;
  cost_per_user_usd: number;
  breakdown:        Array<{
    operation:      string;
    count:          number;
    credits_each:   number;
    credits_total:  number;
    cost_usd_each:  number;
    cost_usd_total: number;
    quality_level:  string;
    provider:       string;
  }>;
}

export async function simulateAICosts(users: number, operations: CostSimulatorInput[]): Promise<CostSimulatorResult> {
  const { data, error } = await db.rpc('simulate_ai_costs', { p_users: users, p_operations: operations });
  if (error) throw error;
  return data as CostSimulatorResult;
}

// ─── Trigger Benchmark ────────────────────────────────────────────────────────

export async function triggerBenchmark(operations?: string[]): Promise<{ ok: boolean; total_runs?: number; providers_tested?: string[] }> {
  const { data, error } = await supabase.functions.invoke('ai-benchmark', {
    method: 'POST',
    body:   operations?.length ? { operations } : {},
  });
  if (error) throw error;
  return data as { ok: boolean; total_runs?: number; providers_tested?: string[] };
}

// ─── Estimador de créditos (pre-call) ────────────────────────────────────────

export async function estimateOperationCredits(operation: string): Promise<{
  credits_cost: number;
  quality_level: string;
  provider: string;
  cache_eligible: boolean;
}> {
  const { data } = await supabase
    .from('ai_operation_pricing')
    .select('credits_cost, quality_level, preferred_provider, cache_enabled')
    .eq('operation', operation)
    .maybeSingle();

  if (!data) {
    return { credits_cost: 3, quality_level: 'standard', provider: 'Shelwi AI', cache_eligible: false };
  }

  return {
    credits_cost:   (data as { credits_cost: number }).credits_cost,
    quality_level:  (data as { quality_level: string }).quality_level,
    provider:       'Shelwi AI',
    cache_eligible: (data as { cache_enabled: boolean }).cache_enabled,
  };
}
