import type { QConfig } from './types';

export interface QuoteDraft {
  step: number;
  cfg: QConfig;
  createdQuoteId: string | null;
  createdQuoteNumber: string | null;
  savedAt: string;
}

const KEY_PREFIX     = 'shelwi_quote_draft_';
const LEGACY_PREFIX  = 'ktz360_quote_draft_';

export function saveQuoteDraft(workspaceId: string, draft: QuoteDraft) {
  try {
    localStorage.setItem(KEY_PREFIX + workspaceId, JSON.stringify(draft));
  } catch {
    // almacenamiento no disponible (modo privado, cuota llena, etc.)
  }
}

export function loadQuoteDraft(workspaceId: string): QuoteDraft | null {
  try {
    // Intentar clave nueva; si no existe, migrar desde clave legacy
    const raw = localStorage.getItem(KEY_PREFIX + workspaceId)
      ?? localStorage.getItem(LEGACY_PREFIX + workspaceId);
    if (!raw) return null;
    const draft = JSON.parse(raw) as QuoteDraft;
    // Migrar silenciosamente a la clave nueva
    localStorage.setItem(KEY_PREFIX + workspaceId, raw);
    localStorage.removeItem(LEGACY_PREFIX + workspaceId);
    return draft;
  } catch {
    return null;
  }
}

export function clearQuoteDraft(workspaceId: string) {
  try {
    localStorage.removeItem(KEY_PREFIX + workspaceId);
    localStorage.removeItem(LEGACY_PREFIX + workspaceId);
  } catch {
    // ignorar
  }
}

export function hasMeaningfulDraft(draft: QuoteDraft | null): boolean {
  if (!draft) return false;
  return !!draft.cfg.clientId || draft.cfg.serviceLines.length > 0 || draft.step > 0;
}
