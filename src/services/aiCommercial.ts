/**
 * aiCommercial.ts — Shelwi IA Comercial
 *
 * Todas las funciones de IA que consumen créditos del plan.
 * ZERO TRUST: el control de créditos ocurre en el backend (ai-proxy + consume_ai_credits).
 * El frontend solo envía el prompt y la operación — nunca el workspace_id ni los créditos.
 *
 * PRO:     generate_description (1), improve_proposal (2), ai_summary (2),
 *          close_probability (3), recommendations (3)
 * PREMIUM: forecast (3), forecast_finance (3), risk_analysis (3), prioritize_opportunities (3), next_best_action (3)
 */
import { callAistudio, type AIResponse } from './aiStudio';
import type { DerivedQuote } from '../lib/types';
import type { Client } from '../lib/types';
import { formatCurrencyCOP } from '../lib/currency';
import type { WorkspaceProfitability } from './finance';
import type { BIExecutiveKPIs, BISalesKPIs, BICustomerKPIs, BIMarketingKPIs } from './bi';

// ─── Helpers de formateo de contexto ────────────────────────────────────────

function quoteContext(q: DerivedQuote): string {
  return `Cotización: "${q.title}" | Cliente: ${q.clientName} | Estado: ${q.status} | Valor: ${formatCurrencyCOP(q.calc.total)} | Días activa: ${Math.floor((Date.now() - new Date(q.created_at).getTime()) / 86400000)}`;
}

// ─── PRO: Generar descripción de trabajo (1 crédito) ────────────────────────

/**
 * Genera una descripción profesional para una cotización.
 * Operación: generate_description → 1 crédito
 */
export async function generateDescription(userInput: string): Promise<AIResponse> {
  const prompt = `Eres un asistente comercial profesional de Shelwi.
El usuario necesita cotizar lo siguiente: "${userInput}"

Genera una descripción clara y profesional para incluir en la propuesta comercial.
Sé conciso (máximo 3 oraciones), directo y orientado al cliente.
No incluyas precios ni valores monetarios.
Responde solo con la descripción, sin explicaciones adicionales.`;

  return callAistudio({ prompt, operation: 'generate_description', max_tokens: 200, temperature: 0.4 });
}

// ─── PRO: Mejorar propuesta (2 créditos) ────────────────────────────────────

/**
 * Mejora el texto de una propuesta existente para aumentar conversión.
 * Operación: improve_proposal → 2 créditos
 */
export async function improveProposal(originalText: string, clientName?: string): Promise<AIResponse> {
  const prompt = `Eres un experto en ventas y redacción de propuestas comerciales de Shelwi.
${clientName ? `El cliente se llama: ${clientName}` : ''}

Texto original de la propuesta:
"${originalText}"

Mejora este texto para que sea más persuasivo y profesional.
Mantén el mismo alcance y no inventes precios.
Usa un tono cercano pero profesional, orientado a cerrar la venta.
Responde solo con el texto mejorado, sin explicaciones.`;

  return callAistudio({ prompt, operation: 'improve_proposal', max_tokens: 400, temperature: 0.5 });
}

// ─── PRO: Resumen inteligente del negocio (2 créditos) ───────────────────────

/**
 * Genera un resumen ejecutivo de la situación comercial del mes.
 * Operación: ai_summary → 2 créditos
 */
export async function generateBusinessSummary(
  quotes: DerivedQuote[],
  companyName: string,
): Promise<AIResponse> {
  const total        = quotes.reduce((a, q) => a + q.calc.total, 0);
  const approved     = quotes.filter(q => q.status === 'Aprobada');
  const sent         = quotes.filter(q => q.status === 'Enviada');
  const conv         = (approved.length + sent.length) > 0
    ? Math.round((approved.length / (approved.length + sent.length)) * 100)
    : 0;
  const atRisk       = sent.filter(q => {
    const days = Math.floor((Date.now() - new Date(q.sent_at ?? q.created_at).getTime()) / 86400000);
    return days >= 5;
  }).length;

  const prompt = `Eres el asistente IA comercial de ${companyName} en Shelwi.

Datos del mes:
- Total cotizado: ${formatCurrencyCOP(total)}
- Cotizaciones enviadas: ${sent.length}
- Cotizaciones aprobadas: ${approved.length}
- Tasa de conversión: ${conv}%
- Cotizaciones en riesgo (sin respuesta >5 días): ${atRisk}

Genera un resumen ejecutivo de máximo 4 puntos clave sobre la situación comercial.
Sé directo, usa datos reales, identifica oportunidades y riesgos.
Formato: puntos breves, máximo 15 palabras cada uno.`;

  return callAistudio({ prompt, operation: 'ai_summary', max_tokens: 300, temperature: 0.3 });
}

// ─── PRO: Probabilidad de cierre (3 créditos) ────────────────────────────────

/**
 * Calcula la probabilidad de cierre de una cotización usando IA.
 * Operación: close_probability → 3 créditos
 */
export async function analyzeCloseProbability(quote: DerivedQuote): Promise<AIResponse> {
  const daysSinceSent = quote.sent_at
    ? Math.floor((Date.now() - new Date(quote.sent_at).getTime()) / 86400000)
    : null;

  const prompt = `Eres un analista comercial de Shelwi especializado en predecir cierres de ventas.

Cotización a analizar:
${quoteContext(quote)}
${daysSinceSent !== null ? `Días desde envío: ${daysSinceSent}` : ''}
${(['Vista'] as string[]).includes(quote.status as string) ? 'El cliente abrió la propuesta' : ''}

Analiza esta cotización y responde en formato JSON:
{
  "probability": <número 0-100>,
  "signal": "<alta|media|baja>",
  "reasoning": "<1-2 oraciones explicando el porqué>",
  "action": "<acción recomendada en máximo 10 palabras>"
}`;

  return callAistudio({ prompt, operation: 'close_probability', max_tokens: 250, temperature: 0.2 });
}

// ─── PRO: Recomendaciones comerciales (3 créditos) ────────────────────────────

/**
 * Genera recomendaciones accionables basadas en el pipeline actual.
 * Operación: recommendations → 3 créditos
 */
export async function getCommercialRecommendations(
  quotes: DerivedQuote[],
  clients: Client[],
): Promise<AIResponse> {
  const pipeline     = quotes.filter(q => q.status === 'Enviada' || (q.status as string) === 'Vista');
  const atRisk       = pipeline.filter(q => {
    const days = Math.floor((Date.now() - new Date(q.sent_at ?? q.created_at).getTime()) / 86400000);
    return days >= 5;
  });
  const topValue     = pipeline.sort((a, b) => b.calc.total - a.calc.total).slice(0, 3);

  const prompt = `Eres el copiloto comercial IA de Shelwi.

Estado del pipeline:
- Cotizaciones activas: ${pipeline.length}
- En riesgo de perder (>5 días sin respuesta): ${atRisk.length}
- Top 3 por valor:
${topValue.map(q => `  · ${q.title} (${q.clientName}) - ${formatCurrencyCOP(q.calc.total)}`).join('\n')}
- Clientes totales: ${clients.length}

Genera exactamente 3 recomendaciones comerciales específicas y accionables.
Cada recomendación: máximo 20 palabras.
Formato JSON:
[
  {"tipo": "seguimiento|oportunidad|riesgo|optimizacion", "texto": "..."},
  ...
]`;

  return callAistudio({ prompt, operation: 'recommendations', max_tokens: 400, temperature: 0.4 });
}

// ─── PREMIUM: Forecast de ventas (3 créditos) ─────────────────────────────────

/**
 * Proyecta ventas para los próximos meses basado en histórico.
 * Operación: forecast → 3 créditos (solo PREMIUM)
 */
export async function forecastSales(
  quotes: DerivedQuote[],
  months = 3,
): Promise<AIResponse> {
  // Calcular histórico por mes
  const now = new Date();
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mQuotes = quotes.filter(q => {
      const qd = new Date(q.created_at);
      return qd.getFullYear() === d.getFullYear() && qd.getMonth() === d.getMonth();
    });
    return {
      month: d.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }),
      total: mQuotes.reduce((a, q) => a + q.calc.total, 0),
      count: mQuotes.length,
      approved: mQuotes.filter(q => q.status === 'Aprobada').length,
    };
  }).reverse();

  const prompt = `Eres un analista financiero de Shelwi con expertise en forecasting de ventas B2B.

Histórico de los últimos 6 meses:
${monthlyData.map(m => `${m.month}: ${formatCurrencyCOP(m.total)} (${m.count} cotizaciones, ${m.approved} aprobadas)`).join('\n')}

Proyecta los próximos ${months} meses considerando:
- Tendencia histórica
- Estacionalidad típica B2B colombiana
- Tasa de conversión promedio del período

Responde en JSON:
{
  "forecast": [
    {"month": "...", "projected_total": <número>, "projected_approved": <número>, "confidence": "<alta|media|baja>"}
  ],
  "trend": "<creciente|estable|decreciente>",
  "insight": "<1 oración con el insight más importante>"
}`;

  return callAistudio({ prompt, operation: 'forecast', max_tokens: 500, temperature: 0.2 });
}

// ─── PREMIUM: Clientes en riesgo (3 créditos) ─────────────────────────────────

/**
 * Identifica clientes en riesgo de abandono con análisis IA.
 * Operación: risk_analysis → 3 créditos (solo PREMIUM)
 */
export async function analyzeClientsAtRisk(
  quotes: DerivedQuote[],
  clients: Client[],
): Promise<AIResponse> {
  const clientActivity = clients.map(c => {
    const cQuotes = quotes.filter(q => q.client_id === c.id);
    const lastQuote = cQuotes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    const daysSinceActivity = lastQuote
      ? Math.floor((Date.now() - new Date(lastQuote.created_at).getTime()) / 86400000)
      : 999;
    const totalValue = cQuotes.filter(q => q.status === 'Aprobada').reduce((a, q) => a + q.calc.total, 0);
    return { name: c.name, daysSinceActivity, totalValue, quotesCount: cQuotes.length };
  }).filter(c => c.quotesCount > 0).sort((a, b) => b.daysSinceActivity - a.daysSinceActivity).slice(0, 10);

  const prompt = `Eres un analista de retención de clientes de Shelwi.

Actividad de clientes (ordenada por días sin actividad):
${clientActivity.map(c => `· ${c.name}: ${c.daysSinceActivity} días sin actividad, valor histórico ${formatCurrencyCOP(c.totalValue)}, ${c.quotesCount} cotizaciones`).join('\n')}

Identifica los clientes en mayor riesgo de abandono y sugiere acciones de retención.
JSON:
{
  "at_risk": [
    {"client": "...", "risk_level": "<crítico|alto|medio>", "reason": "...", "action": "..."}
  ],
  "summary": "<1 oración con resumen del estado de retención>"
}`;

  return callAistudio({ prompt, operation: 'risk_analysis', max_tokens: 500, temperature: 0.3 });
}

// ─── PREMIUM: Priorizar oportunidades (3 créditos) ────────────────────────────

/**
 * Prioriza el pipeline de oportunidades para maximizar conversión.
 * Operación: prioritize_opportunities (usa slot 'recommendations') → 3 créditos
 */
export async function prioritizeOpportunities(quotes: DerivedQuote[]): Promise<AIResponse> {
  const pipeline = quotes
    .filter(q => q.status === 'Enviada' || (q.status as string) === 'Vista')
    .slice(0, 10);

  const prompt = `Eres un especialista en priorización de ventas de Shelwi.

Pipeline actual (${pipeline.length} oportunidades):
${pipeline.map((q, i) => `${i+1}. "${q.title}" (${q.clientName}) - ${formatCurrencyCOP(q.calc.total)} - ${q.status}`).join('\n')}

Prioriza estas oportunidades para maximizar ingresos este mes.
Considera: valor, probabilidad de cierre y urgencia.
JSON:
{
  "priority_list": [
    {"rank": 1, "title": "...", "client": "...", "reason": "<por qué es #1>", "next_step": "..."},
    ...
  ],
  "focus_recommendation": "<qué hacer primero esta semana>"
}`;

  return callAistudio({ prompt, operation: 'recommendations', max_tokens: 600, temperature: 0.3 });
}

// ─── PREMIUM: Próxima mejor acción (3 créditos) ───────────────────────────────

/**
 * Determina la próxima mejor acción para una cotización específica.
 * Operación: recommendations (reutiliza slot) → 3 créditos
 */
export async function nextBestAction(
  quote: DerivedQuote,
  client?: Client,
): Promise<AIResponse> {
  const daysSinceSent = quote.sent_at
    ? Math.floor((Date.now() - new Date(quote.sent_at).getTime()) / 86400000)
    : null;

  const prompt = `Eres el asistente de ventas IA de Shelwi.

Cotización:
${quoteContext(quote)}
${daysSinceSent !== null ? `Días desde envío: ${daysSinceSent}` : ''}
${client?.phone ? `Teléfono cliente: disponible` : 'Teléfono: no disponible'}
${client?.email ? `Email cliente: disponible` : 'Email: no disponible'}

¿Cuál es la próxima mejor acción para avanzar esta cotización?
JSON:
{
  "action": "<llamar|whatsapp|email|visita|seguimiento|cerrar|descartar>",
  "message": "<mensaje sugerido de máximo 30 palabras>",
  "timing": "<ahora|hoy|esta semana|próxima semana>",
  "reasoning": "<por qué esta acción>"
}`;

  return callAistudio({ prompt, operation: 'recommendations', max_tokens: 300, temperature: 0.3 });
}

// ─── PREMIUM: Forecast financiero (3 créditos) ────────────────────────────────

/**
 * Proyecta ingresos, utilidad y riesgos financieros basado en el histórico real.
 * Reutiliza la operación 'forecast_finance' (3 créditos, solo PREMIUM).
 * Datos: get_workspace_profitability() → WorkspaceProfitability.
 */
export async function forecastFinance(
  profitability: WorkspaceProfitability,
  activeOrders = 0,
  activeClients = 0,
): Promise<AIResponse> {
  const { monthly_trend, total_revenue, estimated_profit, estimated_margin_pct,
    gross_margin_pct, avg_quote_value, quotes_count, orders_finalized } = profitability;

  const trendLines = monthly_trend
    .map(m => `${m.label}: Ingresos ${formatCurrencyCOP(m.revenue)} | Utilidad ${formatCurrencyCOP(m.util_amount)} | Margen ${m.margin_pct}%`)
    .join('\n');

  const prompt = `Eres un analista financiero de Shelwi. Analiza los datos reales de un contratista colombiano.

PERÍODO ANALIZADO:
${trendLines}

RESUMEN EJECUTIVO:
- Ingresos totales del período: ${formatCurrencyCOP(total_revenue)}
- Utilidad estimada: ${formatCurrencyCOP(estimated_profit)} (${estimated_margin_pct}%)
- Margen bruto: ${gross_margin_pct}%
- Cotizaciones aprobadas: ${quotes_count}
- Pedidos finalizados: ${orders_finalized}
- Valor promedio por cotización: ${formatCurrencyCOP(avg_quote_value)}
- Pedidos activos ahora: ${activeOrders}
- Clientes activos: ${activeClients}

Con base en estos datos reales, proyecta los próximos 3 meses y evalúa la salud financiera.

Responde ÚNICAMENTE en JSON:
{
  "forecast": [
    {"month": "Jul 2026", "projected_revenue": <número>, "projected_profit": <número>, "projected_margin_pct": <número>, "confidence": "<alta|media|baja>"},
    {"month": "Ago 2026", "projected_revenue": <número>, "projected_profit": <número>, "projected_margin_pct": <número>, "confidence": "<alta|media|baja>"},
    {"month": "Sep 2026", "projected_revenue": <número>, "projected_profit": <número>, "projected_margin_pct": <número>, "confidence": "<alta|media|baja>"}
  ],
  "trend": "<creciente|estable|decreciente>",
  "financial_health": "<saludable|atención|crítico>",
  "risks": ["<riesgo financiero 1>", "<riesgo financiero 2>"],
  "opportunities": ["<oportunidad de mejora 1>", "<oportunidad de mejora 2>"],
  "insight": "<1 oración con el diagnóstico financiero más importante>"
}`;

  return callAistudio({ prompt, operation: 'forecast_finance', max_tokens: 600, temperature: 0.2 });
}

// ─── PREMIUM: BI Analítica — 4 funciones Sprint 19 (3 créditos c/u) ──────────

/**
 * Resumen ejecutivo IA del estado del negocio basado en KPIs reales.
 * Operación: bi_executive_summary → 3 créditos (PREMIUM)
 */
export async function generateExecutiveSummary(kpis: BIExecutiveKPIs): Promise<AIResponse> {
  const prompt = `Eres el analista de negocio IA de Shelwi. Analiza los KPIs ejecutivos reales y genera un resumen ejecutivo.

DATOS REALES DEL PERÍODO ${kpis.period_start} al ${kpis.period_end}:
- Ingresos: ${formatCurrencyCOP(kpis.revenue)} (cambio: ${kpis.revenue_change_pct !== null ? kpis.revenue_change_pct + '%' : 'sin datos prev.'})
- Utilidad estimada: ${formatCurrencyCOP(kpis.profit)} | Margen: ${kpis.margin_pct}%
- Margen bruto: ${kpis.gross_margin_pct}%
- Cotizaciones aprobadas: ${kpis.quotes_approved} | Pedidos finalizados: ${kpis.orders_finalized}
- Pipeline activo: ${formatCurrencyCOP(kpis.pipeline_value)} (${kpis.pipeline_count} oportunidades)
- Tasa conversión 30d: ${kpis.conversion_rate_30d}%
- Clientes VIP: ${kpis.vip_clients} | En riesgo: ${kpis.at_risk_clients}
- Salud financiera: ${kpis.financial_health}

Responde ÚNICAMENTE en JSON:
{
  "estado_general": "<Excelente|Bueno|Regular|Crítico>",
  "resumen": "<2-3 oraciones del estado del negocio>",
  "logros": ["<logro 1>", "<logro 2>"],
  "areas_atencion": ["<área 1>", "<área 2>"],
  "recomendacion_principal": "<1 acción concreta a tomar esta semana>"
}`;

  return callAistudio({ prompt, operation: 'bi_executive_summary', max_tokens: 500, temperature: 0.3 });
}

/**
 * Forecast de negocio IA basado en KPIs de ventas y finanzas.
 * Operación: bi_business_forecast → 3 créditos (PREMIUM)
 */
export async function generateBusinessForecast(
  salesKpis: BISalesKPIs,
  profitability: WorkspaceProfitability,
): Promise<AIResponse> {
  const trend = profitability.monthly_trend.slice(-3)
    .map(m => `${m.label}: ${formatCurrencyCOP(m.revenue)} ingresos, ${m.margin_pct}% margen`)
    .join('\n');

  const prompt = `Eres el analista financiero IA de Shelwi. Proyecta el negocio para los próximos 3 meses.

TENDENCIA RECIENTE:
${trend}

KPIs COMERCIALES ACTUALES:
- Valor cotizado: ${formatCurrencyCOP(salesKpis.total_quoted)}
- Tasa de conversión: ${salesKpis.conversion_rate}%
- Ticket promedio aprobado: ${formatCurrencyCOP(profitability.avg_quote_value)}
- Pipeline activo: ${salesKpis.funnel_summary ? JSON.stringify(salesKpis.funnel_summary) : 'sin datos'}

RENTABILIDAD:
- Margen estimado: ${profitability.estimated_margin_pct}%
- Costo directo promedio: ${formatCurrencyCOP(profitability.total_direct_cost)}

Responde ÚNICAMENTE en JSON:
{
  "forecast": [
    {"month": "<nombre mes>", "revenue_min": <número>, "revenue_max": <número>, "confidence": "<alta|media|baja>"},
    {"month": "<nombre mes>", "revenue_min": <número>, "revenue_max": <número>, "confidence": "<alta|media|baja>"},
    {"month": "<nombre mes>", "revenue_min": <número>, "revenue_max": <número>, "confidence": "<alta|media|baja>"}
  ],
  "supuestos": ["<supuesto 1>", "<supuesto 2>"],
  "escenario_optimista": "<descripción>",
  "escenario_pesimista": "<descripción>",
  "factor_critico": "<el factor más importante que determinará el resultado>"
}`;

  return callAistudio({ prompt, operation: 'bi_business_forecast', max_tokens: 600, temperature: 0.2 });
}

/**
 * Evaluación de riesgos del negocio basada en CS + finanzas.
 * Operación: bi_risk_assessment → 3 créditos (PREMIUM)
 */
export async function generateRiskAssessment(
  customerKpis: BICustomerKPIs,
  profitability: WorkspaceProfitability,
): Promise<AIResponse> {
  const prompt = `Eres el analista de riesgos IA de Shelwi. Evalúa los riesgos del negocio.

CUSTOMER SUCCESS:
- Clientes en riesgo: ${customerKpis.at_risk_clients ? JSON.stringify(customerKpis.at_risk_clients).slice(0, 200) : 'sin datos'}
- NPS: ${customerKpis.nps_score ?? 'sin datos'} (${customerKpis.nps_label})
- Rating promedio: ${customerKpis.avg_rating ?? 'sin datos'}/5

FINANZAS:
- Margen bruto: ${profitability.gross_margin_pct}%
- Margen neto estimado: ${profitability.estimated_margin_pct}%
- ${profitability.has_real_costs ? 'Margen real: ' + profitability.real_margin_pct + '%' : 'Sin costos reales registrados'}
- Clientes VIP: ${customerKpis.health_summary ? (customerKpis.health_summary as Record<string, unknown>).vip ?? 0 : 0}

Responde ÚNICAMENTE en JSON:
{
  "nivel_riesgo": "<Alto|Medio|Bajo>",
  "riesgos": [
    {"categoria": "<Financiero|Operativo|Comercial|Clientes>", "riesgo": "<descripción>", "probabilidad": "<Alta|Media|Baja>", "impacto": "<Alto|Medio|Bajo>"}
  ],
  "mitigaciones": ["<acción de mitigación 1>", "<acción de mitigación 2>"],
  "alerta_critica": "<si hay algo urgente, describir aquí; sino null>"
}`;

  return callAistudio({ prompt, operation: 'bi_risk_assessment', max_tokens: 500, temperature: 0.3 });
}

/**
 * Recomendaciones de crecimiento basadas en marketing + ventas.
 * Operación: bi_growth_recs → 3 créditos (PREMIUM)
 */
export async function generateGrowthRecommendations(
  marketingKpis: BIMarketingKPIs,
  salesKpis: BISalesKPIs,
): Promise<AIResponse> {
  const topChannel = marketingKpis.revenue_by_channel?.[0];
  const topRep = salesKpis.by_rep?.[0];

  const prompt = `Eres el estratega de crecimiento IA de Shelwi. Genera recomendaciones de crecimiento.

MARKETING:
- Clientes nuevos adquiridos: ${marketingKpis.new_clients}
- Canal principal: ${topChannel ? topChannel.source + ' (' + topChannel.clients + ' clientes, $' + topChannel.revenue_from_clients.toLocaleString('es-CO') + ')' : 'sin datos'}
- Referidos convertidos: ${marketingKpis.referral_conversions}
- UTM total visitas: ${marketingKpis.utm_visits}

COMERCIAL:
- Tasa de cierre del equipo: ${salesKpis.conversion_rate}%
- Mejor comercial: ${topRep ? topRep.full_name + ' ($' + topRep.approved_value.toLocaleString('es-CO') + ' aprobado)' : 'sin datos'}
- Cotizaciones activas en pipeline: ${salesKpis.funnel_summary ? JSON.stringify(salesKpis.funnel_summary).slice(0, 200) : 'sin datos'}

Responde ÚNICAMENTE en JSON:
{
  "potencial_crecimiento": "<Alto|Medio|Bajo>",
  "oportunidades": [
    {"area": "<Marketing|Ventas|Retención|Producto>", "oportunidad": "<descripción>", "impacto_estimado": "<descripción del impacto>", "esfuerzo": "<Alto|Medio|Bajo>"}
  ],
  "quick_wins": ["<acción rápida 1>", "<acción rápida 2>", "<acción rápida 3>"],
  "estrategia_recomendada": "<estrategia principal de crecimiento para los próximos 90 días>"
}`;

  return callAistudio({ prompt, operation: 'bi_growth_recs', max_tokens: 600, temperature: 0.4 });
}
