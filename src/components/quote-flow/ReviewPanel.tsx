import { useState } from 'react';
import { Package, HardHat, CheckCircle2, MoreVertical } from 'lucide-react';
import { fmt } from '../../lib/calc';
import { consolidateMaterials, TRANSPARENCY_NOTICE, type ConsolidatedMaterial, type LineItem, type LineItemKind, type ServiceLine } from '../../lib/engine';
import { NumberField } from '../ui/NumberField';

interface Row {
  lineId: string;
  item: LineItem;
  itemIndex: number;
  context: string;
}

function buildRows(lines: ServiceLine[], kind: LineItemKind): Row[] {
  const rows: Row[] = [];
  lines.forEach((l) => {
    const items = kind === 'material' ? l.materials : kind === 'labor' ? l.labor : l.equipment;
    items.forEach((item, itemIndex) => {
      rows.push({ lineId: l.id, item, itemIndex, context: l.service_name + (l.variant_name ? ' · ' + l.variant_name : '') });
    });
  });
  return rows;
}

function fmtQty(n: number): string {
  return n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtUnitPrice(n: number): string {
  const hasDecimals = Math.abs(n - Math.round(n)) > 0.001;
  return '$ ' + n.toLocaleString('es-CO', { minimumFractionDigits: hasDecimals ? 2 : 0, maximumFractionDigits: 2 });
}

const headerCellStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.4px' };
const numberInputStyle: React.CSSProperties = { width: '100%', border: '1.5px solid #E2E8F0', borderRadius: 9, padding: '7px 8px', fontSize: 13, fontWeight: 700, textAlign: 'right', outline: 'none' };

function BlockHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <span style={{ width: 40, height: 40, borderRadius: 10, background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </span>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{title}</div>
        <div style={{ fontSize: 13, color: '#64748B' }}>{subtitle}</div>
      </div>
    </div>
  );
}

function ActionsButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="Editar cantidades" style={{ width: 28, height: 28, border: 'none', background: 'none', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 8 }}>
      <MoreVertical size={16} />
    </button>
  );
}

function MaterialsTable({
  materials, editMode, onToggleEdit, onGroupPriceChange, onGroupQtyChange,
}: {
  materials: ConsolidatedMaterial[];
  editMode: boolean;
  onToggleEdit: () => void;
  onGroupPriceChange: (key: string, price: number) => void;
  onGroupQtyChange: (key: string, qty: number) => void;
}) {
  if (materials.length === 0) return null;
  const total = materials.reduce((a, c) => a + c.item.subtotal, 0);
  const cols = '40px 1fr 110px 90px 130px 130px 40px';

  return (
    <div style={{ marginBottom: 32 }}>
      <BlockHeader icon={<Package size={19} />} title="Materiales" subtitle="Materiales calculados para el servicio seleccionado." />
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 640 }}>
            <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #F1F5F9' }}>
              <span style={headerCellStyle}>No.</span>
              <span style={headerCellStyle}>Descripción</span>
              <span style={headerCellStyle}>Unidad</span>
              <span style={{ ...headerCellStyle, textAlign: 'right' }}>Cantidad</span>
              <span style={{ ...headerCellStyle, textAlign: 'right' }}>Precio unitario</span>
              <span style={{ ...headerCellStyle, textAlign: 'right' }}>Total</span>
              <span />
            </div>
            {materials.map((c, i) => (
              <div key={c.key} style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #F1F5F9' }}>
                <span style={{ fontSize: 13, color: '#94A3B8', fontWeight: 600 }}>{String(i + 1).padStart(2, '0')}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.item.name}</div>
                  <div style={{ fontSize: 12.5, color: '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.contexts.join(' + ')}</div>
                </div>
                <span style={{ fontSize: 13.5, color: '#475569' }}>{c.item.unit}</span>
                {editMode ? (
                  <NumberField min={0} value={c.item.qty} onChange={(v) => onGroupQtyChange(c.key, v)} style={numberInputStyle} />
                ) : (
                  <span style={{ fontSize: 13.5, color: '#475569', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtQty(c.item.qty)}</span>
                )}
                {editMode ? (
                  <NumberField min={0} value={c.item.unitPrice} onChange={(v) => onGroupPriceChange(c.key, v)} style={numberInputStyle} />
                ) : (
                  <span style={{ fontSize: 13.5, color: '#475569', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtUnitPrice(c.item.unitPrice)}</span>
                )}
                <span style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(c.item.subtotal)}</span>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <ActionsButton onClick={onToggleEdit} />
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 24, padding: '14px 16px' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Subtotal materiales</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: '#2563EB', fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LaborTable({
  rows, editMode, onToggleEdit, onPriceChange, onQtyChange, title, subtitle,
}: {
  rows: Row[];
  editMode: boolean;
  onToggleEdit: () => void;
  onPriceChange: (lineId: string, kind: LineItemKind, itemIndex: number, price: number) => void;
  onQtyChange: (lineId: string, kind: LineItemKind, itemIndex: number, qty: number) => void;
  title: string;
  subtitle: string;
}) {
  if (rows.length === 0) return null;
  const total = rows.reduce((a, r) => a + r.item.subtotal, 0);
  const cols = '1fr 110px 90px 130px 130px 40px';

  return (
    <div style={{ marginBottom: 32 }}>
      <BlockHeader icon={<HardHat size={19} />} title={title} subtitle={subtitle} />
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 560 }}>
            <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #F1F5F9' }}>
              <span style={headerCellStyle}>Descripción</span>
              <span style={headerCellStyle}>Unidad</span>
              <span style={{ ...headerCellStyle, textAlign: 'right' }}>Cantidad</span>
              <span style={{ ...headerCellStyle, textAlign: 'right' }}>Precio unitario</span>
              <span style={{ ...headerCellStyle, textAlign: 'right' }}>Total</span>
              <span />
            </div>
            {rows.map((r) => (
              <div key={r.lineId + ':' + r.itemIndex} style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.item.name}</div>
                  <div style={{ fontSize: 12.5, color: '#94A3B8' }}>{r.context}</div>
                </div>
                <span style={{ fontSize: 13.5, color: '#475569' }}>{r.item.unit}</span>
                {editMode ? (
                  <NumberField min={0} value={r.item.qty} onChange={(v) => onQtyChange(r.lineId, r.item.kind, r.itemIndex, v)} style={numberInputStyle} />
                ) : (
                  <span style={{ fontSize: 13.5, color: '#475569', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtQty(r.item.qty)}</span>
                )}
                {editMode ? (
                  <NumberField min={0} value={r.item.unitPrice} onChange={(v) => onPriceChange(r.lineId, r.item.kind, r.itemIndex, v)} style={numberInputStyle} />
                ) : (
                  <span style={{ fontSize: 13.5, color: '#475569', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtUnitPrice(r.item.unitPrice)}</span>
                )}
                <span style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.item.subtotal)}</span>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <ActionsButton onClick={onToggleEdit} />
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 24, padding: '14px 16px' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Subtotal {title.toLowerCase()}</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: '#2563EB', fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EquipmentBlock({ rows }: { rows: Row[] }) {
  if (rows.length > 0) {
    return (
      <LaborTable
        rows={rows}
        editMode={false}
        onToggleEdit={() => {}}
        onPriceChange={() => {}}
        onQtyChange={() => {}}
        title="Equipos y herramientas"
        subtitle="Equipos y herramientas adicionales para el servicio."
      />
    );
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <CheckCircle2 size={20} style={{ color: '#22C55E', flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0F172A' }}>Equipos y herramientas <span style={{ fontWeight: 500, color: '#64748B' }}>(incluido en la mano de obra)</span></div>
          <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>Se incluyen herramientas menores, andamios y equipos básicos necesarios para la ejecución del trabajo.</div>
        </div>
      </div>
      <span style={{ background: '#DCFCE7', color: '#15803D', fontWeight: 700, fontSize: 12.5, padding: '6px 14px', borderRadius: 999, whiteSpace: 'nowrap' }}>Incluido</span>
    </div>
  );
}

function MaterialsCalcSection({ materials }: { materials: ConsolidatedMaterial[] }) {
  const [open, setOpen] = useState(false);
  const techMaterials = materials.filter((c) => c.item.technical_unit);
  if (techMaterials.length === 0) return null;

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 16, marginBottom: 32 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#475569' }}>Cálculo de materiales</span>
        <span style={{ fontSize: 13, color: '#64748B' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && techMaterials.map((c) => {
        const m = c.item;
        const baseQty = m.base_qty ?? 0;
        const waste = m.waste_pct ?? 0;
        const areaCompra = m.qty;
        return (
          <div key={c.key} style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #F1F5F9', fontSize: 12, color: '#475569', lineHeight: 1.7 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>{m.name}</div>
            <div>Área original: <strong>{Math.round(baseQty * 100) / 100} {m.technical_unit}</strong></div>
            <div>Desperdicio: <strong>{waste}%</strong></div>
            <div>Área de compra: <strong>{Math.round(areaCompra * 100) / 100} {m.technical_unit}</strong></div>
            {m.coverage_per_package != null && (
              <div>Cobertura por {m.package_unit?.toLowerCase() || 'empaque'}: <strong>{m.coverage_per_package} {m.technical_unit}</strong> <span style={{ color: '#94A3B8' }}>(puede variar según el fabricante, calculada sobre una medida base)</span></div>
            )}
            {m.package_qty != null && (
              <div>Cantidad de {m.package_unit?.toLowerCase() || 'empaques'}: <strong>{m.package_qty} {m.package_unit}</strong></div>
            )}
            {m.package_price != null && (
              <div>Precio por {m.package_unit?.toLowerCase() || 'empaque'}: <strong>{fmt(m.package_price)}</strong></div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ReviewPanel({
  lines, onPriceChange, onQtyChange, onGroupPriceChange, onGroupQtyChange, materialsIvaAmt, materialsTotal, editMode, onToggleEdit,
}: {
  lines: ServiceLine[];
  onPriceChange: (lineId: string, kind: LineItemKind, itemIndex: number, price: number) => void;
  onQtyChange: (lineId: string, kind: LineItemKind, itemIndex: number, qty: number) => void;
  onGroupPriceChange: (key: string, price: number) => void;
  onGroupQtyChange: (key: string, qty: number) => void;
  materialsIvaAmt?: number;
  materialsTotal?: number;
  editMode: boolean;
  onToggleEdit: () => void;
}) {
  if (lines.length === 0) {
    return <p style={{ fontSize: 13.5, color: '#64748B' }}>Aún no has agregado servicios a esta cotización.</p>;
  }

  const materials = consolidateMaterials(lines);
  const laborRows = buildRows(lines, 'labor');
  const otrosRows = buildRows(lines, 'equipment');

  const subtotalMateriales = materials.reduce((a, c) => a + c.item.subtotal, 0);

  return (
    <div>
      <MaterialsTable materials={materials} editMode={editMode} onToggleEdit={onToggleEdit} onGroupPriceChange={onGroupPriceChange} onGroupQtyChange={onGroupQtyChange} />

      <MaterialsCalcSection materials={materials} />

      {materialsIvaAmt != null && materialsIvaAmt > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 16, marginBottom: 32, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: '#64748B' }}>Subtotal materiales sin IVA</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(subtotalMateriales)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: '#64748B' }}>IVA materiales</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(materialsIvaAmt)}</span></div>
          {materialsTotal != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderTop: '1px solid #F1F5F9', paddingTop: 8 }}><span style={{ color: '#0F172A', fontWeight: 700 }}>Total materiales</span><span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(materialsTotal)}</span></div>
          )}
        </div>
      )}

      <LaborTable rows={laborRows} editMode={editMode} onToggleEdit={onToggleEdit} onPriceChange={onPriceChange} onQtyChange={onQtyChange} title="Mano de obra" subtitle="Mano de obra estimada para el servicio." />

      <EquipmentBlock rows={otrosRows} />

      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 14, padding: 14, fontSize: 12, color: '#1E40AF', lineHeight: 1.5 }}>
        {TRANSPARENCY_NOTICE}
      </div>
    </div>
  );
}
