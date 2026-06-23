/**
 * IntegracionesPage — Configuración de Integraciones Sprint 11
 * Mobile-first. Muestra estado de cada integración y permite conectar/desconectar.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, CheckCircle, AlertCircle, Clock,
  XCircle, ChevronRight, Plug, MessageSquare,
} from 'lucide-react';
import { useIntegrations, useInitiateOAuth, useDisconnectIntegration,
  useConfigureWhatsApp, useTriggerWorker, useConnectAlegra,
  useUpdateAutoSync } from '../../hooks/useIntegrations';
import { useToast } from '../../components/ui/Toast';
import { PROVIDER_META, type IntegrationProvider } from '../../services/integrations';
import { WHATSAPP_EVENT_LABELS, type WhatsAppEventType } from '../../services/whatsapp';
import type { Integration } from '../../services/integrations';

// ─── Status badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config = {
    connected:    { icon: CheckCircle, color: '#16A34A', bg: '#F0FDF4', label: 'Conectado' },
    disconnected: { icon: XCircle,     color: '#64748B', bg: '#F8FAFC', label: 'Desconectado' },
    pending:      { icon: Clock,       color: '#D97706', bg: '#FFFBEB', label: 'Conectando...' },
    error:        { icon: AlertCircle, color: '#DC2626', bg: '#FEF2F2', label: 'Error' },
  }[status] ?? { icon: XCircle, color: '#64748B', bg: '#F8FAFC', label: status };

  const Icon = config.icon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: config.color, background: config.bg, padding: '4px 10px', borderRadius: 99 }}>
      <Icon size={12} />
      {config.label}
    </span>
  );
}

// ─── WhatsApp config sheet ────────────────────────────────────────────────────

function WhatsAppConfigSheet({
  integration, onClose,
}: { integration: Integration | undefined; onClose: () => void }) {
  const configMut = useConfigureWhatsApp();
  const disconnectMut = useDisconnectIntegration();

  const currentConfig = (integration?.config ?? {}) as Record<string, unknown>;
  const currentTemplates = (currentConfig.templates ?? {}) as Record<string, boolean>;

  const [templates, setTemplates] = useState<Partial<Record<WhatsAppEventType, boolean>>>({
    quote_sent:           currentTemplates.quote_sent           ?? true,
    followup:             currentTemplates.followup             ?? true,
    order_created:        currentTemplates.order_created        ?? false,
    work_order_scheduled: currentTemplates.work_order_scheduled ?? false,
    work_order_completed: currentTemplates.work_order_completed ?? false,
    review_request:       currentTemplates.review_request       ?? false,
  });

  async function handleSave() {
    await configMut.mutateAsync({ templates });
    onClose();
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,.4)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 65,
        background: '#fff', borderRadius: '20px 20px 0 0',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
        boxShadow: '0 -8px 40px rgba(15,23,42,.15)',
        maxHeight: '85dvh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#E2E8F0' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 14px', borderBottom: '1px solid #F1F5F9' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>💬 WhatsApp</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 1 }}>Configurar mensajes automáticos</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: '#64748B' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 12, textTransform: 'uppercase', letterSpacing: .4 }}>
            Mensajes automáticos
          </div>
          {(Object.keys(WHATSAPP_EVENT_LABELS) as WhatsAppEventType[]).map(evt => (
            <div key={evt} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '13px 0', borderBottom: '1px solid #F1F5F9',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>{WHATSAPP_EVENT_LABELS[evt]}</div>
                <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 2 }}>
                  {evt === 'quote_sent' ? 'Al enviar una cotización' :
                   evt === 'followup' ? 'Seguimiento comercial manual' :
                   evt === 'order_created' ? 'Al crear un pedido' :
                   evt === 'work_order_scheduled' ? 'Al programar una OT' :
                   evt === 'work_order_completed' ? 'Al finalizar una OT' :
                   'Solicitar reseña del cliente'}
                </div>
              </div>
              <button
                onClick={() => setTemplates(prev => ({ ...prev, [evt]: !prev[evt] }))}
                style={{
                  width: 44, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer',
                  background: templates[evt] ? '#16A34A' : '#E2E8F0',
                  position: 'relative', transition: 'background .15s',
                }}
              >
                <span style={{
                  position: 'absolute', top: 2, left: templates[evt] ? 22 : 2,
                  width: 20, height: 20, borderRadius: '50%', background: '#fff',
                  transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                }} />
              </button>
            </div>
          ))}

          {integration?.status === 'connected' && (
            <button
              onClick={() => { disconnectMut.mutate('whatsapp'); onClose(); }}
              style={{ width: '100%', marginTop: 20, padding: '12px 0', borderRadius: 12, border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
            >
              Desactivar WhatsApp
            </button>
          )}
        </div>

        <div style={{ padding: '0 20px' }}>
          <button
            onClick={handleSave}
            disabled={configMut.isPending}
            style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: '#16A34A', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
          >
            {configMut.isPending ? 'Guardando...' : 'Guardar configuración'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Sheet de configuración de sincronización (Drive/OneDrive/Teams) ─────────

function SyncConfigSheet({
  provider, integration, onClose, onAutoSync, onDisconnect,
}: {
  provider: string;
  integration?: Integration;
  onClose: () => void;
  onAutoSync: (v: boolean) => void;
  onDisconnect: () => void;
}) {
  const meta     = PROVIDER_META[provider];
  const curSync  = (integration?.config as Record<string, boolean>)?.auto_sync ?? false;
  const isStorage = ['drive', 'onedrive'].includes(provider);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,.4)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 65,
        background: '#fff', borderRadius: '20px 20px 0 0',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
        boxShadow: '0 -8px 40px rgba(15,23,42,.15)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: '#E2E8F0' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px 14px', borderBottom: '1px solid #F1F5F9' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>{meta?.icon} {meta?.label}</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 1 }}>Configuración de integración</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20 }}>✕</button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          {/* Estado */}
          <div style={{ background: '#F0FDF4', borderRadius: 12, padding: '12px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E' }} />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#166534' }}>Conectado</span>
            {integration?.connected_at && (
              <span style={{ fontSize: 12, color: '#94A3B8', marginLeft: 'auto' }}>
                {new Date(integration.connected_at).toLocaleDateString('es-CO')}
              </span>
            )}
          </div>

          {/* Toggle auto_sync — solo Drive y OneDrive, no Teams */}
          {isStorage && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', borderBottom: '1px solid #F1F5F9', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Sincronización automática</div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  Al subir evidencias, se copian automáticamente a {meta?.label}
                </div>
                <div style={{ fontSize: 11, color: '#D97706', marginTop: 4, fontWeight: 600 }}>
                  ⚠️ Shelwi sigue siendo la fuente de verdad
                </div>
              </div>
              <button
                onClick={() => onAutoSync(!curSync)}
                style={{
                  width: 44, height: 24, borderRadius: 99, border: 'none',
                  background: curSync ? '#2563EB' : '#E2E8F0',
                  cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background .15s',
                }}
              >
                <span style={{ position: 'absolute', top: 2, left: curSync ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
              </button>
            </div>
          )}

          {integration?.last_sync_at && (
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
              Última sincronización: {new Date(integration.last_sync_at).toLocaleString('es-CO')}
            </div>
          )}
          {integration?.last_error && (
            <div style={{ background: '#FEF2F2', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#DC2626', marginBottom: 14 }}>
              Error: {integration.last_error}
            </div>
          )}

          <button onClick={onDisconnect} style={{ width: '100%', padding: '12px', borderRadius: 12, border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            Desconectar {meta?.label}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Tarjeta de proveedor ─────────────────────────────────────────────────────

function ProviderCard({
  providerKey, integration, onAction,
}: {
  providerKey: string;
  integration?: Integration;
  onAction: (provider: string) => void;
}) {
  const meta   = PROVIDER_META[providerKey];
  const status = integration?.status ?? 'disconnected';
  const isConnected = status === 'connected';
  const isFuture    = !meta.available;

  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '14px 16px',
      boxShadow: '0 2px 8px rgba(0,0,0,.05)',
      opacity: isFuture ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 13, background: meta.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, flexShrink: 0,
        }}>
          {meta.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: '#0F172A' }}>{meta.label}</span>
            {isFuture && (
              <span style={{ fontSize: 10, fontWeight: 700, background: '#F1F5F9', color: '#64748B', padding: '2px 7px', borderRadius: 99 }}>
                Próximamente
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{meta.description}</div>
        </div>
        {!isFuture && (
          <div style={{ flexShrink: 0 }}>
            <StatusBadge status={status} />
          </div>
        )}
      </div>

      {!isFuture && (
        <>
          {integration?.last_error && (
            <div style={{ marginTop: 10, background: '#FEF2F2', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#DC2626' }}>
              {integration.last_error.slice(0, 120)}
            </div>
          )}
          {integration?.last_sync_at && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: '#94A3B8' }}>
              Última sync: {new Date(integration.last_sync_at).toLocaleString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          <button
            onClick={() => onAction(providerKey)}
            style={{
              marginTop: 12, width: '100%', padding: '11px 0', borderRadius: 12, border: 'none',
              background: isConnected ? '#F1F5F9' : meta.bg,
              color: isConnected ? '#374151' : meta.color,
              fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {providerKey === 'whatsapp' ? (
              <><MessageSquare size={15} /> {isConnected ? 'Configurar' : 'Activar WhatsApp'}</>
            ) : (
              <><Plug size={15} /> {isConnected ? 'Desconectar' : 'Conectar'}<ChevronRight size={14} /></>
            )}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function IntegracionesPage() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast }  = useToast();

  const integrationsQ  = useIntegrations();
  const oauthMut       = useInitiateOAuth();
  const disconnectMut  = useDisconnectIntegration();
  const workerMut      = useTriggerWorker();

  const [waSheet,       setWaSheet]       = useState(false);
  const [alegraSheet,   setAlegraSheet]   = useState(false);
  const [syncSheet,     setSyncSheet]     = useState<string | null>(null); // provider key
  const [alegraEmail,   setAlegraEmail]   = useState('');
  const [alegraToken,   setAlegraToken]   = useState('');
  const [autoInvoice,   setAutoInvoice]   = useState(false);
  const connectAlegra = useConnectAlegra();
  const autoSyncMut   = useUpdateAutoSync();

  // Handle OAuth callback result
  useEffect(() => {
    const status   = searchParams.get('status');
    const provider = searchParams.get('provider');
    const error    = searchParams.get('error');
    if (status === 'connected' && provider) {
      showToast(`${PROVIDER_META[provider]?.label ?? provider} conectado correctamente`);
      integrationsQ.refetch();
    }
    if (error) {
      showToast(`Error al conectar: ${decodeURIComponent(error)}`);
    }
  }, [searchParams]);

  const integrations  = integrationsQ.data?.integrations ?? [];
  const recentEvents  = integrationsQ.data?.recent_events ?? [];

  function getIntegration(provider: string): Integration | undefined {
    return integrations.find(i => i.provider === provider);
  }

  function handleAction(provider: string) {
    const integration = getIntegration(provider);
    const isConnected = integration?.status === 'connected';

    if (provider === 'whatsapp') {
      setWaSheet(true);
      return;
    }
    if (provider === 'alegra') {
      setAlegraSheet(true);
      return;
    }
    // Drive/OneDrive/Teams — OAuth flow (activos en Sprint 14)
    if (['drive', 'onedrive', 'teams'].includes(provider)) {
      if (isConnected) {
        setSyncSheet(provider);  // Abrir panel de configuración sync
        return;
      }
      oauthMut.mutate(provider as 'drive' | 'onedrive' | 'teams');
      return;
    }

    if (isConnected) {
      disconnectMut.mutate(provider as IntegrationProvider);
      return;
    }

    if (provider === 'google_calendar' || provider === 'outlook_calendar') {
      oauthMut.mutate(provider);
    }
  }

  // Sprint 14: drive/onedrive/teams pasan a ACTIVE_PROVIDERS
  const ACTIVE_PROVIDERS = [
    'whatsapp', 'google_calendar', 'outlook_calendar', 'alegra', 'gmail', 'outlook_mail',
    'drive', 'onedrive', 'teams',
  ];
  const FUTURE_PROVIDERS: string[] = []; // Todos los soportados están activos

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px 12px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate('/app/config')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#0F172A', padding: '2px 0' }}>
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A' }}>Integraciones</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 1 }}>Conecta Shelwi con tus herramientas</div>
          </div>
          <button
            onClick={() => workerMut.mutate()}
            disabled={workerMut.isPending}
            style={{ border: 'none', background: '#F1F5F9', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            title="Sincronizar ahora"
          >
            <RefreshCw size={16} color="#374151" style={{ animation: workerMut.isPending ? 'spin .8s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Integraciones disponibles */}
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: .4 }}>
          Disponibles
        </div>
        {ACTIVE_PROVIDERS.map(p => (
          <ProviderCard key={p} providerKey={p} integration={getIntegration(p)} onAction={handleAction} />
        ))}

        {/* Eventos recientes */}
        {recentEvents.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 10 }}>
              Actividad reciente
            </div>
            <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
              {recentEvents.slice(0, 6).map((e, i) => {
                const meta = PROVIDER_META[e.provider];
                const statusColor = e.status === 'processed' ? '#16A34A' : e.status === 'failed' ? '#DC2626' : '#D97706';
                return (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: i < 5 ? '1px solid #F1F5F9' : 'none' }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{meta?.icon ?? '🔌'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.event_type.replace(/_/g, ' ')}
                      </div>
                      <div style={{ fontSize: 11, color: '#94A3B8' }}>
                        {new Date(e.created_at).toLocaleString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, flexShrink: 0 }}>
                      {e.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Próximamente */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 10 }}>
            Próximamente
          </div>
          {FUTURE_PROVIDERS.map(p => (
            <ProviderCard key={p} providerKey={p} integration={getIntegration(p)} onAction={handleAction} />
          ))}
        </div>
      </div>

      {/* Alegra config sheet */}
      {alegraSheet && (
        <>
          <div onClick={() => setAlegraSheet(false)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,.4)' }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 65,
            background: '#fff', borderRadius: '20px 20px 0 0',
            paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 40px rgba(15,23,42,.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 99, background: '#E2E8F0' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px 14px', borderBottom: '1px solid #F1F5F9' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>🧾 Conectar Alegra</div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 1 }}>Ingresa tus credenciales de Alegra</div>
              </div>
              <button onClick={() => setAlegraSheet(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20 }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 6 }}>EMAIL DE ALEGRA</div>
                <input type="email" value={alegraEmail} onChange={e => setAlegraEmail(e.target.value)}
                  placeholder="tu@email.com"
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 6 }}>TOKEN API DE ALEGRA</div>
                <input type="password" value={alegraToken} onChange={e => setAlegraToken(e.target.value)}
                  placeholder="Tu token de API de Alegra"
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
                <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 4 }}>
                  Alegra → Mi perfil → API → Clave de acceso
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <button onClick={() => setAutoInvoice(v => !v)} style={{ width: 44, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer', background: autoInvoice ? '#D97706' : '#E2E8F0', position: 'relative' }}>
                  <span style={{ position: 'absolute', top: 2, left: autoInvoice ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
                </button>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0F172A' }}>Facturación automática</div>
                  <div style={{ fontSize: 11.5, color: '#94A3B8' }}>Generar factura cuando un pedido se finaliza</div>
                </div>
              </div>
              <button
                onClick={async () => {
                  await connectAlegra.mutateAsync({ email: alegraEmail, token: alegraToken, autoInvoice });
                  setAlegraSheet(false);
                }}
                disabled={connectAlegra.isPending || !alegraEmail || !alegraToken}
                style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: (!alegraEmail || !alegraToken) ? '#E2E8F0' : '#D97706', color: (!alegraEmail || !alegraToken) ? '#94A3B8' : '#fff', fontWeight: 700, fontSize: 15, cursor: (!alegraEmail || !alegraToken) ? 'not-allowed' : 'pointer' }}
              >
                {connectAlegra.isPending ? 'Validando y conectando...' : 'Conectar Alegra'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Drive/OneDrive/Teams — sync config sheet */}
      {syncSheet && (
        <SyncConfigSheet
          provider={syncSheet}
          integration={getIntegration(syncSheet)}
          onClose={() => setSyncSheet(null)}
          onAutoSync={(v) => {
            autoSyncMut.mutate({ provider: syncSheet as IntegrationProvider, autoSync: v });
            setSyncSheet(null);
          }}
          onDisconnect={() => { disconnectMut.mutate(syncSheet as IntegrationProvider); setSyncSheet(null); }}
        />
      )}

      {/* WhatsApp config sheet */}
      {waSheet && (
        <WhatsAppConfigSheet
          integration={getIntegration('whatsapp')}
          onClose={() => setWaSheet(false)}
        />
      )}
    </div>
  );
}
