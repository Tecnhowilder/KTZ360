import { fmt } from '../../lib/calc';
import type { ServiceLine } from '../../lib/engine';

export function ServiceLinesList({ lines, onRemove }: { lines: ServiceLine[]; onRemove: (id: string) => void }) {
  if (lines.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Servicios agregados a esta cotización</div>
      {lines.map((l) => (
        <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 13, padding: '11px 13px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{l.service_name}{l.variant_name ? ' · ' + l.variant_name : ''}</div>
            <div style={{ fontSize: 11.5, color: '#64748B' }}>{l.quantity_basis} {l.unit_label}</div>
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(l.lineTotal)}</div>
          <button
            onClick={() => onRemove(l.id)}
            style={{ width: 30, height: 30, borderRadius: 9, border: 'none', background: '#FEF2F2', color: '#DC2626', fontSize: 14, cursor: 'pointer', flexShrink: 0 }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
