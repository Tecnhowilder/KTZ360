import { Home, Sun, Paintbrush, ChevronDown, Circle } from 'lucide-react';
import { evalBool, type ExprContext } from '../../lib/engine/expr';
import type { CatalogQuestion } from '../../lib/engine';
import { NumberField } from '../ui/NumberField';

const inputStyle: React.CSSProperties = { width: '100%', height: 64, border: '1.5px solid #E2E8F0', borderRadius: 16, padding: '0 20px', fontSize: 15, outline: 'none' };
const selectStyle: React.CSSProperties = { width: '100%', height: 64, border: '1px solid #E2E8F0', borderRadius: 16, padding: '0 44px 0 20px', fontSize: 15, fontWeight: 600, outline: 'none', background: '#fff', color: '#0F172A', appearance: 'none', cursor: 'pointer' };

function Section({ title, subtitle, children }: { title: string; subtitle?: string | null; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: subtitle ? 2 : 10 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, color: '#64748B', marginBottom: 12 }}>{subtitle}</div>}
      {children}
    </div>
  );
}

function CheckBadge() {
  return (
    <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#2563EB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>✓</span>
  );
}

function SelectField({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div style={{ position: 'relative' }}>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown size={18} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
    </div>
  );
}

export function DynamicQuestions({
  questions, variantId, answers, onChange,
}: {
  questions: CatalogQuestion[];
  variantId: string | null;
  answers: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const visible = questions.filter((q) => {
    if (q.variant_id && q.variant_id !== variantId) return false;
    if (q.visible_if && !evalBool(q.visible_if, answers as unknown as ExprContext)) return false;
    return true;
  });

  if (visible.length === 0) return null;

  const exteriorQ = visible.find((q) => q.key === 'exterior' && q.type === 'boolean');
  const boolGroup = visible.filter((q) => q.type === 'boolean' && q.key !== 'exterior');
  const others = visible.filter((q) => q.key !== exteriorQ?.key && !boolGroup.includes(q));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {exteriorQ && (
        <Section title={exteriorQ.label} subtitle={exteriorQ.help_text}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[{ v: false, l: 'Interior', Icon: Home }, { v: true, l: 'Exterior', Icon: Sun }].map((opt) => {
              const active = Boolean(answers[exteriorQ.key]) === opt.v;
              return (
                <button
                  key={opt.l}
                  onClick={() => onChange(exteriorQ.key, opt.v)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: `1.5px solid ${active ? '#2563EB' : '#E2E8F0'}`, background: active ? '#EFF6FF' : '#fff', borderRadius: 14, padding: '16px 18px', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
                    <opt.Icon size={18} style={{ color: '#2563EB' }} /> {opt.l}
                  </span>
                  {active && <CheckBadge />}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {others.length > 0 && (
        <div className="qf-fields-grid">
          {others.map((q) => {
            const value = answers[q.key];
            return (
              <Section key={q.id} title={q.label} subtitle={q.help_text}>
                {q.type === 'number' && q.min != null && q.max != null && q.max - q.min <= 6 && (
                  <SelectField
                    value={String(typeof value === 'number' ? value : q.min)}
                    onChange={(v) => onChange(q.key, Number(v))}
                    options={Array.from({ length: q.max - q.min + 1 }, (_, i) => q.min! + i).map((n) => ({
                      value: String(n),
                      label: `${n} ${n === 1 ? 'mano' : 'manos'}`,
                    }))}
                  />
                )}
                {q.type === 'number' && !(q.min != null && q.max != null && q.max - q.min <= 6) && (
                  <NumberField
                    style={inputStyle}
                    value={typeof value === 'number' ? value : 0}
                    min={q.min ?? undefined}
                    max={q.max ?? undefined}
                    onChange={(v) => onChange(q.key, v)}
                  />
                )}
                {q.type === 'select' && (
                  <SelectField
                    value={typeof value === 'string' ? value : String(q.options[0]?.value ?? '')}
                    onChange={(v) => onChange(q.key, v)}
                    options={q.options.map((opt) => ({ value: opt.value, label: opt.label }))}
                  />
                )}
                {q.type === 'multiselect' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {q.options.map((opt) => {
                      const arr = Array.isArray(value) ? (value as string[]) : [];
                      const active = arr.includes(opt.value);
                      return (
                        <button
                          key={opt.id}
                          onClick={() => onChange(q.key, active ? arr.filter((v) => v !== opt.value) : [...arr, opt.value])}
                          style={{ border: `1.5px solid ${active ? '#2563EB' : '#E2E8F0'}`, background: active ? '#EEF2FF' : '#fff', color: active ? '#1E40AF' : '#475569', fontWeight: 700, fontSize: 12.5, padding: '9px 13px', borderRadius: 11, cursor: 'pointer' }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Section>
            );
          })}
        </div>
      )}

      {boolGroup.length > 0 && (
        <Section title="Trabajos incluidos" subtitle="Selecciona los trabajos que incluye el servicio.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            {boolGroup.map((q) => {
              const active = Boolean(answers[q.key]);
              return (
                <button
                  key={q.id}
                  onClick={() => onChange(q.key, !active)}
                  style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 8, border: `1.5px solid ${active ? '#2563EB' : '#E2E8F0'}`, background: active ? '#EFF6FF' : '#fff', borderRadius: 14, padding: 14, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                >
                  <span style={{ width: 36, height: 36, borderRadius: 10, background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Paintbrush size={17} />
                  </span>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>{q.label}</div>
                  {q.help_text && <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.4 }}>{q.help_text}</div>}
                  <span style={{ position: 'absolute', top: 12, right: 12 }}>
                    {active ? <CheckBadge /> : <Circle size={20} style={{ color: '#CBD5E1' }} />}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}
