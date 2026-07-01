/**
 * EvidenceUploader — Botón + sheet de carga de evidencias.
 * Flujo: selección → compresión → validación backend → upload → registro.
 * Mobile-first. PREMIUM only (gating mostrado aquí si no tiene feature).
 */
import { useRef, useState } from 'react';
import {
  Plus, Camera, Film, Music, FileText, PenLine, X, Upload, AlertTriangle,
} from 'lucide-react';
import { useUploadEvidence } from '../../hooks/useEvidences';
import { useFeatureAccess } from '../../hooks/usePermissions';
import { useUI } from '../../features/app/UIProvider';
import { SignatureCapture } from './SignatureCapture';
import { ALL_EVIDENCE_ACCEPT } from '../../services/evidences';
import { formatBytes } from '../../services/evidences';

interface Props {
  orderId?:     string;
  workOrderId?: string;
}

const OPTION_CONFIG = [
  { key: 'image',    label: 'Foto',       icon: Camera,   accept: 'image/jpeg,image/png,image/webp', capture: 'environment' as const },
  { key: 'video',    label: 'Video',      icon: Film,     accept: 'video/mp4,video/quicktime,video/webm', capture: undefined },
  { key: 'audio',    label: 'Audio',      icon: Music,    accept: 'audio/mpeg,audio/wav,audio/mp4,audio/ogg', capture: undefined },
  { key: 'document', label: 'PDF',        icon: FileText, accept: 'application/pdf', capture: undefined },
  { key: 'signature',label: 'Firma',      icon: PenLine,  accept: '', capture: undefined },
];

export function EvidenceUploader({ orderId, workOrderId }: Props) {
  const featureQ  = useFeatureAccess('storage_enabled');
  const uploadMut = useUploadEvidence({ orderId, workOrderId });
  const { openUpgradeModal } = useUI();

  const fileRef   = useRef<HTMLInputElement>(null);
  const [open, setOpen]           = useState(false);
  const [signature, setSignature] = useState(false);
  const [pending, setPending]     = useState<File | null>(null);
  const [caption, setCaption]     = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  function handleMainClick() {
    if (featureQ.data === false) {
      openUpgradeModal({
        title: 'Evidencias — Plan PRO',
        message: 'Sube fotos, videos, PDFs y firmas digitales asociadas a tus pedidos y OTs.',
        targetPlan: 'pro',
        ctaLabel: 'Actualizar a PRO',
        bullets: ['Fotos y videos de trabajo','PDFs y documentos','Firmas digitales','Almacenamiento incluido'],
      });
      return;
    }
    setOpen(true);
  }

  function selectFileType(config: typeof OPTION_CONFIG[0]) {
    setOpen(false);
    if (config.key === 'signature') {
      setSignature(true);
      return;
    }
    if (fileRef.current) {
      fileRef.current.accept  = config.accept;
      fileRef.current.capture = config.capture ?? '';
      fileRef.current.value   = '';
      fileRef.current.click();
    }
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPending(file);
    setCaption('');
    setError(null);
  }

  async function handleSignatureCapture(file: File) {
    setSignature(false);
    setPending(file);
    setCaption('');
    setError(null);
  }

  async function handleUpload() {
    if (!pending) return;
    setUploading(true);
    setError(null);
    try {
      await uploadMut.mutateAsync({
        file:        pending,
        orderId:     orderId   ?? null,
        workOrderId: workOrderId ?? null,
        caption:     caption || null,
        isSignature: pending.name.startsWith('firma-'),
      });
      setPending(null);
      setCaption('');
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Error al subir');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      {/* Input oculto */}
      <input
        ref={fileRef}
        type="file"
        style={{ display: 'none' }}
        accept={ALL_EVIDENCE_ACCEPT}
        onChange={onFileSelected}
      />

      {/* Botón principal */}
      <button
        onClick={handleMainClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 16px', borderRadius: 12,
          background: featureQ.data ? '#2563EB' : '#F1F5F9',
          color: featureQ.data ? '#fff' : '#64748B',
          border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700,
        }}
      >
        <Plus size={17} />
        Subir evidencia
      </button>

      {/* Sheet de tipo de archivo */}
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,.4)' }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 55,
            background: '#fff', borderRadius: '20px 20px 0 0',
            paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 40px rgba(15,23,42,.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 99, background: '#E2E8F0' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 14px' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>¿Qué quieres subir?</div>
              <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={20} color="#64748B" />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, padding: '0 16px' }}>
              {OPTION_CONFIG.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => selectFileType(opt)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    padding: '12px 0', borderRadius: 14, border: 'none',
                    background: '#F8FAFC', cursor: 'pointer',
                  }}
                >
                  <opt.icon size={22} color="#2563EB" />
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Firma */}
      {signature && (
        <SignatureCapture
          onCapture={handleSignatureCapture}
          onCancel={() => setSignature(false)}
        />
      )}

      {/* Preview antes de subir */}
      {pending && (
        <>
          <div onClick={() => setPending(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,23,42,.5)' }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 65,
            background: '#fff', borderRadius: '20px 20px 0 0',
            paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 40px rgba(15,23,42,.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 99, background: '#E2E8F0' }} />
            </div>
            <div style={{ padding: '4px 20px 14px', fontSize: 16, fontWeight: 800, color: '#0F172A' }}>
              Vista previa
            </div>

            <div style={{ margin: '0 16px 14px', background: '#F8FAFC', borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Upload size={20} color="#2563EB" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pending.name}</div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>{formatBytes(pending.size)} · {pending.type}</div>
                </div>
              </div>
            </div>

            {/* Caption */}
            <div style={{ padding: '0 16px 14px' }}>
              <input
                type="text"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Agregar descripción (opcional)"
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: 12,
                  border: '1px solid #E2E8F0', background: '#fff',
                  fontSize: 14, color: '#0F172A', boxSizing: 'border-box', outline: 'none',
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{ margin: '0 16px 10px', background: '#FEF2F2', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={14} color="#DC2626" />
                <span style={{ fontSize: 13, color: '#DC2626' }}>{error}</span>
              </div>
            )}

            {/* Acciones */}
            <div style={{ display: 'flex', gap: 10, padding: '0 16px' }}>
              <button
                onClick={() => { setPending(null); setError(null); }}
                style={{ flex: 1, padding: 14, borderRadius: 14, border: '1px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#374151' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading}
                style={{
                  flex: 2, padding: 14, borderRadius: 14, border: 'none',
                  background: uploading ? '#E2E8F0' : '#2563EB',
                  color: uploading ? '#94A3B8' : '#fff',
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  fontSize: 14, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <Upload size={15} />
                {uploading ? 'Subiendo...' : 'Subir evidencia'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
