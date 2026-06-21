/**
 * StorageWidget — Widget de almacenamiento para Dashboard Mobile.
 * Solo visible para PREMIUM. FREE/PRO → upsell.
 * Datos desde get_storage_usage RPC (Zero Trust).
 */
import { useNavigate } from 'react-router-dom';
import { HardDrive, Lock, Camera, Film, Music, FileText, PenLine } from 'lucide-react';
import { useStorageUsage } from '../../hooks/useEvidences';
import { useFeatureAccess } from '../../hooks/usePermissions';
import { useUI } from '../../features/app/UIProvider';
import { formatBytes } from '../../services/evidences';

const CARD: React.CSSProperties = {
  background: '#fff',
  borderRadius: 18,
  padding: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,.06)',
};

const TYPE_ICONS = {
  image:     Camera,
  video:     Film,
  audio:     Music,
  document:  FileText,
  signature: PenLine,
};

const TYPE_COLORS: Record<string, string> = {
  image: '#2563EB', video: '#7C3AED', audio: '#0891B2',
  document: '#D97706', signature: '#16A34A',
};

export function StorageWidget() {
  const navigate = useNavigate();
  const { openUpgradeModal } = useUI();
  const featureQ  = useFeatureAccess('storage_enabled');
  const storageQ  = useStorageUsage();

  // Sin acceso → upsell
  if (featureQ.data === false) {
    return (
      <div
        style={{ ...CARD, margin: '0 16px', cursor: 'pointer',
          background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)',
          border: '1px solid #BBF7D0',
        }}
        onClick={() => openUpgradeModal({
          title: 'Almacenamiento y Evidencias',
          message: 'Sube fotos, videos, PDFs y firmas digitales con 5 GB incluidos.',
          targetPlan: 'premium',
          ctaLabel: 'Activar PREMIUM',
          bullets: ['5 GB de almacenamiento', 'Fotos, videos, audios, PDFs', 'Firmas digitales', 'Galería por pedido y OT'],
        })}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <HardDrive size={18} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#166534' }}>Almacenamiento — PREMIUM</div>
            <div style={{ fontSize: 11.5, color: '#16A34A' }}>5 GB para evidencias de trabajo →</div>
          </div>
          <Lock size={16} color="#16A34A" />
        </div>
      </div>
    );
  }

  if (storageQ.isLoading || !storageQ.data) return null;

  const d         = storageQ.data;
  const pct       = Math.min(100, d.pct_used);
  const barColor  = pct >= 90 ? '#DC2626' : pct >= 80 ? '#D97706' : '#2563EB';

  return (
    <div style={{ ...CARD, margin: '0 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <HardDrive size={15} color="#2563EB" />
          </div>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Almacenamiento</span>
        </div>
        <button
          onClick={() => navigate('/app/pedidos')}
          style={{ border: 'none', background: '#F1F5F9', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: '#2563EB' }}
        >
          Ver pedidos
        </button>
      </div>

      {/* Barra de uso */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: barColor }}>
            {formatBytes(d.used_bytes)} usados
          </span>
          <span style={{ fontSize: 12, color: '#94A3B8' }}>
            {formatBytes(d.max_bytes)} total
          </span>
        </div>
        <div style={{ height: 8, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99, background: barColor,
            width: `${pct}%`, transition: 'width .4s ease',
          }} />
        </div>
        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
          {formatBytes(d.available_bytes)} disponibles · {pct.toFixed(0)}% usado
        </div>
      </div>

      {/* Por tipo */}
      {Object.keys(d.by_type ?? {}).length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(d.by_type ?? {}).map(([type, stat]) => {
            if (!stat) return null;
            const Icon = TYPE_ICONS[type as keyof typeof TYPE_ICONS] ?? FileText;
            const color = TYPE_COLORS[type] ?? '#64748B';
            return (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#F8FAFC', borderRadius: 8, padding: '5px 8px' }}>
                <Icon size={12} color={color} />
                <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>{stat.count}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Alerta si está lleno */}
      {pct >= 90 && (
        <div style={{ marginTop: 12, background: '#FEF2F2', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#DC2626', fontWeight: 600 }}>
          {pct >= 100 ? '🔴 Almacenamiento lleno — elimina archivos para continuar' : '⚠️ Almacenamiento casi lleno'}
        </div>
      )}
    </div>
  );
}
