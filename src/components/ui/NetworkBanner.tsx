/**
 * NetworkBanner — Indicador de estado de red y sincronización offline (Sprint 22)
 *
 * Muestra banner cuando: offline, poor connection, o hay ítems pendientes de sync.
 * Se coloca en AppShell sobre el contenido principal.
 */
import { Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

export function NetworkBanner() {
  const { quality, pendingCount, lastSyncAt, isSyncing, triggerSync } = useNetworkStatus();

  // No mostrar si todo está bien y no hay pendientes
  if (quality === 'online' && pendingCount === 0) return null;

  const isOffline = quality === 'offline';
  const isPoor    = quality === 'poor';

  const bg    = isOffline ? '#FEF2F2' : isPoor ? '#FFFBEB' : '#EFF6FF';
  const color = isOffline ? '#DC2626'  : isPoor ? '#D97706' : '#2563EB';
  const icon  = isOffline
    ? <WifiOff size={14} />
    : isPoor
      ? <AlertTriangle size={14} />
      : <Wifi size={14} />;

  const text = isOffline
    ? 'Sin conexión — los cambios se guardarán localmente'
    : isPoor
      ? 'Conexión lenta — sincronizando en segundo plano'
      : `${pendingCount} operación${pendingCount !== 1 ? 'es' : ''} pendiente${pendingCount !== 1 ? 's' : ''} de sincronizar`;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Estado de red: ${text}`}
      style={{
        background:   bg,
        borderBottom: `1px solid ${color}22`,
        padding:      '7px 14px',
        display:      'flex',
        alignItems:   'center',
        gap:          8,
        fontSize:     12.5,
        color,
        fontWeight:   600,
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex', color }}>{icon}</span>
      <span style={{ flex: 1 }}>{text}</span>

      {/* Última sincronización */}
      {lastSyncAt && !isOffline && (
        <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 400 }}>
          Sync: {lastSyncAt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}

      {/* Botón sincronizar manualmente */}
      {pendingCount > 0 && quality === 'online' && (
        <button
          onClick={triggerSync}
          disabled={isSyncing}
          aria-label="Sincronizar ahora"
          style={{
            border:     'none',
            background: 'none',
            cursor:     isSyncing ? 'not-allowed' : 'pointer',
            color,
            display:    'flex',
            alignItems: 'center',
            gap:        4,
            padding:    '2px 6px',
            borderRadius: 6,
            fontSize:   11.5,
            fontWeight: 700,
          }}
        >
          {isSyncing
            ? <><RefreshCw size={12} style={{ animation: 'spin .8s linear infinite' }} /> Sincronizando…</>
            : <><RefreshCw size={12} /> Sincronizar</>
          }
        </button>
      )}

      {/* Check cuando está todo sincronizado */}
      {pendingCount === 0 && quality === 'online' && (
        <CheckCircle size={14} color="#16A34A" />
      )}
    </div>
  );
}
