import type { CatalogServiceRow } from '../../lib/database.types';
import type { CatalogVariant } from '../../lib/engine';

export function ServicePicker({
  services, selectedServiceId, onSelectService, variants, selectedVariantId, onSelectVariant,
}: {
  services: CatalogServiceRow[];
  selectedServiceId: string | null;
  onSelectService: (id: string) => void;
  variants: CatalogVariant[];
  selectedVariantId: string | null;
  onSelectVariant: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Servicio</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {services.map((s) => {
            const selected = selectedServiceId === s.id;
            return (
              <button
                key={s.id}
                onClick={() => onSelectService(s.id)}
                style={{ border: `1.5px solid ${selected ? '#2563EB' : '#E2E8F0'}`, background: selected ? '#2563EB' : '#fff', color: selected ? '#fff' : '#475569', fontWeight: 700, fontSize: 13, padding: '10px 14px', borderRadius: 12, cursor: 'pointer' }}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      </div>

      {variants.length > 0 && (
        <div>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>Variante</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {variants.map((v) => {
              const selected = selectedVariantId === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => onSelectVariant(v.id)}
                  style={{ border: `1.5px solid ${selected ? '#2563EB' : '#E2E8F0'}`, background: selected ? '#EEF2FF' : '#fff', color: selected ? '#1E40AF' : '#475569', fontWeight: 700, fontSize: 12.5, padding: '9px 13px', borderRadius: 11, cursor: 'pointer' }}
                >
                  {v.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
