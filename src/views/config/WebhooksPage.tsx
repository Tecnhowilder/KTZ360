/**
 * WebhooksPage — /app/config/webhooks
 * Marketplace de integraciones: Zapier · Make · n8n · URL personalizada.
 * Mobile-first. Zero Trust.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, RotateCcw, Play, ChevronDown,
  CheckCircle, XCircle, Copy, Eye, EyeOff,
} from 'lucide-react';
import {
  useWebhookEndpoints, useRegisterWebhook, useUpdateWebhook,
  useDeleteWebhook, useRotateSecret, useTestWebhook,
  useWebhookDeliveries, useRedeliverWebhook,
} from '../../hooks/useWebhooks';
import { WEBHOOK_EVENTS, PROVIDER_LABELS, type WebhookEndpoint } from '../../services/webhooks';

// ─── Main ─────────────────────────────────────────────────────────────────────

export function WebhooksPage() {
  const navigate = useNavigate();
  const endpointsQ = useWebhookEndpoints();
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate('/app/config')} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><ArrowLeft size={20} /></button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#0F172A' }}>Webhooks & Marketplace</div>
            <div style={{ fontSize: 12, color: '#64748B' }}>Zapier · Make · n8n · URL personalizada</div>
          </div>
          <button onClick={() => setShowForm(true)}
            style={{ background: '#6366F1', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> Nuevo
          </button>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Guía rápida */}
        <div style={{ background: '#EEF2FF', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#4338CA', marginBottom: 6 }}>¿Cómo funciona?</div>
          <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6 }}>
            Cuando ocurre un evento en Shelwi (ej. cotización aprobada), se envía automáticamente un POST firmado a tu URL de Zapier, Make o n8n.
            El payload incluye firma HMAC-SHA256 para verificar que viene de Shelwi.
          </div>
        </div>

        {/* Proveedores */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {Object.entries(PROVIDER_LABELS).map(([key, p]) => (
            <div key={key} style={{ background: '#fff', borderRadius: 12, padding: '10px 8px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
              <div style={{ fontSize: 20 }}>{p.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginTop: 4 }}>{p.label}</div>
            </div>
          ))}
        </div>

        {/* Formulario nuevo endpoint */}
        {showForm && (
          <NewEndpointForm onClose={() => setShowForm(false)} onCreated={() => setShowForm(false)} />
        )}

        {/* Lista de endpoints */}
        {endpointsQ.isLoading && <div style={{ textAlign: 'center', color: '#94A3B8', padding: 24 }}>Cargando...</div>}
        {endpointsQ.data?.map(ep => (
          <EndpointCard
            key={ep.id}
            endpoint={ep}
            isSelected={selected === ep.id}
            onSelect={() => setSelected(selected === ep.id ? null : ep.id)}
          />
        ))}
        {endpointsQ.data?.length === 0 && !showForm && (
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🔗</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Sin webhooks configurados</div>
            <div style={{ fontSize: 13, color: '#64748B' }}>Conecta Shelwi con Zapier, Make, n8n o cualquier sistema.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── NewEndpointForm ──────────────────────────────────────────────────────────

function NewEndpointForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const register = useRegisterWebhook();
  const [form, setForm] = useState({ label: '', url: '', providerType: 'webhook', events: ['quote_approved'] as string[] });
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [secretVisible, setSecretVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  function toggleEvent(event: string) {
    setForm(f => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter(e => e !== event) : [...f.events, event],
    }));
  }

  async function handleSubmit() {
    if (!form.label || !form.url || form.events.length === 0) return;
    const result = await register.mutateAsync(form);
    setCreatedSecret(result.secret);
    onCreated();
  }

  function copySecret() {
    if (!createdSecret) return;
    navigator.clipboard.writeText(createdSecret).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  }

  if (createdSecret) {
    return (
      <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.08)', border: '2px solid #F59E0B' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>⚠️ Guarda tu secret ahora</div>
        <div style={{ fontSize: 13, color: '#64748B', marginBottom: 12 }}>
          Este secret no podrá mostrarse nuevamente. Cópialo y configúralo en tu receptor para verificar la firma HMAC.
        </div>
        <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 12px', fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all', marginBottom: 10 }}>
          {secretVisible ? createdSecret : createdSecret.slice(0, 12) + '••••••••••••••••••••••••'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setSecretVisible(v => !v)}
            style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13 }}>
            {secretVisible ? <EyeOff size={14} /> : <Eye size={14} />} {secretVisible ? 'Ocultar' : 'Ver'}
          </button>
          <button onClick={copySecret}
            style={{ flex: 2, padding: '9px 0', borderRadius: 10, border: 'none', background: copied ? '#F0FDF4' : '#6366F1', color: copied ? '#16A34A' : '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13 }}>
            <Copy size={14} /> {copied ? '¡Copiado!' : 'Copiar secret'}
          </button>
        </div>
        <button onClick={onClose}
          style={{ width: '100%', marginTop: 10, padding: '9px 0', borderRadius: 10, border: 'none', background: '#F1F5F9', color: '#374151', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
          Listo, guardé el secret
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 14 }}>Nuevo webhook</div>

      {/* Proveedor */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Plataforma</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginTop: 6 }}>
          {Object.entries(PROVIDER_LABELS).map(([key, p]) => (
            <button key={key} onClick={() => setForm(f => ({ ...f, providerType: key }))}
              style={{ padding: '9px 10px', borderRadius: 10, border: `2px solid ${form.providerType === key ? p.color : '#E2E8F0'}`, background: form.providerType === key ? p.color + '15' : '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: form.providerType === key ? p.color : '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{p.icon}</span>{p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Label + URL */}
      {[
        { key: 'label', label: 'Nombre del webhook', placeholder: 'Ej: Zapier CRM' },
        { key: 'url',   label: 'URL del endpoint (HTTPS)', placeholder: 'https://hooks.zapier.com/...' },
      ].map(f => (
        <div key={f.key} style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{f.label}</label>
          <input value={form[f.key as 'label' | 'url']} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
            placeholder={f.placeholder}
            style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, marginTop: 4, boxSizing: 'border-box' }} />
        </div>
      ))}

      {/* Eventos */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'block' }}>Eventos ({form.events.length} seleccionados)</label>
        {(['Cotizaciones','Pedidos','OTs','Clientes'] as const).map(group => (
          <div key={group} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700, marginBottom: 4 }}>{group}</div>
            {WEBHOOK_EVENTS.filter(e => e.group === group).map(ev => (
              <label key={ev.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.events.includes(ev.value)} onChange={() => toggleEvent(ev.value)} />
                <span style={{ fontSize: 13 }}>{ev.icon} {ev.label}</span>
              </label>
            ))}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSubmit} disabled={register.isPending || !form.label || !form.url || form.events.length === 0}
          style={{ flex: 2, padding: '10px 0', borderRadius: 10, border: 'none', background: '#6366F1', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          {register.isPending ? 'Creando...' : 'Crear webhook'}
        </button>
        <button onClick={onClose}
          style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: '#F1F5F9', color: '#374151', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── EndpointCard ─────────────────────────────────────────────────────────────

function EndpointCard({ endpoint: ep, isSelected, onSelect }: {
  endpoint: WebhookEndpoint; isSelected: boolean; onSelect: () => void;
}) {
  const updateMut  = useUpdateWebhook();
  const deleteMut  = useDeleteWebhook();
  const rotateMut  = useRotateSecret();
  const testMut    = useTestWebhook();
  const deliveriesQ = useWebhookDeliveries(isSelected ? ep.id : undefined);
  const redeliverMut = useRedeliverWebhook();
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const prov = PROVIDER_LABELS[ep.provider_type];
  const statusColor = ep.disabled_at ? '#DC2626' : ep.is_active ? '#16A34A' : '#94A3B8';
  const statusLabel = ep.disabled_at ? 'Deshabilitado' : ep.is_active ? 'Activo' : 'Inactivo';

  async function handleRotate() {
    const r = await rotateMut.mutateAsync(ep.id);
    setNewSecret(r.secret);
  }

  return (
    <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.06)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 22 }}>{prov.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{ep.label}</div>
          <div style={{ fontSize: 11, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{ep.url}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
          <span style={{ fontSize: 11, color: statusColor, fontWeight: 700 }}>{statusLabel}</span>
        </div>
        <button onClick={onSelect} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8' }}>
          <ChevronDown size={16} style={{ transform: isSelected ? 'rotate(180deg)' : 'none', transition: '.2s' }} />
        </button>
      </div>

      {/* Stats rápidas */}
      <div style={{ padding: '0 16px 12px', display: 'flex', gap: 16 }}>
        <div style={{ fontSize: 11, color: '#64748B' }}>{ep.events.length} evento{ep.events.length !== 1 ? 's' : ''}</div>
        <div style={{ fontSize: 11, color: '#64748B' }}>{ep.deliveries_last_24h} entregas (24h)</div>
        {ep.success_rate_7d !== null && (
          <div style={{ fontSize: 11, color: ep.success_rate_7d >= 90 ? '#16A34A' : '#D97706', fontWeight: 700 }}>{ep.success_rate_7d}% éxito (7d)</div>
        )}
        {ep.consecutive_failures > 0 && (
          <div style={{ fontSize: 11, color: '#DC2626', fontWeight: 700 }}>{ep.consecutive_failures} fallos consecutivos</div>
        )}
      </div>

      {/* Panel expandido */}
      {isSelected && (
        <div style={{ borderTop: '1px solid #F1F5F9', padding: 16 }}>
          {/* Alerta de deshabilitado */}
          {ep.disabled_at && (
            <div style={{ background: '#FEF2F2', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#DC2626', fontWeight: 700 }}>⚠️ Endpoint deshabilitado automáticamente</div>
              <div style={{ fontSize: 11, color: '#7F1D1D' }}>{ep.disabled_reason}</div>
              <button onClick={() => updateMut.mutate({ id: ep.id, updates: { is_active: true } })}
                style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                Reactivar endpoint
              </button>
            </div>
          )}

          {/* Nuevo secret tras rotación */}
          {newSecret && (
            <div style={{ background: '#FFF7ED', borderRadius: 10, padding: '10px 12px', marginBottom: 12, border: '1px solid #FCD34D' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>Nuevo secret — guárdalo ahora</div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', color: '#374151', marginBottom: 8 }}>{newSecret}</div>
              <button onClick={() => { navigator.clipboard.writeText(newSecret); setNewSecret(null); }}
                style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: '#D97706', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                Copiar y cerrar
              </button>
            </div>
          )}

          {/* Eventos activos */}
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Eventos suscritos</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {ep.events.map(ev => {
              const meta = WEBHOOK_EVENTS.find(e => e.value === ev);
              return (
                <span key={ev} style={{ background: '#EEF2FF', color: '#4338CA', borderRadius: 99, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>
                  {meta?.icon} {meta?.label ?? ev}
                </span>
              );
            })}
          </div>

          {/* Acciones */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { icon: <Play size={14} />,       label: 'Probar',  fn: () => testMut.mutate(ep.id),   color: '#16A34A' },
              { icon: <RotateCcw size={14} />,  label: 'Rotar',   fn: handleRotate,                  color: '#D97706' },
              { icon: ep.is_active ? <XCircle size={14} /> : <CheckCircle size={14} />,
                label: ep.is_active ? 'Pausar' : 'Activar',
                fn: () => updateMut.mutate({ id: ep.id, updates: { is_active: !ep.is_active } }),
                color: ep.is_active ? '#64748B' : '#16A34A' },
              { icon: <Trash2 size={14} />,     label: 'Eliminar',fn: () => deleteMut.mutate(ep.id), color: '#DC2626' },
            ].map((a, i) => (
              <button key={i} onClick={a.fn}
                style={{ padding: '8px 0', borderRadius: 9, border: 'none', background: a.color + '15', color: a.color, fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                {a.icon}{a.label}
              </button>
            ))}
          </div>

          {/* Historial de entregas */}
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Últimas entregas</div>
          {deliveriesQ.isLoading && <div style={{ fontSize: 12, color: '#94A3B8' }}>Cargando...</div>}
          {deliveriesQ.data?.slice(0, 8).map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #F8FAFC' }}>
              <span style={{ fontSize: 14 }}>
                {d.status === 'delivered' ? '✅' : d.status === 'failed' ? '❌' : d.status === 'retrying' ? '🔄' : '⏳'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                  {WEBHOOK_EVENTS.find(e => e.value === d.event_type)?.label ?? d.event_type}
                </div>
                <div style={{ fontSize: 10, color: '#94A3B8' }}>
                  HTTP {d.response_status ?? '—'} · {d.duration_ms ?? '—'}ms · {d.attempt}/{d.max_attempts}
                </div>
              </div>
              <div style={{ fontSize: 10, color: '#94A3B8' }}>{new Date(d.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</div>
              {d.status === 'failed' && (
                <button onClick={() => redeliverMut.mutate(d.id)}
                  style={{ fontSize: 10, padding: '3px 7px', borderRadius: 6, border: 'none', background: '#EEF2FF', color: '#4338CA', cursor: 'pointer', fontWeight: 700 }}>
                  Reintentar
                </button>
              )}
            </div>
          ))}
          {deliveriesQ.data?.length === 0 && <div style={{ fontSize: 12, color: '#94A3B8' }}>Sin entregas aún.</div>}
        </div>
      )}
    </div>
  );
}
