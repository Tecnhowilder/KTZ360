// Hardening Sprint 21 (A-003): CORS restringido al dominio de la app.
// En desarrollo: se permite el origen del request para facilitar local dev.
const origin = Deno.env.get('SITE_URL') ?? 'https://app.shelwi.com';

export const corsHeaders = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-alegra-signature',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
