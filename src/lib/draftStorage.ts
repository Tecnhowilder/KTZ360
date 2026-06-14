import type { QConfig } from './types';

export interface QuoteDraft {
  step: number;
  cfg: QConfig;
  createdQuoteId: string | null;
  createdQuoteNumber: string | null;
  savedAt: string;
}

const KEY_PREFIX = 'brivia_quote_draft_';

export function saveQuoteDraft(workspaceId: string, draft: QuoteDraft) {
  try {
    localStorage.setItem(KEY_PREFIX + workspaceId, JSON.stringify(draft));
  } catch {
    // almacenamiento no disponible (modo privado, cuota llena, etc.)
  }
}

export function loadQuoteDraft(workspaceId: string): QuoteDraft | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + workspaceId);
    if (!raw) return null;
    return JSON.parse(raw) as QuoteDraft;
  } catch {
    return null;
  }
}

export function clearQuoteDraft(workspaceId: string) {
  try {
    localStorage.removeItem(KEY_PREFIX + workspaceId);
  } catch {
    // ignorar
  }
}

export function hasMeaningfulDraft(draft: QuoteDraft | null): boolean {
  if (!draft) return false;
  return !!draft.cfg.clientId || draft.cfg.serviceLines.length > 0 || draft.step > 0;
}
