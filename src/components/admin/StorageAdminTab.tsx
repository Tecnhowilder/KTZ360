/**
 * StorageAdminTab — Consumo global de storage + Sync (Sprint 9 + Sprint 14)
 * Vista cross-workspace. Solo support_admin+.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStorageGlobal } from '../../services/admin';
import { STORAGE_ADDON_TIERS } from '../../lib/database.types';
import { supabase } from '../../lib/supabaseClient';

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 18 };
const thStyle: React.CSSProperties   = { padding: '10px 12px', fontSize: 11, fontWeight: 800, color: '#94A3B8', letterSpacing: '.5px', borderBottom: '1px solid #EEF2F7', textAlign: 'left' as const };
const tdStyle: React.CSSProperties   = { padding: '10px 12px', verticalAlign: 'middle' as const, fontSize: 12.5 };

type SyncTabKey = 'uso' | 'sincronizaciones' | 'errores';

interface SyncEvent { id: string; workspace_id: string; provider: string; event_type: string; status: string; last_error: string | null; created_at: string; processed_at: string | null }

export function StorageAdminTab() {
  const [syncTab, setSyncTab] = useState<SyncTabKey>('uso');

  const { data = [], isLoading } = useQuery({
    queryKey: ['adminStorageGlobal'],
    queryFn: getStorageGlobal,
  });

  // Sync events (drive/onedrive)
  const syncQuery = useQuery({
    queryKey: ['adminSyncEvents', syncTab],
    queryFn: async () => {
      const statusFilter = syncTab === 'errores' ? ['failed'] : syncTab === 'sincronizaciones' ? ['processed'] : null;
      let q = supabase
        .from('integration_events' as never)
        .select('id, workspace_id, provider, event_type, status, last_error, created_at, processed_at')
        .in('provider', ['drive', 'onedrive'])
        .order('created_at', { ascending: false })
        .limit(50);
      if (statusFilter) q = (q as typeof q).in('status', statusFilter);
      const { data: rows } = await q;
      return (rows ?? []) as SyncEvent[];
    },
    enabled: syncTab !== 'uso',
    staleTime: 30_000,
  });

  const totalMb    = data.reduce((a, r) => a + r.total_mb, 0);
  const totalFiles = data.reduce((a, r) => a + r.total_files, 0);

  const syncEvents = syncQuery.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Tabs Uso / Sincronizaciones / Errores */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '2px solid #F1F5F9', paddingBottom: 8 }}>
        {(['uso','sincronizaciones','errores'] as const).map(t => (
          <button key={t} onClick={() => setSyncTab(t)} style={{
            padding: '7px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: syncTab === t ? '#2563EB' : '#F8FAFC',
            color: syncTab === t ? '#fff' : '#64748B',
            fontSize: 12.5, fontWeight: 700, textTransform: 'capitalize',
          }}>
            {t === 'uso' ? 'Uso de Storage' : t === 'sincronizaciones' ? 'Sincronizaciones' : 'Errores'}
          </button>
        ))}
      </div>
      {/* Contenido según tab */}
      {syncTab !== 'uso' && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>
            {syncTab === 'sincronizaciones' ? 'Sincronizaciones exitosas' : 'Errores de sincronización'}
          </div>
          {syncQuery.isLoading ? (
            <div style={{ color: '#94A3B8', fontSize: 13 }}>Cargando...</div>
          ) : syncEvents.length === 0 ? (
            <div style={{ color: '#94A3B8', fontSize: 13 }}>Sin registros en este período.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    <th style={thStyle}>Workspace</th>
                    <th style={thStyle}>Proveedor</th>
                    <th style={thStyle}>Estado</th>
                    <th style={thStyle}>Fecha</th>
                    {syncTab === 'errores' && <th style={thStyle}>Error</th>}
                  </tr>
                </thead>
                <tbody>
                  {syncEvents.map(e => (
                    <tr key={e.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                      <td style={{ ...tdStyle, fontSize: 11, color: '#94A3B8' }}>{e.workspace_id.slice(0,8)}…</td>
                      <td style={tdStyle}>{e.provider === 'drive' ? '💾 Drive' : '☁️ OneDrive'}</td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: e.status === 'processed' ? '#F0FDF4' : e.status === 'failed' ? '#FEF2F2' : '#FFFBEB', color: e.status === 'processed' ? '#16A34A' : e.status === 'failed' ? '#DC2626' : '#D97706' }}>
                          {e.status}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontSize: 11.5 }}>
                        {new Date(e.created_at).toLocaleString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      {syncTab === 'errores' && (
                        <td style={{ ...tdStyle, fontSize: 11, color: '#DC2626', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.last_error ?? '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {syncTab === 'uso' && <>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 6, textTransform: 'uppercase' }}>Total usado</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#0F172A' }}>{totalMb.toFixed(1)} MB</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 6, textTransform: 'uppercase' }}>Archivos totales</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#0F172A' }}>{totalFiles}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 6, textTransform: 'uppercase' }}>Workspaces con storage</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#0F172A' }}>{data.filter(r => r.total_files > 0).length}</div>
        </div>
      </div>

      {/* Paquetes adicionales de almacenamiento */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Paquetes adicionales de almacenamiento</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {STORAGE_ADDON_TIERS.map(t => (
            <div key={t.gb} style={{ padding: '10px 16px', background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#2563EB' }}>+{t.gb} GB</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginTop: 4 }}>${t.price.toLocaleString('es-CL')}/mes</div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Recurrente</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabla por workspace */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Uso por workspace</div>
        {isLoading ? (
          <div style={{ color: '#94A3B8', fontSize: 13 }}>Cargando…</div>
        ) : data.length === 0 ? (
          <div style={{ color: '#94A3B8', fontSize: 13 }}>Sin evidencias cargadas todavía.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  <th style={thStyle}>Workspace</th>
                  <th style={thStyle}>Archivos</th>
                  <th style={thStyle}>Tamaño (MB)</th>
                  <th style={thStyle}>% del total</th>
                </tr>
              </thead>
              <tbody>
                {data.map(row => (
                  <tr key={row.workspace_id} style={{ borderTop: '1px solid #F1F5F9' }}>
                    <td style={tdStyle}>{row.workspace_name}</td>
                    <td style={tdStyle}>{row.total_files}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{row.total_mb.toFixed(2)}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 80, height: 6, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ width: `${totalMb > 0 ? (row.total_mb / totalMb) * 100 : 0}%`, height: '100%', background: '#2563EB', borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: 11.5 }}>
                          {totalMb > 0 ? ((row.total_mb / totalMb) * 100).toFixed(1) : 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>}  {/* end syncTab === 'uso' */}
    </div>
  );
}
