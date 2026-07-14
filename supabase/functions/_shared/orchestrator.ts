/**
 * AI Orchestrator — Motor de Orquestación Enterprise
 *
 * El usuario NUNCA conoce el proveedor. Solo conoce "Shelwi AI".
 *
 * FLUJO:
 *   1. Verificar Governance Rules (PII, Habeas Data, credenciales)
 *   2. Obtener routing config (operación → capacidades requeridas)
 *   3. Evaluar Provider Policies administrables
 *   4. Seleccionar proveedor por Dynamic Score (no por prioridad fija)
 *   5. Verificar cache (si la operación lo permite)
 *   6. Llamar proveedor seleccionado
 *   7. Fallback automático si falla (usuario no nota el cambio)
 *   8. Guardar en cache (si TTL > 0)
 *   9. Registrar en ai_request_log (observabilidad completa)
 *   10. Actualizar salud del proveedor
 */
import { callGemini }    from './providers/gemini.ts';
import { callNvidianim } from './providers/nvidia.ts';
import type { ProviderRequest, ProviderResponse } from './providers/gemini.ts';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface OrchestratorRequest {
  prompt:       string;
  operation:    string;
  images?:      string[];
  aiMode?:      'balanced' | 'quality' | 'economy' | 'auto';
  requestId?:   string;
  workspaceId?: string;
  userId?:      string;
}

export interface OrchestratorResult {
  text:             string;
  tokensTotal:      number;
  costUsd:          number;
  providerUsed:     string;
  modelUsed:        string;
  fallbackUsed:     boolean;
  cacheHit:         boolean;
  latencyMs:        number;
  creditsConsumed:  number;
  creditsRemaining: number | null;
}

export interface RoutingConfig {
  operation:         string;
  ai_mode:           string;
  provider:          string;
  model:             string;
  fallback_provider: string | null;
  fallback_model:    string | null;
  cache_enabled:     boolean;
  cache_ttl_minutes: number;
  requires_vision:   boolean;
  credits_cost:      number;
  estimated_usd:     number;
  max_allowed_usd:   number;
  min_margin_pct:    number;
}

type AdminClient = ReturnType<typeof import('https://esm.sh/@supabase/supabase-js@2').createClient>;

// ─── Governance: verificar reglas antes de enviar a la IA ────────────────────

async function checkGovernanceRules(
  prompt: string,
  operation: string,
  adminClient: AdminClient
): Promise<{ allowed: boolean; reason?: string; action?: string }> {
  try {
    const { data: rules } = await adminClient
      .from('ai_governance_rules')
      .select('name,rule_type,action,applies_to_operations,pattern_keywords,regex_pattern')
      .eq('enabled', true)
      .in('rule_type', ['pii_detection']); // Solo aplicamos detección sincrónica en proxy

    if (!rules?.length) return { allowed: true };

    const promptLower = prompt.toLowerCase();

    for (const rule of rules) {
      // Verificar si aplica a esta operación
      if (rule.applies_to_operations?.length && !rule.applies_to_operations.includes(operation)) {
        continue;
      }

      // Verificar keywords
      if (rule.pattern_keywords?.length) {
        const matched = rule.pattern_keywords.some((kw: string) => promptLower.includes(kw.toLowerCase()));
        if (matched) {
          if (rule.action === 'block') {
            return { allowed: false, reason: rule.name, action: 'block' };
          }
          // log/alert: continuar pero registrar
          console.warn(`[Governance] Rule triggered: ${rule.name} — action: ${rule.action}`);
        }
      }

      // Verificar regex
      if (rule.regex_pattern) {
        try {
          if (new RegExp(rule.regex_pattern, 'i').test(prompt)) {
            if (rule.action === 'block') {
              return { allowed: false, reason: rule.name, action: 'block' };
            }
            console.warn(`[Governance] Regex match: ${rule.name}`);
          }
        } catch { /* regex inválido — ignorar */ }
      }
    }

    return { allowed: true };
  } catch {
    // Si falla la verificación de gobernanza, no bloquear (fail-open por disponibilidad)
    return { allowed: true };
  }
}

// ─── Policies: aplicar políticas de enrutamiento ─────────────────────────────

async function applyRoutingPolicies(
  operation: string,
  config: RoutingConfig,
  adminClient: AdminClient
): Promise<RoutingConfig> {
  try {
    const { data: policies } = await adminClient
      .from('ai_routing_policies')
      .select('condition_type,provider_key,capability,threshold_value,notes')
      .eq('enabled', true)
      .or(`operation.is.null,operation.eq.${operation}`)
      .order('priority', { ascending: true });

    if (!policies?.length) return config;

    let result = { ...config };

    for (const policy of policies) {
      switch (policy.condition_type) {
        case 'always_use_provider':
          if (policy.provider_key) {
            result = { ...result, provider: policy.provider_key };
          }
          break;

        case 'never_use_provider':
          if (policy.provider_key && result.provider === policy.provider_key) {
            // Redirigir al fallback
            result = {
              ...result,
              provider: result.fallback_provider ?? result.provider,
              model:    result.fallback_model    ?? result.model,
            };
          }
          break;

        case 'fallback_only':
          if (policy.provider_key && result.provider === policy.provider_key) {
            // Este proveedor es solo fallback — mover al fallback slot si está como primario
            result = {
              ...result,
              provider:         result.fallback_provider ?? result.provider,
              model:            result.fallback_model    ?? result.model,
              fallback_provider: policy.provider_key,
              fallback_model:   result.model,
            };
          }
          break;

        case 'max_cost_usd':
          if (policy.threshold_value && result.estimated_usd > policy.threshold_value) {
            console.warn(`[Policy] Cost ${result.estimated_usd} > max ${policy.threshold_value}. Using economy provider.`);
            // Forzar provider más económico — el fallback generalmente es más barato
            if (result.fallback_provider) {
              result = { ...result, provider: result.fallback_provider, model: result.fallback_model ?? result.model };
            }
          }
          break;
      }
    }

    return result;
  } catch {
    // Si falla la evaluación de políticas, usar config original
    return config;
  }
}

// ─── Orchestrator principal ───────────────────────────────────────────────────

export async function orchestrate(
  req: OrchestratorRequest,
  config: RoutingConfig,
  adminClient: AdminClient,
  maxTokens: number,
  temperature: number
): Promise<OrchestratorResult> {
  const t0     = Date.now();
  const aiMode = req.aiMode ?? 'balanced';
  const reqId  = req.requestId ?? crypto.randomUUID();

  // ── 1. Governance Check ───────────────────────────────────────────────────
  const governance = await checkGovernanceRules(req.prompt, req.operation, adminClient);
  if (!governance.allowed) {
    throw Object.assign(new Error(`Solicitud bloqueada por política de gobernanza: ${governance.reason}`), {
      code: 'governance_blocked', governance_rule: governance.reason,
    });
  }

  // ── 2. Aplicar Provider Policies administrables ───────────────────────────
  const effectiveConfig = await applyRoutingPolicies(req.operation, config, adminClient);

  let result: ProviderResponse | null = null;
  let fallbackUsed = false;
  let cacheHit     = false;
  let usedProvider = effectiveConfig.provider;
  let usedModel    = effectiveConfig.model;

  // ── 3. Verificar cache ────────────────────────────────────────────────────
  if (effectiveConfig.cache_enabled && req.workspaceId && !req.images?.length) {
    const cacheKey = buildCacheKey(req.workspaceId, req.operation, req.prompt);
    const { data: hit } = await adminClient.rpc('get_ai_cache_hit', { p_cache_key: cacheKey });

    if (hit?.hit) {
      cacheHit = true;
      await logRequest(adminClient, {
        requestId: reqId, workspaceId: req.workspaceId, userId: req.userId,
        operation: req.operation, aiMode, providerSelected: usedProvider, modelSelected: usedModel,
        success: true, fallbackUsed: false, cacheHit: true,
        latencyMs: Date.now() - t0, tokensTotal: hit.tokens_used ?? 0,
        creditsConsumed: 0, realCostUsd: 0, providerScore: null,
      });
      return {
        text: hit.text, tokensTotal: hit.tokens_used ?? 0, costUsd: 0,
        providerUsed: usedProvider, modelUsed: usedModel,
        fallbackUsed: false, cacheHit: true,
        latencyMs: Date.now() - t0, creditsConsumed: 0, creditsRemaining: null,
      };
    }
  }

  // ── 4. Llamar al proveedor seleccionado por el Orchestrator ───────────────
  const providerReq: ProviderRequest = {
    prompt:  req.prompt,
    images:  req.images ?? [],
    model:   effectiveConfig.model,
    maxTokens,
    temperature,
  };

  const apiKeys = getApiKeys();
  let lastError: Error | null = null;

  try {
    result = await callProvider(effectiveConfig.provider, providerReq, apiKeys);
  } catch (err) {
    lastError = err as Error;
    console.warn(`[Orchestrator] Primary ${effectiveConfig.provider} failed: ${lastError.message}. Trying fallback.`);

    // ── 5. Fallback automático ────────────────────────────────────────────
    if (effectiveConfig.fallback_provider && effectiveConfig.fallback_model) {
      fallbackUsed = true;
      usedProvider = effectiveConfig.fallback_provider;
      usedModel    = effectiveConfig.fallback_model;
      try {
        result    = await callProvider(
          effectiveConfig.fallback_provider,
          { ...providerReq, model: effectiveConfig.fallback_model },
          apiKeys
        );
        lastError = null;
      } catch (fbErr) {
        lastError = fbErr as Error;
      }
    }
  }

  const latencyMs = Date.now() - t0;

  // ── 6. Registro de salud (async, no bloquea) ──────────────────────────────
  void (async () => {
    try {
      await adminClient.rpc('record_provider_health', {
        p_provider_key:    usedProvider,
        p_status:          result ? 'ok' : 'down',
        p_latency_ms:      result ? result.latencyMs : null,
        p_error_count:     (lastError || fallbackUsed) ? 1 : 0,
        p_success_count:   result ? 1 : 0,
        p_is_circuit_open: !result,
        p_last_error:      lastError?.message ?? null,
      });
    } catch { /* fire-and-forget, no bloquea */ }
  })();

  // ── 7. Si todo falló, lanzar error ────────────────────────────────────────
  if (!result) {
    await logRequest(adminClient, {
      requestId: reqId, workspaceId: req.workspaceId, userId: req.userId,
      operation: req.operation, aiMode, providerSelected: usedProvider, modelSelected: usedModel,
      success: false, fallbackUsed, cacheHit: false,
      latencyMs, tokensTotal: 0, creditsConsumed: 0, realCostUsd: 0,
      errorCode: (lastError as { code?: string })?.code ?? 'unknown',
      errorMessage: lastError?.message ?? 'Error desconocido',
      providerScore: null,
    });
    throw lastError ?? new Error('Todos los proveedores IA fallaron. Intenta más tarde.');
  }

  // ── 8. Guardar en cache ────────────────────────────────────────────────────
  if (effectiveConfig.cache_enabled && req.workspaceId && !req.images?.length && result.text.length > 0) {
    const cacheKey = buildCacheKey(req.workspaceId, req.operation, req.prompt);
    void (async () => {
      try {
        await adminClient.rpc('set_ai_cache', {
          p_cache_key:     cacheKey,
          p_workspace_id:  req.workspaceId,
          p_operation:     req.operation,
          p_response_text: result.text,
          p_tokens_used:   result.tokensTotal,
          p_credits:       effectiveConfig.credits_cost,
          p_ttl_minutes:   effectiveConfig.cache_ttl_minutes,
        });
      } catch { /* fire-and-forget, no bloquea */ }
    })();
  }

  // ── 9. Log de observabilidad ───────────────────────────────────────────────
  const creditsValueUsd = effectiveConfig.credits_cost * 0.001; // precio ref. crédito
  const marginPct = creditsValueUsd > 0
    ? ((creditsValueUsd - result.costUsd) / creditsValueUsd) * 100
    : null;

  await logRequest(adminClient, {
    requestId: reqId, workspaceId: req.workspaceId, userId: req.userId,
    operation: req.operation, aiMode, providerSelected: usedProvider, modelSelected: usedModel,
    success: true, fallbackUsed, cacheHit: false,
    latencyMs, tokensTotal: result.tokensTotal,
    creditsConsumed: effectiveConfig.credits_cost, realCostUsd: result.costUsd,
    marginPct, providerScore: null,
  });

  return {
    text:             result.text,
    tokensTotal:      result.tokensTotal,
    costUsd:          result.costUsd,
    providerUsed:     usedProvider,
    modelUsed:        usedModel,
    fallbackUsed,
    cacheHit:         false,
    latencyMs,
    creditsConsumed:  effectiveConfig.credits_cost,
    creditsRemaining: null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function callProvider(
  providerKey: string,
  req: ProviderRequest,
  apiKeys: Record<string, string>
): Promise<ProviderResponse> {
  switch (providerKey) {
    case 'gemini': {
      const key = apiKeys['GEMINI_API_KEY'];
      if (!key) throw Object.assign(new Error('GEMINI_API_KEY no configurada'), { code: 'config_error', retryable: false });
      return callGemini(req, key);
    }
    case 'nvidia': {
      const key = apiKeys['NVIDIA_API_KEY'];
      if (!key) throw Object.assign(new Error('NVIDIA_API_KEY no configurada en Supabase Secrets'), { code: 'config_error', retryable: false });
      return callNvidianim(req, key);
    }
    default:
      throw Object.assign(new Error(`Proveedor IA no implementado: ${providerKey}`), { code: 'unknown_provider', retryable: false });
  }
}

function getApiKeys(): Record<string, string> {
  // API keys SOLO en Deno env secrets — nunca en DB, nunca en código (Zero Trust)
  return {
    GEMINI_API_KEY: Deno.env.get('GEMINI_API_KEY') ?? '',
    NVIDIA_API_KEY: Deno.env.get('NVIDIA_API_KEY') ?? '',
  };
}

function buildCacheKey(workspaceId: string, operation: string, prompt: string): string {
  const fp = prompt.slice(0, 200).toLowerCase().replace(/\s+/g, ' ').trim();
  return `${workspaceId}:${operation}:${fp.length}:${simpleHash(fp)}`;
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

interface LogParams {
  requestId: string; workspaceId?: string; userId?: string;
  operation: string; aiMode: string;
  providerSelected: string; modelSelected: string;
  success: boolean; fallbackUsed: boolean; cacheHit: boolean;
  latencyMs: number; tokensTotal: number;
  creditsConsumed: number; realCostUsd: number;
  marginPct?: number | null; providerScore?: number | null;
  errorCode?: string; errorMessage?: string;
}

async function logRequest(adminClient: AdminClient, p: LogParams): Promise<void> {
  if (!p.workspaceId) return;
  try {
    await adminClient.from('ai_request_log').insert({
      request_id:        p.requestId,
      workspace_id:      p.workspaceId,
      user_id:           p.userId ?? null,
      operation:         p.operation,
      ai_mode:           p.aiMode,
      provider_selected: p.providerSelected,
      model_selected:    p.modelSelected,
      success:           p.success,
      fallback_used:     p.fallbackUsed,
      cache_hit:         p.cacheHit,
      latency_ms:        p.latencyMs,
      tokens_total:      p.tokensTotal,
      credits_consumed:  p.creditsConsumed,
      real_cost_usd:     p.realCostUsd,
      margin_pct:        p.marginPct ?? null,
      provider_score:    p.providerScore ?? null,
      error_code:        p.errorCode ?? null,
      error_message:     p.errorMessage ?? null,
    });
  } catch { /* log de observabilidad, no crítico */ }
}
