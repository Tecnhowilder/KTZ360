import { useState, useEffect } from 'react';
import { X, Search, Star, Clock, Package, TrendingUp, Plus, Check } from 'lucide-react';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useAuth } from '../../features/auth/AuthProvider';
import {
  listCatalogItems, getFavoriteCatalogItems, getRecentCatalogItems,
  createCatalogItem,
  type CatalogItem, type CatalogItemType,
} from '../../services/catalogItems';
import { computeItemSubtotal, type QuoteItem, type ItemType } from '../../lib/itemEngine';
import { NumericInput } from '../ui/NumericInput';

type SheetTab = 'favorites' | 'recents' | 'most_used' | 'catalog' | 'manual';

interface Props {
  onAdd: (item: QuoteItem) => void;
  onClose: () => void;
}

const UNIT_OPTIONS = ['und', 'm²', 'm', 'kg', 'L', 'hrs', 'días', 'mes', 'global', 'caja', 'rollo', 'par', 'kit'];
const TYPE_OPTIONS: { value: ItemType; label: string }[] = [
  { value: 'PRODUCT', label: '📦 Producto' },
  { value: 'SERVICE', label: '🔧 Servicio' },
  { value: 'BUNDLE',  label: '🎁 Combo' },
  { value: 'MANUAL',  label: '✏️ Manual' },
];

const EMPTY_MANUAL = () => ({
  item_name: '', description: '', quantity: 1,
  unit: 'und', unit_price: 0, discount: 0, type: 'SERVICE' as ItemType,
});

export function AddItemSheet({ onAdd, onClose }: Props) {
  const { workspace } = useWorkspace();
  const { user } = useAuth();
  const [tab, setTab] = useState<SheetTab>('catalog');
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<CatalogItem[]>([]);
  const [recents, setRecents]   = useState<CatalogItem[]>([]);
  const [catalog, setCatalog]   = useState<CatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [manual, setManual] = useState(EMPTY_MANUAL());
  // Auto-save prompt
  const [pendingManualItem, setPendingManualItem] = useState<QuoteItem | null>(null);
  const [savingToCatalog, setSavingToCatalog] = useState(false);

  useEffect(() => {
    getFavoriteCatalogItems(workspace.id).then(setFavorites).catch(() => {});
    getRecentCatalogItems(workspace.id).then(setRecents).catch(() => {});
    setLoadingCatalog(true);
    listCatalogItems(workspace.id)
      .then(setCatalog).catch(() => {}).finally(() => setLoadingCatalog(false));
  }, [workspace.id]);

  const mostUsed = [...catalog].sort((a, b) => b.use_count - a.use_count).slice(0, 10);

  function fromCatalog(item: CatalogItem) {
    // Incrementar use_count localmente (optimistic update)
    setCatalog(prev => prev.map(i => i.id === item.id ? { ...i, use_count: i.use_count + 1 } : i));
    const qi: QuoteItem = {
      type: item.type, item_name: item.name,
      description: item.description ?? undefined,
      quantity: 1, unit: item.unit, unit_price: item.price,
      discount: 0, subtotal: item.price,
      catalog_item_id: item.id,
    };
    onAdd(qi);
  }

  async function submitManual() {
    if (!manual.item_name.trim()) return;
    const subtotal = computeItemSubtotal(manual);
    const qi: QuoteItem = { ...manual, subtotal };
    // Si el tipo no es MANUAL, ofrecer guardar en catálogo
    setPendingManualItem(qi);
  }

  async function saveManualToCatalog() {
    if (!pendingManualItem || !user) return;
    setSavingToCatalog(true);
    try {
      await createCatalogItem(workspace.id, user.id, {
        type: (pendingManualItem.type === 'MANUAL' ? 'SERVICE' : pendingManualItem.type) as CatalogItemType,
        name: pendingManualItem.item_name,
        description: pendingManualItem.description,
        unit: pendingManualItem.unit,
        price: pendingManualItem.unit_price,
      });
      // Refrescar catálogo
      listCatalogItems(workspace.id).then(setCatalog).catch(() => {});
    } catch { /* continuar igual */ }
    setSavingToCatalog(false);
    onAdd(pendingManualItem);
    setPendingManualItem(null);
    setManual(EMPTY_MANUAL());
  }

  function skipSaveToCatalog() {
    if (pendingManualItem) onAdd(pendingManualItem);
    setPendingManualItem(null);
    setManual(EMPTY_MANUAL());
  }

  const filterFn = (i: CatalogItem) => !search || i.name.toLowerCase().includes(search.toLowerCase());

  const TABS = [
    { key: 'favorites'  as SheetTab, icon: Star,       label: 'Favoritos',   count: favorites.length },
    { key: 'recents'    as SheetTab, icon: Clock,      label: 'Recientes',   count: recents.length },
    { key: 'most_used'  as SheetTab, icon: TrendingUp, label: 'Más usados',  count: mostUsed.length },
    { key: 'catalog'    as SheetTab, icon: Package,    label: 'Catálogo',    count: catalog.length },
    { key: 'manual'     as SheetTab, icon: Plus,       label: 'Manual',      count: 0 },
  ];

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(15,23,42,.4)' }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60, background: '#fff', borderRadius: '20px 20px 0 0', maxHeight: '90vh', display: 'flex', flexDirection: 'column', paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: '0 -8px 40px rgba(15,23,42,.15)' }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#E2E8F0' }} />
        </div>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 12px' }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Agregar ítem</span>
          <button onClick={onClose} style={{ border: 'none', background: '#F1F5F9', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #F1F5F9', overflowX: 'auto', scrollbarWidth: 'none', paddingLeft: 12 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '9px 10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: tab === t.key ? 700 : 500, color: tab === t.key ? '#2563EB' : '#64748B', borderBottom: tab === t.key ? '2px solid #2563EB' : '2px solid transparent', marginBottom: -1, whiteSpace: 'nowrap', fontFamily: 'inherit', flexShrink: 0 }}>
              <t.icon size={12} />
              {t.label}
              {t.count > 0 && <span style={{ background: '#EFF6FF', color: '#2563EB', fontSize: 9.5, fontWeight: 700, borderRadius: 99, padding: '1px 5px' }}>{t.count}</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {/* Buscador en tabs de catálogo */}
          {tab !== 'manual' && (
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', height: 38, border: '1px solid #E2E8F0', borderRadius: 10, paddingLeft: 30, fontSize: 13.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            </div>
          )}

          {tab === 'favorites' && (
            favorites.length === 0
              ? <EmptyTab msg="No hay favoritos aún. Márcalos con ⭐ en el Catálogo." />
              : favorites.filter(filterFn).map(i => <CatalogRow key={i.id} item={i} onAdd={() => fromCatalog(i)} />)
          )}

          {tab === 'recents' && (
            recents.length === 0
              ? <EmptyTab msg="Sin ítems recientes." />
              : recents.filter(filterFn).map(i => <CatalogRow key={i.id} item={i} onAdd={() => fromCatalog(i)} />)
          )}

          {tab === 'most_used' && (
            mostUsed.length === 0
              ? <EmptyTab msg="Agrega ítems al catálogo para ver los más usados." />
              : mostUsed.filter(filterFn).map((i, idx) => <CatalogRow key={i.id} item={i} rank={idx + 1} onAdd={() => fromCatalog(i)} />)
          )}

          {tab === 'catalog' && (
            loadingCatalog
              ? <div style={{ textAlign: 'center', padding: '24px 0', color: '#94A3B8', fontSize: 13 }}>Cargando catálogo...</div>
              : catalog.filter(filterFn).length === 0
                ? <EmptyTab msg="Catálogo vacío. Agrega ítems en la sección Catálogo o usa el formulario Manual." />
                : catalog.filter(filterFn).map(i => <CatalogRow key={i.id} item={i} onAdd={() => fromCatalog(i)} />)
          )}

          {tab === 'manual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Nombre del ítem *">
                <input autoFocus value={manual.item_name} onChange={e => setManual(p => ({ ...p, item_name: e.target.value }))}
                  placeholder="Ej: Diseño de logo" style={IS} />
              </Field>
              <Field label="Descripción (opcional)">
                <textarea value={manual.description} onChange={e => setManual(p => ({ ...p, description: e.target.value }))}
                  placeholder="Detalle del ítem..." rows={2} style={{ ...IS, height: 'auto', padding: '10px 12px', resize: 'none' }} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Tipo">
                  <select value={manual.type} onChange={e => setManual(p => ({ ...p, type: e.target.value as ItemType }))} style={{ ...IS, cursor: 'pointer' }}>
                    {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="Unidad">
                  <select value={manual.unit} onChange={e => setManual(p => ({ ...p, unit: e.target.value }))} style={{ ...IS, cursor: 'pointer' }}>
                    {UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Cantidad">
                  <NumericInput value={manual.quantity} onChange={v => setManual(p => ({ ...p, quantity: v }))} min={0.01} />
                </Field>
                <Field label="Precio unitario">
                  <NumericInput value={manual.unit_price} onChange={v => setManual(p => ({ ...p, unit_price: v }))} min={0} prefix="$" />
                </Field>
              </div>
              <Field label="Descuento %">
                <NumericInput value={manual.discount} onChange={v => setManual(p => ({ ...p, discount: Math.min(100, v) }))} min={0} max={100} suffix="%" />
              </Field>
              <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>Subtotal</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>${Math.round(computeItemSubtotal(manual)).toLocaleString('es-CO')}</span>
              </div>
              <button onClick={submitManual} disabled={!manual.item_name.trim()}
                style={{ width: '100%', height: 48, border: 'none', background: manual.item_name.trim() ? '#2563EB' : '#E2E8F0', color: manual.item_name.trim() ? '#fff' : '#94A3B8', fontWeight: 700, fontSize: 15, borderRadius: 12, cursor: 'pointer' }}>
                <Plus size={18} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />Agregar ítem
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Prompt guardar en catálogo */}
      {pendingManualItem && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 65, background: 'rgba(15,23,42,.5)' }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 70, background: '#fff', borderRadius: '20px 20px 0 0', padding: '20px 16px 32px', paddingBottom: 'calc(32px + env(safe-area-inset-bottom))', boxShadow: '0 -8px 40px rgba(15,23,42,.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <div style={{ width: 36, height: 4, borderRadius: 99, background: '#E2E8F0' }} />
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>Nuevo ítem agregado</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>{pendingManualItem.item_name}</div>
            <div style={{ fontSize: 13, color: '#64748B', marginBottom: 20 }}>¿Deseas guardarlo en tu catálogo para usarlo en futuras cotizaciones?</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={saveManualToCatalog} disabled={savingToCatalog}
                style={{ flex: 1, height: 48, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 14, borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Check size={16} /> {savingToCatalog ? 'Guardando...' : 'Sí, guardar'}
              </button>
              <button onClick={skipSaveToCatalog}
                style={{ flex: 1, height: 48, border: '1px solid #E2E8F0', background: 'none', color: '#475569', fontWeight: 600, fontSize: 14, borderRadius: 12, cursor: 'pointer' }}>
                No, esta vez no
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function CatalogRow({ item, onAdd, rank }: { item: CatalogItem; onAdd: () => void; rank?: number }) {
  const TC: Record<string, { bg: string; fg: string }> = { PRODUCT: { bg: '#DBEAFE', fg: '#1D4ED8' }, SERVICE: { bg: '#D1FAE5', fg: '#065F46' }, BUNDLE: { bg: '#EDE9FE', fg: '#6D28D9' } };
  const tc = TC[item.type] ?? { bg: '#F1F5F9', fg: '#475569' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #F8FAFC' }}>
      {rank && <span style={{ fontSize: 12, fontWeight: 800, color: '#94A3B8', minWidth: 20, textAlign: 'center' }}>#{rank}</span>}
      <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: tc.bg, color: tc.fg, fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{item.name[0].toUpperCase()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
        <div style={{ fontSize: 11.5, color: '#94A3B8' }}>{item.unit} · ${item.price.toLocaleString('es-CO')}{item.use_count > 0 ? ` · ${item.use_count}x` : ''}</div>
      </div>
      <button onClick={onAdd} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#EFF6FF', color: '#2563EB', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Plus size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
}

function EmptyTab({ msg }: { msg: string }) {
  return <div style={{ textAlign: 'center', padding: '28px 0', color: '#94A3B8', fontSize: 13, lineHeight: 1.5 }}>{msg}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>{label}</label>{children}</div>;
}

const IS: React.CSSProperties = { width: '100%', height: 44, border: '1px solid #E2E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
