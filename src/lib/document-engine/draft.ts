/**
 * draft.ts — Motor de borrador genérico para el Document Engine.
 *
 * Permite crear hooks de draft tipados para cualquier documento:
 *   const quoteDraft = createDraftHooks<QuoteDraftV2>('ktz_quote_draft_v2', 2)
 *   const orderDraft = createDraftHooks<OrderDraftV2>('ktz_order_draft_v2', 1)
 *
 * Cada tipo de documento usa su propia clave de localStorage, evitando
 * colisiones entre módulos.
 *
 * Escalabilidad: localStorage es síncrono y limitado a ~5MB por origen.
 * Para uso en 5000+ usuarios cada draft ocupa <10KB → no hay riesgo de límite.
 */
import { useEffect, useRef } from 'react';

export interface BaseDraft {
  version: number;
  workspaceId: string;
  savedAt: string;
}

export function createDraftHooks<T extends BaseDraft>(keyPrefix: string, version: number) {
  const key = (wid: string) => `${keyPrefix}_${wid}`;

  function save(draft: T): void {
    try {
      localStorage.setItem(key(draft.workspaceId), JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
    } catch { /* ignore quota errors */ }
  }

  function load(workspaceId: string): T | null {
    try {
      const raw = localStorage.getItem(key(workspaceId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as T;
      if (parsed.version !== version) return null;
      return parsed;
    } catch { return null; }
  }

  function clear(workspaceId: string): void {
    try { localStorage.removeItem(key(workspaceId)); } catch { /* noop */ }
  }

  function has(workspaceId: string): boolean {
    return !!load(workspaceId);
  }

  function useAutosave(
    workspaceId: string,
    data: Omit<T, keyof BaseDraft>,
    enabled: boolean,
  ): void {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
      if (!enabled) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        save({ version, workspaceId, savedAt: new Date().toISOString(), ...data } as unknown as T);
      }, 2000);
      return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [workspaceId, enabled, JSON.stringify(data)]); // eslint-disable-line
  }

  return { save, load, clear, has, useAutosave };
}
