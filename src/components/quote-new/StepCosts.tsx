import { ChevronRight, Truck } from 'lucide-react';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import { computeTotals, type QuoteItem, type LaborItem, type CostConfig } from '../../lib/itemEngine';
import { NumericInput } from '../ui/NumericInput';
import { formatCurrencyCOP } from '../../lib/currency';

interface Props {
  items: QuoteItem[];
  laborItems: LaborItem[];
  config: CostConfig;
  onChange: (c: CostConfig) => void;
  onContinue: () => void;
}

const VALID_DAYS_OPTIONS = [
  { label: '7 días',  value: 7 },
  { label: '15 días', value: 15 },
  { label: '30 días', value: 30 },
  { label: '45 días', value: 45 },
  { label: '60 días', value: 60 },
];

function Row({ label, value, accent, negative, amber }: { label: string; value: string; accent?: boolean; negative?: boolean; amber?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #F1F5F9' }}>
      <span style={{ fontSize: 13.5, color: accent ? '#0F172A' : '#64748B', fontWeight: accent ? 700 : 400 }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: accent ? 900 : 600, color: negative ? '#DC2626' : amber ? '#D97706' : accent ? '#0F172A' : '#475569', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function PctSlider({ label, value, max = 100, onChange, hint }: { label: string; value: number; max?: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{label}</label>
        {hint && <span style={{ fontSize: 11, color: '#94A3B8' }}>{hint}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="range" min={0} max={max} step={1} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: '#2563EB' }} />
        <div style={{ width: 72, flexShrink: 0 }}>
          <NumericInput value={value} onChange={v => onChange(Math.min(max, Math.max(0, v)))} max={max} suffix="%" />
        </div>
      </div>
    </div>
  );
}

export function StepCosts({ items, laborItems, config, onChange, onContinue }: Props) {
  const totals = computeTotals(items, config, laborItems);
  const C = formatCurrencyCOP;
  const isCustomDays = !VALID_DAYS_OPTIONS.some(o => o.value === config.valid_days);

  return (
    <div style={{ padding: '0 16px' }}>

      {/* Ajustes de costos */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>
          Ajustes
        </div>
        <PctSlider label="IVA" value={config.tax_rate} onChange={v => onChange({ ...config, tax_rate: v })} hint="Solo aplica a productos/servicios" />
        <PctSlider label="Descuento global" value={config.discount_pct} onChange={v => onChange({ ...config, discount_pct: v, discount_fixed: 0 })} hint="Sobre subtotal" />
        <PctSlider label="Gastos indirectos / Utilidad" value={config.overhead_pct} onChange={v => onChange({ ...config, overhead_pct: v })} hint="Admin + utilidad" />
        <PctSlider label="Anticipo" value={config.advance_pct} onChange={v => onChange({ ...config, advance_pct: v })} hint="% al firmar" />
      </div>

      {/* Transporte */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FFF7ED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Truck size={18} color="#D97706" />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Transporte</div>
              <div style={{ fontSize: 11.5, color: '#94A3B8' }}>Sin IVA · Se suma al total</div>
            </div>
          </div>
          {/* Toggle ON/OFF */}
          <ToggleSwitch
            checked={config.include_transport}
            onChange={v => onChange({ ...config, include_transport: v })}
          />
        </div>

        {config.include_transport && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #FDE68A' }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
              Valor del transporte
            </label>
            <NumericInput
              value={config.transport_cost}
              onChange={v => onChange({ ...config, transport_cost: Math.max(0, v) })}
              min={0}
              prefix="$"
            />
            <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 6 }}>
              No se aplicará IVA sobre este valor.
            </div>
          </div>
        )}
      </div>

      {/* Desglose */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
          Desglose
        </div>
        {items.length > 0 && <Row label="Subtotal productos/servicios" value={C(totals.subtotal)} />}
        {totals.discount > 0 && <Row label={`Descuento (${config.discount_pct}%)`} value={`-${C(totals.discount)}`} negative />}
        {totals.overhead > 0 && <Row label={`Indirectos / Utilidad (${config.overhead_pct}%)`} value={C(totals.overhead)} />}
        {totals.tax > 0 && <Row label={`IVA (${config.tax_rate}%) sobre productos`} value={C(totals.tax)} />}
        {totals.labor_total > 0 && <Row label="Mano de obra (sin IVA)" value={C(totals.labor_total)} amber />}
        {totals.transport_cost > 0 && <Row label="Transporte (sin IVA)" value={C(totals.transport_cost)} amber />}
      </div>

      {/* Total grande */}
      <div style={{ background: 'linear-gradient(135deg,#2563EB 0%,#1D4ED8 100%)', borderRadius: 18, padding: '20px 18px', marginBottom: 12, color: '#fff' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, opacity: .8, marginBottom: 4 }}>TOTAL</div>
        <div style={{ fontSize: 36, fontWeight: 900, fontVariantNumeric: 'tabular-nums', letterSpacing: '-1px', lineHeight: 1 }}>
          {C(totals.total)}
        </div>
        {config.advance_pct > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.2)', display: 'flex', justifyContent: 'space-between' }}>
            <div><div style={{ fontSize: 11, opacity: .7 }}>Anticipo ({config.advance_pct}%)</div><div style={{ fontSize: 16, fontWeight: 800 }}>{C(totals.advance)}</div></div>
            <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, opacity: .7 }}>Saldo</div><div style={{ fontSize: 16, fontWeight: 800 }}>{C(totals.balance)}</div></div>
          </div>
        )}
      </div>

      {/* Vigencia */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>
          Vigencia de la cotización
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: isCustomDays ? 12 : 0 }}>
          {VALID_DAYS_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => onChange({ ...config, valid_days: opt.value })}
              style={{ border: 'none', borderRadius: 99, padding: '7px 14px', cursor: 'pointer', background: config.valid_days === opt.value ? '#2563EB' : '#F1F5F9', color: config.valid_days === opt.value ? '#fff' : '#475569', fontWeight: config.valid_days === opt.value ? 700 : 500, fontSize: 13, fontFamily: 'inherit' }}>
              {opt.label}
            </button>
          ))}
          <button onClick={() => onChange({ ...config, valid_days: 0 })}
            style={{ border: 'none', borderRadius: 99, padding: '7px 14px', cursor: 'pointer', background: isCustomDays ? '#2563EB' : '#F1F5F9', color: isCustomDays ? '#fff' : '#475569', fontWeight: isCustomDays ? 700 : 500, fontSize: 13, fontFamily: 'inherit' }}>
            Personalizada
          </button>
        </div>
        {isCustomDays && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <NumericInput value={config.valid_days} onChange={v => onChange({ ...config, valid_days: Math.max(1, Math.round(v)) })} min={1} max={365} suffix=" días" />
            </div>
            <span style={{ fontSize: 13, color: '#64748B', flexShrink: 0 }}>días</span>
          </div>
        )}
      </div>

      <button onClick={onContinue} style={{ width: '100%', height: 52, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 16, borderRadius: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        Continuar <ChevronRight size={18} />
      </button>
    </div>
  );
}
