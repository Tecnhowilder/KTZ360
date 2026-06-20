/**
 * EmpresaMobile — Vista móvil de Mi Empresa.
 * Diseño minimalista inspirado en Stripe Business Profile / Shopify Settings.
 * Solo se renderiza cuando navMode === 'bottom'.
 */
import { useState, useRef, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload, ChevronRight, Crown, Palette,
  Check, Building2, Save,
} from 'lucide-react';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { updateCompanySettings, uploadLogo, logoUrl } from '../../services/workspaces';
import { useToast } from '../ui/Toast';
import { useUI } from '../../features/app/UIProvider';
import { useFeatureAccess } from '../../hooks/usePermissions';
import { isValidPhone } from '../../lib/validation';
import type { CompanySettings, TaxMode } from '../../lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TAX_LABELS: Record<TaxMode, string> = {
  none:             'Sin IVA',
  materials:        'IVA sobre materiales',
  materials_labor:  'IVA mat. + mano obra',
  custom:           'Personalizado',
};

const CARD: React.CSSProperties = {
  background: '#fff',
  borderRadius: 18,
  boxShadow: '0 2px 8px rgba(0,0,0,.055)',
  overflow: 'hidden',
};


function Field({ label, value, onChange, onBlur, placeholder, type = 'text', error }: {
  label: string; value: string; onChange: (v: string) => void; onBlur: () => void;
  placeholder?: string; type?: string; error?: string;
}) {
  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', letterSpacing: '.4px', marginBottom: 5 }}>{label.toUpperCase()}</div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, fontWeight: 500, color: '#0F172A', background: 'transparent', padding: 0, boxSizing: 'border-box' }}
      />
      {error && <div style={{ fontSize: 11, color: '#DC2626', marginTop: 4 }}>{error}</div>}
    </div>
  );
}

function ConfigTile({ icon, label, value, onPress }: { icon: React.ReactNode; label: string; value: string; onPress: () => void }) {
  return (
    <button onClick={onPress} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', borderBottom: '1px solid #F1F5F9' }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#2563EB' }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: '#94A3B8', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      </div>
      <ChevronRight size={16} color="#CBD5E1"/>
    </button>
  );
}

// ─── EmpresaMobile ────────────────────────────────────────────────────────────

export function EmpresaMobile() {
  const navigate    = useNavigate();
  const { workspace, company, planName } = useWorkspace();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { openUpgradeModal } = useUI();
  const brandingAccess = useFeatureAccess('branding_enabled');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name,       setName]       = useState(company.name);
  const [nit,        setNit]        = useState(company.nit ?? '');
  const [phone,      setPhone]      = useState(company.phone ?? '');
  const [email,      setEmail]      = useState(company.email ?? '');
  const [city,       setCity]       = useState(company.city ?? '');
  const [saved,      setSaved]      = useState(false);
  const [showAllTerms, setShowAllTerms] = useState(false);

  const terms = Array.isArray(company.terms_conditions)
    ? (company.terms_conditions as unknown as string[])
    : [];

  const saveMutation = useMutation({
    mutationFn: (patch: Partial<CompanySettings>) => updateCompanySettings(workspace.id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companySettings', workspace.id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const logoMutation = useMutation({
    mutationFn: (file: File) => uploadLogo(workspace.id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companySettings', workspace.id] });
      queryClient.invalidateQueries({ queryKey: ['workspace', workspace.id] });
      showToast('Logo actualizado ✓');
    },
  });

  function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    logoMutation.mutate(f);
  }

  function handleUploadLogoClick() {
    if (brandingAccess.data === false) {
      openUpgradeModal({ title: 'Personaliza tus cotizaciones', message: 'Sube tu logo con el plan PRO.', targetPlan: 'pro', ctaLabel: 'Actualizar a PRO' });
      return;
    }
    fileInputRef.current?.click();
  }

  function saveAll() {
    saveMutation.mutate({ name, nit, phone, email, city });
  }

  const previewLogo = logoUrl(company.logo_path);
  const visibleTerms = showAllTerms ? terms : terms.slice(0, 3);

  const planColors: Record<string, { bg: string; text: string; border: string }> = {
    Free:    { bg: '#F8FAFC', text: '#475569', border: '#E2E8F0' },
    Pro:     { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
    Premium: { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE' },
  };
  const planStyle = planColors[planName] ?? planColors.Free;

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100%', paddingBottom: 24 }}>

      {/* ── Sub-header ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #EEF2F7', padding: '12px 16px 14px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', letterSpacing: '-.5px', margin: 0 }}>Mi Empresa</h1>
        <p style={{ fontSize: 12, color: '#64748B', margin: '3px 0 0' }}>Información que aparecerá en tus cotizaciones</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 16px 0' }}>

        {/* ── 1. Logo ── */}
        <div style={CARD}>
          <div style={{ padding: '16px 16px 14px', display: 'flex', alignItems: 'center', gap: 16 }}>
            {previewLogo ? (
              <img src={previewLogo} alt="Logo" style={{ width: 72, height: 72, borderRadius: 16, objectFit: 'cover', flexShrink: 0, border: '1px solid #E2E8F0' }}/>
            ) : (
              <div style={{ width: 72, height: 72, borderRadius: 16, background: '#F1F5F9', border: '2px dashed #CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Building2 size={28} color="#94A3B8"/>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoChange} style={{ display: 'none' }}/>
            <div>
              <button onClick={handleUploadLogoClick} disabled={logoMutation.isPending} style={{ display: 'flex', alignItems: 'center', gap: 7, border: '1.5px solid #E2E8F0', background: '#fff', color: '#2563EB', fontWeight: 700, fontSize: 13.5, padding: '10px 16px', borderRadius: 12, cursor: 'pointer', marginBottom: 6 }}>
                <Upload size={14}/>
                {logoMutation.isPending ? 'Subiendo…' : 'Subir logo'}
                {brandingAccess.data === false && <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', background: '#2563EB', padding: '2px 5px', borderRadius: 5 }}>PRO</span>}
              </button>
              <div style={{ fontSize: 11.5, color: '#94A3B8' }}>Recomendado: 512×512 px</div>
            </div>
          </div>
        </div>

        {/* ── 2. Información de la empresa ── */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#64748B', marginBottom: 8, paddingLeft: 2 }}>INFORMACIÓN DE LA EMPRESA</div>
          <div style={CARD}>
            <Field label="Nombre / Razón social" value={name} onChange={setName}
              onBlur={() => name !== company.name && saveMutation.mutate({ name })}
              placeholder="Nombre de tu empresa"/>
            <Field label="NIT" value={nit} onChange={setNit}
              onBlur={() => nit !== (company.nit ?? '') && saveMutation.mutate({ nit })}
              placeholder="900.123.456-7"/>
            <Field label="Teléfono / WhatsApp" value={phone} onChange={setPhone} type="tel"
              onBlur={() => { if (!phone.trim() || isValidPhone(phone)) saveMutation.mutate({ phone }); }}
              placeholder="+57 300 123 4567"
              error={phone.trim() && !isValidPhone(phone) ? 'Número inválido' : undefined}/>
            <Field label="Correo electrónico" value={email} onChange={setEmail} type="email"
              onBlur={() => email !== (company.email ?? '') && saveMutation.mutate({ email })}
              placeholder="contacto@tuempresa.com"/>
            <Field label="Ciudad / Dirección" value={city} onChange={setCity}
              onBlur={() => city !== (company.city ?? '') && saveMutation.mutate({ city })}
              placeholder="Bogotá, Colombia"/>

            {/* Guardar todo */}
            <div style={{ padding: '14px 16px' }}>
              <button onClick={saveAll} disabled={saveMutation.isPending} style={{ width: '100%', border: 'none', background: saved ? '#22C55E' : '#2563EB', color: '#fff', fontWeight: 700, fontSize: 15, padding: '14px 0', borderRadius: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background .3s' }}>
                {saved ? <><Check size={17}/> Cambios guardados</> : <><Save size={16}/> Guardar cambios</>}
              </button>
            </div>
          </div>
        </div>

        {/* ── 3. Configuración de cotización ── */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#64748B', marginBottom: 4, paddingLeft: 2 }}>CONFIGURACIÓN DE COTIZACIÓN</div>
          <div style={{ fontSize: 11.5, color: '#94A3B8', marginBottom: 8, paddingLeft: 2 }}>Define los valores por defecto al crear nuevas cotizaciones.</div>
          <div style={CARD}>
            <ConfigTile
              icon={<span style={{ fontSize: 16 }}>%</span>}
              label="Tasa de IVA"
              value={`${company.tax_rate}%`}
              onPress={() => navigate('/app/empresa')}
            />
            <ConfigTile
              icon={<span style={{ fontSize: 16 }}>💰</span>}
              label="Anticipo requerido"
              value={`${company.advance_pct}%`}
              onPress={() => navigate('/app/empresa')}
            />
            <ConfigTile
              icon={<span style={{ fontSize: 16 }}>📅</span>}
              label="Vigencia por defecto"
              value={`${company.valid_days_default} días`}
              onPress={() => navigate('/app/empresa')}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>🧾</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, color: '#94A3B8', marginBottom: 2 }}>Régimen de IVA</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{TAX_LABELS[company.tax_mode]}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 4. Términos y condiciones ── */}
        {terms.length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#64748B', marginBottom: 8, paddingLeft: 2 }}>TÉRMINOS Y CONDICIONES POR DEFECTO</div>
            <div style={CARD}>
              {visibleTerms.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: '1px solid #F1F5F9' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#CBD5E1', width: 18, flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 13, color: '#374151', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{t}</span>
                  <ChevronRight size={14} color="#CBD5E1" style={{ flexShrink: 0 }}/>
                </div>
              ))}
              {terms.length > 3 && (
                <button onClick={() => setShowAllTerms(v => !v)} style={{ width: '100%', border: 'none', background: 'none', color: '#2563EB', fontWeight: 600, fontSize: 13, padding: '12px 16px', cursor: 'pointer', textAlign: 'left' }}>
                  {showAllTerms ? '↑ Mostrar menos' : `↓ Ver los ${terms.length} términos y condiciones`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── 5. Colores corporativos ── */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#64748B', marginBottom: 8, paddingLeft: 2 }}>PERSONALIZACIÓN DEL PDF</div>
          <div style={CARD}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ fontSize: 11.5, color: '#94A3B8', marginBottom: 10 }}>Colores corporativos en tus propuestas</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {([
                  { label: 'Principal',   color: company.color_primary,   field: 'color_primary' as const },
                  { label: 'Secundario',  color: company.color_secondary,  field: 'color_secondary' as const },
                  { label: 'Acento',      color: company.color_accent,     field: 'color_accent' as const },
                ] as const).map(c => (
                  <div key={c.field} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: c.color, border: '2px solid rgba(0,0,0,.08)' }}/>
                    <span style={{ fontSize: 10, color: '#94A3B8' }}>{c.label}</span>
                  </div>
                ))}
                <button onClick={() => brandingAccess.data === false
                  ? openUpgradeModal({ title: 'Colores corporativos en PRO', message: 'Personaliza colores con PRO.', targetPlan: 'pro', ctaLabel: 'Actualizar a PRO' })
                  : navigate('/app/empresa')}
                  style={{ marginLeft: 'auto', border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#2563EB', fontWeight: 600, fontSize: 12.5, padding: '8px 12px', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Palette size={13}/> Editar
                  {brandingAccess.data === false && <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', background: '#2563EB', padding: '2px 5px', borderRadius: 5 }}>PRO</span>}
                </button>
              </div>
            </div>

            {/* Vista previa PDF mini */}
            <div style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 11.5, color: '#94A3B8', marginBottom: 10 }}>Vista previa del encabezado PDF</div>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ background: company.color_primary, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {previewLogo ? (
                    <img src={previewLogo} alt="Logo" style={{ width: 36, height: 36, borderRadius: 9, objectFit: 'cover', background: '#fff', flexShrink: 0 }}/>
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Building2 size={18} color="#fff"/>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{name || 'Tu empresa'}</div>
                    <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.7)' }}>{city || 'Bogotá, Colombia'}</div>
                  </div>
                </div>
                <div style={{ padding: '10px 14px', background: '#fff' }}>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>PROPUESTA COMERCIAL #KTZ-0001</div>
                  <div style={{ fontSize: 12, color: '#374151', marginTop: 3 }}>
                    <span style={{ color: company.color_accent, fontWeight: 600 }}>{phone || '+57 300 000 0000'}</span>
                    {' · '}{email || 'contacto@empresa.com'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 6. Suscripción actual ── */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#64748B', marginBottom: 8, paddingLeft: 2 }}>TU SUSCRIPCIÓN ACTUAL</div>
          <button onClick={() => navigate('/app/planes')} style={{ width: '100%', ...CARD, border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, padding: '16px', background: planStyle.bg, borderWidth: 1, borderStyle: 'solid', borderColor: planStyle.border }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: planStyle.text, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Crown size={22} color="#fff"/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: planStyle.text }}>Plan {planName}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Ver detalles del plan</div>
            </div>
            <ChevronRight size={18} color={planStyle.text}/>
          </button>
        </div>

        {/* ── 7. Ir al Dashboard ── */}
        <button onClick={() => navigate('/app/dashboard')} style={{ width: '100%', border: '1.5px solid #E2E8F0', background: '#fff', color: '#2563EB', fontWeight: 700, fontSize: 14, padding: '13px 0', borderRadius: 14, cursor: 'pointer' }}>
          Ir al Dashboard →
        </button>

      </div>
    </div>
  );
}
