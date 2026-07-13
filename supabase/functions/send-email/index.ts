import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { templates, type TemplateId } from './templates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// Sustituye {{variable}} por el valor correspondiente de `vars`.
function renderVars(str: string, vars: Record<string, unknown>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

// Enriquece `data` con variables derivadas (links pre-construidos, appName).
// La EF recibe appUrl + token por separado; los callers no necesitan cambiar.
function enrichData(data: Record<string, unknown>): Record<string, unknown> {
  const appUrl = String(data.appUrl ?? '');
  const token  = String(data.token  ?? '');
  return {
    appName: 'Shelwi',
    ...data,
    ...(appUrl ? {
      inviteLink:    `${appUrl}/invite/${token}`,
      verifyLink:    `${appUrl}/verificar/${token}`,
      resetLink:     `${appUrl}/restablecer/${token}`,
      dashboardLink: `${appUrl}/app/dashboard`,
      billingLink:   `${appUrl}/app/planes`,
    } : {}),
  };
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

    // Validar que el template existe (hardcoded o en DB)
    if (!template) {
      return new Response(JSON.stringify({ error: 'template is required' }), {
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

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase       = createClient(supabaseUrl, serviceRoleKey);

    // ─── Leer configuración Resend ─────────────────────────────────────────────
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

    // ─── Enriquecer data con variables derivadas ───────────────────────────────
    const enriched = enrichData(data ?? {});

    // ─── Resolver template: DB primero, fallback a hardcoded ──────────────────
    let subject: string;
    let html: string;

    const { data: dbTemplate } = await supabase
      .from('email_templates')
      .select('subject, body_html, is_active')
      .eq('key', template)
      .maybeSingle();

    if (dbTemplate?.is_active) {
      // Template en DB y activo: renderizar con sustitución de variables
      subject = renderVars(String(dbTemplate.subject), enriched);
      html    = renderVars(String(dbTemplate.body_html), enriched);
    } else if (templates[template as TemplateId]) {
      // Fallback: template hardcodeado (compatibilidad durante transición)
      const rendered = templates[template as TemplateId](enriched);
      subject = rendered.subject;
      html    = rendered.html;
    } else {
      return new Response(JSON.stringify({ error: `unknown_template: ${template}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── Enviar vía Resend ─────────────────────────────────────────────────────
    const fromName  = config.from_name  || 'Shelwi';
    const fromEmail = config.from_email || `no-reply@${config.domain || 'example.com'}`;

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.api_key}`,
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to:   [to],
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
