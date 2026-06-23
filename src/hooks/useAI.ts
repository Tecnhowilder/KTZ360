/**
 * useAI — Sprint 16.3 Performance.
 * Invalida el cache de créditos tras cada llamada exitosa.
 * Elimina necesidad de polling: los créditos se actualizan cuando realmente cambian.
 */
import { useState, useCallback } from 'react';
import { callAistudio, type AIOperation, type AIResponse } from '../services/aiStudio';
import { useInvalidateAICredits } from './useAICredits';

export function useAI() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<Error | null>(null);
  const [credits, setCredits] = useState<{ remaining: number | null; consumed: number }>({
    remaining: null,
    consumed:  0,
  });
  const invalidateCredits = useInvalidateAICredits();

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
      // Invalidar cache de créditos post-llamada (event-driven, no polling)
      invalidateCredits();
      setLoading(false);
      return resp;
    } catch (e) {
      setError(e as Error);
      setLoading(false);
      throw e;
    }
  }, [invalidateCredits]);

  return { generate, loading, error, credits } as const;
}

export default useAI;
