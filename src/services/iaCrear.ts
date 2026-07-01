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
  price?: number;
  type?: string;
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
    .from('catalog_items')
    .select('id, name, description, unit, price, type')
    .eq('status', 'active')
    .is('deleted_at', null)
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

// ─── Normalización para fuzzy matching ───────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quitar tildes
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fuzzyMatch(needle: string, haystack: string): boolean {
  const n = normalize(needle);
  const h = normalize(haystack);
  return h.includes(n) || n.includes(h) || n.split(' ').every(w => h.includes(w));
}

// ─── Extracción robusta de JSON de la respuesta de Gemini ────────────────────

function extractJSON(text: string): string | null {
  // 1. Bloque markdown ```json ... ```
  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch) return mdMatch[1].trim();

  // 2. Primer objeto JSON completo en el texto
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start !== -1 && end > start) return text.slice(start, end + 1);

  return null;
}

// ─── Construir prompt ─────────────────────────────────────────────────────────

function buildPrompt(
  userText:    string,
  catalog:     CatalogContextItem[],
  clients:     ClientContextItem[],
  workspaceConfig: { taxRate?: number; advancePct?: number }
): string {
  const catalogText = catalog.length > 0
    ? catalog.map(c => `  {"id":"${c.id}","name":"${c.name}"${c.description ? `,"desc":"${c.description}"` : ''}}`).join(',\n')
    : '  (catálogo vacío)';

  const clientsText = clients.length > 0
    ? clients.map(c => `  {"id":"${c.id}","name":"${c.name}"${c.phone ? `,"phone":"${c.phone}"` : ''}}`).join(',\n')
    : '  (sin clientes)';

  return `Eres el agente IA de Shelwi. Interpreta la solicitud y responde SOLO con JSON puro, sin bloques markdown, sin texto extra.

CATÁLOGO (úsalo para service_lines):
[
${catalogText}
]

CLIENTES (úsalo para client_id):
[
${clientsText}
]

CONFIG: IVA ${workspaceConfig.taxRate ?? 19}%, anticipo por defecto ${workspaceConfig.advancePct ?? 30}%

SOLICITUD: "${userText}"

REGLAS:
- Busca coincidencias por nombre aunque haya diferencias de tildes o mayúsculas ("pedro fernandez" = "Pedro Fernández")
- type: "cotizacion" si dice cotiza/propuesta/presupuesto/precio; "pedido" si dice pedido/mantenimiento/instalación/servicio; "ambiguo" si no está claro
- service_id: UUID exacto del catálogo si hay coincidencia, null si no existe
- client_id: UUID exacto del cliente si hay coincidencia, null si no existe
- NUNCA inventes productos o clientes que no estén en las listas

Responde exactamente con este JSON (reemplaza los valores):
{"type":"cotizacion","client_id":null,"client_name":"","client_found":false,"title":"","service_lines":[{"service_id":null,"service_name":"","quantity":1,"unit":null,"found_in_catalog":false}],"advance_pct":null,"transport_cost":null,"notes":"","scheduled_date":null,"confidence":"alta","warnings":[]}`;
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
    max_tokens:  1500,
    temperature: 0.1,
  });

  // ── Extraer y parsear JSON ────────────────────────────────────────────────
  let result: IAInterpretResult;
  try {
    const raw = extractJSON(aiResponse.text);
    if (!raw) throw new Error('Sin JSON en respuesta');
    result = JSON.parse(raw) as IAInterpretResult;
  } catch {
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

  // ── Fuzzy matching post-AI ────────────────────────────────────────────────
  // Corrige casos donde la IA no encontró coincidencia por tildes/mayúsculas

  if (!result.client_found && result.client_name) {
    const match = clients.find(c => fuzzyMatch(result.client_name, c.name));
    if (match) {
      result.client_id    = match.id;
      result.client_name  = match.name;
      result.client_found = true;
    }
  }

  result.service_lines = result.service_lines.map(line => {
    if (line.found_in_catalog) return line;
    const match = catalog.find(c => fuzzyMatch(line.service_name, c.name));
    if (match) {
      return { ...line, service_id: match.id, service_name: match.name, found_in_catalog: true };
    }
    return line;
  });

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
