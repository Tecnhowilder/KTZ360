import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Star, Trash2, X, Pencil, Archive, FileSpreadsheet } from 'lucide-react';
import { ImportCatalogModal } from '../components/catalog/ImportCatalogModal';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useAuth } from '../features/auth/AuthProvider';
import {
  listCatalogItems, createCatalogItem, updateCatalogItem,
  deleteCatalogItem, toggleFavoriteCatalogItem,
  type CatalogItem, type CatalogItemType, type CreateCatalogItemInput,
} from '../services/catalogItems';
import { useToast } from '../components/ui/Toast';
import { NumericInput } from '../components/ui/NumericInput';

const TYPE_TABS = [
  { key: 'all',     label: 'Todos' },
  { key: 'SERVICE', label: 'Servicios' },
  { key: 'PRODUCT', label: 'Productos' },
  { key: 'BUNDLE',  label: 'Combos' },
];
const TYPE_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  PRODUCT: { bg: '#DBEAFE', fg: '#1D4ED8', label: 'Producto' },
  SERVICE: { bg: '#D1FAE5', fg: '#065F46', label: 'Servicio' },
  BUNDLE:  { bg: '#EDE9FE', fg: '#6D28D9', label: 'Combo'   },
};
const UNIT_OPTIONS = ['und', 'm²', 'm', 'kg', 'L', 'hrs', 'días', 'mes', 'global', 'caja', 'rollo', 'par', 'kit', 'visita'];
const emptyForm = (): CreateCatalogItemInput => ({ type: 'SERVICE', name: '', unit: 'und', price: 0 });

export function CatalogPage() {
  const { workspace } = useWorkspace();
  const { user }      = useAuth();
  const qc            = useQueryClient();
  const { showToast } = useToast();

  const [typeFilter, setTypeFilter] = useState('all');
  const [search,     setSearch]     = useState('');
  const [formOpen,   setFormOpen]   = useState(false);
  const [form,       setForm]       = useState<CreateCatalogItemInput>(emptyForm());
  const [editItem,    setEditItem]    = useState<CatalogItem | null>(null);
  const [confirmDel,  setConfirmDel]  = useState<CatalogItem | null>(null);
  const [importOpen,  setImportOpen]  = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['catalogItems', workspace.id] });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['catalogItems', workspace.id],
    queryFn:  () => listCatalogItems(workspace.id),
  });

  const createMut = useMutation({
    mutationFn: (input: CreateCatalogItemInput) => createCatalogItem(workspace.id, user!.id, input),
    onSuccess: () => { invalidate(); showToast('Ítem creado ✓'); setFormOpen(false); setForm(emptyForm()); },
    onError:   () => showToast('Error al crear ítem'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CatalogItem> }) => updateCatalogItem(id, patch),
    onSuccess: () => { invalidate(); showToast('Ítem actualizado ✓'); setEditItem(null); },
    onError:   () => showToast('Error al actualizar'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCatalogItem(id),
    onSuccess: () => { invalidate(); showToast('Ítem eliminado'); setConfirmDel(null); },
    onError:   () => showToast('Error al eliminar'),
  });

  const favMut = useMutation({
    mutationFn: ({ id, fav }: { id: string; fav: boolean }) => toggleFavoriteCatalogItem(id, fav),
    onSuccess: () => invalidate(),
  });

  const archiveMut = useMutation({
    mutationFn: (id: string) => updateCatalogItem(id, { status: 'inactive' }),
    onSuccess: () => { invalidate(); showToast('Ítem archivado'); },
    onError:   () => showToast('Error al archivar'),
  });

  const filtered = items.filter(i => {
    const matchType   = typeFilter === 'all' || i.type === typeFilter;
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  // Formulario de edición inicializado con datos del ítem
  function openEdit(item: CatalogItem) {
    setForm({ type: item.type, name: item.name, description: item.description ?? '', unit: item.unit, price: item.price });
    setEditItem(item);
    setFormOpen(true);
  }

  function handleFormSave() {
    if (!form.name.trim()) return;
    if (editItem) {
      updateMut.mutate({ id: editItem.id, patch: { type: form.type, name: form.name, description: form.description, unit: form.unit, price: form.price } });
    } else {
      createMut.mutate(form);
    }
  }

  function closeForm() { setFormOpen(false); setForm(emptyForm()); setEditItem(null); }

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ background: '#fff', padding: '20px 16px 0', borderBottom: '1px solid #F1F5F9', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Catálogo</h1>
            <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2 }}>{items.length} ítems</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setImportOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, padding: '9px 14px', borderRadius: 11, cursor: 'pointer' }}>
              <FileSpreadsheet size={15} /> Excel
            </button>
            <button onClick={() => { setForm(emptyForm()); setEditItem(null); setFormOpen(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 14, padding: '10px 16px', borderRadius: 12, cursor: 'pointer' }}>
              <Plus size={16} /> Agregar
            </button>
          </div>
        </div>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input type="search" placeholder="Buscar en catálogo..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', height: 42, border: '1px solid #E2E8F0', borderRadius: 12, paddingLeft: 36, fontSize: 14, outline: 'none', background: '#F8FAFC', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, scrollbarWidth: 'none' }}>
          {TYPE_TABS.map(t => (
            <button key={t.key} onClick={() => setTypeFilter(t.key)} style={{ flexShrink: 0, border: 'none', cursor: 'pointer', background: typeFilter === t.key ? '#2563EB' : '#F1F5F9', color: typeFilter === t.key ? '#fff' : '#475569', fontWeight: typeFilter === t.key ? 700 : 500, fontSize: 13, padding: '7px 14px', borderRadius: 99, fontFamily: 'inherit' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div style={{ background: '#fff', marginTop: 8 }}>
        {isLoading ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: '#94A3B8' }}>Cargando...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 24px' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Catálogo vacío</div>
            <div style={{ fontSize: 13.5, color: '#64748B', marginBottom: 24 }}>Agrega productos y servicios para cotizar más rápido</div>
            <button onClick={() => { setForm(emptyForm()); setFormOpen(true); }} style={{ border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 14, padding: '12px 24px', borderRadius: 12, cursor: 'pointer' }}>
              + Agregar primer ítem
            </button>
          </div>
        ) : (
          filtered.map(item => {
            const tc = TYPE_COLORS[item.type] ?? { bg: '#F1F5F9', fg: '#475569', label: item.type };
            return (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid #F8FAFC' }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: tc.bg, color: tc.fg, fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {item.name[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: '#64748B', display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                    <span style={{ background: tc.bg, color: tc.fg, padding: '1px 7px', borderRadius: 99, fontWeight: 600, fontSize: 10 }}>{tc.label}</span>
                    <span>{item.unit}</span>
                    <span>·</span>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>${item.price.toLocaleString('es-CO')}</span>
                  </div>
                </div>
                {/* Acciones */}
                <button onClick={() => favMut.mutate({ id: item.id, fav: !item.favorite })}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: item.favorite ? '#F59E0B' : '#CBD5E1', padding: 4 }}>
                  <Star size={18} fill={item.favorite ? '#F59E0B' : 'none'} />
                </button>
                <button onClick={() => openEdit(item)}
                  style={{ border: 'none', background: '#EFF6FF', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#2563EB' }}>
                  <Pencil size={13} />
                </button>
                <button onClick={() => archiveMut.mutate(item.id)} title="Archivar"
                  style={{ border: 'none', background: '#FFFBEB', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#D97706' }}>
                  <Archive size={13} />
                </button>
                <button onClick={() => setConfirmDel(item)}
                  style={{ border: 'none', background: '#FEF2F2', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#EF4444' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom sheet: crear / editar */}
      {formOpen && (
        <>
          <div onClick={closeForm} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(15,23,42,.4)' }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60, background: '#fff', borderRadius: '20px 20px 0 0', padding: '16px 16px', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))', boxShadow: '0 -8px 40px rgba(15,23,42,.15)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <div style={{ width: 36, height: 4, borderRadius: 99, background: '#E2E8F0' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>{editItem ? 'Editar ítem' : 'Nuevo ítem'}</span>
              <button onClick={closeForm} style={{ border: 'none', background: '#F1F5F9', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
                <X size={15} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Tipo */}
              <div>
                <label style={ls}>Tipo</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['SERVICE','PRODUCT','BUNDLE'] as CatalogItemType[]).map(t => (
                    <button key={t} onClick={() => setForm(p => ({ ...p, type: t }))}
                      style={{ flex: 1, padding: '8px 0', border: '1.5px solid', borderColor: form.type === t ? '#2563EB' : '#E2E8F0', borderRadius: 10, background: form.type === t ? '#EFF6FF' : '#fff', color: form.type === t ? '#2563EB' : '#64748B', fontWeight: form.type === t ? 700 : 500, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {t === 'SERVICE' ? 'Servicio' : t === 'PRODUCT' ? 'Producto' : 'Combo'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={ls}>Nombre *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Diseño de logo" style={is} autoFocus={!editItem} />
              </div>
              <div>
                <label style={ls}>Descripción <span style={{ color: '#94A3B8', fontWeight: 400 }}>(opcional)</span></label>
                <input value={form.description || ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Detalle..." style={is} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={ls}>Unidad</label>
                  <select value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} style={is}>
                    {UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label style={ls}>Precio</label>
                  <NumericInput value={form.price} onChange={v => setForm(p => ({ ...p, price: v }))} min={0} prefix="$" />
                </div>
              </div>
              <button onClick={handleFormSave} disabled={!form.name.trim() || isSaving}
                style={{ height: 50, border: 'none', background: form.name.trim() ? '#2563EB' : '#E2E8F0', color: form.name.trim() ? '#fff' : '#94A3B8', fontWeight: 700, fontSize: 15, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                {isSaving ? 'Guardando...' : editItem ? 'Guardar cambios' : 'Crear ítem'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Confirmar eliminar */}
      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
          onClick={() => setConfirmDel(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: 24, maxWidth: 360, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🗑️</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>¿Eliminar "{confirmDel.name}"?</div>
            <div style={{ fontSize: 13, color: '#64748B', marginBottom: 20 }}>El ítem se eliminará del catálogo. Las cotizaciones existentes no se verán afectadas.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDel(null)} style={{ flex: 1, height: 44, border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 14, borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={() => deleteMut.mutate(confirmDel.id)} disabled={deleteMut.isPending}
                style={{ flex: 1, height: 44, border: 'none', background: '#EF4444', color: '#fff', fontWeight: 700, fontSize: 14, borderRadius: 11, cursor: 'pointer', opacity: deleteMut.isPending ? .7 : 1, fontFamily: 'inherit' }}>
                {deleteMut.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <ImportCatalogModal
          onClose={() => setImportOpen(false)}
          onImported={() => { invalidate(); setImportOpen(false); }}
        />
      )}
    </div>
  );
}

const ls: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, color: '#0F172A', marginBottom: 6 };
const is: React.CSSProperties = { width: '100%', height: 44, border: '1px solid #E2E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
