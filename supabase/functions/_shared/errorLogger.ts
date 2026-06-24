/**
 * errorLogger.ts — Structured error logging for Shelwi Edge Functions
 *
 * Logs errors to Supabase's built-in function logs (visible in Dashboard → Edge Functions → Logs).
 * If SENTRY_DSN is configured, also sends errors to Sentry via HTTP (edge-compatible).
 *
 * Usage:
 *   import { logEdgeError } from '../_shared/errorLogger.ts';
 *   logEdgeError('ai-proxy', error, { workspace_id: '...', operation: '...' });
 */

const SENTRY_DSN = Deno.env.get('SENTRY_DSN');

export interface ErrorContext {
  [key: string]: string | number | boolean | null | undefined;
}

export function logEdgeError(
  functionName: string,
  error: unknown,
  context: ErrorContext = {},
): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack   = error instanceof Error ? error.stack  : undefined;

  // Always log to Supabase function logs (console.error)
  console.error(JSON.stringify({
    level:    'error',
    function: functionName,
    message,
    stack,
    context,
    timestamp: new Date().toISOString(),
  }));

  // Fire-and-forget Sentry envelope if DSN configured
  if (SENTRY_DSN) {
    sendToSentry(functionName, message, stack, context).catch(() => {});
  }
}

async function sendToSentry(
  functionName: string,
  message:      string,
  stack:        string | undefined,
  context:      ErrorContext,
): Promise<void> {
  try {
    // Parse Sentry DSN  — format: https://{key}@{host}/{project_id}
    const url    = new URL(SENTRY_DSN!);
    const key    = url.username;
    const host   = url.hostname;
    const projId = url.pathname.replace('/', '');
    const endpoint = `https://${host}/api/${projId}/store/`;

    const envelope = {
      exception: {
        values: [{
          type:       'Error',
          value:      message,
          stacktrace: stack ? { frames: [{ filename: functionName, function: functionName, raw_function: stack }] } : undefined,
        }],
      },
      level:     'error',
      platform:  'javascript',
      environment: Deno.env.get('ENVIRONMENT') ?? 'production',
      tags: {
        edge_function: functionName,
        ...Object.fromEntries(
          Object.entries(context).filter(([, v]) => v !== undefined && v !== null)
        ),
      },
    };

    await fetch(endpoint, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${key}`,
      },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(3000), // 3s máximo para no bloquear la respuesta
    });
  } catch {
    // Silencioso: nunca bloquear por error de observabilidad
  }
}
