import { useState } from 'react';
import { Plus, Trash2, ChevronRight, HardHat } from 'lucide-react';
import { AddItemSheet } from './AddItemSheet';
import { computeItemSubtotal, computeLaborSubtotal, type QuoteItem, type LaborItem } from '../../lib/itemEngine';
import { NumericInput } from '../ui/NumericInput';

interface Props {
  items: QuoteItem[];
  laborItems: LaborItem[];
  onChangeItems: (items: QuoteItem[]) => void;
  onChangeLaborItems: (labor: LaborItem[]) => void;
  onContinue: () => void;
}

const LABOR_UNITS = ['hrs', 'días', 'global', 'semanas', 'mes', 'und', 'visita', 'turno'];

function emptyLabor(): Omit<LaborItem, 'subtotal'> {
  return { item_name: '', description: '', quantity: 1, unit: 'hrs', unit_price: 0 };
}

export function StepItems({ items, laborItems, onChangeItems, onChangeLaborItems, onContinue }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showLaborForm, setShowLaborForm] = useState(false);
  const [laborForm, setLaborForm] = useState(emptyLabor());
  const [editLaborIdx, setEditLaborIdx] = useState<number | null>(null);

  // Puede continuar si hay AL MENOS 1 ítem O 1 mano de obra
  const canContinue = items.length > 0 || laborItems.length > 0;

  const itemsSubtotal  = items.reduce((a, i) => a + i.subtotal, 0);
  const laborSubtotal  = laborItems.reduce((a, i) => a + i.subtotal, 0);
  const totalSubtotal  = itemsSubtotal + laborSubtotal;

  function addItem(item: QuoteItem) {
    onChangeItems([...items, { ...item, sort_order: items.length }]);
    setSheetOpen(false);
  }

  function removeItem(idx: number) {
    onChangeItems(items.filter((_, i) => i !== idx));
  }

  function updateItemQty(idx: number, qty: number) {
    const updated = [...items];
    updated[idx] = { ...updated[idx], quantity: qty, subtotal: computeItemSubtotal({ ...updated[idx], quantity: qty }) };
    onChangeItems(updated);
  }

  function openLaborForm(idx?: number) {
    if (idx !== undefined) {
      const l = laborItems[idx];
      setLaborForm({ item_name: l.item_name, description: l.description ?? '', quantity: l.quantity, unit: l.unit, unit_price: l.unit_price });
      setEditLaborIdx(idx);
    } else {
      setLaborForm(emptyLabor());
      setEditLaborIdx(null);
    }
    setShowLaborForm(true);
  }

  function saveLaborForm() {
    if (!laborForm.item_name.trim()) return;
    const subtotal = computeLaborSubtotal(laborForm);
    const newItem: LaborItem = { ...laborForm, subtotal };
    if (editLaborIdx !== null) {
      const updated = [...laborItems];
      updated[editLaborIdx] = newItem;
      onChangeLaborItems(updated);
    } else {
      onChangeLaborItems([...laborItems, { ...newItem, sort_order: laborItems.length }]);
    }
    setShowLaborForm(false);
    setLaborForm(emptyLabor());
    setEditLaborIdx(null);
  }

  function removeLabor(idx: number) {
    onChangeLaborItems(laborItems.filter((_, i) => i !== idx));
  }

  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');

  return (
    <div style={{ padding: '0 16px' }}>

      {/* ── SECCIÓN ÍTEMS ─────────────────────────────────────────────────── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>
        Productos y servicios
      </div>

      {items.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden', marginBottom: 10 }}>
          {items.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: idx < items.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.item_name}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>{fmt(item.unit_price)} / {item.unit}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <button onClick={() => updateItemQty(idx, Math.max(0.01, item.quantity - 1))}
                  style={qtyBtn}>−</button>
                <span style={{ fontSize: 13, fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{item.quantity}</span>
                <button onClick={() => updateItemQty(idx, item.quantity + 1)}
                  style={qtyBtn}>+</button>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0F172A', minWidth: 70, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(item.subtotal)}
              </div>
              <button onClick={() => removeItem(idx)} style={delBtn}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => setSheetOpen(true)} style={addBtn('#EFF6FF', '#2563EB')}>
        <Plus size={17} /> Agregar producto o servicio
      </button>

      {/* ── SECCIÓN MANO DE OBRA ───────────────────────────────────────────── */}
      <div style={{ marginTop: 20, marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
          Mano de obra
        </div>
        <div style={{ fontSize: 11.5, color: '#94A3B8' }}>Opcional · No aplica IVA</div>
      </div>

      {laborItems.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden', marginBottom: 10 }}>
          {laborItems.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: idx < laborItems.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <HardHat size={15} color="#D97706" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.item_name}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>{item.quantity} {item.unit} × {fmt(item.unit_price)}</div>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#D97706', minWidth: 70, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(item.subtotal)}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => openLaborForm(idx)}
                  style={{ ...delBtn, background: '#EFF6FF', color: '#2563EB', borderColor: '#BFDBFE' }}>
                  ✎
                </button>
                <button onClick={() => removeLabor(idx)} style={delBtn}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => openLaborForm()} style={addBtn('#FFFBEB', '#D97706')}>
        <HardHat size={16} /> Agregar mano de obra
      </button>

      {/* ── SUBTOTAL PARCIAL ───────────────────────────────────────────────── */}
      {canContinue && (
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px 16px', marginTop: 20, marginBottom: 4 }}>
          {itemsSubtotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748B', marginBottom: 6 }}>
              <span>Productos/servicios</span>
              <span style={{ fontWeight: 600 }}>{fmt(itemsSubtotal)}</span>
            </div>
          )}
          {laborSubtotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#D97706', marginBottom: 6 }}>
              <span>Mano de obra</span>
              <span style={{ fontWeight: 600 }}>{fmt(laborSubtotal)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid #E2E8F0' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Subtotal (sin IVA)</span>
            <span style={{ fontSize: 20, fontWeight: 900, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalSubtotal)}</span>
          </div>
        </div>
      )}

      {!canContinue && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#94A3B8', fontSize: 13 }}>
          Agrega al menos un producto, servicio o mano de obra para continuar.
        </div>
      )}

      {/* Botón continuar */}
      <button
        onClick={onContinue}
        disabled={!canContinue}
        style={{
          width: '100%', height: 52, marginTop: 16, border: 'none',
          background: canContinue ? '#2563EB' : '#E2E8F0',
          color: canContinue ? '#fff' : '#94A3B8',
          fontWeight: 700, fontSize: 16, borderRadius: 14,
          cursor: canContinue ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        Continuar <ChevronRight size={18} />
      </button>

      {/* Sheet agregar ítem del catálogo */}
      {sheetOpen && <AddItemSheet onAdd={addItem} onClose={() => setSheetOpen(false)} />}

      {/* Formulario mano de obra */}
      {showLaborForm && (
        <>
          <div onClick={() => setShowLaborForm(false)} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(15,23,42,.4)' }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60, background: '#fff', borderRadius: '20px 20px 0 0', padding: '16px 16px 32px', paddingBottom: 'calc(32px + env(safe-area-inset-bottom))', boxShadow: '0 -8px 40px rgba(15,23,42,.15)', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <div style={{ width: 36, height: 4, borderRadius: 99, background: '#E2E8F0' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <HardHat size={18} color="#D97706" />
              <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>
                {editLaborIdx !== null ? 'Editar mano de obra' : 'Agregar mano de obra'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Descripción *">
                <input autoFocus value={laborForm.item_name}
                  onChange={e => setLaborForm(p => ({ ...p, item_name: e.target.value }))}
                  placeholder="Ej: Instalación de vidrio, Transporte, Diseño..." style={IS} />
              </Field>
              <Field label="Notas (opcional)">
                <input value={laborForm.description || ''}
                  onChange={e => setLaborForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Detalles adicionales..." style={IS} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Cantidad">
                  <NumericInput value={laborForm.quantity} onChange={v => setLaborForm(p => ({ ...p, quantity: v }))} min={0.01} />
                </Field>
                <Field label="Unidad">
                  <select value={laborForm.unit} onChange={e => setLaborForm(p => ({ ...p, unit: e.target.value }))} style={IS}>
                    {LABOR_UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Valor unitario">
                <NumericInput value={laborForm.unit_price} onChange={v => setLaborForm(p => ({ ...p, unit_price: v }))} min={0} prefix="$" />
              </Field>

              {/* Preview subtotal */}
              <div style={{ background: '#FFFBEB', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: '#92400E', fontWeight: 600 }}>Subtotal (sin IVA)</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#D97706' }}>
                  {fmt(computeLaborSubtotal(laborForm))}
                </span>
              </div>

              <button
                onClick={saveLaborForm}
                disabled={!laborForm.item_name.trim()}
                style={{ height: 50, border: 'none', background: laborForm.item_name.trim() ? '#D97706' : '#E2E8F0', color: '#fff', fontWeight: 700, fontSize: 15, borderRadius: 12, cursor: 'pointer' }}>
                {editLaborIdx !== null ? 'Guardar cambios' : 'Agregar mano de obra'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Estilos compartidos ──────────────────────────────────────────────────────
const qtyBtn: React.CSSProperties = { width: 26, height: 26, borderRadius: 7, border: '1px solid #E2E8F0', background: '#F8FAFC', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const delBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: '1px solid #FEE2E2', background: '#FEF2F2', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const addBtn = (bg: string, color: string): React.CSSProperties => ({ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '13px', border: `1.5px dashed ${color}`, borderRadius: 12, background: bg, cursor: 'pointer', color, fontSize: 14.5, fontWeight: 700, fontFamily: 'inherit' });
const IS: React.CSSProperties = { width: '100%', height: 44, border: '1px solid #E2E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>{label}</label>{children}</div>;
}
