import { useState, useCallback } from 'react';
import { callAistudio } from '../services/aiStudio';

export function useAI() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const generate = useCallback(async (prompt: string, opts = {}) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await callAistudio({ prompt, ...opts });
      setLoading(false);
      return resp;
    } catch (e) {
      setError(e as Error);
      setLoading(false);
      throw e;
    }
  }, []);

  return { generate, loading, error } as const;
}

export default useAI;
