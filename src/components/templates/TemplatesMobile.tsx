/**
 * TemplatesMobile — Vista móvil rediseñada de Plantillas.
 * Solo se renderiza cuando navMode === 'bottom'.
 * Referencia visual aprobada: diseño premium tipo Notion / Canva.
 */
import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Filter, Star, MoreVertical, Copy, Trash2, Bot, ChevronRight } from 'lucide-react';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useUI, defaultQConfig } from '../../features/app/UIProvider';
import { listTemplates, deleteTemplate } from '../../services/templates';
import { serviceLabel, fmtM } from '../../lib/calc';
import { computeQuote } from '../../lib/engine';
import type { ServiceLine } from '../../lib/engine';

// ─── Categorías ───────────────────────────────────────────────────────────────

interface Category { label: string; key: string; color: string; bg: string; emoji: string }

const CATS: Category[] = [
  { label: 'Todas',        key: 'all',          color: '#2563EB', bg: '#EFF6FF', emoji: '📋' },
  { label: 'Pintura',      key: 'pintura',      color: '#EF4444', bg: '#FEF2F2', emoji: '🎨' },
  { label: 'Electricidad', key: 'electricidad', color: '#F59E0B', bg: '#FFFBEB', emoji: '⚡' },
  { label: 'Drywall',      key: 'drywall',      color: '#64748B', bg: '#F8FAFC', emoji: '🏗️' },
  { label: 'Remodelación', key: 'remodelacion', color: '#7C3AED', bg: '#F5F3FF', emoji: '🔨' },
  { label: 'Plomería',     key: 'plomeria',     color: '#0EA5E9', bg: '#F0F9FF', emoji: '💧' },
  { label: 'Carpintería',  key: 'carpinteria',  color: '#92400E', bg: '#FEF3C7', emoji: '🪵' },
];

function detectCategory(name: string, summary: string): string {
  const t = (name + ' ' + summary).toLowerCase();
  if (/pintura|esmalte|laca|barniz/.test(t))                              return 'pintura';
  if (/elect|cable|tomacorriente|tablero|lámpara|lampara/.test(t))        return 'electricidad';
  if (/drywall|dry wall|pladur|placa/.test(t))                            return 'drywall';
  if (/remodelaci|demolici/.test(t))                                      return 'remodelacion';
  if (/plomería|plomeria|tubería|agua|sanitario|baño/.test(t))            return 'plomeria';
  if (/carpintería|madera|puerta|ventana|mueble/.test(t))                 return 'carpinteria';
  return 'all';
}

// ─── Card thumbnail ───────────────────────────────────────────────────────────

function TemplateThumbnail({ category, size = 76 }: { category: string; size?: number }) {
  const cat = CATS.find(c => c.key === category) ?? CATS[0];
  return (
    <div style={{
      width: size, height: size, borderRadius: 14, flexShrink: 0,
      background: cat.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36,
    }}>
      {cat.emoji}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TemplateCard {
  id: string;
  name: string;
  summary: string;
  estFmt: string;
  estValue: number;
  category: string;
  serviceLines: ServiceLine[];
  raw: ReturnType<typeof listTemplates> extends Promise<Array<infer T>> ? T : never;
}

// ─── TemplatesMobile (main export) ───────────────────────────────────────────

export function TemplatesMobile() {
  const { workspace, company } = useWorkspace();
  const { openQuoteFlow } = useUI();
  const queryClient = useQueryClient();

  const [search,     setSearch]     = useState('');
  const [activeTab,  setActiveTab]  = useState<'mine' | 'shared'>('mine');
  const [activeCat,  setActiveCat]  = useState('all');
  const [searching,  setSearching]  = useState(false);
  const [menuOpen,   setMenuOpen]   = useState<string | null>(null);
  const [favorites,  setFavorites]  = useState<Set<string>>(new Set());

  const query = useQuery({
    queryKey: ['templates', workspace.id],
    queryFn: () => listTemplates(workspace.id),
  });

  const cards: TemplateCard[] = useMemo(() => {
    if (!query.data) return [];
    return query.data.map(t => {
      const sls = (Array.isArray(t.service_lines) ? t.service_lines : []) as unknown as ServiceLine[];
      const val = computeQuote(sls, {
        adminPct: t.admin_pct, imprevistosPct: t.imprevistos_pct, util: t.util,
        taxMode: t.tax_mode, taxRate: t.tax_rate, discount: t.discount, discountOn: t.discount_on,
        transportCost: t.transport_cost, transportEnabled: t.transport_enabled,
      }).total;
      const summary  = serviceLabel(sls);
      const category = detectCategory(t.name, summary);
      return { id: t.id, name: t.name, summary, estFmt: fmtM(val), estValue: val, category, serviceLines: sls, raw: t as any };
    });
  }, [query.data]);

  const filtered = useMemo(() => {
    return cards.filter(c => {
      const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.summary.toLowerCase().includes(search.toLowerCase());
      const matchCat    = activeCat === 'all' || c.category === activeCat;
      return matchSearch && matchCat;
    });
  }, [cards, search, activeCat]);

  // KPIs
  const totalTemplates = cards.length;
  const totalValue     = cards.reduce((a, c) => a + c.estValue, 0);
  const topTemplate    = cards.sort((a, b) => b.estValue - a.estValue)[0];
  const favCount       = favorites.size;

  async function handleDelete(id: string) {
    setMenuOpen(null);
    await deleteTemplate(id);
    queryClient.invalidateQueries({ queryKey: ['templates', workspace.id] });
  }

  function handleUse(c: TemplateCard) {
    setMenuOpen(null);
    openQuoteFlow({
      step: 4,
      cfg: {
        ...defaultQConfig(company),
        serviceLines:   c.serviceLines,
        adminPct:       (c.raw as any).admin_pct,
        imprevistosPct: (c.raw as any).imprevistos_pct,
        util:           (c.raw as any).util,
        validDays:      (c.raw as any).valid_days,
        discount:       (c.raw as any).discount,
        discountOn:     (c.raw as any).discount_on,
        taxMode:        (c.raw as any).tax_mode,
        taxRate:        (c.raw as any).tax_rate,
        transportCost:  (c.raw as any).transport_cost,
        transportEnabled: (c.raw as any).transport_enabled,
        proj: c.name,
      },
    });
  }

  if (query.isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: '#94A3B8', fontSize: 14 }}>
      Cargando plantillas…
    </div>
  );

  // Cat counts
  const catCounts = CATS.reduce<Record<string, number>>((acc, cat) => {
    acc[cat.key] = cat.key === 'all' ? cards.length : cards.filter(c => c.category === cat.key).length;
    return acc;
  }, {});

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100%', paddingBottom: 16 }}>

      {/* ── Sub-header con título + acciones ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #EEF2F7', padding: '12px 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', letterSpacing: '-.5px', margin: 0 }}>Plantillas</h1>
              <Star size={16} color="#F59E0B" fill="#F59E0B"/>
            </div>
            <p style={{ fontSize: 12, color: '#64748B', margin: '2px 0 0' }}>Reutiliza tus cotizaciones favoritas</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => setSearching(v => !v)} style={{ border: 'none', background: '#F1F5F9', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Search size={16} color="#374151"/>
            </button>
            <button style={{ border: 'none', background: '#F1F5F9', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Filter size={16} color="#374151"/>
            </button>
            <button onClick={() => openQuoteFlow({ cfg: defaultQConfig(company) })} style={{ border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 12.5, padding: '8px 12px', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
              <Plus size={14}/> Nueva
            </button>
          </div>
        </div>

        {/* Buscador expandible */}
        {searching && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 11, padding: '8px 12px', marginTop: 8 }}>
            <Search size={15} color="#94A3B8"/>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar plantilla, categoría o trabajo…"
              style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: 14, color: '#0F172A', fontFamily: 'inherit' }}
            />
          </div>
        )}
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '14px 16px 2px', scrollbarWidth: 'none' }}>
        {[
          { label: 'Total plantillas',  value: String(totalTemplates), sub: 'Todas tus plantillas', color: '#2563EB', bg: '#EFF6FF', emoji: '📄' },
          { label: 'Valor total est.',  value: fmtM(totalValue),       sub: 'Suma estimada',        color: '#22C55E', bg: '#F0FDF4', emoji: '💰' },
          { label: 'Favoritas',         value: String(favCount),       sub: 'Marcadas como fav.',   color: '#F59E0B', bg: '#FFFBEB', emoji: '⭐' },
          { label: 'Con mayor valor',   value: topTemplate?.estFmt ?? '--', sub: topTemplate?.name.slice(0,14) ?? 'Sin datos', color: '#7C3AED', bg: '#F5F3FF', emoji: '🏆' },
        ].map(k => (
          <div key={k.label} style={{ minWidth: 130, background: '#fff', borderRadius: 16, padding: '12px 14px', boxShadow: '0 2px 8px rgba(0,0,0,.05)', flexShrink: 0 }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{k.emoji}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #EEF2F7', marginTop: 12 }}>
        {([['mine','Mis plantillas'],['shared','Plantillas compartidas']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{ flex: 1, border: 'none', background: 'none', padding: '12px 0', fontWeight: activeTab === key ? 700 : 500, fontSize: 13.5, color: activeTab === key ? '#2563EB' : '#64748B', cursor: 'pointer', borderBottom: activeTab === key ? '2px solid #2563EB' : '2px solid transparent', transition: 'all .2s' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Category chips ── */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 16px 4px', scrollbarWidth: 'none' }}>
        {CATS.filter(c => catCounts[c.key] > 0 || c.key === 'all').map(cat => {
          const active = activeCat === cat.key;
          return (
            <button key={cat.key} onClick={() => setActiveCat(cat.key)} style={{ flexShrink: 0, border: `1.5px solid ${active ? cat.color : '#E2E8F0'}`, background: active ? cat.color : '#fff', color: active ? '#fff' : '#374151', fontWeight: active ? 700 : 500, fontSize: 12.5, padding: '6px 12px', borderRadius: 99, cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap' }}>
              {cat.label}{catCounts[cat.key] > 0 ? ` ${catCounts[cat.key]}` : ''}
            </button>
          );
        })}
      </div>

      {/* ── Lista de plantillas ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 16px 0' }}>

        {filtered.length === 0 && (
          <div style={{ background: '#fff', borderRadius: 18, padding: '28px 20px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🗂️</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
              {search ? 'Sin resultados' : 'Sin plantillas aún'}
            </div>
            <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5, margin: '0 0 16px' }}>
              {search ? 'Intenta con otro término.' : 'Guarda una cotización como plantilla para verla aquí.'}
            </p>
            <button onClick={() => openQuoteFlow({ cfg: defaultQConfig(company) })} style={{ border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 13.5, padding: '10px 20px', borderRadius: 11, cursor: 'pointer' }}>
              Crear cotización
            </button>
          </div>
        )}

        {filtered.map(c => {
          const cat     = CATS.find(x => x.key === c.category) ?? CATS[0];
          const isFav   = favorites.has(c.id);
          const isMenuOpen = menuOpen === c.id;
          const isTop   = c.id === topTemplate?.id;

          return (
            <div key={c.id} style={{ background: '#fff', borderRadius: 18, padding: '14px 14px', boxShadow: '0 2px 8px rgba(0,0,0,.05)', position: 'relative' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <TemplateThumbnail category={c.category} size={72}/>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{c.name}</span>
                        {isTop && <span style={{ fontSize: 10, fontWeight: 700, background: '#FEF3C7', color: '#92400E', padding: '2px 6px', borderRadius: 99, flexShrink: 0 }}>Más usada</span>}
                      </div>
                      <p style={{ fontSize: 12, color: '#64748B', margin: '3px 0 6px', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{c.summary}</p>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: cat.color, background: cat.bg, padding: '2px 7px', borderRadius: 99 }}>{cat.label}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => setMenuOpen(isMenuOpen ? null : c.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8', padding: 2 }}>
                        <MoreVertical size={16}/>
                      </button>
                      <button onClick={() => setFavorites(s => { const n = new Set(s); isFav ? n.delete(c.id) : n.add(c.id); return n; })} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2 }}>
                        <Star size={16} color={isFav ? '#F59E0B' : '#CBD5E1'} fill={isFav ? '#F59E0B' : 'none'}/>
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: '#2563EB', fontVariantNumeric: 'tabular-nums' }}>{c.estFmt}</span>
                    <button onClick={() => handleUse(c)} style={{ border: 'none', background: '#0F172A', color: '#fff', fontWeight: 700, fontSize: 12, padding: '7px 14px', borderRadius: 9, cursor: 'pointer' }}>
                      Usar →
                    </button>
                  </div>
                </div>
              </div>

              {/* Menú contextual */}
              {isMenuOpen && (
                <>
                  <div onClick={() => setMenuOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 10 }}/>
                  <div style={{ position: 'absolute', right: 14, top: 44, zIndex: 20, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '4px', boxShadow: '0 8px 32px rgba(0,0,0,.14)', minWidth: 160 }}>
                    {[
                      { icon: <Plus size={14}/>,      label: 'Usar plantilla', action: () => handleUse(c),       color: '#0F172A' },
                      { icon: <Copy size={14}/>,       label: 'Duplicar',       action: () => setMenuOpen(null),  color: '#0F172A' },
                      { icon: <Trash2 size={14}/>,     label: 'Eliminar',       action: () => handleDelete(c.id), color: '#EF4444' },
                    ].map(item => (
                      <button key={item.label} onClick={item.action} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', border: 'none', background: 'none', cursor: 'pointer', color: item.color, fontSize: 13.5, fontWeight: 500, borderRadius: 10, textAlign: 'left' }}>
                        <span style={{ color: item.color }}>{item.icon}</span>{item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Banner Shelwi IA ── */}
      <div style={{ margin: '14px 16px 0', background: 'linear-gradient(135deg,#F0F9FF 0%,#EFF6FF 100%)', border: '1px solid #BFDBFE', borderRadius: 18, padding: '16px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 42, flexShrink: 0 }}>🤖</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Duplica, personaliza y cotiza más rápido</span>
          </div>
          <p style={{ fontSize: 12, color: '#475569', margin: '0 0 10px', lineHeight: 1.5 }}>Usa IA para optimizar tus plantillas y generar nuevas combinaciones automáticamente.</p>
          <button onClick={() => openQuoteFlow({ cfg: defaultQConfig(company) })} style={{ border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 12.5, padding: '8px 14px', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Bot size={14}/> Usar Shelwi IA
          </button>
        </div>
      </div>

      {/* ── Plantillas más destacadas ── */}
      {cards.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>Plantillas destacadas</span>
            <button style={{ border: 'none', background: 'none', color: '#2563EB', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, padding: 0 }}>Ver todas <ChevronRight size={13}/></button>
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '0 16px 4px', scrollbarWidth: 'none' }}>
            {cards.slice(0, 5).map(c => {
              const cat = CATS.find(x => x.key === c.category) ?? CATS[0];
              return (
                <div key={c.id} onClick={() => handleUse(c)} style={{ minWidth: 130, background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.06)', flexShrink: 0, cursor: 'pointer' }}>
                  <div style={{ height: 80, background: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>{cat.emoji}</div>
                  <div style={{ padding: '10px 10px 12px' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{c.name}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: '#2563EB', fontVariantNumeric: 'tabular-nums' }}>{c.estFmt}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Crear nueva plantilla CTA ── */}
      <div style={{ margin: '14px 16px 0', background: '#fff', border: '1.5px dashed #BFDBFE', borderRadius: 18, padding: '20px 18px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.04)' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>✨</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1E40AF', marginBottom: 5 }}>¿Cotizas algo seguido?</div>
        <p style={{ fontSize: 12.5, color: '#64748B', lineHeight: 1.5, margin: '0 0 14px' }}>Guarda cualquier cotización como plantilla y úsala en segundos la próxima vez.</p>
        <button onClick={() => openQuoteFlow({ cfg: defaultQConfig(company) })} style={{ border: '1.5px solid #2563EB', background: '#EFF6FF', color: '#2563EB', fontWeight: 700, fontSize: 13, padding: '10px 20px', borderRadius: 11, cursor: 'pointer' }}>
          Crear cotización →
        </button>
      </div>

    </div>
  );
}
