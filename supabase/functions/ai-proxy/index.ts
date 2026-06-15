import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';

serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const body = await req.json();
    const prompt = body.prompt;
    const images = body.images;
    const model = body.model || 'gemini-1.5';
    const maxTokens = body.max_tokens ?? 800;
    const temperature = body.temperature ?? 0.2;

    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'prompt is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const geminiUrl = Deno.env.get('GEMINI_API_URL') || `https://api.aistudio.google.com/v1/models/${model}:generate`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        max_tokens: maxTokens,
        temperature,
        images,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      return new Response(JSON.stringify({ error: result, status: response.status }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
