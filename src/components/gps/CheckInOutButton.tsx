/**
 * CheckInOutButton — Botón GPS para operarios.
 * Flujo: solicitar GPS → validar consentimiento → one-shot getCurrentPosition → RPC.
 * NO usa watchPosition(). Protección de batería obligatoria.
 */
import { useState } from 'react';
import { MapPin, LogIn, LogOut, AlertTriangle, CheckCircle, X, WifiOff } from 'lucide-react';
import { useCheckIn, useCheckOut, useGrantGpsConsent } from '../../hooks/useGPS';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useToast } from '../ui/Toast';
import type { OperationalStatus } from '../../lib/database.types';

interface Props {
  orderId?:           string | null;
  workOrderId?:       string | null;
  operationalStatus:  OperationalStatus;
  gpsConsent:         boolean;
}

export function CheckInOutButton({ orderId, workOrderId, operationalStatus, gpsConsent }: Props) {
  const { profile }    = useWorkspace();
  const { showToast }  = useToast();
  const [showConsent, setShowConsent] = useState(false);
  const [isOffline,   setIsOffline]   = useState(false);

  const checkIn     = useCheckIn({ orderId, workOrderId });
  const checkOut    = useCheckOut({ orderId, workOrderId });
  const grantConsent = useGrantGpsConsent();

  const isInSite = operationalStatus === 'en_sitio';
  const loading  = checkIn.isPending || checkOut.isPending;

  // Solo operarios y supervisores hacen check-in
  if (!['operario','supervisor','employee'].includes(profile.role)) return null;

  async function handleAction() {
    // Verificar conexión antes de intentar cualquier operación GPS
    if (!navigator.onLine) {
      setIsOffline(true);
      setTimeout(() => setIsOffline(false), 4000);
      showToast('Sin conexión a internet. Conéctate e intenta de nuevo.');
      return;
    }
    if (!gpsConsent) {
      setShowConsent(true);
      return;
    }
    if (isInSite) {
      await checkOut.mutateAsync();
    } else {
      await checkIn.mutateAsync();
    }
  }

  async function handleAcceptConsent() {
    await grantConsent.mutateAsync();
    setShowConsent(false);
    // Después del consentimiento, proceder con check-in
    await checkIn.mutateAsync();
  }

  return (
    <>
      {/* Banner sin conexión */}
      {isOffline && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, marginBottom: 8 }}>
          <WifiOff size={14} color="#DC2626" />
          <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>Sin conexión — el check-in requiere internet</span>
        </div>
      )}

      <button
        onClick={handleAction}
        disabled={loading}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 20px', borderRadius: 14, border: 'none',
          background: loading ? '#E2E8F0' : isInSite ? '#DC2626' : '#16A34A',
          color: loading ? '#94A3B8' : '#fff',
          fontSize: 14, fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer',
          boxShadow: loading ? 'none' : '0 4px 16px rgba(0,0,0,.2)',
          transition: 'all .15s',
        }}
      >
        {loading ? (
          <span style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
        ) : isInSite ? (
          <LogOut size={17} />
        ) : (
          <LogIn size={17} />
        )}
        {loading ? 'Procesando...' : isInSite ? 'Check Out' : 'Check In'}
        {!loading && <MapPin size={14} style={{ opacity: 0.8 }} />}
      </button>

      {/* Modal de consentimiento GPS */}
      {showConsent && (
        <>
          <div onClick={() => setShowConsent(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,23,42,.5)' }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 105,
            background: '#fff', borderRadius: '20px 20px 0 0',
            padding: '24px 20px calc(24px + env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 40px rgba(15,23,42,.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MapPin size={22} color="#2563EB" />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Activar GPS</div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 1 }}>Consentimiento requerido</div>
              </div>
              <button onClick={() => setShowConsent(false)} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={20} color="#64748B" />
              </button>
            </div>

            <div style={{ background: '#F8FAFC', borderRadius: 12, padding: 14, marginBottom: 20 }}>
              <p style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.6, margin: 0 }}>
                Tu ubicación será utilizada <strong>únicamente</strong> para la gestión operativa de órdenes y actividades laborales asignadas a ti.
              </p>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12 }}>
                <AlertTriangle size={14} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: '#92400E', margin: 0, lineHeight: 1.5 }}>
                  La ubicación solo se registra al hacer Check In, Check Out o actualizar tu estado. No hay seguimiento continuo.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowConsent(false)} style={{ flex: 1, padding: 14, borderRadius: 14, border: '1px solid #E2E8F0', background: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#374151' }}>
                Cancelar
              </button>
              <button
                onClick={handleAcceptConsent}
                disabled={grantConsent.isPending}
                style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 14, border: 'none', background: '#16A34A', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >
                <CheckCircle size={16} />
                Aceptar y hacer Check In
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
