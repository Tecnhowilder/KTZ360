/**
 * circuitBreaker.ts — Circuit Breaker para Edge Functions de Shelwi.
 *
 * Estados:
 *   CLOSED   → tráfico normal, contabiliza fallos
 *   OPEN     → rechaza inmediatamente (fast-fail), espera cooldown
 *   HALF_OPEN → deja pasar 1 request de prueba; si falla → OPEN, si pasa → CLOSED
 *
 * Configuración por defecto:
 *   - 5 fallos consecutivos abren el circuito
 *   - 30 segundos en OPEN antes de probar HALF_OPEN
 *   - Deno Edge Functions son stateful en la misma instancia (memory persiste entre requests del mismo worker)
 *
 * Nota Deno: el estado vive en memoria del worker. Si Supabase escala a múltiples workers,
 * cada uno tiene su propio contador — suficiente para protección local sin Redis.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  name:             string;
  failureThreshold: number;    // fallos consecutivos para abrir
  cooldownMs:       number;    // tiempo en OPEN antes de probar HALF_OPEN
  onOpen?:          () => void;
  onClose?:         () => void;
}

export interface CircuitBreaker {
  call<T>(fn: () => Promise<T>): Promise<T>;
  state: () => CircuitState;
  stats: () => { failures: number; state: CircuitState; openSince: number | null };
}

export function createCircuitBreaker(opts: CircuitBreakerOptions): CircuitBreaker {
  let state: CircuitState = 'CLOSED';
  let failureCount = 0;
  let openSince: number | null = null;
  let halfOpenAttemptInFlight = false;

  function toOpen() {
    state = 'OPEN';
    openSince = Date.now();
    failureCount = 0;
    console.log(JSON.stringify({
      level: 'warn',
      circuit: opts.name,
      event: 'circuit_opened',
      message: `Circuit breaker ${opts.name} ABIERTO — fast-fail activo`,
      timestamp: new Date().toISOString(),
    }));
    opts.onOpen?.();
  }

  function toClose() {
    state = 'CLOSED';
    openSince = null;
    failureCount = 0;
    halfOpenAttemptInFlight = false;
    console.log(JSON.stringify({
      level: 'info',
      circuit: opts.name,
      event: 'circuit_closed',
      message: `Circuit breaker ${opts.name} CERRADO — tráfico normal`,
      timestamp: new Date().toISOString(),
    }));
    opts.onClose?.();
  }

  async function call<T>(fn: () => Promise<T>): Promise<T> {
    if (state === 'OPEN') {
      const elapsed = Date.now() - (openSince ?? 0);
      if (elapsed < opts.cooldownMs) {
        throw new CircuitOpenError(opts.name, opts.cooldownMs - elapsed);
      }
      // Cooldown expirado → probar HALF_OPEN
      if (halfOpenAttemptInFlight) {
        throw new CircuitOpenError(opts.name, 0);
      }
      state = 'HALF_OPEN';
      halfOpenAttemptInFlight = true;
    }

    try {
      const result = await fn();
      // Éxito → reset
      if (state === 'HALF_OPEN') toClose();
      else failureCount = 0;
      return result;
    } catch (err) {
      if (err instanceof CircuitOpenError) throw err;

      failureCount++;
      if (state === 'HALF_OPEN') {
        toOpen();
      } else if (failureCount >= opts.failureThreshold) {
        toOpen();
      }
      throw err;
    }
  }

  return {
    call,
    state: () => state,
    stats: () => ({ failures: failureCount, state, openSince }),
  };
}

export class CircuitOpenError extends Error {
  constructor(public readonly circuit: string, public readonly retryInMs: number) {
    super(`Circuit breaker '${circuit}' abierto. Reintenta en ${Math.ceil(retryInMs / 1000)}s.`);
    this.name = 'CircuitOpenError';
  }
}
