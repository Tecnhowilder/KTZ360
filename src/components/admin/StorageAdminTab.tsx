/**
 * StorageAdminTab — Consumo global de storage (Sprint 9)
 * Vista cross-workspace. Solo support_admin+.
 */
import { useQuery } from '@tanstack/react-query';
import { getStorageGlobal } from '../../services/admin';

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 18 };
const thStyle: React.CSSProperties   = { padding: '10px 12px', fontSize: 11, fontWeight: 800, color: '#94A3B8', letterSpacing: '.5px', borderBottom: '1px solid #EEF2F7', textAlign: 'left' as const };
const tdStyle: React.CSSProperties   = { padding: '10px 12px', verticalAlign: 'middle' as const, fontSize: 12.5 };

const TIERS = [
  { label: '10 GB',  gb: 10  },
  { label: '25 GB',  gb: 25  },
  { label: '50 GB',  gb: 50  },
  { label: '100 GB', gb: 100 },
];

export function StorageAdminTab() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['adminStorageGlobal'],
    queryFn: getStorageGlobal,
  });

  const totalMb    = data.reduce((a, r) => a + r.total_mb, 0);
  const totalFiles = data.reduce((a, r) => a + r.total_files, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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

      {/* Tiers futuros (informativo) */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12 }}>Tiers de almacenamiento (próximamente)</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {TIERS.map(t => (
            <div key={t.gb} style={{ padding: '10px 16px', background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#2563EB' }}>{t.label}</div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Disponible Q3 2026</div>
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
    </div>
  );
}
