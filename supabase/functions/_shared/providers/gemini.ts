/**
 * Gemini Provider Adapter
 * Abstracción sobre la API de Google Gemini para el AI Orchestrator.
 * El usuario siempre ve "Shelwi AI" — nunca "Gemini".
 */

export interface ProviderRequest {
  prompt:      string;
  images?:     string[];   // base64 JPEG
  model:       string;
  maxTokens:   number;
  temperature: number;
}

export interface ProviderResponse {
  text:        string;
  tokensInput: number;
  tokensOutput: number;
  tokensTotal: number;
  latencyMs:   number;
  costUsd:     number;
  model:       string;
  provider:    string;
}

export interface ProviderError {
  code:     string;
  message:  string;
  retryable: boolean;
}

export async function callGemini(
  req: ProviderRequest,
  apiKey: string,
  timeoutMs = 25_000
): Promise<ProviderResponse> {
  const t0 = Date.now();
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent?key=${apiKey}`;

  // Construir partes: texto + imágenes opcionales
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [{ text: req.prompt }];
  if (req.images?.length) {
    for (const img of req.images) {
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: img } });
    }
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      maxOutputTokens: req.maxTokens,
      temperature: req.temperature,
    },
  };

  const controller  = new AbortController();
  const timeout     = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(geminiUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const latencyMs = Date.now() - t0;

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const isRetryable = res.status === 429 || res.status >= 500;
    const err = new Error(`Gemini HTTP ${res.status}`) as Error & { code: string; retryable: boolean };
    err.code = `gemini_${res.status}`;
    err.retryable = isRetryable;
    throw err;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();

  // Extraer texto — filtra partes "thought" de modelos con thinking mode
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const textParts = (data?.candidates?.[0]?.content?.parts ?? []) as Array<any>;
  const text = textParts
    .filter((p: { thought?: boolean; text?: string }) => !p.thought && typeof p.text === 'string')
    .map((p: { text: string }) => p.text)
    .join('') || '';

  const tokensInput  = data?.usageMetadata?.promptTokenCount     ?? 0;
  const tokensOutput = data?.usageMetadata?.candidatesTokenCount ?? 0;
  const tokensTotal  = data?.usageMetadata?.totalTokenCount      ?? (tokensInput + tokensOutput);

  // Costo estimado: $0.075 USD / 1M tokens (Gemini Flash)
  const costUsd = (tokensTotal / 1_000_000) * 0.075;

  return { text, tokensInput, tokensOutput, tokensTotal, latencyMs, costUsd, model: req.model, provider: 'gemini' };
}

export async function pingGemini(apiKey: string, model = 'gemini-2.5-flash'): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const t0 = Date.now();
  try {
    const res = await callGemini(
      { prompt: 'Responde exactamente: OK', images: [], model, maxTokens: 5, temperature: 0 },
      apiKey,
      8_000
    );
    return { ok: res.text.trim().length > 0, latencyMs: Date.now() - t0 };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - t0, error: (e as Error).message };
  }
}
