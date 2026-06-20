import { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck, X } from 'lucide-react';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import {
  listNotifications, countUnread, markAsRead, markAllAsRead,
  type AppNotification,
} from '../../services/notifications';

const TYPE_COLORS: Record<string, { bg: string; dot: string }> = {
  success: { bg: '#F0FDF4', dot: '#22C55E' },
  warning: { bg: '#FFFBEB', dot: '#F59E0B' },
  danger:  { bg: '#FEF2F2', dot: '#EF4444' },
  info:    { bg: '#EFF6FF', dot: '#2563EB' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)  return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24)  return `hace ${hr}h`;
  return `hace ${Math.floor(hr / 24)}d`;
}

export function NotificationBell() {
  const { workspace } = useWorkspace();
  const [open,         setOpen]         = useState(false);
  const [unread,       setUnread]       = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading,      setLoading]      = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Contar no leídas cada 30s
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const n = await countUnread(workspace.id);
      if (!cancelled) setUnread(n);
    }
    poll();
    const t = setInterval(poll, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [workspace.id]);

  async function openPanel() {
    setOpen(true);
    setLoading(true);
    const data = await listNotifications(workspace.id, 20);
    setNotifications(data);
    setLoading(false);
  }

  async function handleRead(id: string) {
    await markAsRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnread(prev => Math.max(0, prev - 1));
  }

  async function handleMarkAll() {
    await markAllAsRead(workspace.id);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnread(0);
  }

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={dropRef} style={{ position: 'relative', flexShrink: 0 }}>
      {/* Botón campana */}
      <button
        aria-label="Notificaciones"
        onClick={() => open ? setOpen(false) : openPanel()}
        style={{
          border: 'none', background: 'none', padding: 0,
          cursor: 'pointer', width: 44, height: 44,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,.75)', position: 'relative',
        }}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 8, right: 8,
            width: 16, height: 16, borderRadius: '50%',
            background: '#EF4444', border: '2px solid #0B0F19',
            fontSize: 9, fontWeight: 800, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown de notificaciones */}
      {open && (
        <div style={{
          position: 'fixed', right: 12, top: 62, zIndex: 200,
          width: 340, maxWidth: 'calc(100vw - 24px)',
          background: '#fff', borderRadius: 16,
          border: '1px solid #E2E8F0',
          boxShadow: '0 16px 48px rgba(15,23,42,.18)',
          overflow: 'hidden',
        }}>
          {/* Header del dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', borderBottom: '1px solid #F1F5F9' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>
              Notificaciones {unread > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#EF4444', padding: '1px 6px', borderRadius: 99, marginLeft: 6 }}>{unread}</span>}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {unread > 0 && (
                <button onClick={handleMarkAll} title="Marcar todas como leídas"
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#2563EB', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600 }}>
                  <CheckCheck size={14} /> Leer todas
                </button>
              )}
              <button onClick={() => setOpen(false)}
                style={{ border: 'none', background: '#F1F5F9', borderRadius: 7, width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Lista */}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Cargando...</div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
                <div style={{ fontSize: 13, color: '#64748B' }}>Sin notificaciones aún</div>
              </div>
            ) : (
              notifications.map(n => {
                const tc = TYPE_COLORS[n.type] ?? TYPE_COLORS.info;
                return (
                  <div
                    key={n.id}
                    onClick={() => !n.is_read && handleRead(n.id)}
                    style={{
                      display: 'flex', gap: 10, padding: '12px 16px',
                      background: n.is_read ? '#fff' : tc.bg,
                      borderBottom: '1px solid #F8FAFC',
                      cursor: n.is_read ? 'default' : 'pointer',
                      transition: 'background .15s',
                    }}
                  >
                    {/* Dot indicador */}
                    <div style={{ paddingTop: 4, flexShrink: 0 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.is_read ? '#CBD5E1' : tc.dot }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: n.is_read ? 500 : 700, color: '#0F172A', lineHeight: 1.4 }}>{n.title}</div>
                      {n.message && <div style={{ fontSize: 12, color: '#64748B', marginTop: 2, lineHeight: 1.4 }}>{n.message}</div>}
                      <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 4 }}>{timeAgo(n.created_at)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
