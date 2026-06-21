import { useState, useCallback } from 'react';
import { callAistudio, type AIOperation, type AIResponse } from '../services/aiStudio';

export function useAI() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<Error | null>(null);
  const [credits, setCredits] = useState<{ remaining: number | null; consumed: number }>({
    remaining: null,
    consumed:  0,
  });

  /**
   * Genera una respuesta IA.
   * @param prompt      Texto del prompt
   * @param operation   Operación a ejecutar (determina el costo en créditos)
   * @param opts        Opciones adicionales (images, max_tokens, temperature)
   */
  const generate = useCallback(async (
    prompt:    string,
    operation: AIOperation,
    opts:      { images?: unknown[]; max_tokens?: number; temperature?: number } = {},
  ): Promise<AIResponse> => {
    setLoading(true);
    setError(null);
    try {
      const resp = await callAistudio({ prompt, operation, ...opts });
      setCredits({
        remaining: resp.credits_remaining,
        consumed:  resp.credits_consumed,
      });
      setLoading(false);
      return resp;
    } catch (e) {
      setError(e as Error);
      setLoading(false);
      throw e;
    }
  }, []);

  return { generate, loading, error, credits } as const;
}

export default useAI;
