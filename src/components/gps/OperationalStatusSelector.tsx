/**
 * OperationalStatusSelector — Selector de estado operativo.
 * Para que el usuario actualice su estado sin GPS.
 */
import { useUpdateOperationalStatus } from '../../hooks/useGPS';
import { OPERATIONAL_STATUS_META } from '../../services/gps';
import type { OperationalStatus } from '../../lib/database.types';

const SELECTABLE: OperationalStatus[] = ['disponible', 'en_ruta', 'en_sitio', 'finalizado', 'off'];

interface Props {
  current: OperationalStatus;
  onClose?: () => void;
}

export function OperationalStatusSelector({ current, onClose }: Props) {
  const updateMut = useUpdateOperationalStatus();

  async function handleSelect(status: OperationalStatus) {
    if (status === current) { onClose?.(); return; }
    await updateMut.mutateAsync(status);
    onClose?.();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 4 }}>
        Mi estado operativo
      </div>
      {SELECTABLE.map(status => {
        const meta  = OPERATIONAL_STATUS_META[status];
        const isActive = status === current;
        return (
          <button
            key={status}
            onClick={() => handleSelect(status)}
            disabled={updateMut.isPending}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderRadius: 12, border: 'none',
              background: isActive ? meta.bg : '#F8FAFC',
              cursor: updateMut.isPending ? 'not-allowed' : 'pointer',
              textAlign: 'left', transition: 'all .12s',
              outline: isActive ? `2px solid ${meta.color}` : 'none',
            }}
          >
            <span style={{
              width: 12, height: 12, borderRadius: '50%',
              background: meta.dotColor, flexShrink: 0,
            }} />
            <span style={{ fontSize: 14, fontWeight: isActive ? 700 : 500, color: isActive ? meta.color : '#374151' }}>
              {meta.label}
            </span>
            {isActive && (
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: meta.color }}>
                Actual
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
