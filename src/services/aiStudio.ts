import { supabase } from '../lib/supabaseClient';

export type AIRequest = {
  prompt: string;
  images?: unknown[];
  model?: string;
  max_tokens?: number;
  temperature?: number;
  [k: string]: any;
};

export async function callAistudio(req: AIRequest) {
  const { data, error } = await supabase.functions.invoke('ai-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  if (error) {
    throw error;
  }

  return data;
}

export default { callAistudio };
