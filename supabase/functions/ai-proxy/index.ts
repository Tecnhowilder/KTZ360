/**
 * ai-proxy — Edge Function Shelwi (AI Orchestrator Edition)
 *
 * API SURFACE IDÉNTICA — Backward compatible al 100%.
 * El frontend sigue llamando: supabase.functions.invoke('ai-proxy', ...)
 *
 * CAMBIOS INTERNOS:
 *   - Ruta hacia AI Orchestrator (Gemini + NVIDIA NIM + futuros proveedores)
 *   - Proveedor seleccionado dinámicamente (scoring + fallback)
 *   - Cache inteligente (si la operación lo permite)
 *   - Observabilidad completa en ai_request_log
 *   - Límites por usuario/rol (check_ai_user_budget)
 *   - Salud de proveedor registrada automáticamente
 *
 * SEGURIDAD (Zero Trust — sin cambios):
 *   - JWT verificado en cada request
 *   - workspace_id del JWT, nunca del cliente
 *   - ai_mode y model del cliente son hints, la decisión final es del servidor
 *   - Tokens, temperatura y modelo decididos por servidor (ai_operation_costs)
 */
import { serve }          from 'https://deno.land/std@0.201.0/http/server.ts';
import { createClient }   from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger }   from '../_shared/logger.ts';
import { orchestrate }    from '../_shared/orchestrator.ts';
import type { OrchestratorRequest, RoutingConfig } from '../_shared/orchestrator.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id',
  'Content-Type': 'application/json',
};

function corsHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { ...CORS_HEADERS, ...extra };
}

const _supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
const _supabaseKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const _supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
const adminClient   = createClient(_supabaseUrl, _supabaseKey);

serve(async (req) => {
  const reqStart = Date.now();
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const log = createLogger('ai-proxy', requestId);

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405, headers: corsHeaders(log.responseHeaders()),
    });
  }

  try {
    // ── 1. Autenticar ────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized', code: 'no_token' }), {
        status: 401, headers: corsHeaders(log.responseHeaders()),
      });
    }

    const userClient = createClient(_supabaseUrl, _supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'unauthorized', code: 'invalid_token' }), {
        status: 401, headers: corsHeaders(log.responseHeaders()),
      });
    }

    // ── 2. workspace_id del DB — nunca del cliente ───────────────────────────
    const { data: profile, error: profileError } = await adminClient
      .from('profiles').select('workspace_id').eq('id', user.id).single();

    if (profileError || !profile?.workspace_id) {
      return new Response(JSON.stringify({ error: 'workspace_not_found' }), {
        status: 403, headers: corsHeaders(log.responseHeaders()),
      });
    }
    const workspaceId = profile.workspace_id as string;

    // ── 3. Parsear body ──────────────────────────────────────────────────────
    const body      = await req.json();
    const prompt    = body.prompt as string;
    const images    = body.images as string[] | undefined;
    const operation = (body.operation as string) ?? 'generate_description';
    // ai_mode: hint del cliente — el Orchestrator puede ignorarlo según configuración
    const aiMode    = (['balanced','quality','economy','auto'].includes(body.ai_mode))
      ? body.ai_mode as 'balanced' | 'quality' | 'economy' | 'auto'
      : 'balanced';

    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'prompt is required' }), {
        status: 400, headers: corsHeaders(log.responseHeaders()),
      });
    }

    log.info('request_received', { workspace_id: workspaceId, operation, ai_mode: aiMode });

    // ── 4a. Rate limit: 100 llamadas/hora por workspace ──────────────────────
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const { count: callsLastHour } = await adminClient
      .from('ai_usage').select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).gte('created_at', oneHourAgo);

    if ((callsLastHour ?? 0) >= 100) {
      log.warn('rate_limit_exceeded', { workspace_id: workspaceId });
      return new Response(JSON.stringify({
        error: 'rate_limit_exceeded',
        message: 'Has superado el límite de 100 llamadas IA por hora. Intenta más tarde.',
        retry_after_minutes: 60,
      }), { status: 429, headers: corsHeaders(log.responseHeaders()) });
    }

    // ── 4b. Obtener configuración del Orchestrator ───────────────────────────
    const { data: routingCfg, error: routingErr } = await adminClient
      .rpc('get_ai_routing_config', { p_operation: operation, p_ai_mode: aiMode });

    // Config del servidor para tokens y temperatura (Zero Trust: ignora valores del cliente)
    const { data: opCost } = await adminClient
      .from('ai_operation_costs')
      .select('credits_cost, max_tokens, temperature')
      .eq('operation', operation).eq('active', true).maybeSingle();

    const maxTokens   = (opCost?.max_tokens   as number | null) ?? 800;
    const temperature = (opCost?.temperature  as number | null) ?? 0.2;
    const creditsNeeded = (opCost?.credits_cost as number | null) ?? 3;

    // Routing config: usar resultado de RPC o defaults seguros
    const config: RoutingConfig = routingErr || !routingCfg
      ? {
          operation, ai_mode: aiMode,
          provider: 'gemini', model: 'gemini-2.5-flash',
          fallback_provider: null, fallback_model: null,
          cache_enabled: false, cache_ttl_minutes: 0,
          requires_vision: (images?.length ?? 0) > 0,
          credits_cost: creditsNeeded,
          estimated_usd: 0.001, max_allowed_usd: 0.01, min_margin_pct: 40,
        }
      : { ...routingCfg as RoutingConfig, credits_cost: creditsNeeded };

    // ── 4c. Verificar créditos del workspace ─────────────────────────────────
    const { data: creditCheck, error: creditErr } = await adminClient
      .rpc('check_ai_credits', { p_workspace_id: workspaceId, p_credits_needed: creditsNeeded });

    if (!creditErr && creditCheck && !creditCheck.allowed) {
      const reason = creditCheck.reason;
      if (reason === 'ai_not_included') {
        return new Response(JSON.stringify({
          error: 'ai_not_included',
          message: 'La IA no está incluida en tu plan actual. Actualiza a PRO o PREMIUM.',
          credits_remaining: 0,
        }), { status: 403, headers: CORS_HEADERS });
      }
      if (reason === 'limit_reached') {
        return new Response(JSON.stringify({
          error: 'ai_credits_exhausted',
          message: 'Has agotado tus créditos IA de este mes. Se reinician el 1 del próximo mes.',
          credits_used: creditCheck.credits_used,
          credits_max:  creditCheck.credits_max,
          credits_remaining: 0,
        }), { status: 429, headers: CORS_HEADERS });
      }
    }

    // ── 4d. Verificar presupuesto por usuario (si tiene límites configurados) ─
    const { data: userBudget } = await adminClient
      .rpc('check_ai_user_budget', {
        p_workspace_id:   workspaceId,
        p_user_id:        user.id,
        p_credits_needed: creditsNeeded,
      });

    if (userBudget && !userBudget.allowed) {
      const reasonMap: Record<string, string> = {
        per_op_exceeded:          `Esta operación supera tu límite por operación (${userBudget.per_op_max} créditos).`,
        daily_limit_reached:      `Has alcanzado tu límite diario de créditos IA (${userBudget.daily_remaining ?? 0} restantes hoy).`,
        user_monthly_limit_reached: `Has alcanzado tu límite mensual de créditos IA.`,
      };
      return new Response(JSON.stringify({
        error: 'user_budget_exceeded',
        message: reasonMap[userBudget.reason] ?? 'Límite de créditos IA alcanzado.',
        reason:  userBudget.reason,
      }), { status: 429, headers: corsHeaders(log.responseHeaders()) });
    }

    // ── 5. Orchestrator: seleccionar proveedor y ejecutar ────────────────────
    const orchReq: OrchestratorRequest = {
      prompt, images, operation, aiMode,
      requestId, workspaceId, userId: user.id,
    };

    const orchResult = await orchestrate(orchReq, config, adminClient, maxTokens, temperature);

    // ── 6. Registrar consumo de créditos ─────────────────────────────────────
    const { data: consumeResult, error: consumeErr } = await adminClient
      .rpc('consume_ai_credits', {
        p_workspace_id:   workspaceId,
        p_operation:      operation,
        p_tokens_used:    orchResult.tokensTotal,
        p_estimated_cost: orchResult.costUsd,
        p_model:          orchResult.modelUsed,
        p_exec_ms:        orchResult.latencyMs,
      });

    if (consumeErr) console.error('consume_ai_credits error:', consumeErr);

    const totalMs = Date.now() - reqStart;
    log.finish(200, totalMs, {
      workspace_id:  workspaceId,
      operation,
      provider_used: orchResult.providerUsed,
      fallback:      String(orchResult.fallbackUsed),
      cache_hit:     String(orchResult.cacheHit),
      tokens:        String(orchResult.tokensTotal),
    });

    // Respuesta idéntica a la versión anterior (backward compatible)
    return new Response(JSON.stringify({
      text:              orchResult.text,
      tokens_used:       orchResult.tokensTotal,
      credits_consumed:  consumeResult?.credits_consumed ?? creditsNeeded,
      credits_remaining: consumeResult?.credits_remaining ?? null,
      // Campos adicionales (no rompen nada — clientes anteriores los ignoran)
      provider_used:     orchResult.providerUsed,
      fallback_used:     orchResult.fallbackUsed,
      cache_hit:         orchResult.cacheHit,
      latency_ms:        orchResult.latencyMs,
    }), { status: 200, headers: corsHeaders(log.responseHeaders()) });

  } catch (error) {
    const totalMs = Date.now() - reqStart;
    log.error('unhandled_error', error);
    log.finish(500, totalMs);
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);

    // Distinguir errores de configuración de proveedor
    if (msg.includes('NVIDIA_API_KEY no configurada')) {
      return new Response(JSON.stringify({
        error:   'provider_not_configured',
        message: 'El proveedor de IA alternativo no está configurado. Usa el proveedor principal.',
      }), { status: 503, headers: corsHeaders() });
    }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: corsHeaders(log.responseHeaders()),
    });
  }
});
