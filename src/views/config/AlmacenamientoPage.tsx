/**
 * AlmacenamientoPage — Gestión de cuota y paquetes de almacenamiento Sprint 14
 * /app/config/almacenamiento — Mobile-first
 *
 * Principio: SHELWI ES LA FUENTE DE VERDAD.
 * Los paquetes adicionales extienden la cuota en Supabase Storage.
 * Si se cancela un addon: archivos intactos, nuevas cargas bloqueadas.
 *
 * Zero Trust: todas las validaciones en backend.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, HardDrive, Plus, X, CheckCircle, AlertTriangle } from 'lucide-react';
import { useStorageUsage } from '../../hooks/useEvidences';
import { useWorkspaceStorageAddons, useActivateStorageAddon, useCancelStorageAddon } from '../../hooks/useStorageAddons';
import { useFeatureAccess } from '../../hooks/usePermissions';
import { useUI } from '../../features/app/UIProvider';
import { formatBytes } from '../../services/evidences';
import type { WorkspaceStorageAddonRow } from '../../lib/database.types';

// ─── Planes de paquetes ───────────────────────────────────────────────────────

const ADDON_PLANS = [
  { gb: 10 as const, price: 14900, label: '+10 GB', popular: false },
  { gb: 25 as const, price: 24900, label: '+25 GB', popular: true  },
  { gb: 50 as const, price: 35900, label: '+50 GB', popular: false },
];

function fmtCOP(n: number) { return '$ ' + Math.round(n).toLocaleString('es-CO'); }

// ─── Barra de cuota ───────────────────────────────────────────────────────────

function QuotaBar({ usedBytes, maxBytes }: { usedBytes: number; maxBytes: number }) {
  const pct      = maxBytes > 0 ? Math.min(100, Math.round((usedBytes / maxBytes) * 100)) : 0;
  const barColor = pct >= 90 ? '#DC2626' : pct >= 80 ? '#D97706' : '#2563EB';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: barColor }}>{formatBytes(usedBytes)} usado</span>
        <span style={{ fontSize: 12, color: '#94A3B8' }}>de {formatBytes(maxBytes)}</span>
      </div>
      <div style={{ height: 10, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 99, transition: 'width .4s' }} />
      </div>
      <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
        {formatBytes(Math.max(0, maxBytes - usedBytes))} disponibles · {pct}% usado
      </div>
      {pct >= 80 && (
        <div style={{ marginTop: 10, background: pct >= 90 ? '#FEF2F2' : '#FFFBEB', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} color={pct >= 90 ? '#DC2626' : '#D97706'} />
          <span style={{ fontSize: 12, fontWeight: 600, color: pct >= 90 ? '#DC2626' : '#D97706' }}>
            {pct >= 100 ? 'Almacenamiento lleno — no puedes subir más archivos' : `Almacenamiento al ${pct}%`}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Tarjeta addon activo ─────────────────────────────────────────────────────

function ActiveAddonCard({ addon, onCancel }: {
  addon: WorkspaceStorageAddonRow;
  onCancel: () => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 14, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <CheckCircle size={18} color="#fff" />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#166534' }}>+{addon.gb} GB activos</div>
        <div style={{ fontSize: 12, color: '#16A34A' }}>{fmtCOP(addon.unit_price)}/mes</div>
      </div>
      {!confirmDel ? (
        <button onClick={() => setConfirmDel(true)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}>
          <X size={16} />
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setConfirmDel(false)} style={{ border: '1px solid #E2E8F0', background: '#fff', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: '#374151' }}>
            No
          </button>
          <button onClick={onCancel} style={{ border: 'none', background: '#EF4444', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#fff' }}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function AlmacenamientoPage() {
  const navigate   = useNavigate();
  const { openUpgradeModal } = useUI();
  const featureQ   = useFeatureAccess('storage_enabled');
  const storageQ   = useStorageUsage();
  const addonsQ    = useWorkspaceStorageAddons();
  const activateMut = useActivateStorageAddon();
  const cancelMut   = useCancelStorageAddon();
  const [buySheet, setBuySheet] = useState<typeof ADDON_PLANS[0] | null>(null);

  const storage = storageQ.data;
  const addons  = (addonsQ.data ?? []).filter(a => a.status === 'active');
  const totalAddonGB = addons.reduce((s, a) => s + a.gb, 0);
  const totalGB = (storage?.max_bytes ?? 0) / 1073741824;

  // Sin acceso PREMIUM
  if (featureQ.data === false) {
    return (
      <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 80 }}>
        <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><ArrowLeft size={20} /></button>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>Almacenamiento</div>
        </div>
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <HardDrive size={40} color="#94A3B8" style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Disponible en Plan PRO</div>
          <div style={{ fontSize: 13, color: '#64748B', marginBottom: 20 }}>Incluye almacenamiento para evidencias, fotos y documentos de tus pedidos.</div>
          <button onClick={() => openUpgradeModal({ title: 'Almacenamiento', message: 'Almacenamiento incluido en el plan PRO para evidencias de trabajo.', targetPlan: 'pro', ctaLabel: 'Actualizar a PRO' })}
            style={{ background: '#2563EB', color: '#fff', border: 'none', borderRadius: 14, padding: '13px 28px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            Ver plan PRO
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100dvh', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => navigate(-1)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#0F172A' }}><ArrowLeft size={20} /></button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A' }}>Almacenamiento</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 1 }}>Gestiona tu cuota de almacenamiento</div>
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <HardDrive size={18} color="#2563EB" />
        </div>
      </div>

      <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Cuota actual */}
        {storage && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Tu almacenamiento</div>
            <QuotaBar usedBytes={storage.used_bytes} maxBytes={storage.max_bytes} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
              <div style={{ background: '#F8FAFC', borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 2 }}>Incluido PREMIUM</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>5 GB</div>
              </div>
              {totalAddonGB > 0 && (
                <div style={{ background: '#F0FDF4', borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 2 }}>Paquetes adicionales</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#16A34A' }}>+{totalAddonGB} GB</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Addons activos */}
        {addons.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 10 }}>Paquetes activos</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {addons.map(a => (
                <ActiveAddonCard key={a.id} addon={a}
                  onCancel={() => cancelMut.mutate({ addonId: a.id })}
                />
              ))}
            </div>
          </div>
        )}

        {/* Comprar paquetes */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 10 }}>Ampliar almacenamiento</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ADDON_PLANS.map(plan => (
              <div key={plan.gb} style={{
                background: '#fff', borderRadius: 16, padding: '14px 16px',
                border: plan.popular ? '2px solid #2563EB' : '1px solid #F1F5F9',
                boxShadow: '0 2px 8px rgba(0,0,0,.05)', position: 'relative',
              }}>
                {plan.popular && (
                  <span style={{ position: 'absolute', top: -8, left: 16, background: '#2563EB', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 99 }}>
                    MÁS POPULAR
                  </span>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A' }}>{plan.label}</div>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Recurrente · cancela cuando quieras</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#2563EB', marginTop: 4 }}>{fmtCOP(plan.price)}/mes</div>
                  </div>
                  <button
                    onClick={() => setBuySheet(plan)}
                    style={{ border: 'none', background: '#2563EB', color: '#fff', borderRadius: 12, padding: '10px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={15} /> Agregar
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 10, lineHeight: 1.5 }}>
            ✔ Al cancelar: tus archivos se conservan · Solo se bloquean nuevas cargas · Puedes volver a contratar en cualquier momento.
          </div>
        </div>
      </div>

      {/* Confirm Buy Sheet */}
      {buySheet && (
        <>
          <div onClick={() => setBuySheet(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,.4)' }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 65,
            background: '#fff', borderRadius: '20px 20px 0 0',
            padding: '20px 20px calc(20px + env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 40px rgba(15,23,42,.15)',
          }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>Confirmar paquete</div>
            <div style={{ background: '#F8FAFC', borderRadius: 14, padding: '14px', marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>+{buySheet.gb} GB de almacenamiento</div>
              <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>Recurrente — {fmtCOP(buySheet.price)}/mes</div>
              <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 6 }}>
                Tu nueva cuota total: {totalGB + buySheet.gb} GB
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setBuySheet(null)} style={{ flex: 1, padding: 14, borderRadius: 14, border: '1px solid #E2E8F0', background: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#374151' }}>
                Cancelar
              </button>
              <button
                onClick={async () => {
                  await activateMut.mutateAsync({ gb: buySheet.gb, unitPrice: buySheet.price });
                  setBuySheet(null);
                }}
                disabled={activateMut.isPending}
                style={{ flex: 2, padding: 14, borderRadius: 14, border: 'none', background: '#2563EB', color: '#fff', fontSize: 14, fontWeight: 700, cursor: activateMut.isPending ? 'not-allowed' : 'pointer' }}>
                {activateMut.isPending ? 'Activando...' : `Activar +${buySheet.gb} GB`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
