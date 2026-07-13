/**
 * WizardStepPreview — Vista previa + compartir genérica para el Document Engine.
 *
 * Diferencias con StepPreviewShare (que queda INTACTO para Cotizaciones):
 *   - No tiene dependencia directa de getOrCreateQuoteToken
 *   - No llama a openDocument (DocumentOverlay) directamente
 *   - Recibe callbacks onGetShareUrl y onOpenDocument inyectados desde el padre
 *   - entityLabel configurable ("Cotización" | "Pedido" | etc.)
 *
 * Así StepPreviewShare no acumula condicionales de tipo y este componente
 * puede usarse para cualquier documento comercial futuro.
 */
import { useState } from 'react';
import { Edit2, ChevronDown } from 'lucide-react';
import { computeTotals, type QuoteItem, type LaborItem, type CostConfig } from '../../lib/document-engine';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useToast } from '../ui/Toast';
import { formatCurrencyCOP } from '../../lib/currency';
import { shareByEmail, openWhatsAppShare } from '../../lib/shareUtils';
import { ShareBar } from '../ui/ShareBar';
import { PDFPreviewRenderer } from '../quote-new/PDFPreviewRenderer';

interface Props {
  items:          QuoteItem[];
  laborItems?:    LaborItem[];
  config:         CostConfig;
  clientName:     string;
  clientPhone?:   string | null;
  clientEmail?:   string | null;
  documentName:   string;
  documentNumber?: string;
  entityLabel:    string;             // "Cotización" | "Pedido"
  documentLabel?: string;            // label en el PDF ("COTIZACIÓN" | "PEDIDO")
  onChangeDocumentName: (name: string) => void;
  onSave:         () => Promise<string | null>;
  isSaving:       boolean;
  /** Devuelve la URL pública para compartir. Si no está disponible, el compartir igual funciona sin URL. */
  onGetShareUrl:  ((savedId: string) => Promise<string>) | null;
  /** Abre la vista de documento para PDF. Si es null, se usa window.print() */
  onOpenDocument: ((savedId: string) => void) | null;
}

export function WizardStepPreview({
  items, laborItems = [], config,
  clientName, clientPhone, clientEmail,
  documentName, documentNumber, entityLabel, documentLabel,
  onChangeDocumentName, onSave, isSaving,
  onGetShareUrl, onOpenDocument,
}: Props) {
  const { company, planName } = useWorkspace();
  const { showToast } = useToast();
  const [savedId,      setSavedId]      = useState<string | null>(null);
  const [editingName,  setEditingName]  = useState(false);
  const [working,      setWorking]      = useState(false);
  const [previewOpen,  setPreviewOpen]  = useState(false);

  const totals = computeTotals(items, config, laborItems);
  const fmt    = formatCurrencyCOP;

  async function ensureSaved(): Promise<string | null> {
    if (savedId) return savedId;
    const id = await onSave();
    if (id) setSavedId(id);
    return id;
  }

  async function handleWhatsApp() {
    setWorking(true);
    try {
      const id = await ensureSaved();
      if (!id) { showToast('Guarda el documento primero'); return; }

      // Obtener URL pública — funciona igual si falla (sin URL)
      let url: string | null = null;
      if (onGetShareUrl) {
        try { url = await onGetShareUrl(id); } catch { /* sin URL, compartir igual */ }
      }

      // Usar openWhatsAppShare para el mismo formato profesional que Cotizaciones
      await openWhatsAppShare({
        clientName,
        projectName:  documentName,
        companyName:  company?.name ?? '',
        publicUrl:    url ?? window.location.href,
        total:        totals.total,
        phone:        clientPhone ?? undefined,
        quoteNumber:  documentNumber,
      });
    } catch { showToast('Error al abrir WhatsApp'); }
    finally { setWorking(false); }
  }

  async function handleEmail() {
    setWorking(true);
    try {
      const id = await ensureSaved();
      if (!id) { showToast('Guarda el documento primero'); return; }

      let url: string | null = null;
      if (onGetShareUrl) {
        try { url = await onGetShareUrl(id); } catch { /* sin URL */ }
      }

      // Mismo formato de email que Cotizaciones
      await shareByEmail({
        clientName,
        projectName: documentName,
        companyName: company?.name ?? '',
        publicUrl:   url ?? `${window.location.origin}/app`,
        total:       totals.total,
        clientEmail: clientEmail ?? undefined,
        quoteNumber: documentNumber,
        planCode:    planName?.toLowerCase() ?? 'free',
      });
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') showToast('Error al abrir correo');
    } finally { setWorking(false); }
  }

  async function handleCopyLink() {
    setWorking(true);
    try {
      const id = await ensureSaved();
      if (!id) { showToast('Guarda el documento primero'); return; }
      if (!onGetShareUrl) { showToast('Enlace público no disponible'); return; }
      try {
        const url = await onGetShareUrl(id);
        await navigator.clipboard.writeText(url);
        showToast('Enlace copiado ✓');
      } catch {
        showToast('Enlace público no disponible todavía');
      }
    } catch { showToast('Error al copiar enlace'); }
    finally { setWorking(false); }
  }

  async function handlePDF() {
    const id = await ensureSaved();
    if (!id) { showToast('Guarda el documento primero'); return; }
    if (onOpenDocument) {
      onOpenDocument(id);
    } else {
      window.print();
    }
  }

  return (
    <div style={{ padding: '0 16px' }}>
      {/* Nombre editable */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
          Nombre del {entityLabel.toLowerCase()}
        </div>
        {editingName ? (
          <input autoFocus value={documentName}
            onChange={e => onChangeDocumentName(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={e => e.key === 'Enter' && setEditingName(false)}
            style={{ width: '100%', fontSize: 16, fontWeight: 700, border: 'none', outline: 'none', borderBottom: '2px solid #2563EB', paddingBottom: 4, fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', flex: 1 }}>{documentName || 'Sin nombre'}</span>
            <button onClick={() => setEditingName(true)}
              style={{ border: '1px solid #E2E8F0', background: '#F8FAFC', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', color: '#475569' }}>
              <Edit2 size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Toggle vista previa */}
      <button onClick={() => setPreviewOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, cursor: 'pointer', marginBottom: previewOpen ? 0 : 14, fontFamily: 'inherit', borderBottomLeftRadius: previewOpen ? 0 : 14, borderBottomRightRadius: previewOpen ? 0 : 14 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Vista previa del documento</span>
        <ChevronDown size={16} color="#64748B" style={{ transform: previewOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>

      {previewOpen && (
        <div style={{ border: '1px solid #E2E8F0', borderTop: 'none', borderRadius: '0 0 14px 14px', overflow: 'hidden', marginBottom: 14, maxHeight: '60vh', overflowY: 'auto' }}>
          <PDFPreviewRenderer
            items={items} laborItems={laborItems} config={config}
            clientName={clientName} quoteName={documentName}
            quoteNumber={documentNumber}
            company={company ?? undefined}
            documentLabel={documentLabel}
          />
        </div>
      )}

      {/* Resumen total */}
      {!previewOpen && (
        <div style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)', borderRadius: 16, padding: '16px 18px', marginBottom: 14, color: '#fff' }}>
          <div style={{ fontSize: 12, opacity: .8, marginBottom: 4 }}>Total del {entityLabel.toLowerCase()}</div>
          <div style={{ fontSize: 30, fontWeight: 900, fontVariantNumeric: 'tabular-nums', letterSpacing: '-1px' }}>{fmt(totals.total)}</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, opacity: .8 }}>
            <span>{items.length} ítem{items.length !== 1 ? 's' : ''}</span>
            {clientName && <span>· {clientName}</span>}
          </div>
        </div>
      )}

      {/* ShareBar */}
      <div style={{ marginBottom: 14 }}>
        <ShareBar
          onWhatsApp={handleWhatsApp}
          onEmail={handleEmail}
          onCopyLink={onGetShareUrl ? handleCopyLink : undefined}
          onPDF={onOpenDocument ? handlePDF : undefined}
          disabled={working || isSaving}
        />
      </div>

      {/* Guardar */}
      {!savedId ? (
        <button onClick={async () => { const id = await onSave(); if (id) setSavedId(id); }}
          disabled={isSaving || working}
          style={{ width: '100%', height: 52, border: 'none', background: '#0F172A', color: '#fff', fontWeight: 700, fontSize: 16, borderRadius: 14, cursor: 'pointer', opacity: isSaving ? .7 : 1 }}>
          {isSaving ? 'Guardando...' : `Guardar ${entityLabel.toLowerCase()}`}
        </button>
      ) : (
        <div style={{ textAlign: 'center', padding: '14px 0', fontSize: 14.5, color: '#22C55E', fontWeight: 700 }}>
          ✓ {entityLabel} guardado exitosamente
        </div>
      )}
    </div>
  );
}
