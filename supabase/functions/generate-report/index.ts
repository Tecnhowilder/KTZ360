/**
 * generate-report — Edge Function Shelwi Sprint 5
 *
 * Genera exportaciones de reportes en CSV y PDF.
 * ZERO TRUST: JWT verificado, workspace_id obtenido del DB, plan validado.
 *
 * NOTA: Usa Deno.serve() nativo (Deno 1.35+) — sin imports de deno.land/std.
 * createClient se importa vía esm.sh (ya cacheado en el runtime de Supabase).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}
const toRow = (r: unknown[]) => r.map(esc).join(',');
const toCSV = (headers: string[], rows: unknown[][]) =>
  [toRow(headers), ...rows.map(toRow)].join('\n');

// ─── Generadores CSV por tipo ─────────────────────────────────────────────────

function summaryCSV(d: Record<string, unknown>): string {
  const k = d['kpis'] as Record<string, unknown>;
  const p = d['period'] as Record<string, unknown>;
  const period = `${p?.['start']} → ${p?.['end']}`;
  return toCSV(
    ['Período', 'Métrica', 'Valor'],
    [
      [period, 'Cotizaciones creadas',        k?.['cotizaciones_creadas']],
      [period, 'Valor cotizado (COP)',         k?.['valor_cotizado']],
      [period, 'Cotizaciones enviadas',        k?.['cotizaciones_enviadas']],
      [period, 'Cotizaciones aprobadas',       k?.['cotizaciones_aprobadas']],
      [period, 'Valor aprobado (COP)',         k?.['valor_aprobado']],
      [period, 'Cotizaciones rechazadas',      k?.['cotizaciones_rechazadas']],
      [period, 'Cotizaciones vencidas',        k?.['cotizaciones_vencidas']],
      [period, 'Tasa de conversión (%)',       k?.['tasa_conversion']],
      [period, 'Tiempo promedio cierre (días)',k?.['tiempo_promedio_cierre_dias']],
      [period, 'Con seguimiento',              k?.['con_seguimiento']],
    ]
  );
}

function funnelCSV(d: Record<string, unknown>): string {
  const stages = (d['stages'] ?? []) as Record<string, unknown>[];
  return toCSV(
    ['Estado', 'Cantidad', 'Valor COP', 'Conversión desde total (%)'],
    stages.map(s => [s['label'], s['count'], s['valor'], s['conversion_from_total']])
  );
}

function servicesCSV(d: Record<string, unknown>): string {
  const svcs = (d['services'] ?? []) as Record<string, unknown>[];
  return toCSV(
    ['Servicio', 'Cotizado (veces)', 'Valor cotizado COP', 'Vendido (veces)', 'Valor vendido COP', 'Conversión (%)'],
    svcs.map(s => [s['service_name'], s['veces_cotizado'], s['valor_cotizado'], s['veces_vendido'], s['valor_vendido'], s['tasa_conversion']])
  );
}

function clientsCSV(d: Record<string, unknown>): string {
  const top = (d['top_clientes'] ?? []) as Record<string, unknown>[];
  return toCSV(
    ['Cliente', 'Cotizaciones', 'Valor cotizado COP', 'Aprobadas', 'Valor aprobado COP', 'Conversión (%)'],
    top.map(c => [c['name'], c['cotizaciones'], c['valor_cotizado'], c['aprobadas'], c['valor_aprobado'], c['tasa_conversion']])
  );
}

// ─── Generador HTML para PDF ──────────────────────────────────────────────────

function buildHTML(type: string, data: Record<string, unknown>, company: string, periodLabel: string): string {
  const now = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  const titles: Record<string, string> = {
    summary: 'Resumen General', funnel: 'Embudo Comercial',
    services: 'Servicios', clients: 'Clientes', executive: 'Dashboard Ejecutivo',
  };

  let body = '';

  if (type === 'summary') {
    const k = data['kpis'] as Record<string, unknown>;
    body = `<div class="grid">
      <div class="kpi"><div class="lbl">Valor cotizado</div><div class="val blue">$ ${Number(k?.['valor_cotizado'] ?? 0).toLocaleString('es-CO')}</div></div>
      <div class="kpi"><div class="lbl">Valor aprobado</div><div class="val green">$ ${Number(k?.['valor_aprobado'] ?? 0).toLocaleString('es-CO')}</div></div>
      <div class="kpi"><div class="lbl">Cotizaciones</div><div class="val">${k?.['cotizaciones_creadas']}</div></div>
      <div class="kpi"><div class="lbl">Aprobadas</div><div class="val green">${k?.['cotizaciones_aprobadas']}</div></div>
      <div class="kpi"><div class="lbl">Rechazadas</div><div class="val red">${k?.['cotizaciones_rechazadas']}</div></div>
      <div class="kpi"><div class="lbl">Tasa conversión</div><div class="val blue">${k?.['tasa_conversion']}%</div></div>
      <div class="kpi"><div class="lbl">Cierre promedio</div><div class="val">${k?.['tiempo_promedio_cierre_dias']} días</div></div>
      <div class="kpi"><div class="lbl">Vistas por cliente</div><div class="val">${k?.['cotizaciones_vistas']}</div></div>
    </div>`;
  } else if (type === 'funnel') {
    const stages = (data['stages'] ?? []) as Record<string, unknown>[];
    body = `<table><thead><tr><th>Estado</th><th>Cantidad</th><th>Valor COP</th><th>Conversión</th></tr></thead><tbody>
      ${stages.map(s => `<tr><td>${s['label']}</td><td>${s['count']}</td><td>$ ${Number(s['valor'] ?? 0).toLocaleString('es-CO')}</td><td>${s['conversion_from_total']}%</td></tr>`).join('')}
    </tbody></table>`;
  } else if (type === 'services') {
    const svcs = (data['services'] ?? []) as Record<string, unknown>[];
    body = `<table><thead><tr><th>Servicio</th><th>Cotizado</th><th>Vendido</th><th>Conversión</th></tr></thead><tbody>
      ${svcs.map(s => `<tr><td>${s['service_name']}</td><td>${s['veces_cotizado']}</td><td>${s['veces_vendido']}</td><td>${s['tasa_conversion']}%</td></tr>`).join('')}
    </tbody></table>`;
  } else if (type === 'clients') {
    const top = (data['top_clientes'] ?? []) as Record<string, unknown>[];
    body = `<table><thead><tr><th>Cliente</th><th>Cotizaciones</th><th>Aprobadas</th><th>Valor aprobado</th><th>Conversión</th></tr></thead><tbody>
      ${top.map(c => `<tr><td>${c['name']}</td><td>${c['cotizaciones']}</td><td>${c['aprobadas']}</td><td>$ ${Number(c['valor_aprobado'] ?? 0).toLocaleString('es-CO')}</td><td>${c['tasa_conversion']}%</td></tr>`).join('')}
    </tbody></table>`;
  }

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Shelwi — ${titles[type] ?? 'Reporte'}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
body{background:#fff;color:#0F172A;padding:32px;font-size:13px}
header{border-bottom:2px solid #2563EB;padding-bottom:16px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-end}
h1{font-size:22px;font-weight:800}
.meta{font-size:11px;color:#64748B;text-align:right}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
.kpi{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:14px}
.lbl{font-size:10px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
.val{font-size:20px;font-weight:800;color:#0F172A}
.val.green{color:#16A34A}.val.red{color:#DC2626}.val.blue{color:#2563EB}
table{width:100%;border-collapse:collapse;font-size:12px}
thead tr{background:#F1F5F9}
th{text-align:left;padding:10px 12px;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.4px}
td{padding:10px 12px;border-bottom:1px solid #F1F5F9}
footer{margin-top:32px;padding-top:12px;border-top:1px solid #E2E8F0;font-size:10px;color:#94A3B8;display:flex;justify-content:space-between}
</style></head><body>
<header>
  <div>
    <div style="font-size:11px;color:#64748B;font-weight:700;margin-bottom:4px">SHELWI · REPORTES</div>
    <h1>${titles[type] ?? 'Reporte'}</h1>
    <div style="font-size:13px;color:#374151;margin-top:4px">${company}</div>
  </div>
  <div class="meta"><div>Generado: ${now}</div><div style="margin-top:4px;font-weight:700;color:#2563EB">${periodLabel}</div></div>
</header>
${body}
<footer><span>Shelwi · Reportes automatizados</span><span>${now}</span></footer>
</body></html>`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...CORS, 'Content-Type': 'text/plain' } });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    // 1. Verificar JWT
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const url     = Deno.env.get('SUPABASE_URL')!;
    const svcKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verificar sesión del usuario
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'invalid_token' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // 2. ZERO TRUST: workspace_id desde DB (nunca del cliente)
    const admin = createClient(url, svcKey);
    const { data: profile, error: profErr } = await admin
      .from('profiles').select('workspace_id').eq('id', user.id).single();
    if (profErr || !profile) {
      return new Response(JSON.stringify({ error: 'profile_not_found' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    const wsId = profile.workspace_id;

    // 3. Validar plan PRO+
    const { data: hasAccess } = await admin.rpc('check_feature_access', {
      p_workspace_id: wsId, p_feature: 'advanced_reports_enabled',
    });
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: 'plan_required', message: 'Exportaciones requieren plan PRO o PREMIUM' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // 4. Parsear parámetros
    const body         = await req.json();
    const reportType   = String(body.report_type ?? 'summary');
    const format       = String(body.format ?? 'csv');
    const periodStart  = body.period_start ?? null;
    const periodEnd    = body.period_end   ?? null;

    const validTypes   = ['summary', 'funnel', 'services', 'clients', 'executive'];
    const validFormats = ['csv', 'pdf'];
    if (!validTypes.includes(reportType))   return new Response(JSON.stringify({ error: 'invalid_report_type' }),   { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    if (!validFormats.includes(format))     return new Response(JSON.stringify({ error: 'invalid_format' }),        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });

    // 5. Obtener datos vía RPC
    const RPC_MAP: Record<string, string> = {
      summary: 'get_reports_summary', funnel: 'get_funnel_report',
      services: 'get_services_report', clients: 'get_clients_report',
      executive: 'get_executive_dashboard',
    };
    const rpcArgs: Record<string, unknown> = { p_workspace_id: wsId };
    if (reportType !== 'executive') {
      if (periodStart) rpcArgs['p_period_start'] = periodStart;
      if (periodEnd)   rpcArgs['p_period_end']   = periodEnd;
    }

    const { data: rpcData, error: rpcErr } = await admin.rpc(RPC_MAP[reportType], rpcArgs);
    if (rpcErr) return new Response(JSON.stringify({ error: 'rpc_error', message: rpcErr.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });

    const reportData = rpcData as Record<string, unknown>;
    if (!reportData['ok']) return new Response(JSON.stringify({ error: reportData['error'] }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });

    // 6. Nombre de empresa
    const { data: co } = await admin.from('company_settings').select('name').eq('workspace_id', wsId).maybeSingle();
    const companyName  = (co as { name?: string } | null)?.name ?? 'Mi empresa';

    const period      = reportData['period'] as Record<string, unknown> | undefined;
    const periodLabel = period ? `${period['start']} → ${period['end']}` : new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    const names: Record<string, string> = { summary: 'resumen', funnel: 'embudo', services: 'servicios', clients: 'clientes', executive: 'ejecutivo' };
    const filename = `shelwi-${names[reportType]}-${new Date().toISOString().slice(0, 10)}`;

    // 7. Generar documento
    if (format === 'csv') {
      let csv = '';
      if (reportType === 'summary')   csv = summaryCSV(reportData);
      else if (reportType === 'funnel')    csv = funnelCSV(reportData);
      else if (reportType === 'services')  csv = servicesCSV(reportData);
      else if (reportType === 'clients')   csv = clientsCSV(reportData);
      else csv = JSON.stringify(reportData, null, 2);

      return new Response(csv, {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
        },
      });
    }

    // PDF: devuelve HTML listo para imprimir
    const html = buildHTML(reportType, reportData, companyName, periodLabel);
    return new Response(html, {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${filename}.html"`,
      },
    });

  } catch (err) {
    console.error('[generate-report]', err);
    return new Response(JSON.stringify({ error: 'internal_error', message: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
