import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { templates, type TemplateId } from './templates.ts';

interface SendEmailBody {
  template: TemplateId;
  to: string;
  data?: Record<string, unknown>;
}

interface ResendConfig {
  api_key?: string;
  domain?: string;
  from_email?: string;
  from_name?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as SendEmailBody;
    const { template, to, data } = body;

    if (!template || !templates[template]) {
      return new Response(JSON.stringify({ error: `unknown_template: ${template}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!to || typeof to !== 'string') {
      return new Response(JSON.stringify({ error: 'to is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: configRow, error: configError } = await supabase
      .from('system_configuration')
      .select('value')
      .eq('key', 'resend')
      .maybeSingle();

    if (configError) throw configError;

    const config = (configRow?.value ?? {}) as ResendConfig;

    if (!config.api_key) {
      return new Response(
        JSON.stringify({ error: 'resend_not_configured', message: 'Resend no está configurado en system_configuration.' }),
        { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { subject, html } = templates[template](data ?? {});

    const fromName = config.from_name || 'Shelwi';
    const fromEmail = config.from_email || `no-reply@${config.domain || 'example.com'}`;

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.api_key}`,
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject,
        html,
      }),
    });

    const resendResult = await resendResponse.json();

    if (!resendResponse.ok) {
      return new Response(JSON.stringify({ error: 'resend_error', detail: resendResult }), {
        status: resendResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: resendResult.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
