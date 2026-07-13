import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listEmailTemplates, upsertEmailTemplate, toggleEmailTemplate,
  getEmailTemplateVersions, rollbackEmailTemplate,
  type EmailTemplateRow, type EmailTemplateVersion,
} from '../../services/admin';
import { useToast } from '../ui/Toast';

// ─── Estilos ──────────────────────────────────────────────────────────────────

const card:   React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 18 };
const inp:    React.CSSProperties = { border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '8px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' };
const btn:    React.CSSProperties = { border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: '#2563EB', color: '#fff' };
const btnSm:  React.CSSProperties = { ...btn, padding: '4px 10px', fontSize: 11 };
const label:  React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 };

// ─── Utilidades ───────────────────────────────────────────────────────────────

// Extrae {{variables}} del texto del template
function extractVars(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\{\{(\w+)\}\}/g)) found.add(m[1]);
  return Array.from(found);
}

// Genera preview HTML sustituyendo {{var}} por valores de muestra
function renderPreview(subject: string, bodyHtml: string, vars: string[]): { subject: string; html: string } {
  const sampleValues: Record<string, string> = {
    appName: 'Shelwi', inviterName: 'Ana García', workspaceName: 'Mi Empresa',
    role: 'Administrador', inviteLink: 'https://shelwi.co/invite/DEMO',
    verifyLink: 'https://shelwi.co/verificar/DEMO', resetLink: 'https://shelwi.co/restablecer/DEMO',
    dashboardLink: 'https://shelwi.co/app/dashboard', billingLink: 'https://shelwi.co/app/planes',
    fullName: 'Carlos López', planName: 'PRO', amount: '$149.000 COP',
    periodEnd: '01 Ago 2026',
  };
  const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => sampleValues[k] ?? `[${k}]`);
  // Ensure all declared vars have at least a placeholder sample
  vars.forEach(v => { if (!sampleValues[v]) sampleValues[v] = `[${v}]`; });
  return { subject: fill(subject), html: fill(bodyHtml) };
}

// ─── Panel Editor ─────────────────────────────────────────────────────────────

type PanelTab = 'editor' | 'preview' | 'history';

interface EditorPanelProps {
  template: EmailTemplateRow;
  canEdit: boolean;
  onClose: () => void;
}

function EditorPanel({ template, canEdit, onClose }: EditorPanelProps) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [tab, setTab]           = useState<PanelTab>('editor');
  const [subject, setSubject]   = useState(template.subject);
  const [bodyHtml, setBodyHtml] = useState(template.body_html);
  const [note, setNote]         = useState('');
  const [isDirty, setIsDirty]   = useState(false);

  const detectedVars = useMemo(() => extractVars(subject + ' ' + bodyHtml), [subject, bodyHtml]);
  const preview      = useMemo(() => renderPreview(subject, bodyHtml, detectedVars), [subject, bodyHtml, detectedVars]);

  const versionsQ = useQuery({
    queryKey: ['emailTemplateVersions', template.key],
    queryFn:  () => getEmailTemplateVersions(template.key),
    enabled:  tab === 'history',
  });

  const saveMut = useMutation({
    mutationFn: () => upsertEmailTemplate({
      key:       template.key,
      name:      template.name,
      description: template.description,
      subject,
      body_html: bodyHtml,
      variables: detectedVars,
      locale:    template.locale,
      note:      note.trim() || null,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['adminEmailTemplates'] });
      qc.invalidateQueries({ queryKey: ['emailTemplateVersions', template.key] });
      showToast(`Guardado — versión ${res.version}`);
      setIsDirty(false);
      setNote('');
    },
    onError: (e: Error) => showToast(e.message),
  });

  const rollbackMut = useMutation({
    mutationFn: (version: number) => rollbackEmailTemplate(template.key, version),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminEmailTemplates'] });
      qc.invalidateQueries({ queryKey: ['emailTemplateVersions', template.key] });
      showToast('Rollback aplicado');
      onClose();
    },
    onError: (e: Error) => showToast(e.message),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A' }}>{template.name}</div>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
            key: <code style={{ background: '#F1F5F9', borderRadius: 4, padding: '1px 5px' }}>{template.key}</code>
            {' · '}v{template.version}{' · '}
            <span style={{ color: template.is_active ? '#16A34A' : '#94A3B8', fontWeight: 700 }}>
              {template.is_active ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>
        <button onClick={onClose} style={{ ...btnSm, background: '#F1F5F9', color: '#374151' }}>✕ Cerrar</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #E2E8F0', paddingBottom: 0 }}>
        {(['editor','preview','history'] as PanelTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ ...btnSm, borderRadius: '8px 8px 0 0', background: tab === t ? '#EFF6FF' : 'transparent',
              color: tab === t ? '#2563EB' : '#64748B', borderBottom: tab === t ? '2px solid #2563EB' : 'none' }}>
            {{ editor: '✏️ Editor', preview: '👁 Preview', history: '🕐 Historial' }[t]}
          </button>
        ))}
      </div>

      {/* ── Tab Editor ── */}
      {tab === 'editor' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={label}>Asunto</label>
            <input value={subject} onChange={e => { setSubject(e.target.value); setIsDirty(true); }}
              style={inp} placeholder="Asunto del correo. Usa {{variable}}" disabled={!canEdit} />
          </div>
          <div>
            <label style={label}>HTML del correo</label>
            <textarea value={bodyHtml} onChange={e => { setBodyHtml(e.target.value); setIsDirty(true); }}
              rows={18} style={{ ...inp, fontFamily: 'monospace', fontSize: 11, resize: 'vertical' as const }}
              placeholder="HTML completo del correo. Usa {{variable}} para interpolación."
              disabled={!canEdit} />
          </div>

          {/* Variables detectadas */}
          <div>
            <label style={label}>Variables detectadas</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {detectedVars.length === 0
                ? <span style={{ fontSize: 12, color: '#94A3B8' }}>Ninguna — usa {'{{variable}}'} en el texto</span>
                : detectedVars.map(v => (
                    <span key={v} style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8,
                      background: '#EFF6FF', color: '#2563EB', fontFamily: 'monospace' }}>
                      {`{{${v}}}`}
                    </span>
                  ))}
            </div>
          </div>

          {/* Nota del cambio */}
          {canEdit && (
            <div>
              <label style={label}>Nota del cambio (opcional)</label>
              <input value={note} onChange={e => setNote(e.target.value)}
                style={inp} placeholder="Describe qué cambiaste para el historial de versiones…" />
            </div>
          )}

          {canEdit && (
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !isDirty}
                style={{ ...btn, opacity: (saveMut.isPending || !isDirty) ? .5 : 1 }}>
                {saveMut.isPending ? 'Guardando…' : '💾 Guardar nueva versión'}
              </button>
              {isDirty && (
                <button onClick={() => { setSubject(template.subject); setBodyHtml(template.body_html); setIsDirty(false); }}
                  style={{ ...btn, background: '#F1F5F9', color: '#374151' }}>
                  Descartar cambios
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab Preview ── */}
      {tab === 'preview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ ...card, background: '#F8FAFC' }}>
            <label style={label}>Asunto renderizado</label>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', marginTop: 4 }}>{preview.subject}</div>
          </div>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ background: '#F8FAFC', padding: '8px 12px', fontSize: 11, color: '#64748B',
              borderBottom: '1px solid #E2E8F0' }}>
              Vista previa del correo (valores de muestra)
            </div>
            <iframe
              srcDoc={preview.html}
              title="Email preview"
              style={{ width: '100%', height: 500, border: 'none', display: 'block' }}
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      )}

      {/* ── Tab Historial ── */}
      {tab === 'history' && (
        <div>
          {versionsQ.isLoading && <div style={{ fontSize: 13, color: '#94A3B8' }}>Cargando historial…</div>}
          {versionsQ.data?.length === 0 && (
            <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '20px 0' }}>
              No hay versiones anteriores. Aparecerán aquí cada vez que guardes cambios.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(versionsQ.data ?? []).map(v => (
              <VersionRow key={v.id} version={v} canEdit={canEdit}
                onRollback={() => rollbackMut.mutate(v.version)}
                rolling={rollbackMut.isPending} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VersionRow({ version: v, canEdit, onRollback, rolling }: {
  version: EmailTemplateVersion;
  canEdit: boolean;
  onRollback: () => void;
  rolling: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', background: '#F8FAFC', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 800, padding: '2px 8px', borderRadius: 8,
            background: '#E0E7FF', color: '#3730A3' }}>v{v.version}</span>
          <span style={{ fontSize: 12, color: '#64748B' }}>
            {new Date(v.saved_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
          {v.note && <span style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>— {v.note}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setExpanded(x => !x)}
            style={{ ...btnSm, background: '#F1F5F9', color: '#374151' }}>
            {expanded ? 'Ocultar' : 'Ver'}
          </button>
          {canEdit && (
            <button onClick={onRollback} disabled={rolling}
              style={{ ...btnSm, background: rolling ? '#F1F5F9' : '#FEF3C7', color: '#D97706',
                opacity: rolling ? .5 : 1 }}>
              {rolling ? '…' : '↺ Restaurar'}
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '10px 14px', borderTop: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Asunto:</div>
          <div style={{ fontSize: 12, color: '#0F172A', marginBottom: 10 }}>{v.subject}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>HTML (primeros 500 chars):</div>
          <pre style={{ fontSize: 10, color: '#64748B', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            background: '#F8FAFC', padding: 8, borderRadius: 8, maxHeight: 200, overflow: 'auto', margin: 0 }}>
            {v.body_html.slice(0, 500)}{v.body_html.length > 500 ? '…' : ''}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── EmailTemplatesTab ────────────────────────────────────────────────────────

export function EmailTemplatesTab({ canEdit }: { canEdit: boolean }) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch]           = useState('');

  const templatesQ = useQuery({
    queryKey: ['adminEmailTemplates'],
    queryFn:  listEmailTemplates,
  });

  const toggleMut = useMutation({
    mutationFn: ({ key, active }: { key: string; active: boolean }) => toggleEmailTemplate(key, active),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['adminEmailTemplates'] }); showToast('Estado actualizado'); },
    onError: (e: Error) => showToast(e.message),
  });

  const templates = templatesQ.data ?? [];
  const filtered  = templates.filter(t =>
    !search.trim() ||
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.key.toLowerCase().includes(search.toLowerCase())
  );

  const selected = selectedKey ? templates.find(t => t.key === selectedKey) : null;

  if (templatesQ.isLoading) return <div style={{ fontSize: 13, color: '#94A3B8' }}>Cargando templates…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Templates de correo</div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
            {templates.length} templates · {templates.filter(t => t.is_active).length} activos
          </div>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar template…"
          style={{ ...inp, width: 220 }} />
      </div>

      {/* Lista de templates */}
      {!selected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(t => (
            <div key={t.key} style={{ ...card, padding: '14px 18px',
              border: `1.5px solid ${t.is_active ? '#E2E8F0' : '#F1F5F9'}`,
              opacity: t.is_active ? 1 : .7 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{t.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8,
                      color: t.is_active ? '#16A34A' : '#94A3B8',
                      background: t.is_active ? '#F0FDF4' : '#F1F5F9' }}>
                      {t.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8,
                      background: '#E0E7FF', color: '#3730A3', fontWeight: 700 }}>v{t.version}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>
                    <code style={{ background: '#F1F5F9', borderRadius: 4, padding: '1px 5px' }}>{t.key}</code>
                    {t.description && <span style={{ marginLeft: 8 }}>{t.description}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 4, fontStyle: 'italic' }}>
                    {t.subject}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => setSelectedKey(t.key)}
                    style={{ ...btnSm, background: '#EFF6FF', color: '#2563EB' }}>
                    ✏️ Editar
                  </button>
                  {canEdit && (
                    <button
                      onClick={() => toggleMut.mutate({ key: t.key, active: !t.is_active })}
                      disabled={toggleMut.isPending}
                      style={{ ...btnSm,
                        background: t.is_active ? '#FEE2E2' : '#F0FDF4',
                        color: t.is_active ? '#DC2626' : '#16A34A' }}>
                      {t.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                  )}
                </div>
              </div>

              {/* Variables */}
              {t.variables.length > 0 && (
                <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                  {t.variables.map(v => (
                    <span key={v} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6,
                      background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0',
                      fontFamily: 'monospace' }}>{`{{${v}}}`}</span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', color: '#94A3B8', fontSize: 13, padding: '32px 0' }}>
              Sin resultados para «{search}»
            </div>
          )}
        </div>
      )}

      {/* Panel de edición */}
      {selected && (
        <div style={card}>
          <EditorPanel
            template={selected}
            canEdit={canEdit}
            onClose={() => setSelectedKey(null)}
          />
        </div>
      )}
    </div>
  );
}
