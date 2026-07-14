/**
 * desdeImagen.ts — Servicio de extracción IA desde fotografía
 *
 * FASE 1 — La IA extrae TODA la información visible, sin importar si existe en Shelwi.
 * FASE 2 — Se compara lo extraído con catálogo y clientes (via RLS) del workspace.
 *
 * Zero Trust:
 *   - Toda llamada a Gemini pasa por ai-proxy (Edge Function con JWT verificado)
 *   - workspace_id del JWT en backend — nunca del frontend
 *   - catalog y clients se cargan via RLS (solo datos del workspace autenticado)
 *   - Nunca se crean productos o clientes automáticamente
 */

import { callAistudio } from './aiStudio';
import type { CatalogContextItem, ClientContextItem } from './iaCrear';

// ─── Tipos de resultado ───────────────────────────────────────────────────────

export type VisionDocType   = 'cotizacion' | 'pedido' | 'desconocido';
export type VisionConfidence = 'alta' | 'media' | 'baja';

/** Un producto/servicio detectado en la imagen. */
export interface VisionItem {
  // ── FASE 1: Información detectada ──────────────────────────────────────────
  detected_name:    string;
  quantity:         number;
  unit:             string;
  price_visible:    number | null;   // precio leído en la imagen
  brand:            string | null;   // marca
  reference:        string | null;   // referencia / SKU / código
  model:            string | null;   // modelo
  discount_visible: number | null;   // descuento visible (%)
  observations:     string | null;   // observaciones adicionales
  confidence_pct:   number;          // confianza 0-100

  // ── FASE 2: Matching con catálogo Shelwi ────────────────────────────────────
  service_id:       string | null;
  service_name:     string;
  found_in_catalog: boolean;
  confidence:       VisionConfidence;
}

/** Resultado completo de extracción. */
export interface VisionExtractResult {
  // ── Tipo de documento ───────────────────────────────────────────────────────
  doc_type: VisionDocType;

  // ── FASE 1: Cliente detectado ───────────────────────────────────────────────
  client_name:           string;
  client_phone:          string;
  client_address:        string;
  client_email:          string;
  client_confidence_pct: number;   // confianza en los datos del cliente 0-100

  // ── FASE 2: Matching con clientes Shelwi ───────────────────────────────────
  client_id:    string | null;
  client_found: boolean;

  // ── Items ───────────────────────────────────────────────────────────────────
  items: VisionItem[];

  // ── Contexto del documento ──────────────────────────────────────────────────
  notes:         string;
  date_visible:  string | null;   // fecha visible en el documento
  total_visible: number | null;   // total detectado en la imagen
  iva_visible:   number | null;   // IVA detectado

  // ── Calidad global ──────────────────────────────────────────────────────────
  confidence:         VisionConfidence;
  confidence_pct:     number;          // confianza global 0-100
  warnings:           string[];
  processing_time_ms: number;          // tiempo total de procesamiento
}

// ─── Compresión de imagen ─────────────────────────────────────────────────────

/**
 * Comprime y convierte un File a base64 JPEG.
 * Elimina metadatos EXIF automáticamente (canvas no los preserva).
 */
export function compressImage(file: File, maxPx = 1024, quality = 0.87): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width  * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No canvas context')); return; }
      ctx.drawImage(img, 0, 0, w, h);

      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
    };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo cargar la imagen')); };
    img.src = url;
  });
}

// ─── Fuzzy matching ───────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function fuzzyMatch(needle: string, haystack: string): boolean {
  const n = normalize(needle);
  const h = normalize(haystack);
  if (h.includes(n) || n.includes(h)) return true;
  const words = n.split(' ').filter(w => w.length > 2);
  return words.length > 0 && words.every(w => h.includes(w));
}

// ─── Prompt de visión ─────────────────────────────────────────────────────────

function buildVisionPrompt(catalog: CatalogContextItem[], clients: ClientContextItem[]): string {
  const catalogText = catalog.length > 0
    ? catalog.map(c =>
        `  {"id":"${c.id}","name":"${c.name}"${c.unit ? `,"unit":"${c.unit}"` : ''}${c.price ? `,"price":${c.price}` : ''}}`
      ).join(',\n')
    : '  (catálogo vacío)';

  const clientsText = clients.length > 0
    ? clients.map(c =>
        `  {"id":"${c.id}","name":"${c.name}"${c.phone ? `,"phone":"${c.phone}"` : ''}}`
      ).join(',\n')
    : '  (sin clientes registrados)';

  return `Eres el asistente IA de Shelwi para análisis de documentos comerciales.

OBJETIVO: Analizar la imagen en DOS FASES independientes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 1 — EXTRACCIÓN COMPLETA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Extrae ABSOLUTAMENTE TODA la información visible en la imagen.
NO importa si existe o no en Shelwi.
Incluye: nombres exactos, cantidades, unidades, precios, marcas, referencias,
modelos, descuentos, fechas, totales, IVA, direcciones, teléfonos, correos,
observaciones, notas, cualquier texto relevante.
Si no puedes leer un campo, déjalo null — NUNCA inventes datos.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASE 2 — MATCHING CON SHELWI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CATÁLOGO DE PRODUCTOS SHELWI (para comparar, no para inventar):
[
${catalogText}
]

CLIENTES SHELWI (para comparar, no para inventar):
[
${clientsText}
]

Busca la MEJOR coincidencia de nombre para cada producto y para el cliente.
Si no hay coincidencia razonable: service_id=null, found_in_catalog=false, client_id=null, client_found=false.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLAS CRÍTICAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- NUNCA inventes productos que no estén en la imagen
- NUNCA inventes clientes
- Los IDs de matching deben ser exactamente los del catálogo/clientes — nunca UUIDs inventados
- confidence_pct refleja qué tan legible/segura es la información detectada (0=ilegible, 100=completamente claro)
- Responde SOLO con JSON puro, sin markdown, sin texto adicional

Responde con EXACTAMENTE este esquema JSON:
{"doc_type":"pedido","client_name":"","client_phone":"","client_address":"","client_email":"","client_confidence_pct":0,"client_id":null,"client_found":false,"items":[{"detected_name":"","quantity":1,"unit":"und","price_visible":null,"brand":null,"reference":null,"model":null,"discount_visible":null,"observations":null,"confidence_pct":0,"service_id":null,"service_name":"","found_in_catalog":false,"confidence":"media"}],"notes":"","date_visible":null,"total_visible":null,"iva_visible":null,"confidence":"alta","confidence_pct":0,"warnings":[]}`;
}

// ─── Extracción robusta de JSON ───────────────────────────────────────────────

function extractJSON(text: string): string | null {
  const md = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (md) return md[1].trim();
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return null;
}

// ─── Función principal ────────────────────────────────────────────────────────

export async function extractFromImage(
  base64Image: string,
  catalog:     CatalogContextItem[],
  clients:     ClientContextItem[]
): Promise<VisionExtractResult> {
  const t0     = Date.now();
  const prompt = buildVisionPrompt(catalog, clients);

  const aiResponse = await callAistudio({
    prompt,
    operation:   'ia_photo_interpret',
    images:      [base64Image],
    max_tokens:  2500,
    temperature: 0.05,
  });

  const processing_time_ms = Date.now() - t0;

  // ── Parsear JSON ──────────────────────────────────────────────────────────
  let raw: VisionExtractResult;
  try {
    const jsonStr = extractJSON(aiResponse.text);
    if (!jsonStr) throw new Error('Sin JSON');
    raw = JSON.parse(jsonStr) as VisionExtractResult;
  } catch {
    return {
      doc_type: 'desconocido',
      client_name: '', client_phone: '', client_address: '', client_email: '',
      client_confidence_pct: 0, client_id: null, client_found: false,
      items: [], notes: '',
      date_visible: null, total_visible: null, iva_visible: null,
      confidence: 'baja', confidence_pct: 0,
      warnings: ['No se pudo interpretar la respuesta de la IA. Intenta con una foto más clara.'],
      processing_time_ms,
    };
  }

  raw.processing_time_ms = processing_time_ms;

  // ── FASE 2 — Fuzzy matching post-IA: corregir coincidencias ─────────────

  // Cliente
  if (!raw.client_found && raw.client_name) {
    const match = clients.find(c => fuzzyMatch(raw.client_name, c.name));
    if (match) { raw.client_id = match.id; raw.client_name = match.name; raw.client_found = true; }
  }

  // Productos
  raw.items = (raw.items ?? []).map(item => {
    if (item.found_in_catalog && item.service_id) return item;
    const match = catalog.find(c => fuzzyMatch(item.detected_name, c.name));
    if (match) return { ...item, service_id: match.id, service_name: match.name, found_in_catalog: true };
    return { ...item, service_name: item.service_name || item.detected_name };
  });

  // Derivar confidence textual si solo viene confidence_pct
  if (!raw.confidence) {
    raw.confidence = raw.confidence_pct >= 80 ? 'alta' : raw.confidence_pct >= 60 ? 'media' : 'baja';
  }
  raw.items = raw.items.map(item => ({
    ...item,
    confidence: item.confidence ?? (
      item.confidence_pct >= 80 ? 'alta' : item.confidence_pct >= 60 ? 'media' : 'baja'
    ),
  }));

  return raw;
}
