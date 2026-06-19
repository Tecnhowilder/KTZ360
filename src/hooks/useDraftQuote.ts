import { useEffect, useRef } from 'react';
import type { StepClientData } from '../components/quote-new/StepClient';
import type { QuoteItem, CostConfig } from '../lib/itemEngine';

export interface QuoteDraftV2 {
  version: 2;
  workspaceId: string;
  savedAt: string;
  currentStep: number;
  clientData: StepClientData;
  items: QuoteItem[];
  costConfig: CostConfig;
  quoteName: string;
}

const DRAFT_KEY = (wid: string) => `ktz_quote_draft_v2_${wid}`;

export function saveDraft(draft: QuoteDraftV2) {
  try {
    localStorage.setItem(DRAFT_KEY(draft.workspaceId), JSON.stringify(draft));
  } catch { /* quota exceeded — ignorar */ }
}

export function loadDraft(workspaceId: string): QuoteDraftV2 | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(workspaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuoteDraftV2;
    if (parsed.version !== 2) return null;
    return parsed;
  } catch { return null; }
}

export function clearDraft(workspaceId: string) {
  try { localStorage.removeItem(DRAFT_KEY(workspaceId)); } catch { /* noop */ }
}

export function hasDraft(workspaceId: string): boolean {
  return !!loadDraft(workspaceId);
}

/** Hook que auto-guarda el borrador con debounce cada vez que cambia el estado. */
export function useDraftAutosave(
  workspaceId: string,
  data: Omit<QuoteDraftV2, 'version' | 'workspaceId' | 'savedAt'>,
  enabled: boolean
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    // Debounce 2s — no guardar en cada keystroke
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveDraft({
        version: 2,
        workspaceId,
        savedAt: new Date().toISOString(),
        ...data,
      });
    }, 2000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [workspaceId, enabled, JSON.stringify(data)]);
}

export const EMPTY_CLIENT_DATA: StepClientData = {
  clientId: null, clientName: '', projectName: '', description: '',
};
