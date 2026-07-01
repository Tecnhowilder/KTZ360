/**
 * iaCrear.ts — Agente IA Operativo (Sprint IA-Crear)
 *
 * Interpreta solicitudes en lenguaje natural y extrae datos estructurados
 * para crear cotizaciones o pedidos usando los flujos existentes.
 *
 * Zero Trust:
 *   - Catálogo y clientes se cargan vía RLS (solo del workspace del JWT)
 *   - workspace_id nunca se pasa desde el frontend
 *   - callAistudio() consume créditos via ai-proxy (check + consume)
 *
 * Reutiliza sin duplicar:
 *   - callAistudio() para llamar a Gemini
 *   - openQuoteFlow() para abrir el flujo de cotización
 *   - create_direct_order RPC para pedidos directos
 *   - catálogo y clientes existentes
 */
import { supabase } from '../lib/supabaseClient';
import { callAistudio, type AIResponse } from './aiStudio';

// ─── Tipos de resultado ───────────────────────────────────────────────────────

export type CreationType = 'cotizacion' | 'pedido' | 'ambiguo';

export interface CatalogContextItem {
  id: string;
  name: string;
  description: string | null;
  unit?: string | null;
}

export interface ClientContextItem {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
}

export interface IAItemResult {
  service_id: string | null;       // UUID del catálogo si fue encontrado
  service_name: string;            // Nombre como lo interpretó la IA
  quantity: number;
  unit: string | null;
  found_in_catalog: boolean;
}

export interface IAInterpretResult {
  type:              CreationType;
  client_id:         string | null;
  client_name:       string;
  client_found:      boolean;
  title:             string;
  service_lines:     IAItemResult[];
  advance_pct:       number | null;
  transport_cost:    number | null;
  notes:             string;
  scheduled_date:    string | null;
  confidence:        'alta' | 'media' | 'baja';
  warnings:          string[];
}

// ─── Cargar contexto del workspace (catálogo + clientes) ─────────────────────
// RLS garantiza que solo se ven datos del workspace del JWT autenticado.

export async function fetchCatalogContext(): Promise<CatalogContextItem[]> {
  const { data } = await (supabase as any)
    .from('catalog_services')
    .select('id, name, description')
    .limit(80)
    .order('name');
  return (data ?? []) as CatalogContextItem[];
}

export async function fetchClientsContext(): Promise<ClientContextItem[]> {
  const { data } = await supabase
    .from('clients' as any)
    .select('id, name, phone, email')
    .is('deleted_at', null)
    .limit(60)
    .order('name');
  return (data as unknown as ClientContextItem[]) ?? [];
}

// ─── Construir prompt ─────────────────────────────────────────────────────────

function buildPrompt(
  userText:    string,
  catalog:     CatalogContextItem[],
  clients:     ClientContextItem[],
  workspaceConfig: { taxRate?: number; advancePct?: number }
): string {
  const catalogText = catalog.length > 0
    ? catalog.map(c => `- ID:${c.id} | ${c.name}${c.description ? ` (${c.description})` : ''}`).join('\n')
    : '(Catálogo vacío — el usuario deberá agregar productos manualmente)';

  const clientsText = clients.length > 0
    ? clients.map(c => `- ID:${c.id} | ${c.name}${c.phone ? ` | Tel: ${c.phone}` : ''}`).join('\n')
    : '(Sin clientes registrados)';

  return `Eres el Agente IA Operativo de Shelwi, una plataforma para contratistas colombianos.

Tu tarea: interpretar la solicitud del usuario y extraer información estructurada para crear una COTIZACIÓN o PEDIDO.

═══ CATÁLOGO DISPONIBLE (ÚNICAMENTE usar estos productos) ═══
${catalogText}

═══ CLIENTES REGISTRADOS (ÚNICAMENTE usar estos clientes) ═══
${clientsText}

═══ CONFIGURACIÓN DEL WORKSPACE ═══
- IVA: ${workspaceConfig.taxRate ?? 19}%
- Anticipo por defecto: ${workspaceConfig.advancePct ?? 30}%

═══ SOLICITUD DEL USUARIO ═══
"${userText}"

═══ REGLAS ABSOLUTAS ═══
1. NUNCA inventar productos que no estén en el catálogo
2. NUNCA inventar precios ni referencias
3. NUNCA inventar clientes que no estén en la lista
4. Si un producto no existe en el catálogo: service_id = null, found_in_catalog = false
5. Si un cliente no existe: client_id = null, client_found = false
6. Detectar automáticamente si es COTIZACIÓN o PEDIDO:
   - Cotización: "cotiza", "propuesta", "presupuesto", "precio", "cuánto cuesta"
   - Pedido: "pedido", "mantenimiento", "revisión", "instalación", "enviar técnico", "visita", "servicio"
   - Si es ambiguo: type = "ambiguo"
7. Extraer: anticipo (%), transporte (COP), fechas, observaciones
8. Todo lo que no puedas clasificar va en "notes"

Responde ÚNICAMENTE con JSON válido (sin texto extra):
{
  "type": "cotizacion" | "pedido" | "ambiguo",
  "client_id": "uuid exacto de la lista o null",
  "client_name": "nombre mencionado por el usuario",
  "client_found": true | false,
  "title": "título corto y descriptivo del trabajo (máx 60 chars)",
  "service_lines": [
    {
      "service_id": "uuid exacto del catálogo o null",
      "service_name": "nombre del servicio/producto mencionado",
      "quantity": 1,
      "unit": "unidad (und, m², m, hr, etc.) o null",
      "found_in_catalog": true | false
    }
  ],
  "advance_pct": número (0-100) o null,
  "transport_cost": número en COP o null,
  "notes": "notas y observaciones no clasificadas",
  "scheduled_date": "YYYY-MM-DD o null",
  "confidence": "alta" | "media" | "baja",
  "warnings": ["advertencia si falta info importante"]
}`;
}

// ─── Función principal de interpretación ─────────────────────────────────────

export async function interpretCreationRequest(
  userText:        string,
  catalog:         CatalogContextItem[],
  clients:         ClientContextItem[],
  workspaceConfig: { taxRate?: number; advancePct?: number } = {}
): Promise<{ result: IAInterpretResult; aiResponse: AIResponse }> {

  const prompt = buildPrompt(userText, catalog, clients, workspaceConfig);

  // Llama a Gemini via ai-proxy → verifica y consume créditos automáticamente
  const aiResponse = await callAistudio({
    prompt,
    operation:   'ia_voice_interpret',
    max_tokens:  800,
    temperature: 0.1,   // baja temperatura = respuestas más deterministas
  });

  // Parsear JSON de la respuesta
  let result: IAInterpretResult;
  try {
    const jsonMatch = aiResponse.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No se encontró JSON en la respuesta');
    result = JSON.parse(jsonMatch[0]) as IAInterpretResult;
  } catch {
    // Si falla el parse, devolver resultado mínimo
    result = {
      type:           'ambiguo',
      client_id:      null,
      client_name:    '',
      client_found:   false,
      title:          userText.slice(0, 60),
      service_lines:  [],
      advance_pct:    null,
      transport_cost: null,
      notes:          userText,
      scheduled_date: null,
      confidence:     'baja',
      warnings:       ['No se pudo interpretar completamente la solicitud'],
    };
  }

  return { result, aiResponse };
}

// ─── create_direct_order frontend wrapper ─────────────────────────────────────

export interface DirectOrderInput {
  clientId:       string;
  title:          string;
  description?:   string;
  itemsSnapshot?: IAItemResult[];
  totalAmount?:   number;
  notes?:         string;
  scheduledAt?:   string;
}

export async function createDirectOrder(input: DirectOrderInput): Promise<{ orderId: string }> {
  const { data, error } = await (supabase as any).rpc('create_direct_order', {
    p_client_id:      input.clientId,
    p_title:          input.title,
    p_description:    input.description    ?? null,
    p_items_snapshot: input.itemsSnapshot  ?? [],
    p_total_amount:   input.totalAmount    ?? 0,
    p_notes:          input.notes          ?? null,
    p_scheduled_at:   input.scheduledAt    ?? null,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'Error al crear pedido directo');
  return { orderId: data.order_id };
}
