/**
 * ai-proxy — Edge Function Shelwi
 * Intermediario para Gemini con control de créditos IA (Zero Trust).
 *
 * FLUJO:
 *   1. Verificar JWT del usuario autenticado
 *   2. Obtener workspace_id del JWT
 *   3. Verificar créditos disponibles en DB (RPC check_ai_credits)
 *   4. Llamar a Gemini API
 *   5. Registrar consumo de créditos (RPC consume_ai_credits)
 *   6. Retornar resultado
 *
 * SEGURIDAD:
 *   - Nunca confiar en el workspace_id enviado por el cliente
 *   - Obtenerlo siempre del JWT verificado
 *   - Control de créditos ejecutado en DB (security definer)
 */
import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function logEdgeError(fnName: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack   = error instanceof Error ? error.stack  : undefined;
  console.error(JSON.stringify({ level: 'error', function: fnName, message, stack, timestamp: new Date().toISOString() }));
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

serve(async (req) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405, headers: CORS_HEADERS,
    });
  }

  try {
    // ── 1. Verificar autenticación ──────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized', code: 'no_token' }), {
        status: 401, headers: CORS_HEADERS,
      });
    }

    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verificar JWT con el token del usuario
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'unauthorized', code: 'invalid_token' }), {
        status: 401, headers: CORS_HEADERS,
      });
    }

    // ── 2. Obtener workspace_id desde DB (nunca del cliente) ────────────────
    const adminClient = createClient(supabaseUrl, supabaseKey);

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('workspace_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.workspace_id) {
      return new Response(JSON.stringify({ error: 'workspace_not_found' }), {
        status: 403, headers: CORS_HEADERS,
      });
    }

    const workspaceId = profile.workspace_id;

    // ── 3. Parsear body ─────────────────────────────────────────────────────
    const body        = await req.json();
    const prompt      = body.prompt;
    const images      = body.images;
    const operation   = body.operation ?? 'generate_description';
    const maxTokens   = body.max_tokens ?? 800;
    const temperature = body.temperature ?? 0.2;

    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'prompt is required' }), {
        status: 400, headers: CORS_HEADERS,
      });
    }

    // ── 4a. Rate limit: max 100 llamadas/hora por workspace ─────────────────
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const { count: callsLastHour } = await adminClient
      .from('ai_usage')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .gte('created_at', oneHourAgo);

    if ((callsLastHour ?? 0) >= 100) {
      // Registrar evento de rate limit
      adminClient.from('audit_log').insert({
        workspace_id: workspaceId,
        user_id:      user.id,
        action:       'ai_rate_limit_exceeded',
        entity_type:  'security',
        metadata:     { calls_last_hour: callsLastHour },
      }).then(() => {}).catch(() => {});

      return new Response(JSON.stringify({
        error:   'rate_limit_exceeded',
        message: 'Has superado el límite de 100 llamadas IA por hora. Intenta más tarde.',
        retry_after_minutes: 60,
      }), { status: 429, headers: CORS_HEADERS });
    }

    // ── 4b. Obtener costo real de la operación desde DB ──────────────────────
    const { data: opCost } = await adminClient
      .from('ai_operation_costs')
      .select('credits_cost')
      .eq('operation', operation)
      .eq('active', true)
      .maybeSingle();

    const creditsNeeded = opCost?.credits_cost ?? 1;

    // ── 4c. Verificar créditos IA disponibles ────────────────────────────────
    const { data: creditCheck, error: creditErr } = await adminClient
      .rpc('check_ai_credits', {
        p_workspace_id:   workspaceId,
        p_credits_needed: creditsNeeded,
      });

    if (creditErr) {
      console.error('check_ai_credits error:', creditErr);
      // No bloquear por error interno — registrar y continuar
    } else if (creditCheck && !creditCheck.allowed) {
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
          message: `Has agotado tus créditos IA de este mes. Se reinician el 1 del próximo mes.`,
          credits_used:      creditCheck.credits_used,
          credits_max:       creditCheck.credits_max,
          credits_remaining: 0,
        }), { status: 429, headers: CORS_HEADERS });
      }
    }

    // ── 5. Llamar a Gemini API ──────────────────────────────────────────────
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not configured' }), {
        status: 500, headers: CORS_HEADERS,
      });
    }

    // gemini-2.5-flash: usa extracción multi-part para manejar el thinking mode
    const modelId   = body.model ?? 'gemini-2.5-flash';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    const geminiBody: Record<string, unknown> = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
      },
    };

    // Agregar imágenes si las hay
    if (images?.length) {
      (geminiBody.contents as unknown[])[0] = {
        parts: [
          { text: prompt },
          ...images.map((img: string) => ({
            inlineData: { mimeType: 'image/jpeg', data: img },
          })),
        ],
      };
    }

    const geminiStartMs = Date.now();
    let geminiRes: Response;
    try {
      geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      });
    } catch (fetchErr) {
      console.error('Gemini fetch error:', String(fetchErr));
      return new Response(JSON.stringify({
        error: 'gemini_network_error',
        message: 'No se pudo conectar con Gemini API.',
      }), { status: 502, headers: CORS_HEADERS });
    }
    const executionTimeMs = Date.now() - geminiStartMs;

    let geminiData: unknown;
    try {
      geminiData = await geminiRes.json();
    } catch {
      const raw = await geminiRes.text().catch(() => '');
      console.error('Gemini non-JSON response:', geminiRes.status, raw.slice(0, 200));
      return new Response(JSON.stringify({
        error: 'gemini_parse_error',
        message: `Gemini devolvió una respuesta inesperada (HTTP ${geminiRes.status}).`,
      }), { status: 502, headers: CORS_HEADERS });
    }

    if (!geminiRes.ok) {
      console.error('Gemini API error:', geminiData);
      return new Response(JSON.stringify({
        error: 'gemini_error',
        details: geminiData,
      }), { status: 502, headers: CORS_HEADERS });
    }

    // Extraer tokens usados de la respuesta de Gemini
    const tokensUsed = (geminiData.usageMetadata?.totalTokenCount ?? 0) as number;
    const estimatedCostUSD = (tokensUsed / 1_000_000) * 0.15; // $0.15 USD/1M tokens entrada

    // ── 6. Registrar consumo de créditos — Sprint 24: incluye model + exec_time ─
    const { data: consumeResult, error: consumeErr } = await adminClient
      .rpc('consume_ai_credits', {
        p_workspace_id:   workspaceId,
        p_operation:      operation,
        p_tokens_used:    tokensUsed,
        p_estimated_cost: estimatedCostUSD,
        p_model:          modelId,         // Sprint 24: modelo real usado
        p_exec_ms:        executionTimeMs, // Sprint 24: tiempo de respuesta Gemini
      });

    if (consumeErr) {
      console.error('consume_ai_credits error:', consumeErr);
      // No bloquear la respuesta por error de registro
    }

    // Extraer texto generado — combinar partes reales (excluye partes thought de modelos con thinking)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts = (geminiData.candidates?.[0]?.content?.parts ?? []) as Array<any>;
    const text = parts
      .filter((p: any) => !p.thought && typeof p.text === 'string')
      .map((p: any) => p.text as string)
      .join('') || '';

    return new Response(JSON.stringify({
      text,
      tokens_used:       tokensUsed,
      credits_consumed:  consumeResult?.credits_consumed ?? 1,
      credits_remaining: consumeResult?.credits_remaining ?? null,
    }), { status: 200, headers: CORS_HEADERS });

  } catch (error) {
    logEdgeError('ai-proxy', error);
    const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: CORS_HEADERS,
    });
  }
});
