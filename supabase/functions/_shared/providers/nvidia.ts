/**
 * NVIDIA NIM Provider Adapter
 * Abstracción sobre la API OpenAI-compatible de NVIDIA Build.
 * El usuario siempre ve "Shelwi AI" — nunca "NVIDIA".
 *
 * NVIDIA Build usa la misma API que OpenAI (chat/completions).
 * Base URL: https://integrate.api.nvidia.com/v1
 * Auth: Bearer NVIDIA_API_KEY
 */
import type { ProviderRequest, ProviderResponse } from './gemini.ts';

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';

// Costo por modelo (USD / 1M tokens) — valores aproximados de NVIDIA Build catalog
const MODEL_COST: Record<string, number> = {
  'nvidia/llama-3.1-nemotron-70b-instruct': 0.20,
  'meta/llama-3.2-11b-vision-instruct':     0.16,
  'meta/llama-3.1-8b-instruct':             0.06,
  'mistralai/mistral-7b-instruct-v0.3':     0.06,
};

export async function callNvidianim(
  req: ProviderRequest,
  apiKey: string,
  timeoutMs = 25_000
): Promise<ProviderResponse> {
  const t0 = Date.now();

  // Construir mensaje: si hay imágenes, usar multimodal message content
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let userContent: any;

  if (req.images?.length) {
    // Formato multimodal OpenAI-compatible
    userContent = [
      { type: 'text', text: req.prompt },
      ...req.images.map((img: string) => ({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${img}` },
      })),
    ];
  } else {
    userContent = req.prompt;
  }

  const body = {
    model:       req.model,
    messages:    [{ role: 'user', content: userContent }],
    max_tokens:  req.maxTokens,
    temperature: req.temperature,
    stream:      false,
  };

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      body:   JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const latencyMs = Date.now() - t0;

  if (!res.ok) {
    const isRetryable = res.status === 429 || res.status >= 500;
    const err = new Error(`NVIDIA HTTP ${res.status}`) as Error & { code: string; retryable: boolean };
    err.code = `nvidia_${res.status}`;
    err.retryable = isRetryable;
    throw err;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();

  const text         = data?.choices?.[0]?.message?.content ?? '';
  const tokensInput  = data?.usage?.prompt_tokens     ?? 0;
  const tokensOutput = data?.usage?.completion_tokens ?? 0;
  const tokensTotal  = data?.usage?.total_tokens      ?? (tokensInput + tokensOutput);

  // Costo estimado
  const ratePerM = MODEL_COST[req.model] ?? 0.15;
  const costUsd  = (tokensTotal / 1_000_000) * ratePerM;

  return { text, tokensInput, tokensOutput, tokensTotal, latencyMs, costUsd, model: req.model, provider: 'nvidia' };
}

export async function pingNvidianim(apiKey: string, model = 'meta/llama-3.1-8b-instruct'): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const t0 = Date.now();
  try {
    const res = await callNvidianim(
      { prompt: 'Responde exactamente: OK', images: [], model, maxTokens: 5, temperature: 0 },
      apiKey,
      8_000
    );
    return { ok: res.text.trim().length > 0, latencyMs: Date.now() - t0 };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - t0, error: (e as Error).message };
  }
}
