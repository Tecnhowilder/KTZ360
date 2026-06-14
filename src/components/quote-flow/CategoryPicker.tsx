import { useState } from 'react';
import {
  LayoutGrid,
  PaintRoller,
  PanelsTopLeft,
  Zap,
  Wrench,
  Blocks,
  ShowerHead,
  ChefHat,
  Triangle,
  Droplet,
  Waves,
  Building2,
  type LucideIcon,
} from 'lucide-react';
import type { CatalogCategoryRow } from '../../lib/database.types';

const ICON_MAP: Record<string, { icon: LucideIcon; color: string }> = {
  pintura: { icon: PaintRoller, color: '#2563EB' },
  pisos: { icon: LayoutGrid, color: '#2563EB' },
  drywall: { icon: PanelsTopLeft, color: '#2563EB' },
  electricidad: { icon: Zap, color: '#F59E0B' },
  plomeria: { icon: Wrench, color: '#2563EB' },
  mamposteria: { icon: Blocks, color: '#F97316' },
  remodelacion_banos: { icon: ShowerHead, color: '#2563EB' },
  remodelacion_cocinas: { icon: ChefHat, color: '#EC4899' },
  cubiertas: { icon: Triangle, color: '#EF4444' },
  impermeabilizacion: { icon: Droplet, color: '#0EA5E9' },
  piscinas: { icon: Waves, color: '#06B6D4' },
  obra_gris: { icon: Building2, color: '#64748B' },
};

function CategoryImage({ category, selected }: { category: CatalogCategoryRow; selected: boolean }) {
  const [failed, setFailed] = useState(false);
  const iconInfo = (category.icon && ICON_MAP[category.icon]) || { icon: LayoutGrid, color: '#2563EB' };
  const Icon = iconInfo.icon;

  return (
    <div style={{ aspectRatio: '4/3', position: 'relative', overflow: 'hidden', background: '#F1F5F9' }}>
      {!failed && category.image_path ? (
        <img
          src={category.image_path}
          alt={category.name}
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', background: 'repeating-linear-gradient(45deg,#EEF2FF,#EEF2FF 8px,#F8FAFF 8px,#F8FAFF 16px)' }} />
      )}

      <span
        style={{
          position: 'absolute',
          bottom: 10,
          left: 10,
          width: 38,
          height: 38,
          borderRadius: 12,
          background: '#fff',
          color: iconInfo.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(15,23,42,.12)',
        }}
      >
        <Icon size={19} />
      </span>

      {selected && (
        <span
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: '#2563EB',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          ✓
        </span>
      )}
    </div>
  );
}

export function CategoryPicker({
  categories,
  selectedId,
  onSelect,
}: {
  categories: CatalogCategoryRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <LayoutGrid size={20} />
        </span>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#0F172A' }}>Categorías de servicio</div>
      </div>
      <p style={{ fontSize: 13, color: '#64748B', margin: '4px 0 16px' }}>
        Selecciona la categoría que mejor describe el trabajo que necesitas.
      </p>

      <div className="qf-cat-grid">
        {categories.map((c) => {
          const selected = selectedId === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`qf-cat-card${selected ? ' qf-cat-card--active' : ''}`}
            >
              <CategoryImage category={c} selected={selected} />
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 2 }}>{c.name}</div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: '#64748B',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {c.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
