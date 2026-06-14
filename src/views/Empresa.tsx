import { useState, useRef, type ChangeEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { updateCompanySettings, uploadLogo, logoUrl } from '../services/workspaces';
import { useToast } from '../components/ui/Toast';
import { NumberField } from '../components/ui/NumberField';
import type { CompanySettings, TaxMode } from '../lib/types';

export function Empresa() {
  const { workspace, company } = useWorkspace();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(company.name);
  const [nit, setNit] = useState(company.nit ?? '');
  const [phone, setPhone] = useState(company.phone ?? '');
  const [taxMode, setTaxMode] = useState<TaxMode>(company.tax_mode);
  const [taxRate, setTaxRate] = useState(company.tax_rate);
  const [advancePct, setAdvancePct] = useState(company.advance_pct);
  const [validDaysDefault, setValidDaysDefault] = useState(company.valid_days_default);
  const [terms, setTerms] = useState<string[]>(Array.isArray(company.terms_conditions) ? (company.terms_conditions as unknown as string[]) : []);
  const [newTerm, setNewTerm] = useState('');

  const saveMutation = useMutation({
    mutationFn: (patch: Partial<CompanySettings>) => updateCompanySettings(workspace.id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companySettings', workspace.id] });
    },
  });

  function saveTerms(next: string[]) {
    setTerms(next);
    saveMutation.mutate({ terms_conditions: next as unknown as CompanySettings['terms_conditions'] });
  }

  function addTerm() {
    if (!newTerm.trim()) return;
    saveTerms([...terms, newTerm.trim()]);
    setNewTerm('');
  }

  function editTerm(i: number, value: string) {
    setTerms((prev) => prev.map((t, idx) => (idx === i ? value : t)));
  }

  function commitTerm() {
    saveMutation.mutate({ terms_conditions: terms as unknown as CompanySettings['terms_conditions'] });
  }

  function removeTerm(i: number) {
    saveTerms(terms.filter((_, idx) => idx !== i));
  }

  function moveTerm(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= terms.length) return;
    const next = [...terms];
    [next[i], next[j]] = [next[j], next[i]];
    saveTerms(next);
  }

  const logoMutation = useMutation({
    mutationFn: (file: File) => uploadLogo(workspace.id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companySettings', workspace.id] });
      queryClient.invalidateQueries({ queryKey: ['workspace', workspace.id] });
      showToast('Logo actualizado');
    },
  });

  function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    logoMutation.mutate(f);
  }

  const inputStyle: React.CSSProperties = { width: '100%', border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '11px 13px', fontSize: 14, outline: 'none' };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 };

  const previewLogo = logoUrl(company.logo_path);

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 'clamp(22px,4vw,30px)', fontWeight: 800, letterSpacing: '-1px', marginBottom: 6 }}>Mi Empresa</h1>
      <p style={{ fontSize: 13.5, color: '#64748B', marginBottom: 18 }}>Estos datos aparecen en el encabezado de cada cotización en PDF.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {previewLogo ? (
              <img src={previewLogo} alt="Logo" style={{ width: 60, height: 60, borderRadius: 16, objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 60, height: 60, borderRadius: 16, background: 'repeating-linear-gradient(45deg,#EEF2FF,#EEF2FF 7px,#F8FAFF 7px,#F8FAFF 14px)', border: '1px dashed #DBE5FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Mono',monospace", fontSize: 9, color: '#64748B', textAlign: 'center', flexShrink: 0 }}>
                [ logo ]
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoChange} style={{ display: 'none' }} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={logoMutation.isPending}
              style={{ border: '1.5px solid #E2E8F0', background: '#fff', color: '#2563EB', fontWeight: 700, fontSize: 13, padding: '9px 14px', borderRadius: 11, cursor: 'pointer' }}
            >
              {logoMutation.isPending ? 'Subiendo…' : 'Subir logo'}
            </button>
          </div>
          <div>
            <label style={labelStyle}>Nombre / Razón social</label>
            <input
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name !== company.name && saveMutation.mutate({ name })}
            />
          </div>
          <div>
            <label style={labelStyle}>NIT</label>
            <input
              style={inputStyle}
              value={nit}
              onChange={(e) => setNit(e.target.value)}
              onBlur={() => nit !== (company.nit ?? '') && saveMutation.mutate({ nit })}
            />
          </div>
          <div>
            <label style={labelStyle}>Teléfono / WhatsApp</label>
            <input
              style={inputStyle}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => phone !== (company.phone ?? '') && saveMutation.mutate({ phone })}
            />
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Configuración de facturación y propuestas</div>

          <div>
            <label style={labelStyle}>Régimen tributario por defecto</label>
            <select
              value={taxMode}
              onChange={(e) => {
                const mode = e.target.value as TaxMode;
                const rate = mode === 'none' ? 0 : (taxRate || 19);
                setTaxMode(mode);
                setTaxRate(rate);
                saveMutation.mutate({ tax_mode: mode, tax_rate: rate });
              }}
              style={inputStyle}
            >
              <option value="none">Sin IVA</option>
              <option value="materials">IVA sobre materiales</option>
              <option value="materials_labor">IVA sobre materiales + mano de obra</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>

          {taxMode !== 'none' && (
            <div>
              <label style={labelStyle}>Tasa de IVA (%)</label>
              <NumberField
                min={0}
                max={100}
                style={inputStyle}
                value={taxRate}
                onChange={setTaxRate}
                onBlur={() => taxRate !== company.tax_rate && saveMutation.mutate({ tax_rate: taxRate })}
              />
            </div>
          )}

          <div>
            <label style={labelStyle}>Anticipo requerido por defecto (%)</label>
            <NumberField
              min={0}
              max={100}
              style={inputStyle}
              value={advancePct}
              onChange={setAdvancePct}
              onBlur={() => advancePct !== company.advance_pct && saveMutation.mutate({ advance_pct: advancePct })}
            />
          </div>

          <div>
            <label style={labelStyle}>Vigencia por defecto (días)</label>
            <NumberField
              min={1}
              style={inputStyle}
              value={validDaysDefault}
              onChange={setValidDaysDefault}
              onBlur={() => validDaysDefault !== company.valid_days_default && saveMutation.mutate({ valid_days_default: validDaysDefault })}
            />
          </div>

          <div>
            <label style={labelStyle}>Términos y condiciones</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {terms.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', padding: '11px 0' }}>{i + 1}.</span>
                  <textarea
                    value={t}
                    onChange={(e) => editTerm(i, e.target.value)}
                    onBlur={commitTerm}
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical', flex: 1 }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <button onClick={() => moveTerm(i, -1)} disabled={i === 0} style={{ border: '1px solid #E2E8F0', background: '#fff', borderRadius: 8, width: 28, height: 24, cursor: i === 0 ? 'default' : 'pointer', color: '#475569', fontSize: 12 }}>↑</button>
                    <button onClick={() => moveTerm(i, 1)} disabled={i === terms.length - 1} style={{ border: '1px solid #E2E8F0', background: '#fff', borderRadius: 8, width: 28, height: 24, cursor: i === terms.length - 1 ? 'default' : 'pointer', color: '#475569', fontSize: 12 }}>↓</button>
                    <button onClick={() => removeTerm(i)} style={{ border: '1px solid #FECACA', background: '#FEF2F2', borderRadius: 8, width: 28, height: 24, cursor: 'pointer', color: '#DC2626', fontSize: 12 }}>✕</button>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={newTerm}
                  onChange={(e) => setNewTerm(e.target.value)}
                  placeholder="Nuevo término o condición"
                  style={{ ...inputStyle, flex: 1 }}
                  onKeyDown={(e) => e.key === 'Enter' && addTerm()}
                />
                <button onClick={addTerm} style={{ border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 13, padding: '0 16px', borderRadius: 11, cursor: 'pointer' }}>
                  Agregar
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 18, padding: 0, overflow: 'hidden' }}>
          <div style={{ background: '#F8FAFC', padding: '12px 16px', borderBottom: '1px solid #EEF2F7', fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '.5px' }}>VISTA PREVIA EN PDF</div>
          <div style={{ padding: 20 }}>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ background: '#2563EB', padding: '14px 16px', color: '#fff', display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ display: 'flex', gap: 2.5 }}>
                  <div style={{ width: 5, height: 18, borderRadius: 3, background: 'rgba(255,255,255,.5)', transform: 'skewX(-16deg)' }} />
                  <div style={{ width: 5, height: 18, borderRadius: 3, background: 'rgba(255,255,255,.8)', transform: 'skewX(-16deg)' }} />
                  <div style={{ width: 5, height: 18, borderRadius: 3, background: '#fff', transform: 'skewX(-16deg)' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{name || 'Mi Empresa'}</div>
                  <div style={{ fontSize: 10, opacity: 0.85 }}>NIT {nit || '—'}</div>
                </div>
              </div>
              <div style={{ padding: 16, fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>Propuesta #BRV-0142</span>
                  <span style={{ fontSize: 11, color: '#94A3B8' }}>Válida hasta 30 jun 2026</span>
                </div>
                <div style={{ marginTop: 4 }}>
                  Cliente: Constructora Andina<br />Proyecto: Remodelación Apto 502
                </div>
                <div style={{ borderTop: '2px solid #0F172A', marginTop: 12, paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>TOTAL</span>
                  <span style={{ fontWeight: 800, color: '#2563EB', fontSize: 15 }}>$ 4.850.000</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
