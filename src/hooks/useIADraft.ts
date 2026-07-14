/**
 * useIADraft — Persistencia de sesiones IA (localStorage)
 *
 * Patrón idéntico a useDraftQuote.ts, adaptado para el flujo "Desde Imagen".
 * Persiste: docType, imageBase64 (thumbnail), extractResult, resolvedItems, step.
 * Quota exceeded → guarda sin imagen (datos preservados, thumbnail = null).
 * Nunca pierde el trabajo del usuario entre navegaciones.
 */
import { useEffect, useRef } from 'react';
import type { VisionExtractResult, VisionItem, VisionConfidence } from '../services/desdeImagen';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface IADraftItem extends VisionItem {
  resolution: 'include' | 'skip' | 'pending';
}

export type IADraftStep = 'results' | 'preview';
export type IADraftDocType = 'cotizacion' | 'pedido';

export interface IADraft {
  version:       2;
  workspaceId:   string;
  savedAt:       string;
  docType:       IADraftDocType | null;
  imageBase64:   string | null;   // thumbnail — puede ser null si localStorage lleno
  extractResult: VisionExtractResult | null;
  items:         IADraftItem[];
  lastStep:      IADraftStep;
}

// ─── Clave de almacenamiento ──────────────────────────────────────────────────

const DRAFT_KEY = (wid: string) => `shelwi_ia_draft_v2_${wid}`;

// ─── Funciones estáticas ──────────────────────────────────────────────────────

export function saveIADraft(draft: IADraft): void {
  const key = DRAFT_KEY(draft.workspaceId);
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Quota exceeded — reintentar sin imagen (priorizar datos sobre thumbnail)
    try {
      localStorage.setItem(key, JSON.stringify({ ...draft, imageBase64: null }));
    } catch { /* noop */ }
  }
}

export function loadIADraft(workspaceId: string): IADraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(workspaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IADraft;
    if (parsed.version !== 2) return null;
    if (!parsed.extractResult) return null;
    return parsed;
  } catch { return null; }
}

export function clearIADraft(workspaceId: string): void {
  try { localStorage.removeItem(DRAFT_KEY(workspaceId)); } catch { /* noop */ }
}

export function hasIADraft(workspaceId: string): boolean {
  return !!loadIADraft(workspaceId);
}

/** Tiempo relativo legible: "hace 5 minutos", "hace 2 horas", etc. */
export function draftRelativeTime(savedAt: string): string {
  const diff = Date.now() - new Date(savedAt).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1)  return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return `hace ${hrs}h`;
  return `hace ${Math.round(hrs / 24)} días`;
}

// ─── Hook — auto-guardado con debounce ───────────────────────────────────────

type AutosaveData = {
  docType:       IADraftDocType | null;
  imageBase64:   string | null;
  extractResult: VisionExtractResult | null;
  items:         IADraftItem[];
  lastStep:      IADraftStep;
};

export function useIADraftAutosave(
  workspaceId: string,
  data: AutosaveData,
  enabled: boolean
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !workspaceId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveIADraft({
        version:     2,
        workspaceId,
        savedAt:     new Date().toISOString(),
        ...data,
      });
    }, 1500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [workspaceId, enabled, JSON.stringify(data)]); // eslint-disable-line
}

// Re-export VisionItem and VisionConfidence so consumers don't need to import from two places
export type { VisionExtractResult, VisionItem, VisionConfidence };
