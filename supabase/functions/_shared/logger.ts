/**
 * logger.ts — Observabilidad centralizada para Edge Functions de Shelwi.
 *
 * Características:
 *  - X-Request-ID: generado automáticamente o propagado desde el header de entrada.
 *  - Correlation ID: mismo request_id viaja en la respuesta para trazabilidad.
 *  - Logs estructurados en JSON: legibles por Supabase Log Drain y parsers externos.
 *  - Registro opcional en edge_function_logs (tabla DB) para queries ad-hoc y SLO dashboard.
 *  - Integración con Sentry vía errorLogger.ts (solo errores).
 *  - Silencioso ante errores propios: NUNCA bloquea la respuesta principal.
 *
 * Uso:
 *   const log = createLogger('ai-proxy', req.headers.get('x-request-id'));
 *   log.info('Gemini invocado', { workspace_id, operation });
 *   log.error('Timeout', error, { workspace_id });
 *   return new Response(..., { headers: log.responseHeaders() });
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logEdgeError } from './errorLogger.ts';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogContext {
  workspace_id?: string;
  [key: string]: string | number | boolean | null | undefined;
}

// Supabase client a nivel módulo — reutilizado entre invocaciones (service role para insertar logs)
const _supabaseUrl        = Deno.env.get('SUPABASE_URL')!;
const _serviceRoleKey     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const _logClient          = createClient(_supabaseUrl, _serviceRoleKey);
const DB_LOGGING_ENABLED  = Deno.env.get('EF_DB_LOGGING') === 'true'; // opt-in para no impactar performance en todos los envs

export interface Logger {
  requestId: string;
  info:  (message: string, ctx?: LogContext) => void;
  warn:  (message: string, ctx?: LogContext) => void;
  error: (message: string, error?: unknown, ctx?: LogContext) => void;
  /** Registra duración y cierra el ciclo. Llamar al final del handler. */
  finish: (statusCode: number, durationMs: number, ctx?: LogContext) => void;
  /** Headers a incluir en la Response para propagación de X-Request-ID. */
  responseHeaders: () => Record<string, string>;
}

export function createLogger(functionName: string, incomingRequestId?: string | null): Logger {
  const requestId = incomingRequestId ?? crypto.randomUUID();

  function emit(level: LogLevel, message: string, ctx: LogContext = {}) {
    const entry = {
      level,
      function:   functionName,
      request_id: requestId,
      message,
      ...ctx,
      timestamp: new Date().toISOString(),
    };
    if (level === 'error') {
      console.error(JSON.stringify(entry));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  }

  function persistToDb(level: LogLevel, message: string, ctx: LogContext, durationMs?: number) {
    if (!DB_LOGGING_ENABLED) return;
    void (async () => {
      try {
        const { error } = await _logClient
          .from('edge_function_logs')
          .insert({
            function_name: functionName,
            request_id:    requestId,
            level,
            message,
            context:       ctx,
            duration_ms:   durationMs ?? null,
            workspace_id:  ctx.workspace_id ?? null,
          });
        if (error) console.warn(JSON.stringify({ level: 'warn', function: '_logger', message: 'DB log failed', error: error.message }));
      } catch { /* DB logging is non-critical */ }
    })();
  }

  return {
    requestId,

    info(message, ctx = {}) {
      emit('info', message, ctx);
      persistToDb('info', message, ctx);
    },

    warn(message, ctx = {}) {
      emit('warn', message, ctx);
      persistToDb('warn', message, ctx);
    },

    error(message, error, ctx = {}) {
      emit('error', message, ctx);
      if (error) logEdgeError(functionName, error, { request_id: requestId, ...ctx });
      persistToDb('error', message, { ...ctx, error_message: error instanceof Error ? error.message : String(error ?? '') });
    },

    finish(statusCode, durationMs, ctx = {}) {
      const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
      const message = `${functionName} → ${statusCode} (${durationMs}ms)`;
      emit(level, message, { ...ctx, status_code: statusCode, duration_ms: durationMs });
      persistToDb(level, message, { ...ctx, status_code: statusCode }, durationMs);
    },

    responseHeaders() {
      return { 'x-request-id': requestId };
    },
  };
}
