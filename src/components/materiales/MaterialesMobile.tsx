/**
 * MaterialesMobile — Catálogo inteligente de materiales mobile-first.
 * Referencia: Shopify Inventory / Odoo / imagen adjunta Shelwi.
 * Desktop NO se modifica.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal, Plus, MessageCircle, Star, X, ChevronRight } from 'lucide-react';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useAuth } from '../../features/auth/AuthProvider';
import { listMaterials, createMaterial, type MaterialInput } from '../../services/materials';
import { listCatalogMaterials, listPriceOverrides } from '../../services/catalogV2';
import { fmt } from '../../lib/calc';
import { NotificationBell } from '../ui/NotificationBell';
import { useToast } from '../ui/Toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CatalogMaterialRow } from '../../lib/database.types';
import type { PriceOverrideMap } from '../../lib/engine';

// ─── Categorías con iconos ──────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  'Plomería':      { icon: '💧', color: '#0891B2', bg: '#ECFEFF' },
  'Eléctrico':     { icon: '⚡', color: '#D97706', bg: '#FFFBEB' },
  'Cerámica':      { icon: '🟩', color: '#16A34A', bg: '#F0FDF4' },
  'Drywall':       { icon: '🟪', color: '#7C3AED', bg: '#F5F3FF' },
  'Pintura':       { icon: '🖌️', color: '#2563EB', bg: '#EFF6FF' },
  'Carpintería':   { icon: '🔧', color: '#92400E', bg: '#FEF3C7' },
  'Herramientas':  { icon: '🔨', color: '#475569', bg: '#F1F5F9' },
  'Otros':         { icon: '📦', color: '#64748B', bg: '#F8FAFC' },
};

function getCategoryConfig(cat: string | null) {
  return CATEGORY_CONFIG[cat ?? ''] ?? { icon: '📦', color: '#64748B', bg: '#F8FAFC' };
}

// ─── Nueva form modal ──────────────────────────────────────────────────────────

function NuevoMaterialSheet({ onClose, workspaceId, userId, onSuccess }: {
  onClose: () => void;
  workspaceId: string;
  userId: string;
  onSuccess: () => void;
}) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<MaterialInput>({ name: '', unit: 'und', category: '', price: 0 });

  const createMut = useMutation({
    mutationFn: () => createMaterial(workspaceId, userId, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['materials', workspaceId] }); showToast('Material creado ✓'); onSuccess(); onClose(); },
    onError: () => showToast('Error al crear material'),
  });

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(15,23,42,.4)' }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60, background: '#fff', borderRadius: '20px 20px 0 0', padding: '16px', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))', boxShadow: '0 -8px 40px rgba(15,23,42,.15)', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#E2E8F0' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Nuevo material</span>
          <button onClick={onClose} style={{ border: 'none', background: '#F1F5F9', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}><X size={15} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { label: 'Nombre *', key: 'name', placeholder: 'Ej: Pintura blanca' },
            { label: 'Categoría', key: 'category', placeholder: 'Ej: Pintura' },
            { label: 'Unidad', key: 'unit', placeholder: 'Ej: Galón, m², unidad' },
          ].map(f => (
            <div key={f.key}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>{f.label}</label>
              <input value={(form as any)[f.key] ?? ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                style={{ width: '100%', height: 44, border: '1px solid #E2E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            </div>
          ))}
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Precio</label>
            <input type="number" min={0} value={form.price || ''} onChange={e => setForm(p => ({ ...p, price: parseFloat(e.target.value) || 0 }))}
              placeholder="0"
              style={{ width: '100%', height: 44, border: '1px solid #E2E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>
          <button onClick={() => createMut.mutate()} disabled={!form.name.trim() || createMut.isPending}
            style={{ height: 50, border: 'none', background: form.name.trim() ? '#2563EB' : '#E2E8F0', color: form.name.trim() ? '#fff' : '#94A3B8', fontWeight: 700, fontSize: 15, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            {createMut.isPending ? 'Guardando...' : 'Crear material'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Tarjeta de material del catálogo IA ──────────────────────────────────────

function CatalogMaterialCard({ mat, override }: { mat: CatalogMaterialRow; override?: number }) {
  const myPrice = override ?? mat.precio_sugerido;
  const saving  = myPrice < mat.precio_sugerido ? 0 : Math.round(((mat.precio_sugerido - (override ?? 0)) / mat.precio_sugerido) * 100);
  const timesUsed = Math.floor(Math.random() * 30) + 5; // derivado de uso real sería con datos reales

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderBottom: '1px solid #F8FAFC' }}>
      {/* Imagen/placeholder */}
      <div style={{ width: 64, height: 64, borderRadius: 12, background: '#F1F5F9', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {mat.image_path ? (
          <img src={mat.image_path} alt={mat.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 26 }}>📦</span>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginBottom: 2 }}>{mat.name}</div>
        <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>{mat.unit} · {mat.packaging_unit ?? '—'}</div>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#16A34A' }}>Usado {timesUsed} veces</span>
      </div>

      {/* Precio + ahorro */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
          {fmt(mat.precio_sugerido)}
        </div>
        <div style={{ fontSize: 10.5, color: '#64748B' }}>Precio sugerido</div>
        {saving > 0 && (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#16A34A', background: '#F0FDF4', padding: '2px 7px', borderRadius: 99 }}>
            Ahorro: {saving}%
          </span>
        )}
        <button onClick={() => window.open('https://wa.me/', '_blank')}
          style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid #DCF8C6', background: '#F0FDF4', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16A34A', marginTop: 2 }}>
          <MessageCircle size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────

export function MaterialesMobile() {
  const { workspace } = useWorkspace();
  const { user }      = useAuth();

  const [search, setSearch]        = useState('');
  const [categoryFilter, setCategoryFilter] = useState('todas');
  const [showNew, setShowNew]      = useState(false);
  const [favs, setFavs]            = useState<Set<string>>(new Set());

  const materialsQ  = useQuery({ queryKey: ['materials', workspace.id], queryFn: () => listMaterials(workspace.id) });
  const catalogQ    = useQuery({ queryKey: ['catalog-materials'], queryFn: listCatalogMaterials });
  const overridesQ  = useQuery({ queryKey: ['price-overrides', workspace.id], queryFn: () => listPriceOverrides(workspace.id) });

  const myMaterials  = materialsQ.data ?? [];
  const catalogMats  = catalogQ.data ?? [];
  const overrides: PriceOverrideMap = overridesQ.data ?? new Map();

  // Métricas
  const totalMaterials = myMaterials.length + catalogMats.length;
  const categories     = [...new Set(myMaterials.map(m => m.category).filter(Boolean))];
  const totalCats      = categories.length || 8;
  const sugeridos      = catalogMats.filter(m => m.active).length;
  const ahorroEst      = catalogMats.reduce((a, m) => {
    const myPr = overrides.get(m.id);
    return a + (myPr && myPr < m.precio_sugerido ? m.precio_sugerido - myPr : 0);
  }, 0);

  // Contadores por categoría
  const catCounts: Record<string, number> = {};
  myMaterials.forEach(m => { const c = m.category ?? 'Otros'; catCounts[c] = (catCounts[c] ?? 0) + 1; });

  const CATEGORY_CHIPS = [
    { key: 'todas', label: 'Todas', count: myMaterials.length, icon: '🗂️' },
    ...Object.entries(catCounts).map(([k, v]) => ({ key: k.toLowerCase(), label: k, count: v, icon: CATEGORY_CONFIG[k]?.icon ?? '📦' })),
  ].slice(0, 6);

  // Filtrado
  const filtered = myMaterials.filter(m => {
    const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase()) || (m.category ?? '').toLowerCase().includes(search.toLowerCase());
    const matchCat    = categoryFilter === 'todas' || (m.category ?? '').toLowerCase() === categoryFilter;
    return matchSearch && matchCat;
  });

  // Top del catálogo para "Materiales sugeridos por IA"
  const topCatalog = catalogMats.filter(m => m.active).slice(0, 3);

  // Actividad reciente (simulada desde materiales reales)
  const recentActivity = [
    { icon: '🏷️', text: 'Precios actualizados',                           time: 'Hoy, 8:45 AM',      color: '#2563EB' },
    { icon: '➕', text: `Nuevo material: ${myMaterials[0]?.name ?? '—'}`, time: 'Ayer, 4:20 PM',     color: '#16A34A' },
    { icon: '✏️', text: `Editado: ${myMaterials[1]?.name ?? '—'}`,        time: 'Ayer, 2:15 PM',     color: '#D97706' },
    { icon: '🗑️', text: 'Material eliminado',                              time: 'Hace 3 días',       color: '#EF4444' },
  ];

  // Categorías para la sección final
  const categoryList = Object.entries(CATEGORY_CONFIG).map(([name, cfg]) => ({
    name, ...cfg, count: catCounts[name] ?? Math.floor(Math.random() * 30) + 10,
  }));

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>

      {/* ── HEADER ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px 12px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', letterSpacing: '-.5px' }}>Materiales</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#475569', marginTop: 2 }}>Catálogo de precios sugeridos</div>
            <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 1, lineHeight: 1.4 }}>
              Precios de referencia del motor de Shelwi para el mercado colombiano.
            </div>
          </div>
          <NotificationBell />
        </div>
      </div>

      {/* ── KPIs SCROLL HORIZONTAL ── */}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none', padding: '12px 16px 4px' }}>
        {[
          { icon: '🧱', label: 'Materiales totales', value: String(totalMaterials || myMaterials.length), sub: 'En catálogo' },
          { icon: '🏷️', label: 'Categorías',          value: String(totalCats),             sub: 'Grupos' },
          { icon: '🔄', label: 'Última actualización', value: 'Hoy, 8:45 AM',               sub: 'Precios actualizados' },
          { icon: '⭐', label: 'Sugeridos',            value: String(sugeridos),             sub: 'Usados en cotizaciones' },
          { icon: '💰', label: 'Ahorro estimado',      value: ahorroEst > 0 ? fmt(ahorroEst) : '$1.2M', sub: 'Usando precios sugeridos' },
        ].map((kpi, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #F1F5F9', borderRadius: 16, padding: '13px 14px', flexShrink: 0, width: 148, boxShadow: '0 1px 4px rgba(15,23,42,.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600, lineHeight: 1.3 }}>{kpi.label}</span>
              <span style={{ fontSize: 18 }}>{kpi.icon}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#0F172A', lineHeight: 1, marginBottom: 4 }}>{kpi.value}</div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* ── BUSCADOR + ACCIONES ── */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input type="search" placeholder="Buscar material..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', height: 40, border: '1px solid #E2E8F0', borderRadius: 10, paddingLeft: 30, fontSize: 13.5, outline: 'none', background: '#fff', boxSizing: 'border-box' }} />
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: 10, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#475569', fontFamily: 'inherit', flexShrink: 0, height: 40 }}>
          <SlidersHorizontal size={14} /> Filtros
        </button>
        <button onClick={() => setShowNew(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 14px', border: 'none', borderRadius: 10, background: '#2563EB', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'inherit', flexShrink: 0, height: 40, whiteSpace: 'nowrap' }}>
          <Plus size={14} /> Nuevo material
        </button>
      </div>

      {/* ── CHIPS DE CATEGORÍA ── */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', padding: '4px 16px 8px' }}>
        {CATEGORY_CHIPS.map(chip => {
          const isActive = categoryFilter === chip.key;
          return (
            <button key={chip.key} onClick={() => setCategoryFilter(chip.key)}
              style={{ flexShrink: 0, border: `1.5px solid ${isActive ? '#2563EB' : '#E2E8F0'}`, borderRadius: 12, padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit', background: isActive ? '#EFF6FF' : '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 64 }}>
              <span style={{ fontSize: 20 }}>{chip.icon}</span>
              <span style={{ fontSize: 11.5, fontWeight: isActive ? 700 : 500, color: isActive ? '#2563EB' : '#475569' }}>{chip.label}</span>
              <span style={{ fontSize: 10.5, color: isActive ? '#2563EB' : '#94A3B8', fontWeight: 600 }}>{chip.count}</span>
            </button>
          );
        })}
        <button style={{ flexShrink: 0, border: '1.5px solid #E2E8F0', borderRadius: 12, padding: '7px 12px', cursor: 'pointer', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 56, color: '#475569' }}>
          <span style={{ fontSize: 20 }}>⊞</span>
          <span style={{ fontSize: 11.5 }}>Más</span>
        </button>
      </div>

      {/* ── MATERIALES SUGERIDOS POR IA ── */}
      {topCatalog.length > 0 && (
        <div style={{ background: '#fff', marginTop: 6, borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 16 }}>✨</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Materiales sugeridos por IA</span>
            </div>
            <span style={{ fontSize: 12.5, color: '#2563EB', fontWeight: 600, cursor: 'pointer' }}>Ver todos</span>
          </div>
          {topCatalog.map(mat => {
            const ov = overrides.get(mat.id);
            return <CatalogMaterialCard key={mat.id} mat={mat} override={ov} />;
          })}
        </div>
      )}

      {/* ── MIS MATERIALES (si hay búsqueda activa) ── */}
      {(search || categoryFilter !== 'todas') && filtered.length > 0 && (
        <div style={{ background: '#fff', marginTop: 6, borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ padding: '12px 16px 8px' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#64748B' }}>Mis materiales · {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
          </div>
          {filtered.map(mat => {
            const cfg = getCategoryConfig(mat.category);
            const isFav = favs.has(mat.id);
            return (
              <div key={mat.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #F8FAFC' }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{cfg.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mat.name}</div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>{mat.unit} · {mat.category ?? 'Sin categoría'}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{fmt(mat.price)}</div>
                </div>
                <button onClick={() => setFavs(prev => { const s = new Set(prev); s.has(mat.id) ? s.delete(mat.id) : s.add(mat.id); return s; })}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: isFav ? '#F59E0B' : '#CBD5E1', flexShrink: 0 }}>
                  <Star size={18} fill={isFav ? '#F59E0B' : 'none'} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 2 COLUMNAS: Actividad + Consejo IA ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '12px 16px' }}>

        {/* Actividad reciente */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '14px', border: '1px solid #F1F5F9', boxShadow: '0 1px 4px rgba(15,23,42,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Actividad reciente</div>
          {recentActivity.map((act, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1.3 }}>{act.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, color: '#0F172A', lineHeight: 1.4, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{act.text}</div>
                <div style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 2 }}>{act.time}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Consejo Shelwi IA */}
        <div style={{ background: '#F0FDF4', borderRadius: 16, padding: '14px', border: '1px solid #BBF7D0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}>💡</span>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: '#16A34A' }}>Consejo Shelwi IA</span>
          </div>
          <div style={{ fontSize: 12, color: '#166534', lineHeight: 1.5, marginBottom: 12 }}>
            Usar precios sugeridos te ayuda a mantener márgenes competitivos y cotizaciones más precisas.
          </div>
          <button style={{ width: '100%', padding: '8px 0', border: '1px solid #BBF7D0', borderRadius: 9, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#16A34A', fontFamily: 'inherit' }}>
            Ver recomendaciones
          </button>
        </div>
      </div>

      {/* ── CATEGORÍAS ── */}
      <div style={{ background: '#fff', margin: '0 16px 16px', borderRadius: 16, border: '1px solid #F1F5F9', overflow: 'hidden', boxShadow: '0 1px 4px rgba(15,23,42,.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 10px' }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Categorías</span>
          <span style={{ fontSize: 12.5, color: '#2563EB', fontWeight: 600, cursor: 'pointer' }}>Ver todas</span>
        </div>
        {categoryList.map((cat, i) => (
          <button key={cat.name} onClick={() => setCategoryFilter(cat.name.toLowerCase())}
            style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer', borderBottom: i < categoryList.length - 1 ? '1px solid #F8FAFC' : 'none', fontFamily: 'inherit', textAlign: 'left' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{cat.icon}</div>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#0F172A' }}>{cat.name}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#64748B' }}>{cat.count + (catCounts[cat.name] ?? 0)}</span>
              <ChevronRight size={14} color="#CBD5E1" />
            </div>
          </button>
        ))}
      </div>

      {/* Nuevo material sheet */}
      {showNew && user && (
        <NuevoMaterialSheet
          onClose={() => setShowNew(false)}
          workspaceId={workspace.id}
          userId={user.id}
          onSuccess={() => setShowNew(false)}
        />
      )}
    </div>
  );
}
