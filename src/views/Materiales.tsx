import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useAuth } from '../features/auth/AuthProvider';
import { listMaterials, createMaterial, updateMaterial, type MaterialInput } from '../services/materials';
import { listCatalogMaterials, listPriceOverrides, upsertPriceOverride, deletePriceOverride } from '../services/catalogV2';
import { fmt } from '../lib/calc';
import { useToast } from '../components/ui/Toast';
import type { Material } from '../lib/types';

function CatalogPriceTable() {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();

  const materialsQuery = useQuery({ queryKey: ['catalog-materials'], queryFn: listCatalogMaterials });
  const overridesQuery = useQuery({ queryKey: ['price-overrides', workspace.id], queryFn: () => listPriceOverrides(workspace.id) });

  const mutation = useMutation({
    mutationFn: async ({ materialId, value, suggested }: { materialId: string; value: string; suggested: number }) => {
      const num = parseFloat(value);
      if (!value.trim() || Number.isNaN(num) || num === suggested) {
        await deletePriceOverride(workspace.id, 'material', materialId);
      } else {
        await upsertPriceOverride(workspace.id, 'material', materialId, num);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['price-overrides', workspace.id] }),
  });

  if (materialsQuery.isLoading || !materialsQuery.data || !overridesQuery.data) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Catálogo de precios sugeridos</h2>
      <p style={{ fontSize: 13, color: '#64748B', marginBottom: 14 }}>
        Precios de referencia del motor de Brivia para el mercado colombiano. Si dejas tu precio vacío o igual al sugerido, se usa el valor sugerido.
      </p>
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, overflow: 'hidden' }}>
        <div style={{ display: 'flex', padding: '12px 16px', background: '#F8FAFC', borderBottom: '1px solid #EEF2F7', fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '.5px' }}>
          <span style={{ flex: 1 }}>MATERIAL</span>
          <span style={{ width: 170, textAlign: 'right' }}>MÍN · SUGERIDO · MÁX</span>
          <span style={{ width: 100, textAlign: 'right' }}>TU PRECIO</span>
        </div>
        {materialsQuery.data.map((m) => {
          const override = overridesQuery.data.get(`material:${m.id}`);
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{m.name}</div>
                <div style={{ fontSize: 11.5, color: '#64748B' }}>por {m.unit}</div>
              </div>
              <div style={{ width: 170, textAlign: 'right', fontSize: 12, color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(m.precio_minimo)} · {fmt(m.precio_sugerido)} · {fmt(m.precio_maximo)}
              </div>
              <div style={{ width: 100, flexShrink: 0 }}>
                <input
                  type="number"
                  min={0}
                  step="any"
                  defaultValue={override ?? ''}
                  placeholder={String(m.precio_sugerido)}
                  onBlur={(e) => mutation.mutate({ materialId: m.id, value: e.target.value, suggested: m.precio_sugerido })}
                  style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: 9, padding: '7px 8px', fontSize: 12.5, fontWeight: 700, textAlign: 'right', outline: 'none' }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Materiales() {
  const { workspace } = useWorkspace();
  const [editing, setEditing] = useState<Material | 'new' | null>(null);

  const query = useQuery({
    queryKey: ['materials', workspace.id],
    queryFn: () => listMaterials(workspace.id),
  });

  if (query.isLoading || !query.data) return null;

  return (
    <div>
      <h1 style={{ fontSize: 'clamp(22px,4vw,30px)', fontWeight: 800, letterSpacing: '-1px', marginBottom: 18 }}>Materiales</h1>

      <CatalogPriceTable />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800 }}>Tus materiales personalizados</h2>
        <button
          onClick={() => setEditing('new')}
          style={{ border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 14, padding: '11px 17px', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}
        >
          <span style={{ fontSize: 17 }}>+</span> Agregar
        </button>
      </div>
      <p style={{ fontSize: 13.5, color: '#64748B', marginBottom: 18 }}>Materiales propios fuera del catálogo de Brivia, para tu referencia.</p>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, overflow: 'hidden' }}>
        <div style={{ display: 'flex', padding: '12px 16px', background: '#F8FAFC', borderBottom: '1px solid #EEF2F7', fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '.5px' }}>
          <span style={{ flex: 1 }}>MATERIAL</span>
          <span style={{ width: 90, textAlign: 'right' }}>PRECIO</span>
        </div>
        {query.data.map((m) => (
          <div
            key={m.id}
            onClick={() => setEditing(m)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'repeating-linear-gradient(45deg,#EEF2FF,#EEF2FF 5px,#F8FAFF 5px,#F8FAFF 10px)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{m.name}</div>
              <div style={{ fontSize: 11.5, color: '#64748B' }}>{m.category || 'General'} · por {m.unit}</div>
            </div>
            <div style={{ width: 90, textAlign: 'right', fontSize: 13.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(m.price)}</div>
          </div>
        ))}
        {query.data.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: '#94A3B8' }}>Aún no tienes materiales registrados.</div>
        )}
      </div>

      {editing && <MaterialModal material={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MaterialModal({ material, onClose }: { material: Material | null; onClose: () => void }) {
  const { workspace } = useWorkspace();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [name, setName] = useState(material?.name ?? '');
  const [unit, setUnit] = useState(material?.unit ?? '');
  const [category, setCategory] = useState(material?.category ?? '');
  const [price, setPrice] = useState(String(material?.price ?? ''));

  const mutation = useMutation({
    mutationFn: () => {
      const input: MaterialInput = { name, unit, category: category || null, price: Number(price) || 0 };
      return material ? updateMaterial(material.id, input) : createMaterial(workspace.id, user!.id, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials', workspace.id] });
      showToast(material ? 'Material actualizado' : 'Material creado');
      onClose();
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !unit.trim()) return;
    mutation.mutate();
  }

  const inputStyle: React.CSSProperties = { width: '100%', border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '11px 13px', fontSize: 14, outline: 'none' };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 400, animation: 'pop .25s ease' }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 16 }}>{material ? 'Editar material' : 'Nuevo material'}</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Nombre</label>
            <input style={inputStyle} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Pintura tipo 1" />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Unidad</label>
              <input style={inputStyle} required value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="galón, m², kg…" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Categoría</label>
              <input style={inputStyle} value={category ?? ''} onChange={(e) => setCategory(e.target.value)} placeholder="Pintura" />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Precio</label>
            <input style={inputStyle} required type="number" min={0} step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 14, padding: 12, borderRadius: 11, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending} style={{ flex: 1, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 14, padding: 12, borderRadius: 11, cursor: 'pointer', opacity: mutation.isPending ? 0.7 : 1 }}>
              {mutation.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
