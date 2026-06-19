import { useState, useEffect } from 'react';
import { Search, Plus, ChevronRight, AlertCircle } from 'lucide-react';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useAuth } from '../../features/auth/AuthProvider';
import { searchClients, createClient, findDuplicateClients, type ClientInput } from '../../services/clients';
import type { Client } from '../../lib/types';

export interface StepClientData {
  clientId: string | null;
  clientName: string;
  clientEmail?: string;    // para precompletar share por correo
  projectName: string;
  description: string;
}

interface Props {
  data: StepClientData;
  onChange: (d: StepClientData) => void;
  onContinue: () => void;
}

const AVATAR_COLORS = [
  { bg: '#DBEAFE', fg: '#1D4ED8' }, { bg: '#D1FAE5', fg: '#065F46' },
  { bg: '#EDE9FE', fg: '#6D28D9' }, { bg: '#FEF3C7', fg: '#92400E' },
  { bg: '#E0F2FE', fg: '#0369A1' },
];
const av = (name: string) => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

const EMPTY_FORM: ClientInput = {
  name: '', phone: '', email: '', document_number: '',
  address: '', neighborhood: '', city: '', notes: '',
};

export function StepClient({ data, onChange, onContinue }: Props) {
  const { workspace } = useWorkspace();
  const { user } = useAuth();

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Client[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [form, setForm] = useState<ClientInput>(EMPTY_FORM);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<Client[]>([]);
  const [showDupSheet, setShowDupSheet] = useState(false);

  // Búsqueda debounced
  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const r = await searchClients(workspace.id, search);
        setResults(r);
      } finally { setLoadingSearch(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [search, workspace.id]);

  function selectClient(c: Client) {
    onChange({ ...data, clientId: c.id, clientName: c.name, clientEmail: c.email ?? undefined });
    setSearch('');
    setResults([]);
  }

  async function handleCreateClient() {
    if (!form.name.trim() || !consent || !user) return;
    setSaving(true);
    try {
      // 1. Verificar duplicados
      const dups = await findDuplicateClients(workspace.id, form.phone, form.email, form.document_number);
      if (dups.length > 0) {
        setDuplicates(dups);
        setShowDupSheet(true);
        setSaving(false);
        return;
      }
      // 2. Crear cliente
      const created = await createClient(workspace.id, user.id, form);
      onChange({ ...data, clientId: created.id, clientName: created.name, clientEmail: created.email ?? undefined });
      setShowNewForm(false);
      setForm(EMPTY_FORM);
      setConsent(false);
    } catch (e) {
      alert('Error al crear cliente. Intenta de nuevo.');
    } finally { setSaving(false); }
  }

  const canContinue = data.clientId !== null || data.clientName.trim().length > 0;

  return (
    <div style={{ padding: '0 16px' }}>
      {/* Cliente seleccionado */}
      {data.clientName && !showNewForm && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#EFF6FF', border: '1.5px solid #BFDBFE', borderRadius: 14, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: '#DBEAFE', color: '#1D4ED8', fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {data.clientName[0].toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1E40AF' }}>{data.clientName}</div>
            {!data.clientId && <div style={{ fontSize: 11.5, color: '#60A5FA' }}>Nuevo cliente (no guardado aún)</div>}
          </div>
          <button onClick={() => onChange({ ...data, clientId: null, clientName: '' })}
            style={{ border: 'none', background: 'none', color: '#93C5FD', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
            Cambiar
          </button>
        </div>
      )}

      {!data.clientName && !showNewForm && (
        <>
          {/* Búsqueda */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="search" placeholder="Buscar por nombre, teléfono, correo..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', height: 46, border: '1px solid #E2E8F0', borderRadius: 12, paddingLeft: 38, paddingRight: 12, fontSize: 14.5, outline: 'none', background: '#F8FAFC', boxSizing: 'border-box' }}
            />
          </div>

          {/* Resultados */}
          {search.trim() && (
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden', marginBottom: 12, boxShadow: '0 4px 16px rgba(15,23,42,.07)' }}>
              {loadingSearch ? (
                <div style={{ padding: '14px 16px', color: '#94A3B8', fontSize: 13 }}>Buscando...</div>
              ) : results.length === 0 ? (
                <div style={{ padding: '14px 16px', color: '#94A3B8', fontSize: 13 }}>Sin resultados para "{search}"</div>
              ) : (
                results.slice(0, 6).map(c => {
                  const a = av(c.name);
                  return (
                    <button key={c.id} onClick={() => selectClient(c)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: 'none', background: 'none', cursor: 'pointer', borderBottom: '1px solid #F8FAFC', textAlign: 'left', fontFamily: 'inherit' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: a.bg, color: a.fg, fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{c.name[0]}</div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: '#94A3B8' }}>{[c.phone, c.email].filter(Boolean).join(' · ')}</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Botón nuevo cliente */}
          <button onClick={() => setShowNewForm(true)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: '1.5px dashed #CBD5E1', borderRadius: 12, background: 'none', cursor: 'pointer', color: '#475569', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', marginBottom: 4 }}>
            <Plus size={18} color="#2563EB" /> Crear cliente nuevo
          </button>
        </>
      )}

      {/* Formulario nuevo cliente */}
      {showNewForm && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>Nuevo cliente</span>
            <button onClick={() => { setShowNewForm(false); setForm(EMPTY_FORM); setConsent(false); }}
              style={{ border: 'none', background: 'none', color: '#64748B', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Obligatorios */}
            <Field label="Nombre completo *">
              <input autoFocus value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Juan Pérez / Empresa SAS" style={IS} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Teléfono *">
                <input type="tel" value={form.phone ?? ''} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  placeholder="310 000 0000" style={IS} />
              </Field>
              <Field label="Correo *">
                <input type="email" value={form.email ?? ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="nombre@correo.com" style={IS} />
              </Field>
            </div>

            {/* Opcionales */}
            <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 12 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Información adicional (opcional)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <Field label="Nit / Cédula">
                  <input value={form.document_number ?? ''} onChange={e => setForm(p => ({ ...p, document_number: e.target.value }))}
                    placeholder="Documento" style={IS} />
                </Field>
                <Field label="Ciudad">
                  <input value={form.city ?? ''} onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                    placeholder="Bogotá" style={IS} />
                </Field>
              </div>
              <Field label="Dirección">
                <input value={form.address ?? ''} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  placeholder="Calle 123 #45-67" style={IS} />
              </Field>
              <div style={{ marginTop: 10 }}>
                <Field label="Observaciones">
                  <textarea value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Notas internas sobre el cliente..." rows={2}
                    style={{ ...IS, height: 'auto', padding: '10px 12px', resize: 'none' }} />
                </Field>
              </div>
            </div>

            {/* Consentimiento HABEAS DATA */}
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: 12 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
                  style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, cursor: 'pointer', accentColor: '#2563EB' }} />
                <span style={{ fontSize: 12, color: '#92400E', lineHeight: 1.5 }}>
                  Al registrar este cliente declaro que cuento con la autorización necesaria para el tratamiento de sus datos personales.
                  Shelwi actúa únicamente como proveedor tecnológico y no es responsable por la gestión de datos realizada por sus usuarios.
                </span>
              </label>
            </div>

            <button onClick={handleCreateClient}
              disabled={!form.name.trim() || !form.phone?.trim() || !form.email?.trim() || !consent || saving}
              style={{ height: 48, border: 'none', background: (form.name.trim() && form.phone?.trim() && form.email?.trim() && consent) ? '#2563EB' : '#E2E8F0', color: (form.name.trim() && form.phone?.trim() && form.email?.trim() && consent) ? '#fff' : '#94A3B8', fontWeight: 700, fontSize: 15, borderRadius: 12, cursor: 'pointer' }}>
              {saving ? 'Guardando...' : 'Guardar cliente'}
            </button>
          </div>
        </div>
      )}

      {/* Proyecto (siempre visible) */}
      {!showNewForm && (
        <>
          <div style={{ marginTop: 20 }}>
            <label style={LS}>Nombre del proyecto <span style={{ color: '#94A3B8', fontWeight: 400 }}>(opcional)</span></label>
            <input value={data.projectName} onChange={e => onChange({ ...data, projectName: e.target.value })}
              placeholder="Ej: Remodelación sala comedor" style={{ ...IS, width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={LS}>Descripción <span style={{ color: '#94A3B8', fontWeight: 400 }}>(opcional)</span></label>
            <textarea value={data.description} onChange={e => onChange({ ...data, description: e.target.value })}
              placeholder="Notas sobre esta cotización..." rows={2}
              style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: 12, padding: '10px 12px', fontSize: 14, outline: 'none', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>

          <button onClick={onContinue} disabled={!canContinue} style={{ width: '100%', height: 52, marginTop: 20, border: 'none', background: canContinue ? '#2563EB' : '#E2E8F0', color: canContinue ? '#fff' : '#94A3B8', fontWeight: 700, fontSize: 16, borderRadius: 14, cursor: canContinue ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            Continuar <ChevronRight size={18} />
          </button>
        </>
      )}

      {/* Sheet duplicados */}
      {showDupSheet && (
        <>
          <div onClick={() => setShowDupSheet(false)} style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(15,23,42,.4)' }} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60, background: '#fff', borderRadius: '20px 20px 0 0', padding: '16px 16px 32px', boxShadow: '0 -8px 40px rgba(15,23,42,.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <div style={{ width: 36, height: 4, borderRadius: 99, background: '#E2E8F0' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <AlertCircle size={18} color="#F59E0B" />
              <span style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>Ya existe un cliente similar</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {duplicates.map(c => {
                const a = av(c.name);
                return (
                  <button key={c.id} onClick={() => { selectClient(c); setShowDupSheet(false); setShowNewForm(false); setForm(EMPTY_FORM); setConsent(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid #E2E8F0', borderRadius: 12, background: '#F8FAFC', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: a.bg, color: a.fg, fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.name[0]}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: '#94A3B8' }}>{[c.phone, c.email].filter(Boolean).join(' · ')}</div>
                    </div>
                    <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#2563EB' }}>Usar</span>
                  </button>
                );
              })}
            </div>
            <button onClick={async () => {
              setShowDupSheet(false);
              setSaving(true);
              try {
                const created = await createClient(workspace.id, user!.id, form);
                onChange({ ...data, clientId: created.id, clientName: created.name, clientEmail: created.email ?? undefined });
                setShowNewForm(false);
                setForm(EMPTY_FORM);
                setConsent(false);
              } finally { setSaving(false); }
            }} style={{ width: '100%', height: 46, border: '1.5px solid #E2E8F0', background: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600, color: '#475569', cursor: 'pointer', fontFamily: 'inherit' }}>
              Continuar creando de todas formas
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={LS}>{label}</label>
      {children}
    </div>
  );
}

const LS: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, color: '#0F172A', marginBottom: 6 };
const IS: React.CSSProperties = { width: '100%', height: 44, border: '1px solid #E2E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
