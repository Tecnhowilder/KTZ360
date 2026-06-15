import { supabase } from '../lib/supabaseClient';
import type { Json } from '../lib/database.types';

/**
 * Registro centralizado de auditoría. Wrapper único del patrón
 * `insert into audit_log` (RLS `audit_log_insert_own` permite
 * `user_id = auth.uid()`). Best-effort: nunca bloquea el flujo de UI.
 */
export async function logEvent(
  workspaceId: string,
  userId: string | null,
  action: string,
  entityType: string = 'app',
  entityId?: string | null,
  metadata: Json = {},
): Promise<void> {
  try {
    await supabase.from('audit_log').insert({
      workspace_id: workspaceId,
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      metadata,
    });
  } catch {
    // best-effort
  }
}
