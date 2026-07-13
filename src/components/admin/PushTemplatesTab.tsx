/**
 * PushTemplatesTab — Gestor de plantillas de push notifications (Sprint Final)
 *
 * Permite al Super Admin crear/editar plantillas de push sin deploy.
 * Soporta variables {{var}} sustituibles en el momento de envío.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import type { PushNotificationTemplateRow } from '../../lib/database.types';
import { useToast } from '../ui/Toast';
import { BRAND_COLORS } from '../../lib/brand';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (supabase as any).rpc.bind(supabase as any);

// ─── Estilos ──────────────────────────────────────────────────────────────────

const cardStyle:  React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 20 };
const inputStyle: React.CSSProperties = { border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '8px 10px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#64748B', display: 'block', marginBottom: 4, letterSpacing: '.04em', textTransform: 'uppercase' };
const btnPrimary: React.CSSProperties = { border: 'none', background: BRAND_COLORS.primary, color: '#fff', fontWeight: 700, fontSize: 12.5, padding: '8px 16px', borderRadius: 9, cursor: 'pointer' };
const btnGhost:   React.CSSProperties = { ...btnPrimary, background: 'transparent', color: '#64748B', border: '1.5px solid #E2E8F0' };
const thStyle:    React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 800, color: '#94A3B8', letterSpacing: '.5px', borderBottom: '1px solid #EEF2F7', textAlign: 'left', whiteSpace: 'nowrap' };
const tdStyle:    React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle', fontSize: 12.5 };

// ─── Servicio local ───────────────────────────────────────────────────────────

async function listPushTemplates(): Promise<PushNotificationTemplateRow[]> {
  const { data, error } = await supabase
    .from('push_notification_templates')
    .select('*')
    .order('key');
  if (error) throw error;
  return data ?? [];
}

async function upsertPushTemplate(t: Partial<PushNotificationTemplateRow> & { key: string }): Promise<void> {
  const vars = t.variables ?? [];
  const { data, error } = await rpc('admin_upsert_push_template', {
    p_key:         t.key,
    p_name:        t.name ?? '',
    p_description: t.description ?? null,
    p_title:       t.title ?? '',
    p_body:        t.body ?? '',
    p_deep_link:   t.deep_link ?? null,
    p_image_url:   t.image_url ?? null,
    p_variables:   vars,
    p_priority:    t.priority ?? 'normal',
    p_active:      t.active ?? true,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'Error al guardar');
}

async function toggleTemplate(key: string, active: boolean): Promise<void> {
  const { data, error } = await rpc('admin_toggle_push_template', { p_key: key, p_active: active });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'Error');
}

// ─── Toggle visual ────────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer', flexShrink: 0 }}>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{ position: 'absolute', inset: 0, borderRadius: 999, background: value ? '#10B981' : '#E2E8F0', transition: '.2s' }} />
      <span style={{ position: 'absolute', top: 3, left: value ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: '.2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
    </label>
  );
}

// ─── Preview de push ──────────────────────────────────────────────────────────

function PushPreview({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ background: '#1E293B', borderRadius: 16, padding: '12px 14px', maxWidth: 320 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 28, height: 28, background: BRAND_COLORS.primary, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>S</div>
        <span style={{ color: '#94A3B8', fontSize: 11 }}>Shelwi · ahora</span>
      </div>
      <div style={{ color: '#F8FAFC', fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>
        {title || '(título)'}
      </div>
      <div style={{ color: '#CBD5E1', fontSize: 12.5 }}>
        {body || '(cuerpo)'}
      </div>
    </div>
  );
}

// ─── Form modal ───────────────────────────────────────────────────────────────

type FormState = {
  key: string; name: string; description: string;
  title: string; body: string; deep_link: string; image_url: string;
  variables: string; priority: 'normal' | 'high'; active: boolean;
};

const EMPTY: FormState = {
  key: '', name: '', description: '', title: '', body: '',
  deep_link: '', image_url: '', variables: '', priority: 'normal', active: true,
};

function TemplateFormModal({
  initial, isNew, onSave, onClose, saving,
}: {
  initial: FormState;
  isNew: boolean;
  onSave: (f: FormState) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof FormState, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 28, width: '100%', maxWidth: 700, maxHeight: '92vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 20, color: '#0F172A' }}>
          {isNew ? 'Nueva Plantilla Push' : `Editar: ${form.key}`}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 26 }}>
          {/* Columna izquierda: datos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>Key (único)</label>
              <input style={{ ...inputStyle, fontFamily: 'monospace' }} value={form.key} disabled={!isNew}
                onChange={e => set('key', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="order_created" />
            </div>
            <div>
              <label style={labelStyle}>Nombre</label>
              <input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nuevo Pedido" />
            </div>
            <div>
              <label style={labelStyle}>Descripción</label>
              <input style={inputStyle} value={form.description} onChange={e => set('description', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Título (soporta {`{{var}}`})</label>
              <input style={inputStyle} value={form.title} onChange={e => set('title', e.target.value)}
                placeholder="🛒 Nuevo pedido de {{client_name}}" />
            </div>
            <div>
              <label style={labelStyle}>Cuerpo (soporta {`{{var}}`})</label>
              <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                value={form.body} onChange={e => set('body', e.target.value)}
                placeholder="Pedido por {{amount}} — toca para ver detalles" />
            </div>
            <div>
              <label style={labelStyle}>Deep Link (opcional)</label>
              <input style={inputStyle} value={form.deep_link} onChange={e => set('deep_link', e.target.value)}
                placeholder="/app/pedidos/{{entity_id}}" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Variables declaradas</label>
                <input style={inputStyle} value={form.variables} onChange={e => set('variables', e.target.value)}
                  placeholder="client_name, amount" />
                <span style={{ fontSize: 10.5, color: '#94A3B8' }}>coma separadas</span>
              </div>
              <div>
                <label style={labelStyle}>Prioridad</label>
                <select style={inputStyle} value={form.priority} onChange={e => set('priority', e.target.value as 'normal' | 'high')}>
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Toggle value={form.active} onChange={v => set('active', v)} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{form.active ? 'Activa' : 'Inactiva'}</span>
            </div>
          </div>

          {/* Columna derecha: preview */}
          <div>
            <label style={{ ...labelStyle, marginBottom: 10 }}>Vista previa</label>
            <PushPreview title={form.title} body={form.body} />
            <div style={{ marginTop: 16, background: '#F8FAFC', borderRadius: 10, padding: 12, fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Variables disponibles</div>
              {form.variables ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {form.variables.split(',').map(v => v.trim()).filter(Boolean).map(v => (
                    <code key={v} style={{ background: '#EEF2F7', borderRadius: 5, padding: '2px 7px', color: '#334155' }}>{`{{${v}}}`}</code>
                  ))}
                </div>
              ) : (
                <span style={{ color: '#94A3B8' }}>Sin variables declaradas</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
          <button style={btnGhost} onClick={onClose}>Cancelar</button>
          <button style={btnPrimary} onClick={() => onSave(form)} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar Plantilla'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function PushTemplatesTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [editItem, setEditItem] = useState<{ form: FormState; isNew: boolean } | null>(null);

  const tplsQ = useQuery({ queryKey: ['adminPushTemplates'], queryFn: listPushTemplates });

  const upsertMut = useMutation({
    mutationFn: (f: FormState) => upsertPushTemplate({
      ...f,
      variables: f.variables.split(',').map(v => v.trim()).filter(Boolean),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['adminPushTemplates'] }); setEditItem(null); showToast('Plantilla guardada ✓'); },
    onError: (e: Error) => showToast(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: ({ key, active }: { key: string; active: boolean }) => toggleTemplate(key, active),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['adminPushTemplates'] }); showToast('Plantilla actualizada'); },
    onError: (e: Error) => showToast(e.message),
  });

  const templates = tplsQ.data ?? [];

  const openCreate = () => setEditItem({ form: { ...EMPTY }, isNew: true });
  const openEdit = (t: PushNotificationTemplateRow) => setEditItem({
    isNew: false,
    form: {
      key: t.key, name: t.name, description: t.description ?? '',
      title: t.title, body: t.body, deep_link: t.deep_link ?? '',
      image_url: t.image_url ?? '', variables: (t.variables ?? []).join(', '),
      priority: t.priority, active: t.active,
    },
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 2 }}>Push Notification Templates</h2>
          <p style={{ fontSize: 12.5, color: '#64748B' }}>Gestiona el contenido de las notificaciones push desde el backoffice. Soporta variables dinámicas.</p>
        </div>
        {canEdit && <button style={btnPrimary} onClick={openCreate}>+ Nueva Plantilla</button>}
      </div>

      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        {tplsQ.isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Cargando plantillas…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>KEY</th>
                <th style={thStyle}>NOMBRE</th>
                <th style={thStyle}>TÍTULO</th>
                <th style={thStyle}>VARIABLES</th>
                <th style={thStyle}>PRIOR.</th>
                <th style={thStyle}>ACTIVA</th>
                {canEdit && <th style={thStyle}>ACCIONES</th>}
              </tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.key} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={tdStyle}><code style={{ fontSize: 11.5, background: '#F8FAFC', padding: '2px 6px', borderRadius: 4, color: '#334155' }}>{t.key}</code></td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                    {t.description && <div style={{ fontSize: 11, color: '#94A3B8' }}>{t.description}</div>}
                  </td>
                  <td style={tdStyle}><span style={{ fontSize: 12.5, color: '#475569' }}>{t.title.length > 40 ? t.title.slice(0, 40) + '…' : t.title}</span></td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(t.variables ?? []).map(v => (
                        <code key={v} style={{ background: '#EEF2F7', borderRadius: 4, fontSize: 10, padding: '1px 5px', color: '#334155' }}>{`{{${v}}}`}</code>
                      ))}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      background: t.priority === 'high' ? '#FEF3C7' : '#F1F5F9',
                      color: t.priority === 'high' ? '#92400E' : '#64748B',
                      borderRadius: 5, fontSize: 10.5, fontWeight: 700, padding: '2px 8px',
                    }}>{t.priority}</span>
                  </td>
                  <td style={tdStyle}>
                    {canEdit ? (
                      <Toggle value={t.active} onChange={v => toggleMut.mutate({ key: t.key, active: v })} />
                    ) : (
                      <span style={{ background: t.active ? '#DCFCE7' : '#FEE2E2', color: t.active ? '#166534' : '#991B1B', borderRadius: 6, fontSize: 11, fontWeight: 700, padding: '2px 8px' }}>
                        {t.active ? 'ON' : 'OFF'}
                      </span>
                    )}
                  </td>
                  {canEdit && (
                    <td style={tdStyle}>
                      <button style={{ ...btnGhost, padding: '5px 10px', fontSize: 11 }} onClick={() => openEdit(t)}>Editar</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editItem && (
        <TemplateFormModal
          initial={editItem.form}
          isNew={editItem.isNew}
          onSave={f => upsertMut.mutate(f)}
          onClose={() => setEditItem(null)}
          saving={upsertMut.isPending}
        />
      )}
    </div>
  );
}
