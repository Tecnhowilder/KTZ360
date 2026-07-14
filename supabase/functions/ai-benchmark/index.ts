/**
 * ai-benchmark — Motor de Benchmark Automatizado
 *
 * Ejecuta prompts de referencia contra todos los proveedores habilitados,
 * registra los resultados en ai_benchmark_results, y devuelve el resumen.
 *
 * Uso: POST /ai-benchmark  { body: { operations?: string[] } }
 *      (sin body = benchmarkea todas las operaciones configuradas)
 *
 * Programar via Cron de Supabase para ejecución nocturna.
 * Zero Trust: API keys solo desde Deno.env (Supabase Secrets).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callGemini }    from '../_shared/providers/gemini.ts';
import { callNvidianim } from '../_shared/providers/nvidia.ts';
import type { ProviderRequest } from '../_shared/providers/gemini.ts';

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_API_KEY        = Deno.env.get('GEMINI_API_KEY') ?? '';
const NVIDIA_API_KEY        = Deno.env.get('NVIDIA_API_KEY') ?? '';

// ─── Prompts de referencia por tipo de operación ─────────────────────────────

const BENCHMARK_PROMPTS: Record<string, string> = {
  text_general:   'Explica brevemente qué es un sistema de gestión de cotizaciones. Responde en español. Máximo 3 párrafos.',
  json_mode:      'Genera un objeto JSON con los campos: name, price, quantity, unit, description. Ejemplo para un producto de ferretería. Solo el JSON, sin markdown.',
  reasoning:      'Un cliente tiene una cotización de 5 ítems. Los primeros 3 ítems tienen descuento del 10%, los últimos 2 no tienen descuento. Los precios son: $100, $200, $300, $400, $500. ¿Cuál es el total final? Muestra el razonamiento paso a paso.',
  long_context:   'Eres un asistente de negocios. Proporciona 10 consejos para mejorar la gestión de cotizaciones en una empresa de construcción. Sé específico y práctico.',
};

// ─── Casos de prueba por proveedor/modelo ────────────────────────────────────

interface BenchmarkCase {
  provider_key: string;
  model_id:     string;
  api_key:      string;
  operations:   string[];
}

async function loadBenchmarkCases(
  adminClient: ReturnType<typeof createClient>,
  filterOps?: string[]
): Promise<BenchmarkCase[]> {
  const { data: providers } = await adminClient
    .from('ai_providers')
    .select('provider_key')
    .eq('enabled', true);

  const { data: models } = await adminClient
    .from('ai_provider_models')
    .select('provider_key, model_id')
    .eq('enabled', true)
    .in('provider_key', (providers ?? []).map(p => p.provider_key));

  if (!models?.length) return [];

  const cases: BenchmarkCase[] = [];
  const ops = filterOps ?? Object.keys(BENCHMARK_PROMPTS);

  for (const model of models) {
    const key = model.provider_key === 'gemini'  ? GEMINI_API_KEY
              : model.provider_key === 'nvidia'   ? NVIDIA_API_KEY
              : '';

    if (!key) continue; // sin API key configurada → skip

    cases.push({
      provider_key: model.provider_key,
      model_id:     model.model_id,
      api_key:      key,
      operations:   ops,
    });
  }

  return cases;
}

// ─── Evaluar calidad de respuesta (heurística simple) ────────────────────────

function scoreResponse(text: string, operation: string): number {
  if (!text || text.length < 10) return 0;

  let score = 50; // base

  // Longitud razonable
  if (text.length > 100)  score += 10;
  if (text.length > 300)  score += 10;

  // JSON valido para json_mode
  if (operation === 'json_mode') {
    try {
      const jsonText = text.replace(/```json\n?/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(jsonText);
      if (parsed && typeof parsed === 'object') score += 30;
      if (parsed.name && parsed.price !== undefined) score = Math.min(100, score + 10);
    } catch { score -= 20; }
  }

  // Razonamiento: buscar respuesta numérica
  if (operation === 'reasoning') {
    if (/\d+\.?\d*/.test(text)) score += 15;
    if (/total|suma|resultado/i.test(text)) score += 15;
  }

  // En español
  if (/\s(un|una|los|las|el|la|de|en|que|con|para)\s/i.test(text)) score += 10;

  return Math.min(100, Math.max(0, score));
}

// ─── Ejecutar benchmark para un caso ─────────────────────────────────────────

async function runBenchmarkCase(
  bc: BenchmarkCase,
  adminClient: ReturnType<typeof createClient>
): Promise<void> {
  for (const operation of bc.operations) {
    const prompt = BENCHMARK_PROMPTS[operation];
    if (!prompt) continue;

    const req: ProviderRequest = {
      prompt,
      model:     bc.model_id,
      maxTokens: 512,
      temperature: 0.3,
    };

    const t0 = Date.now();
    let success     = false;
    let qualityScore = 0;
    let latencyMs   = 0;
    let costUsd     = 0;
    let tokensTotal = 0;
    let errorMsg    = '';

    try {
      const res = bc.provider_key === 'gemini'
        ? await callGemini(req, bc.api_key, 30_000)
        : await callNvidianim(req, bc.api_key, 30_000);

      latencyMs    = Date.now() - t0;
      success      = true;
      qualityScore = scoreResponse(res.text, operation);
      costUsd      = res.costUsd;
      tokensTotal  = res.tokensTotal;

    } catch (err) {
      latencyMs = Date.now() - t0;
      errorMsg  = (err as Error).message ?? 'error desconocido';
      console.error(`[Benchmark] ${bc.provider_key}/${bc.model_id} ${operation}: ${errorMsg}`);
    }

    // Registrar resultado en DB (no bloquea el loop)
    await adminClient.from('ai_benchmark_results').insert({
      provider_key:  bc.provider_key,
      model_id:      bc.model_id,
      operation,
      prompt_tokens:  0,
      output_tokens:  tokensTotal,
      latency_ms:     latencyMs,
      quality_score:  qualityScore,
      cost_usd:       costUsd,
      success,
      error_message:  errorMsg || null,
      test_type:      'automated',
    }).catch(e => console.error('[Benchmark] insert error:', e.message));
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  let filterOps: string[] | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.operations?.length) filterOps = body.operations;
  } catch { /* body vacío — ok */ }

  const cases = await loadBenchmarkCases(adminClient, filterOps);

  if (!cases.length) {
    return new Response(JSON.stringify({ ok: false, error: 'No hay proveedores habilitados con API key configurada' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Ejecutar todos los casos secuencialmente para no sobrecargar APIs
  const started_at = new Date().toISOString();
  let total_runs   = 0;
  const results_by_provider: Record<string, number> = {};

  for (const bc of cases) {
    await runBenchmarkCase(bc, adminClient);
    const runCount = bc.operations.length;
    total_runs += runCount;
    results_by_provider[`${bc.provider_key}/${bc.model_id}`] = (results_by_provider[`${bc.provider_key}/${bc.model_id}`] ?? 0) + runCount;
  }

  const finished_at = new Date().toISOString();

  return new Response(
    JSON.stringify({
      ok:          true,
      started_at,
      finished_at,
      total_runs,
      providers_tested: cases.map(c => c.provider_key).filter((v, i, a) => a.indexOf(v) === i),
      results_by_provider,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
