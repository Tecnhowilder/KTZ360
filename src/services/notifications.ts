import { supabase } from '../lib/supabaseClient';

export interface AppNotification {
  id: string;
  workspace_id: string;
  user_id: string | null;
  title: string;
  message: string | null;
  type: 'info' | 'success' | 'warning' | 'danger';
  is_read: boolean;
  created_at: string;
  /** Metadatos opcionales: quote_id, client_name, quote_number */
  metadata?: Record<string, unknown>;
}

export async function createNotification(
  workspaceId: string,
  notification: {
    title: string;
    message?: string;
    type?: AppNotification['type'];
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await supabase.from('notifications').insert({
      workspace_id: workspaceId,
      title: notification.title,
      message: notification.message ?? null,
      type: notification.type ?? 'info',
      is_read: false,
    });
  } catch { /* silencioso — las notificaciones no deben bloquear el flujo */ }
}

export async function listNotifications(
  workspaceId: string,
  limit = 20
): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as AppNotification[];
}

export async function countUnread(workspaceId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('is_read', false);
  if (error) return 0;
  return count ?? 0;
}

export async function markAsRead(notificationId: string): Promise<void> {
  await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId);
}

export async function markAllAsRead(workspaceId: string): Promise<void> {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('workspace_id', workspaceId)
    .eq('is_read', false);
}
