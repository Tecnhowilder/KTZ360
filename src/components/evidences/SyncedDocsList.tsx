/**
 * SyncedDocsList — Sección "Documentos sincronizados" en Pedidos/OTs.
 * Muestra evidencias con su estado en Drive/OneDrive.
 * Todo viene de Shelwi — NUNCA consulta directamente Drive/OneDrive.
 * Si Drive cae, Shelwi sigue funcionando.
 */
import { useState, useEffect } from 'react';
import { RefreshCw, ExternalLink, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { formatBytes } from '../../services/evidences';
import type { EvidenceFileType } from '../../lib/database.types';

const FILE_ICONS: Record<EvidenceFileType, string> = {
  image: '📷', video: '🎥', audio: '🎵', document: '📄', signature: '✍️',
};

interface SyncRef { provider: string; external_id: string; external_url: string | null; synced_at: string }
interface EvidenceSyncRow {
  id: string; file_name: string; file_type: EvidenceFileType; file_size: number;
  created_at: string; refs: SyncRef[]; pending_events: number;
}

interface Props {
  orderId?: string;
  workOrderId?: string;
}

export function SyncedDocsList({ orderId, workOrderId }: Props) {
  const { workspace } = useWorkspace();
  const [rows,    setRows]    = useState<EvidenceSyncRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying,setRetrying]= useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      // Obtener evidencias del pedido/OT
      let q = supabase
        .from('evidence_files' as never)
        .select('id, file_name, file_type, file_size, created_at')
        .eq('workspace_id', workspace.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (orderId)     q = (q as typeof q).eq('order_id', orderId);
      if (workOrderId) q = (q as typeof q).eq('work_order_id', workOrderId);

      const { data: evidences } = await q;
      if (!evidences?.length) { setRows([]); setLoading(false); return; }

      // Para cada evidencia, obtener su estado de sync desde integration_entity_refs
      const enriched: EvidenceSyncRow[] = await Promise.all(
        (evidences as Array<{ id: string; file_name: string; file_type: EvidenceFileType; file_size: number; created_at: string }>)
          .map(async (ev) => {
            const { data: syncStatus } = await supabase.rpc('get_sync_status' as never, {
              p_workspace_id: workspace.id,
              p_evidence_id:  ev.id,
            } as never);
            const s = syncStatus as { ok: boolean; refs?: SyncRef[]; pending_events?: number } | null;
            return {
              ...ev,
              refs: s?.refs ?? [],
              pending_events: s?.pending_events ?? 0,
            };
          })
      );

      setRows(enriched);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [orderId, workOrderId]);

  async function retrySync(evidenceId: string) {
    setRetrying(evidenceId);
    try {
      // Encolar un nuevo intento de sync para Drive y OneDrive
      await supabase.rpc('queue_integration_event' as never, {
        p_workspace_id: workspace.id,
        p_provider: 'drive',
        p_event_type: 'drive_sync',
        p_payload: { evidence_id: evidenceId },
      } as never);
      await supabase.rpc('queue_integration_event' as never, {
        p_workspace_id: workspace.id,
        p_provider: 'onedrive',
        p_event_type: 'onedrive_sync',
        p_payload: { evidence_id: evidenceId },
      } as never);
      setTimeout(() => load(), 1000);
    } finally {
      setRetrying(null);
    }
  }

  if (loading) return (
    <div style={{ padding: '20px 0', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Cargando...</div>
  );

  if (!rows.length) return (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
      <div style={{ fontSize: 14, color: '#64748B' }}>Sin documentos todavía</div>
      <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>Sube evidencias en la pestaña Evidencias</div>
    </div>
  );

  const PROVIDERS = [
    { key: 'drive',    label: 'Drive',    icon: '💾' },
    { key: 'onedrive', label: 'OneDrive', icon: '☁️' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map(ev => {
        const driveRef    = ev.refs.find(r => r.provider === 'drive');
        const onedriveRef = ev.refs.find(r => r.provider === 'onedrive');
        const hasPending  = ev.pending_events > 0;

        return (
          <div key={ev.id} style={{ background: '#fff', borderRadius: 14, padding: '13px 14px', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
            {/* Archivo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 20 }}>{FILE_ICONS[ev.file_type]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.file_name}
                </div>
                <div style={{ fontSize: 11.5, color: '#94A3B8' }}>
                  {formatBytes(ev.file_size)} · {new Date(ev.created_at).toLocaleDateString('es-CO')}
                </div>
              </div>
              {(driveRef || onedriveRef) ? null : hasPending ? (
                <Clock size={16} color="#D97706" />
              ) : (
                <button
                  onClick={() => retrySync(ev.id)}
                  disabled={retrying === ev.id}
                  style={{ border: 'none', background: '#F1F5F9', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <RefreshCw size={12} style={{ animation: retrying === ev.id ? 'spin .8s linear infinite' : 'none' }} />
                  Reintentar
                </button>
              )}
            </div>

            {/* Estado sync por proveedor */}
            <div style={{ display: 'flex', gap: 8 }}>
              {PROVIDERS.map(prov => {
                const ref = ev.refs.find(r => r.provider === prov.key);
                return (
                  <div key={prov.key} style={{
                    flex: 1, background: ref ? '#F0FDF4' : hasPending ? '#FFFBEB' : '#F8FAFC',
                    borderRadius: 10, padding: '8px 10px',
                    border: ref ? '1px solid #BBF7D0' : hasPending ? '1px solid #FDE68A' : '1px solid #F1F5F9',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: ref?.external_url ? 4 : 0 }}>
                      <span style={{ fontSize: 14 }}>{prov.icon}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: ref ? '#166534' : hasPending ? '#92400E' : '#64748B' }}>
                        {prov.label}
                      </span>
                      {ref ? <CheckCircle size={11} color="#16A34A" /> : hasPending ? <Clock size={11} color="#D97706" /> : <AlertTriangle size={11} color="#94A3B8" />}
                    </div>
                    {ref?.external_url && (
                      <a href={ref.external_url} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#2563EB', textDecoration: 'none' }}>
                        Abrir <ExternalLink size={10} />
                      </a>
                    )}
                    {ref?.synced_at && (
                      <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
                        {new Date(ref.synced_at).toLocaleString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
