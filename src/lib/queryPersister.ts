/**
 * queryPersister — persistencia lightweight de React Query en localStorage.
 *
 * SCOPE: solo queries de tier AUTH (profile, workspace, plan).
 * Evita re-fetches en cada recarga para datos que cambian cada 5 minutos.
 *
 * TTL: 30 minutos. Expirado → cache descartado, fetches normales.
 * Tamaño máximo: 200 kB comprimidos. Si supera el cuota de localStorage, falla silencioso.
 */
import type { QueryClient } from '@tanstack/react-query';

const CACHE_KEY  = 'shelwi:rq-auth-v1';
const MAX_AGE_MS = 30 * 60_000; // 30 minutos

interface CacheEntry {
  ts:      number;
  queries: Record<string, unknown>;
}

/** Prefijos de queryKey que deben persistirse */
const PERSIST_PREFIXES = ['profile', 'workspace', 'plan', 'features', 'permissions'];

function isPersistable(queryKey: readonly unknown[]): boolean {
  const first = String(queryKey[0] ?? '');
  return PERSIST_PREFIXES.some(p => first === p);
}

/** Guarda todas las queries persistibles en localStorage. Llamado después de login y en app focus. */
export function persistAuthCache(queryClient: QueryClient): void {
  try {
    const queries: Record<string, unknown> = {};
    queryClient.getQueryCache().getAll().forEach(query => {
      if (!isPersistable(query.queryKey)) return;
      if (query.state.status !== 'success') return;
      queries[JSON.stringify(query.queryKey)] = query.state.data;
    });

    if (Object.keys(queries).length === 0) return;

    const entry: CacheEntry = { ts: Date.now(), queries };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // quota exceeded o JSON error — silencioso
  }
}

/** Restaura el cache persistido al montar el QueryClient. Llamado antes de cualquier query. */
export function restoreAuthCache(queryClient: QueryClient): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;

    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > MAX_AGE_MS) {
      localStorage.removeItem(CACHE_KEY);
      return;
    }

    Object.entries(entry.queries).forEach(([keyStr, data]) => {
      const queryKey = JSON.parse(keyStr) as readonly unknown[];
      queryClient.setQueryData(queryKey, data);
    });
  } catch {
    localStorage.removeItem(CACHE_KEY);
  }
}

/** Suscripción al QueryCache — persiste automáticamente cuando datos de auth cambian. */
export function subscribeAuthPersister(queryClient: QueryClient): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const unsubscribe = queryClient.getQueryCache().subscribe(event => {
    if (event.type !== 'updated') return;
    if (!isPersistable(event.query.queryKey)) return;
    if (event.query.state.status !== 'success') return;

    // Debounce para evitar escrituras excesivas cuando llegan múltiples queries juntas
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => persistAuthCache(queryClient), 500);
  });

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    unsubscribe();
  };
}

/** Limpia el cache persistido — llamado en logout. */
export function clearPersistedCache(): void {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}
