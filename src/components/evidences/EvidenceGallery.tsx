/**
 * EvidenceGallery — Galería de evidencias de un pedido u OT.
 * Mobile-first: grid de miniaturas, visor de pantalla completa.
 * Soporta: fotos, videos, PDFs, audios, firmas.
 */
import { useState, useEffect } from 'react';
import { X, Download, Trash2, FileText, Music, Film, PenLine, Image } from 'lucide-react';
import { useEvidenceGallery, useDeleteEvidence } from '../../hooks/useEvidences';
import { getSignedUrl, getSignedUrls, formatBytes } from '../../services/evidences';
import type { EvidenceFileWithUploader, EvidenceFileType } from '../../lib/database.types';

// ─── Icono por tipo ───────────────────────────────────────────────────────────

function FileIcon({ type, size = 24, color = '#64748B' }: { type: EvidenceFileType; size?: number; color?: string }) {
  const icons: Record<EvidenceFileType, React.ComponentType<{ size?: number; color?: string }>> = {
    image:     Image,
    video:     Film,
    audio:     Music,
    document:  FileText,
    signature: PenLine,
  };
  const Icon = icons[type] ?? FileText;
  return <Icon size={size} color={color} />;
}

// ─── Visor de archivo a pantalla completa ─────────────────────────────────────

function FileViewer({
  file, signedUrl, onClose, onDelete, canDelete,
}: {
  file: EvidenceFileWithUploader;
  signedUrl: string;
  onClose: () => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.95)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Barra superior */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        paddingTop: 'calc(12px + env(safe-area-inset-top))',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.file_name}
          </div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
            {formatBytes(file.file_size)}
            {file.uploader_name ? ` · ${file.uploader_name}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {/* Descargar */}
          <a
            href={signedUrl}
            download={file.file_name}
            style={{
              width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
            }}
          >
            <Download size={16} color="#fff" />
          </a>
          {/* Eliminar */}
          {canDelete && (
            <button
              onClick={onDelete}
              style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(239,68,68,.2)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Trash2 size={16} color="#EF4444" />
            </button>
          )}
          {/* Cerrar */}
          <button
            onClick={onClose}
            style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,.12)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={18} color="#fff" />
          </button>
        </div>
      </div>

      {/* Contenido */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 16 }}>
        {(file.file_type === 'image' || file.file_type === 'signature') && (
          <img
            src={signedUrl}
            alt={file.file_name}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }}
          />
        )}
        {file.file_type === 'video' && (
          <video
            src={signedUrl}
            controls
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }}
          />
        )}
        {file.file_type === 'audio' && (
          <div style={{ textAlign: 'center' }}>
            <Music size={64} color="#64748B" style={{ marginBottom: 24 }} />
            <audio src={signedUrl} controls style={{ width: '100%', maxWidth: 320 }} />
          </div>
        )}
        {file.file_type === 'document' && (
          <iframe
            src={signedUrl}
            title={file.file_name}
            style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8, background: '#fff' }}
          />
        )}
      </div>

      {/* Caption */}
      {file.caption && (
        <div style={{ padding: '8px 16px 16px', color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
          {file.caption}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  orderId?:     string;
  workOrderId?: string;
}

export function EvidenceGallery({ orderId, workOrderId }: Props) {
  const galleryQ = useEvidenceGallery({ orderId, workOrderId });
  const deleteMut = useDeleteEvidence();

  const [signedUrls, setSignedUrls]   = useState<Record<string, string>>({});
  const [viewer, setViewer]           = useState<EvidenceFileWithUploader | null>(null);
  const [confirmDel, setConfirmDel]   = useState<EvidenceFileWithUploader | null>(null);
  const [loadingUrls, setLoadingUrls] = useState(false);

  const files = galleryQ.data?.files ?? [];

  // Obtener URLs firmadas cuando cambian los archivos
  useEffect(() => {
    if (!files.length) return;
    const newPaths = files.map(f => f.storage_path).filter(p => !signedUrls[p]);
    if (!newPaths.length) return;

    setLoadingUrls(true);
    getSignedUrls(newPaths, 3600)
      .then(urls => setSignedUrls(prev => ({ ...prev, ...urls })))
      .finally(() => setLoadingUrls(false));
  }, [files.map(f => f.id).join(',')]);

  if (galleryQ.isLoading || loadingUrls) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
        {[1,2,3,4,5,6].map(i => (
          <div key={i} style={{ aspectRatio: '1', borderRadius: 10, background: '#F1F5F9' }} />
        ))}
      </div>
    );
  }

  if (galleryQ.isError) {
    return (
      <div style={{ padding: '16px', background: '#FEF2F2', borderRadius: 12, fontSize: 13, color: '#DC2626' }}>
        Evidencias disponibles solo en plan PREMIUM.
      </div>
    );
  }

  if (!files.length) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0' }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>📷</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#64748B' }}>Sin evidencias todavía</div>
        <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>Usa el botón "+" para subir fotos, videos o documentos</div>
      </div>
    );
  }

  async function openViewer(file: EvidenceFileWithUploader) {
    if (!signedUrls[file.storage_path]) {
      const url = await getSignedUrl(file.storage_path);
      setSignedUrls(prev => ({ ...prev, [file.storage_path]: url }));
    }
    setViewer(file);
  }

  function handleDelete(file: EvidenceFileWithUploader) {
    setConfirmDel(file);
  }

  async function confirmDelete() {
    if (!confirmDel) return;
    await deleteMut.mutateAsync({ evidenceId: confirmDel.id, storagePath: confirmDel.storage_path });
    if (viewer?.id === confirmDel.id) setViewer(null);
    setConfirmDel(null);
  }

  const TYPE_COLORS: Record<EvidenceFileType, { bg: string; color: string }> = {
    image:     { bg: '#EFF6FF', color: '#2563EB' },
    video:     { bg: '#F5F3FF', color: '#7C3AED' },
    audio:     { bg: '#ECFEFF', color: '#0891B2' },
    document:  { bg: '#FEF3C7', color: '#92400E' },
    signature: { bg: '#F0FDF4', color: '#16A34A' },
  };

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
        {files.map(file => {
          const url = signedUrls[file.storage_path];
          const tc  = TYPE_COLORS[file.file_type];
          return (
            <button
              key={file.id}
              onClick={() => openViewer(file)}
              style={{
                aspectRatio: '1', borderRadius: 10, border: 'none', cursor: 'pointer',
                overflow: 'hidden', position: 'relative', padding: 0,
                background: tc.bg,
              }}
            >
              {(file.file_type === 'image' || file.file_type === 'signature') && url ? (
                <img src={url} alt={file.file_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <FileIcon type={file.file_type} size={28} color={tc.color} />
                  <span style={{ fontSize: 9, fontWeight: 700, color: tc.color, textTransform: 'uppercase', letterSpacing: .5 }}>
                    {file.file_type}
                  </span>
                </div>
              )}
              {file.is_signature && (
                <div style={{ position: 'absolute', top: 4, right: 4, background: '#16A34A', borderRadius: 99, padding: '2px 5px', fontSize: 8, color: '#fff', fontWeight: 700 }}>
                  FIRMA
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Visor */}
      {viewer && signedUrls[viewer.storage_path] && (
        <FileViewer
          file={viewer}
          signedUrl={signedUrls[viewer.storage_path]}
          onClose={() => setViewer(null)}
          onDelete={() => handleDelete(viewer)}
          canDelete={true}
        />
      )}

      {/* Confirmar eliminación */}
      {confirmDel && (
        <>
          <div onClick={() => setConfirmDel(null)} style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(15,23,42,.5)' }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 120,
            background: '#fff', borderRadius: '20px 20px 0 0',
            padding: '24px 20px calc(24px + env(safe-area-inset-bottom))',
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>¿Eliminar evidencia?</div>
            <div style={{ fontSize: 13, color: '#64748B', marginBottom: 20 }}>"{confirmDel.file_name}" será eliminada permanentemente.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDel(null)} style={{ flex: 1, padding: 14, borderRadius: 14, border: '1px solid #E2E8F0', background: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#374151' }}>
                Cancelar
              </button>
              <button onClick={confirmDelete} disabled={deleteMut.isPending} style={{ flex: 1, padding: 14, borderRadius: 14, border: 'none', background: '#EF4444', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#fff' }}>
                {deleteMut.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
