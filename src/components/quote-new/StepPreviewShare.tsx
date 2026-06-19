import { useState } from 'react';
import { Edit2, ChevronDown } from 'lucide-react';
import { computeTotals, type QuoteItem, type LaborItem, type CostConfig } from '../../lib/itemEngine';
import { PDFPreviewRenderer } from './PDFPreviewRenderer';
import { getOrCreateQuoteToken } from '../../services/publicPortal';
import { useUI } from '../../features/app/UIProvider';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useToast } from '../ui/Toast';
import { formatCurrencyCOP } from '../../lib/currency';
import { shareByEmail, openWhatsAppShare } from '../../lib/shareUtils';
import { ShareBar } from '../ui/ShareBar';

interface Props {
  items: QuoteItem[];
  laborItems?: LaborItem[];
  config: CostConfig;
  clientName: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  quoteName: string;
  quoteNumber?: string;
  onChangeQuoteName: (name: string) => void;
  onSave: () => Promise<string | null>;
  isSaving: boolean;
}

export function StepPreviewShare({
  items, laborItems = [], config, clientName, clientPhone, clientEmail, quoteName, quoteNumber,
  onChangeQuoteName, onSave, isSaving,
}: Props) {
  const { openDocument } = useUI();
  const { company } = useWorkspace();
  const { showToast } = useToast();
  const [savedId, setSavedId] = useState<string | null>(null);
  const [, setLinkCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [working, setWorking] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const totals = computeTotals(items, config, laborItems);
  const fmt = formatCurrencyCOP;

  async function ensureSaved(): Promise<string | null> {
    if (savedId) return savedId;
    const id = await onSave();
    if (id) setSavedId(id);
    return id;
  }

  async function getPublicUrl(quoteId: string): Promise<string> {
    const token = await getOrCreateQuoteToken(quoteId);
    return `${window.location.origin}/p/${token}`;
  }

  async function handleWhatsApp() {
    setWorking(true);
    try {
      const id = await ensureSaved();
      if (!id) return;
      const url = await getPublicUrl(id);
      openWhatsAppShare({
        clientName,
        projectName: quoteName,
        companyName: company?.name ?? '',
        publicUrl: url,
        total: totals.total,
        phone: clientPhone ?? undefined,
      });
    } catch { showToast('Error al generar link'); }
    finally { setWorking(false); }
  }

  async function handleEmail() {
    setWorking(true);
    try {
      const id = await ensureSaved();
      if (!id) return;
      const url = await getPublicUrl(id);
      // navigator.share() en mobile → selector nativo (Gmail, Outlook, Mail, etc.)
      // mailto: fallback en desktop
      await shareByEmail({
        clientName,
        projectName: quoteName,
        companyName: company?.name ?? '',
        publicUrl: url,
        total: totals.total,
        clientEmail: clientEmail ?? undefined,
      });
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') showToast('Error al abrir correo');
    }
    finally { setWorking(false); }
  }

  async function handleCopyLink() {
    setWorking(true);
    try {
      const id = await ensureSaved();
      if (!id) return;
      const url = await getPublicUrl(id);
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      showToast('Link copiado al portapapeles ✓');
      setTimeout(() => setLinkCopied(false), 3000);
    } catch { showToast('Error al copiar link'); }
    finally { setWorking(false); }
  }


  async function handleSaveOnly() {
    const id = await onSave();
    if (id) setSavedId(id);
  }

  return (
    <div style={{ padding: '0 16px' }}>
      {/* Nombre de cotización editable */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Nombre de la cotización</div>
        {editingName ? (
          <input
            autoFocus value={quoteName}
            onChange={e => onChangeQuoteName(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={e => e.key === 'Enter' && setEditingName(false)}
            style={{ width: '100%', fontSize: 16, fontWeight: 700, border: 'none', outline: 'none', borderBottom: '2px solid #2563EB', paddingBottom: 4, fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', flex: 1 }}>{quoteName || 'Sin nombre'}</span>
            <button onClick={() => setEditingName(true)} style={{ border: '1px solid #E2E8F0', background: '#F8FAFC', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', color: '#475569' }}>
              <Edit2 size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Toggle vista previa */}
      <button
        onClick={() => setPreviewOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, cursor: 'pointer', marginBottom: previewOpen ? 0 : 14, fontFamily: 'inherit', borderBottomLeftRadius: previewOpen ? 0 : 14, borderBottomRightRadius: previewOpen ? 0 : 14 }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Vista previa del documento</span>
        <ChevronDown size={16} color="#64748B" style={{ transform: previewOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>

      {previewOpen && (
        <div style={{ border: '1px solid #E2E8F0', borderTop: 'none', borderRadius: '0 0 14px 14px', overflow: 'hidden', marginBottom: 14, maxHeight: '60vh', overflowY: 'auto' }}>
          <PDFPreviewRenderer
            items={items} laborItems={laborItems} config={config}
            clientName={clientName} quoteName={quoteName}
            quoteNumber={quoteNumber}
            company={company ?? undefined}
          />
        </div>
      )}

      {/* Resumen rápido */}
      {!previewOpen && (
        <div style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', borderRadius: 16, padding: '16px 18px', marginBottom: 14, color: '#fff' }}>
          <div style={{ fontSize: 12, opacity: .8, marginBottom: 4 }}>Total de la cotización</div>
          <div style={{ fontSize: 30, fontWeight: 900, fontVariantNumeric: 'tabular-nums', letterSpacing: '-1px' }}>{fmt(totals.total)}</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, opacity: .8 }}>
            <span>{items.length} ítem{items.length !== 1 ? 's' : ''}</span>
            {clientName && <span>· {clientName}</span>}
          </div>
        </div>
      )}

      {/* Barra de compartir */}
      <div style={{ marginBottom: 14 }}>
        <ShareBar
          onWhatsApp={handleWhatsApp}
          onEmail={handleEmail}
          onCopyLink={handleCopyLink}
          onPDF={async () => {
            // Guardar primero si no está guardado, luego abrir overlay para imprimir
            const id = await ensureSaved();
            if (id) openDocument(id);
          }}
          disabled={working || isSaving}
        />
      </div>

      {/* Guardar */}
      {!savedId ? (
        <button
          onClick={handleSaveOnly}
          disabled={isSaving || working}
          style={{ width: '100%', height: 52, border: 'none', background: '#0F172A', color: '#fff', fontWeight: 700, fontSize: 16, borderRadius: 14, cursor: 'pointer', opacity: isSaving ? .7 : 1 }}
        >
          {isSaving ? 'Guardando...' : 'Guardar cotización'}
        </button>
      ) : (
        <div style={{ textAlign: 'center', padding: '14px 0', fontSize: 14.5, color: '#22C55E', fontWeight: 700 }}>
          ✓ Cotización guardada exitosamente
        </div>
      )}
    </div>
  );
}

