/**
 * DesdeImagenPage — /app/ia/desde-imagen
 *
 * Asistente IA de nivel Enterprise para crear documentos desde fotografías.
 *
 * ─── ARQUITECTURA ──────────────────────────────────────────────────────────────
 * Flujo:  selector → cámara → procesando → resultados → vista previa → completo
 *
 * FASE 1: La IA extrae TODA la información visible de la imagen.
 * FASE 2: Se compara con catálogo y clientes del workspace vía RLS.
 *
 * ─── CAUSA RAÍZ (BUGS CORREGIDOS) ─────────────────────────────────────────────
 * BUG 1 — Reselección mismo archivo: el browser no dispara onChange al elegir
 *   el mismo fichero si el input no fue re-montado. FIX: key counter incremental
 *   en el <input type="file"> fuerza un nuevo elemento DOM en cada uso.
 *
 * BUG 2 — Catalog/clients stale: después de crear cliente/producto, los arrays
 *   en memoria son obsoletos. FIX: refetch después de cada creación.
 *
 * ─── ZERO TRUST ────────────────────────────────────────────────────────────────
 * - ai-proxy valida JWT y obtiene workspace_id del perfil (nunca del frontend)
 * - Catálogo y clientes cargados vía RLS del workspace autenticado
 * - Ninguna entidad se crea automáticamente — siempre confirmación explícita
 * - workspace_id del JWT vía useWorkspace(), nunca hardcodeado
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate }            from 'react-router-dom';
import {
  ArrowLeft, Camera, Image as ImageIcon, FileText, Package,
  CheckCircle2, Loader2, ChevronRight, User, AlertTriangle,
  Eye, Clock, Zap, Plus, XCircle, Search, Sparkles,
  RotateCcw, Shield, Bot, CheckCheck,
} from 'lucide-react';
import { useWorkspace }           from '../features/auth/WorkspaceProvider';
import { useAuth }                from '../features/auth/AuthProvider';
import { useAICredits, useInvalidateAICredits } from '../hooks/useAICredits';
import { isAICreditsExhausted, isAIPlanNotIncluded } from '../services/aiStudio';
import {
  fetchCatalogContext, fetchClientsContext, createDirectOrder,
  type CatalogContextItem, type ClientContextItem, type IAItemResult,
} from '../services/iaCrear';
import {
  compressImage, extractFromImage,
  type VisionExtractResult, type VisionItem,
} from '../services/desdeImagen';
import {
  computeItemSubtotal, DEFAULT_COST_CONFIG,
  type QuoteItem, type CostConfig,
} from '../lib/itemEngine';
import { createCatalogItem, type CatalogItem } from '../services/catalogItems';
import { ClientQuickCreateSheet }     from '../components/clients/ClientQuickCreateSheet';
import { PDFPreviewRenderer }         from '../components/quote-new/PDFPreviewRenderer';
import { NotificationBell }           from '../components/ui/NotificationBell';
import { useToast }                   from '../components/ui/Toast';
import { formatCurrencyCOP }          from '../lib/currency';
import {
  useIADraftAutosave, loadIADraft, clearIADraft, saveIADraft,
  draftRelativeTime,
  type IADraftItem, type IADraftDocType,
} from '../hooks/useIADraft';
import type { Client } from '../lib/types';

// ─── Paleta ───────────────────────────────────────────────────────────────────

const C = {
  purple:      '#7C3AED',
  purpleDark:  '#6D28D9',
  purpleBg:    '#F5F3FF',
  purpleText:  '#5B21B6',
  text:        '#0F172A',
  sub:         '#64748B',
  border:      '#E2E8F0',
  bg:          '#F8FAFC',
  white:       '#FFFFFF',
  green:       '#16A34A',
  greenBg:     '#F0FDF4',
  orange:      '#EA580C',
  orangeBg:    '#FFF7ED',
  blue:        '#2563EB',
  blueBg:      '#EFF6FF',
  amber:       '#D97706',
  amberBg:     '#FFFBEB',
};

// ─── CSS global ───────────────────────────────────────────────────────────────

const GLOBAL_CSS = `
  @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin    { to{transform:rotate(360deg)} }
  @keyframes slideIn { from{transform:translateY(100%)} to{transform:translateY(0)} }
`;

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Step     = 'selector' | 'camera' | 'processing' | 'results' | 'preview';
type DocType  = IADraftDocType;
type ResolvedItem = IADraftItem;

interface TimelineEntry {
  id:     string;
  label:  string;
  status: 'pending' | 'running' | 'done';
}

interface ProcessingStepUI {
  id:     string;
  label:  string;
  status: 'pending' | 'running' | 'done';
}

interface PageState {
  step:            Step;
  docType:         DocType | null;
  imageFile:       File | null;
  imageUrl:        string | null;
  imageBase64:     string | null;
  processingSteps: ProcessingStepUI[];
  processingPct:   number;
  timeline:        TimelineEntry[];
  extractResult:   VisionExtractResult | null;
  resolvedItems:   ResolvedItem[];
}

const TIMELINE_ENTRIES: TimelineEntry[] = [
  { id: 'recv',     label: 'Imagen recibida',     status: 'pending' },
  { id: 'ocr',      label: 'IA analizando',        status: 'pending' },
  { id: 'client',   label: 'Cliente detectado',    status: 'pending' },
  { id: 'products', label: 'Productos detectados', status: 'pending' },
  { id: 'match_c',  label: 'Cliente asociado',     status: 'pending' },
  { id: 'match_p',  label: 'Productos asociados',  status: 'pending' },
  { id: 'doc',      label: 'Documento generado',   status: 'pending' },
  { id: 'ready',    label: 'Listo',                status: 'pending' },
];

const INIT_PROCESSING: ProcessingStepUI[] = [
  { id: 'ocr',        label: 'Leyendo texto (OCR)',         status: 'pending' },
  { id: 'products',   label: 'Identificando productos',      status: 'pending' },
  { id: 'quantities', label: 'Reconociendo cantidades',      status: 'pending' },
  { id: 'client',     label: 'Detectando datos del cliente', status: 'pending' },
  { id: 'validation', label: 'Validando información',        status: 'pending' },
];

const INIT_STATE: PageState = {
  step:            'selector',
  docType:         null,
  imageFile:       null,
  imageUrl:        null,
  imageBase64:     null,
  processingSteps: INIT_PROCESSING,
  processingPct:   0,
  timeline:        TIMELINE_ENTRIES,
  extractResult:   null,
  resolvedItems:   [],
};

const UNIT_OPTIONS = ['und', 'm²', 'm', 'kg', 'L', 'hrs', 'días', 'mes', 'global', 'caja', 'rollo', 'par', 'kit'];

// ─── Helpers visuales ─────────────────────────────────────────────────────────

function ConfBadge({ pct }: { pct: number }) {
  const color = pct >= 85 ? C.green : pct >= 65 ? C.amber : '#DC2626';
  const bg    = pct >= 85 ? C.greenBg : pct >= 65 ? C.amberBg : '#FEF2F2';
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, background: bg, padding: '2px 7px', borderRadius: 99, flexShrink: 0 }}>
      {pct}%
    </span>
  );
}

function StatusBadge({ found }: { found: boolean }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: found ? C.greenBg : C.orangeBg, color: found ? C.green : C.orange, flexShrink: 0 }}>
      {found ? '✓ En Shelwi' : '+ Sin catálogo'}
    </span>
  );
}

// ─── PageHeader ───────────────────────────────────────────────────────────────

function PageHeader({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 20, background: C.white, borderBottom: `1px solid ${C.border}`, padding: '0 16px', height: 56, display: 'flex', alignItems: 'center', gap: 12 }}>
      <button onClick={onBack} aria-label="Volver" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 6, display: 'flex', color: C.text }}>
        <ArrowLeft size={22} />
      </button>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: C.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>S</div>
        <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{title}</span>
      </div>
      <NotificationBell />
    </header>
  );
}

function BottomAction({ children, onBack }: { children: React.ReactNode; onBack?: () => void }) {
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 45, background: C.white, borderTop: `1px solid ${C.border}`, padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {children}
      {onBack && (
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: C.sub, padding: '4px 0', alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} /> Volver
        </button>
      )}
    </div>
  );
}

// ─── Modal: Descartar borrador ────────────────────────────────────────────────

function DiscardModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <>
      <div onClick={onCancel} aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,.5)' }} />
      <div role="dialog" aria-modal="true" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 71, background: C.white, borderRadius: '20px 20px 0 0', padding: '28px 20px', paddingBottom: 'calc(28px + env(safe-area-inset-bottom))' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.orangeBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={24} color={C.orange} />
          </div>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 6 }}>¿Descartar trabajo?</div>
          <p style={{ fontSize: 14, color: C.sub, margin: 0, lineHeight: 1.5 }}>Se eliminará el análisis IA en curso. Esta acción no se puede deshacer.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={onCancel}  style={{ width: '100%', padding: '14px', border: 'none', borderRadius: 14, background: C.purple, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>Seguir editando</button>
          <button onClick={onConfirm} style={{ width: '100%', padding: '14px', border: `1.5px solid ${C.border}`, borderRadius: 14, background: C.white, color: C.orange, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Sí, descartar</button>
        </div>
      </div>
    </>
  );
}

// ─── Modal: Continuar borrador ────────────────────────────────────────────────

function ResumeDraftModal({ draft, onContinue, onDiscard }: {
  draft:      { savedAt: string; docType: DocType | null; itemCount: number; clientName: string };
  onContinue: () => void;
  onDiscard:  () => void;
}) {
  const label = draft.docType === 'cotizacion' ? 'Cotización' : draft.docType === 'pedido' ? 'Pedido' : 'Documento';
  return (
    <>
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,.5)' }} />
      <div role="dialog" aria-modal="true" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 71, background: C.white, borderRadius: '20px 20px 0 0', padding: '24px 20px', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))', animation: 'slideIn .28s ease' }}>
        <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: C.purpleBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bot size={24} color={C.purple} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Análisis IA sin finalizar</div>
            <div style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>{label} · {draft.itemCount} producto{draft.itemCount !== 1 ? 's' : ''} · {draftRelativeTime(draft.savedAt)}</div>
            {draft.clientName && <div style={{ fontSize: 12.5, color: C.purple, marginTop: 1, fontWeight: 600 }}>Cliente: {draft.clientName}</div>}
          </div>
        </div>
        <div style={{ background: C.purpleBg, borderRadius: 12, padding: '10px 13px', marginBottom: 16, display: 'flex', gap: 8 }}>
          <Shield size={14} color={C.purple} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: C.purpleText, margin: 0, lineHeight: 1.5 }}>Tu trabajo está guardado automáticamente. Puedes continuar desde donde lo dejaste.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={onContinue} style={{ width: '100%', padding: '14px', border: 'none', borderRadius: 14, background: C.purple, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <RotateCcw size={17} /> Continuar análisis
          </button>
          <button onClick={onDiscard} style={{ width: '100%', padding: '12px', border: `1.5px solid ${C.border}`, borderRadius: 14, background: C.white, color: C.orange, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            Descartar y empezar nuevo
          </button>
        </div>
      </div>
    </>
  );
}

// ─── PASO 1: Selector — rediseño pixel-perfect ───────────────────────────────

function SelectorStep({
  docType, onDocType, onCamera, onGallery, onBack,
  hasDraft, draftSavedAt, draftItemCount, draftClientName, draftDocType,
  onResumeDraft, onDiscardDraft,
}: {
  docType: DocType | null; onDocType: (t: DocType) => void;
  onCamera: () => void; onGallery: (file: File) => void; onBack: () => void;
  hasDraft: boolean; draftSavedAt: string; draftItemCount: number;
  draftClientName: string; draftDocType: DocType | null;
  onResumeDraft: () => void; onDiscardDraft: () => void;
}) {
  // BUG FIX: key counter — fuerza re-mount del <input> → mismo archivo re-seleccionable
  const [inputKey, setInputKey] = useState(0);

  function handleGalleryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) { onGallery(file); setInputKey(k => k + 1); }
  }

  const canCapture = !!docType;

  return (
    <div style={{ background: C.bg, minHeight: '100dvh', animation: 'fadeUp .22s ease' }}>
      <PageHeader onBack={onBack} title="Desde foto" />
      <div style={{ padding: '16px 16px 140px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Hero */}
        <div style={{ background: `linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)`, borderRadius: 20, padding: '20px 18px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.purple, color: '#fff', borderRadius: 99, padding: '3px 10px', fontSize: 11, fontWeight: 800, marginBottom: 10 }}>
            <Sparkles size={11} /> NUEVO
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: C.text, lineHeight: 1.1, marginBottom: 8 }}>
                Desde foto <span style={{ fontSize: 24 }}>📷</span>
              </div>
              <p style={{ fontSize: 13, color: C.sub, margin: '0 0 12px', lineHeight: 1.5 }}>
                La IA detecta productos, cantidades y cliente desde cualquier imagen{' '}
                <strong style={{ color: C.purple }}>al instante</strong>.
              </p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(124,58,237,.1)', borderRadius: 99, padding: '4px 10px' }}>
                <Zap size={12} color={C.purple} />
                <span style={{ fontSize: 11.5, color: C.purpleText, fontWeight: 700 }}>
                  Más rápido, más preciso, <span style={{ color: C.purple }}>más inteligente</span>
                </span>
              </div>
            </div>
            {/* Ilustración decorativa */}
            <div style={{ flexShrink: 0, width: 64, height: 68, position: 'relative' }}>
              <div style={{ width: 52, height: 64, background: C.white, borderRadius: 10, boxShadow: '0 4px 16px rgba(124,58,237,.2)', display: 'flex', flexDirection: 'column', padding: 6, gap: 3 }}>
                {[1, 0.7, 0.5, 0.7, 0.5].map((w, i) => (
                  <div key={i} style={{ height: 4, borderRadius: 2, background: '#E2E8F0', width: `${w * 100}%` }} />
                ))}
              </div>
              <div style={{ position: 'absolute', bottom: -4, right: -8, width: 28, height: 28, borderRadius: '50%', background: C.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 12px ${C.purple}66` }}>
                <Bot size={14} color="#fff" />
              </div>
            </div>
          </div>
        </div>

        {/* Centro de Actividad IA */}
        {hasDraft && (
          <div style={{ background: C.white, borderRadius: 16, border: `1.5px solid ${C.purple}40`, padding: '14px 16px', boxShadow: '0 2px 12px rgba(124,58,237,.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: C.purpleBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Bot size={18} color={C.purple} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>🤖 Análisis IA en progreso</div>
                <div style={{ fontSize: 12, color: C.sub }}>
                  {draftDocType === 'cotizacion' ? 'Cotización' : 'Pedido'} · {draftItemCount} producto{draftItemCount !== 1 ? 's' : ''}{draftSavedAt ? ` · ${draftRelativeTime(draftSavedAt)}` : ''}
                  {draftClientName ? ` · ${draftClientName}` : ''}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: C.amberBg, color: C.amber }}>⏳ Pendiente</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onResumeDraft} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 12, background: C.purple, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <RotateCcw size={14} /> Continuar
              </button>
              <button onClick={onDiscardDraft} style={{ flex: 1, padding: '10px', border: `1.5px solid ${C.border}`, borderRadius: 12, background: C.white, color: C.orange, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                Descartar
              </button>
            </div>
          </div>
        )}

        {/* 1. ¿Qué deseas crear? */}
        <div style={{ background: C.white, borderRadius: 16, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', border: `2px solid ${C.purple}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.purple }}>1</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>¿Qué deseas crear?</span>
          </div>
          <p style={{ fontSize: 12.5, color: C.sub, margin: '0 0 12px 36px' }}>Elige el tipo de documento <strong>que quieres generar</strong>.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            {([
              { id: 'cotizacion' as DocType, icon: <FileText size={22} color={docType === 'cotizacion' ? '#fff' : C.purple} />, label: 'Cotización', desc: 'Genera una cotización para tu cliente' },
              { id: 'pedido'     as DocType, icon: <Package   size={22} color={docType === 'pedido'     ? '#fff' : C.purple} />, label: 'Pedido',     desc: 'Crea un pedido directo al instante' },
            ]).map(opt => {
              const active = docType === opt.id;
              return (
                <button key={opt.id} onClick={() => onDocType(opt.id)} style={{ flex: 1, padding: '14px 10px', borderRadius: 14, cursor: 'pointer', border: `2px solid ${active ? C.purple : C.border}`, background: active ? C.purple : C.white, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, transition: 'all .16s', textAlign: 'left' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: active ? 'rgba(255,255,255,.2)' : C.purpleBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {opt.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: active ? '#fff' : C.text, marginBottom: 2 }}>{opt.label}</div>
                    <div style={{ fontSize: 11.5, color: active ? 'rgba(255,255,255,.8)' : C.sub, lineHeight: 1.4 }}>{opt.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. ¿Cómo agregas la imagen? */}
        <div style={{ background: C.white, borderRadius: 16, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', opacity: canCapture ? 1 : .55, transition: 'opacity .2s', pointerEvents: canCapture ? 'auto' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', border: `2px solid ${canCapture ? C.purple : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: canCapture ? C.purple : C.border }}>2</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>¿Cómo agregas la imagen?</span>
          </div>
          <p style={{ fontSize: 12.5, color: C.sub, margin: '0 0 14px 36px' }}>Puedes tomar una foto o elegir desde tu galería.</p>
          <div style={{ display: 'flex', gap: 14 }}>
            <button onClick={onCamera} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 8px', borderRadius: 14, border: `1.5px solid ${C.border}`, background: C.white, cursor: 'pointer' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.purpleBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Camera size={26} color={C.purple} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text }}>Tomar foto</div>
                <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2, lineHeight: 1.4 }}>Usa la cámara para<br/>capturar la imagen</div>
              </div>
            </button>
            {/* Galería: sin atributo capture → selector nativo del sistema */}
            <button onClick={() => document.getElementById(`ia-gallery-${inputKey}`)?.click()} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 8px', borderRadius: 14, border: `1.5px solid ${C.border}`, background: C.white, cursor: 'pointer' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.blueBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ImageIcon size={26} color={C.blue} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text }}>Galería</div>
                <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2, lineHeight: 1.4 }}>Elige una imagen desde<br/>tu dispositivo</div>
              </div>
            </button>
          </div>
        </div>

        {/* Info strip */}
        <div style={{ background: C.white, borderRadius: 16, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <Sparkles size={14} color={C.purple} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>La IA analizará la imagen y detectará:</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
            {[{ e: '📦', l: 'Productos' }, { e: '🔢', l: 'Cantidades' }, { e: '💲', l: 'Precios' }, { e: '👤', l: 'Cliente' }].map(t => (
              <div key={t.l} style={{ display: 'flex', alignItems: 'center', gap: 5, background: C.purpleBg, borderRadius: 99, padding: '5px 11px' }}>
                <span style={{ fontSize: 13 }}>{t.e}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.purpleText }}>{t.l}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: C.sub, margin: 0, lineHeight: 1.5 }}>
            Más rápido, más preciso y con la <span style={{ color: C.purple, fontWeight: 700 }}>inteligencia de Shelwi</span>.
          </p>
        </div>
      </div>

      {/* BUG FIX: key cambia → nuevo elemento DOM → mismo archivo re-seleccionable */}
      <input key={inputKey} id={`ia-gallery-${inputKey}`} type="file" accept="image/*" onChange={handleGalleryChange} style={{ display: 'none' }} aria-hidden="true" />
      <style>{GLOBAL_CSS}</style>
    </div>
  );
}

// ─── PASO 2: Cámara ───────────────────────────────────────────────────────────

function CameraStep({ onCapture, onBack }: { onCapture: (file: File) => void; onBack: () => void }) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const [fbKey, setFbKey]         = useState(0);
  const [ready, setReady]         = useState(false);
  const [permDenied, setPermDenied] = useState(false);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    let mounted = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then(stream => {
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setReady(true);
      })
      .catch(() => { if (mounted) setPermDenied(true); });
    return () => { mounted = false; streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || capturing) return;
    setCapturing(true);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) { setCapturing(false); return; }
      streamRef.current?.getTracks().forEach(t => t.stop());
      onCapture(new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  }, [onCapture, capturing]);

  function onFbChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) { streamRef.current?.getTracks().forEach(t => t.stop()); onCapture(file); }
    setFbKey(k => k + 1);
  }

  if (permDenied) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', zIndex: 50 }}>
        <div style={{ padding: '14px 16px', paddingTop: 'calc(14px + env(safe-area-inset-top))', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={{ border: 'none', background: 'rgba(255,255,255,.12)', borderRadius: 8, cursor: 'pointer', padding: 8, display: 'flex' }}><ArrowLeft size={20} color="#fff" /></button>
          <span style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 16, color: '#fff' }}>Cámara</span>
          <div style={{ width: 36 }} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 48 }}>🔐</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Permiso de cámara necesario</div>
          <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,.7)', lineHeight: 1.6, maxWidth: 280 }}>Habilita el acceso en configuración o selecciona una imagen de galería.</p>
          <button onClick={() => fallbackRef.current?.click()} style={{ background: C.purple, border: 'none', color: '#fff', fontWeight: 700, fontSize: 15, padding: '14px 28px', borderRadius: 14, cursor: 'pointer', width: '100%', maxWidth: 280 }}>📁 Elegir desde galería</button>
          <button onClick={onBack} style={{ background: 'none', border: '1.5px solid rgba(255,255,255,.3)', color: '#fff', fontWeight: 600, fontSize: 14, padding: '12px 24px', borderRadius: 12, cursor: 'pointer', width: '100%', maxWidth: 280 }}>← Volver</button>
        </div>
        <input key={fbKey} ref={fallbackRef} type="file" accept="image/*" onChange={onFbChange} style={{ display: 'none' }} aria-hidden="true" />
        <style>{GLOBAL_CSS}</style>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', zIndex: 50 }}>
      <div style={{ padding: '14px 16px', paddingTop: 'calc(14px + env(safe-area-inset-top))', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{ border: 'none', background: 'rgba(255,255,255,.12)', borderRadius: 8, cursor: 'pointer', padding: 8, display: 'flex' }}><ArrowLeft size={20} color="#fff" /></button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Tomar foto</div>
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.6)', marginTop: 1 }}>Encuadra el documento y presiona capturar</div>
        </div>
        <div style={{ width: 36 }} />
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: ready ? 'block' : 'none' }} />
        {!ready && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 size={36} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        )}
        {ready && ([
          { top: 20, left: 20,   bT: '3px solid #fff', bL: '3px solid #fff', bR: 'none',          bB: 'none',          r: '4px 0 0 0' },
          { top: 20, right: 20,  bT: '3px solid #fff', bL: 'none',           bR: '3px solid #fff', bB: 'none',          r: '0 4px 0 0' },
          { bottom: 20, left: 20,  bT: 'none', bL: '3px solid #fff', bR: 'none',          bB: '3px solid #fff', r: '0 0 0 4px' },
          { bottom: 20, right: 20, bT: 'none', bL: 'none',           bR: '3px solid #fff', bB: '3px solid #fff', r: '0 0 4px 0' },
        ] as const).map((g, i) => (
          <div key={i} style={{ position: 'absolute', top: 'top' in g ? g.top : undefined, right: 'right' in g ? g.right : undefined, bottom: 'bottom' in g ? g.bottom : undefined, left: 'left' in g ? g.left : undefined, width: 28, height: 28, borderTop: g.bT, borderRight: g.bR, borderBottom: g.bB, borderLeft: g.bL, borderRadius: g.r }} />
        ))}
      </div>
      <div style={{ padding: '18px 32px', paddingBottom: 'calc(18px + env(safe-area-inset-bottom))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={() => fallbackRef.current?.click()} aria-label="Galería" style={{ width: 48, height: 48, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ImageIcon size={22} color="#fff" />
        </button>
        <button onClick={capture} disabled={!ready || capturing} aria-label="Capturar" style={{ width: 72, height: 72, borderRadius: '50%', border: `4px solid ${C.purple}`, background: 'rgba(124,58,237,.15)', cursor: ready && !capturing ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: ready && !capturing ? C.purple : 'rgba(255,255,255,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .2s' }}>
            {capturing && <Loader2 size={22} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />}
          </div>
        </button>
        <div style={{ width: 48 }} />
      </div>
      <input key={fbKey} ref={fallbackRef} type="file" accept="image/*" onChange={onFbChange} style={{ display: 'none' }} aria-hidden="true" />
      <style>{GLOBAL_CSS}</style>
    </div>
  );
}

// ─── PASO 3: Procesando ───────────────────────────────────────────────────────

function ProcessingStep({ steps, pct, imageUrl, timeline }: { steps: ProcessingStepUI[]; pct: number; imageUrl: string | null; timeline: TimelineEntry[] }) {
  const radius = 52; const circ = 2 * Math.PI * radius;
  return (
    <div style={{ background: C.bg, minHeight: '100dvh', animation: 'fadeUp .22s ease' }}>
      <PageHeader onBack={() => {}} title="Analizando..." />
      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, textAlign: 'center', margin: '0 0 4px' }}>Analizando imagen</h1>
          <p style={{ fontSize: 13, color: C.sub, textAlign: 'center', margin: 0 }}>La IA extrae toda la información visible...</p>
        </div>
        <div style={{ position: 'relative', width: 136, height: 136, alignSelf: 'center' }}>
          <svg width={136} height={136} viewBox="0 0 136 136">
            <circle cx={68} cy={68} r={radius} fill="none" stroke="#E2E8F0" strokeWidth={10} />
            <circle cx={68} cy={68} r={radius} fill="none" stroke={C.purple} strokeWidth={10} strokeDasharray={`${circ * pct / 100} ${circ}`} strokeLinecap="round" transform="rotate(-90 68 68)" style={{ transition: 'stroke-dasharray .5s ease' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {imageUrl ? <img src={imageUrl} alt="" style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover' }} /> : <span style={{ fontSize: 24, fontWeight: 800, color: C.text }}>{pct}%</span>}
          </div>
        </div>
        <div style={{ background: C.white, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          {steps.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: i < steps.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {s.status === 'done'    && <CheckCircle2 size={22} color={C.green} />}
                {s.status === 'running' && <Loader2 size={20} color={C.purple} style={{ animation: 'spin 1s linear infinite' }} />}
                {s.status === 'pending' && <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${C.border}` }} />}
              </div>
              <span style={{ fontSize: 14, fontWeight: s.status === 'running' ? 700 : 500, color: s.status === 'pending' ? C.sub : C.text }}>{s.label}</span>
            </div>
          ))}
        </div>
        {/* Timeline */}
        <div style={{ background: C.white, borderRadius: 16, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>Timeline del proceso</div>
          {timeline.map((entry, i) => (
            <div key={entry.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: entry.status === 'done' ? C.green : entry.status === 'running' ? C.purple : C.border, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                  {entry.status === 'done'    && <CheckCheck size={10} color="#fff" />}
                  {entry.status === 'running' && <Loader2 size={10} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />}
                  {entry.status === 'pending' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                </div>
                {i < timeline.length - 1 && <div style={{ width: 2, height: 18, background: entry.status === 'done' ? C.green : C.border }} />}
              </div>
              <div style={{ paddingBottom: i < timeline.length - 1 ? 2 : 0, paddingTop: 1 }}>
                <span style={{ fontSize: 12.5, fontWeight: entry.status !== 'pending' ? 600 : 400, color: entry.status === 'done' ? C.text : entry.status === 'running' ? C.purple : C.sub }}>{entry.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <style>{GLOBAL_CSS}</style>
    </div>
  );
}

// ─── PASO 4: Resultados ───────────────────────────────────────────────────────

function ResultsStep({ result, items, imageUrl, onContinue, onBack, onCreateClient, onOpenProductSheet, onSkipProduct, onSearchSimilar }: {
  result: VisionExtractResult; items: ResolvedItem[]; imageUrl: string | null;
  onContinue: () => void; onBack: () => void; onCreateClient: () => void;
  onOpenProductSheet: (item: VisionItem) => void; onSkipProduct: (name: string) => void; onSearchSimilar: (name: string) => void;
}) {
  const foundCount    = items.filter(i => i.found_in_catalog).length;
  const skippedCount  = items.filter(i => i.resolution === 'skip').length;
  const automationPct = items.length > 0 ? Math.round((foundCount / items.length) * 100) : 0;
  const timeStr       = result.processing_time_ms ? `${(result.processing_time_ms / 1000).toFixed(1)}s` : null;

  return (
    <div style={{ background: C.bg, minHeight: '100dvh', animation: 'fadeUp .22s ease' }}>
      <PageHeader onBack={onBack} title="Resultados IA" />
      <div style={{ padding: '16px 16px 170px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Resumen premium */}
        <div style={{ background: `linear-gradient(135deg, ${C.purple}, ${C.purpleDark})`, borderRadius: 18, padding: '16px', color: '#fff', boxShadow: `0 8px 24px -4px ${C.purple}66` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={17} color="#fff" />
              <span style={{ fontSize: 14, fontWeight: 800 }}>IA completó el análisis</span>
            </div>
            {timeStr && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,.15)', borderRadius: 99, padding: '3px 8px' }}>
                <Clock size={12} color="#fff" />
                <span style={{ fontSize: 11.5, fontWeight: 700 }}>{timeStr}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, marginBottom: imageUrl ? 12 : 0 }}>
            {[
              { label: 'Confianza',  value: `${result.confidence_pct}%` },
              { label: 'Detectados', value: String(items.length) },
              { label: 'Encontrados',value: String(foundCount) },
              { label: 'Automático', value: `${automationPct}%` },
            ].map(m => (
              <div key={m.label} style={{ background: 'rgba(255,255,255,.13)', borderRadius: 10, padding: '9px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1 }}>{m.value}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.75)', marginTop: 2, fontWeight: 600 }}>{m.label}</div>
              </div>
            ))}
          </div>
          {imageUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={imageUrl} alt="Imagen analizada" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', border: '2px solid rgba(255,255,255,.3)', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.8)', fontWeight: 600 }}>Imagen analizada</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', marginTop: 1 }}>
                  {skippedCount > 0 ? `${skippedCount} omitido${skippedCount > 1 ? 's' : ''}` : 'Todo incluido'} · 🤖 {automationPct}% automático
                </div>
              </div>
            </div>
          )}
        </div>

        {/* BLOQUE 1: Información detectada */}
        <div style={{ background: C.white, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <div style={{ padding: '12px 16px 10px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15 }}>✨</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Información detectada por la IA</span>
          </div>
          {/* Cliente */}
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <User size={13} color={C.sub} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '.4px' }}>Cliente</span>
              {result.client_confidence_pct > 0 && <ConfBadge pct={result.client_confidence_pct} />}
            </div>
            {result.client_name ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{result.client_name}</div>
                {result.client_phone   && <div style={{ fontSize: 12.5, color: C.sub }}>📞 {result.client_phone}</div>}
                {result.client_email   && <div style={{ fontSize: 12.5, color: C.sub }}>✉️ {result.client_email}</div>}
                {result.client_address && <div style={{ fontSize: 12.5, color: C.sub }}>📍 {result.client_address}</div>}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: C.sub, fontStyle: 'italic' }}>No se detectó cliente en la imagen</div>
            )}
          </div>
          {/* Productos */}
          <div style={{ padding: '10px 16px 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Package size={13} color={C.sub} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '.4px' }}>Productos detectados ({items.length})</span>
            </div>
          </div>
          {items.length === 0 ? (
            <div style={{ padding: '8px 16px 14px', fontSize: 13, color: C.sub, fontStyle: 'italic' }}>No se detectaron productos</div>
          ) : items.map((item, i) => (
            <div key={i} style={{ padding: '10px 16px', borderTop: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, flex: 1 }}>{item.detected_name}</div>
                {item.confidence_pct > 0 && <ConfBadge pct={item.confidence_pct} />}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                <span style={{ fontSize: 12, color: C.sub }}>×{item.quantity} {item.unit}</span>
                {item.price_visible !== null && <span style={{ fontSize: 12, color: C.sub }}>· {formatCurrencyCOP(item.price_visible)}</span>}
                {item.brand         && <span style={{ fontSize: 12, color: C.sub }}>· {item.brand}</span>}
                {item.reference     && <span style={{ fontSize: 12, color: C.sub }}>· Ref: {item.reference}</span>}
                {item.model         && <span style={{ fontSize: 12, color: C.sub }}>· {item.model}</span>}
                {!!item.discount_visible && <span style={{ fontSize: 12, color: C.amber }}>· {item.discount_visible}% desc.</span>}
              </div>
              {item.observations && <div style={{ fontSize: 12, color: C.sub, fontStyle: 'italic', marginTop: 2 }}>{item.observations}</div>}
            </div>
          ))}
          {(result.total_visible !== null || result.date_visible) && (
            <div style={{ padding: '10px 16px 14px', borderTop: `1px solid ${C.border}`, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {result.date_visible      && <div style={{ fontSize: 12, color: C.sub }}>📅 {result.date_visible}</div>}
              {result.total_visible !== null && <div style={{ fontSize: 12, color: C.sub }}>Total: <strong>{formatCurrencyCOP(result.total_visible)}</strong></div>}
              {result.iva_visible !== null   && <div style={{ fontSize: 12, color: C.sub }}>IVA: {formatCurrencyCOP(result.iva_visible)}</div>}
            </div>
          )}
        </div>

        {/* BLOQUE 2: Estado en Shelwi */}
        <div style={{ background: C.white, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <div style={{ padding: '12px 16px 10px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15 }}>📦</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Estado en Shelwi</span>
          </div>
          {/* Cliente en Shelwi */}
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>Cliente</div>
            {!result.client_name ? (
              <div style={{ fontSize: 13, color: C.sub, fontStyle: 'italic' }}>Sin información detectada</div>
            ) : result.client_found ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <User size={17} color={C.green} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{result.client_name}</div>
                  <div style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>✓ Cliente existente en Shelwi</div>
                </div>
                <StatusBadge found={true} />
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.orangeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User size={17} color={C.orange} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{result.client_name}</div>
                    <div style={{ fontSize: 12, color: C.orange, fontWeight: 600 }}>⚠ No existe en Shelwi</div>
                  </div>
                </div>
                <button onClick={onCreateClient} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 14px', border: `1.5px solid ${C.purple}`, borderRadius: 12, background: C.purpleBg, color: C.purple, fontWeight: 700, fontSize: 13, cursor: 'pointer', width: '100%' }}>
                  <Plus size={16} /> Crear cliente con estos datos
                </button>
              </div>
            )}
          </div>
          {/* Productos en Shelwi */}
          {items.map((item, i) => (
            <div key={i} style={{ padding: '12px 16px', borderTop: i > 0 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: item.found_in_catalog || item.resolution === 'skip' ? 0 : 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: item.resolution === 'skip' ? C.sub : C.text, textDecoration: item.resolution === 'skip' ? 'line-through' : 'none' }}>{item.detected_name}</div>
                  <div style={{ fontSize: 12, color: C.sub, marginTop: 1 }}>×{item.quantity} {item.unit}</div>
                </div>
                {item.resolution === 'skip'
                  ? <span style={{ fontSize: 11, fontWeight: 700, color: C.sub, background: C.bg, padding: '3px 9px', borderRadius: 99 }}>Omitido</span>
                  : <StatusBadge found={item.found_in_catalog} />
                }
              </div>
              {item.found_in_catalog && item.resolution !== 'skip' && (
                <div style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>✓ Asociado → {item.service_name}</div>
              )}
              {!item.found_in_catalog && item.resolution !== 'skip' && (
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  <button onClick={() => onOpenProductSheet(item)} style={{ flex: 1, minWidth: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '9px 8px', border: `1.5px solid ${C.purple}`, borderRadius: 10, background: C.purpleBg, color: C.purple, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                    <Plus size={13} /> Crear
                  </button>
                  <button onClick={() => onSearchSimilar(item.detected_name)} style={{ flex: 1, minWidth: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '9px 8px', border: `1.5px solid ${C.border}`, borderRadius: 10, background: C.white, color: C.sub, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
                    <Search size={13} /> Buscar
                  </button>
                  <button onClick={() => onSkipProduct(item.detected_name)} style={{ flex: 1, minWidth: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '9px 8px', border: `1.5px solid ${C.border}`, borderRadius: 10, background: C.white, color: C.sub, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
                    <XCircle size={13} /> Omitir
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {result.warnings.length > 0 && (
          <div style={{ background: C.amberBg, border: `1px solid #FDE68A`, borderRadius: 14, padding: '12px 14px', display: 'flex', gap: 10 }}>
            <AlertTriangle size={17} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{result.warnings.map((w, i) => <p key={i} style={{ fontSize: 12.5, color: '#92400E', margin: i > 0 ? '4px 0 0' : 0 }}>{w}</p>)}</div>
          </div>
        )}
      </div>

      <BottomAction onBack={onBack}>
        <button onClick={onContinue} style={{ width: '100%', padding: '14px', border: 'none', borderRadius: 14, cursor: 'pointer', background: C.purple, color: '#fff', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: `0 8px 20px -6px ${C.purple}88` }}>
          Ver vista previa del documento <ChevronRight size={18} />
        </button>
      </BottomAction>
      <style>{GLOBAL_CSS}</style>
    </div>
  );
}

// ─── PASO 5: Vista previa PDF real ───────────────────────────────────────────

function PreviewStep({ result, items, docType, catalog, company, onConfirm, onBack, confirming }: {
  result: VisionExtractResult; items: ResolvedItem[]; docType: DocType;
  catalog: CatalogContextItem[]; company: Record<string, unknown>;
  onConfirm: () => void; onBack: () => void; confirming: boolean;
}) {
  const included = items.filter(i => i.resolution !== 'skip');
  const quoteItems: QuoteItem[] = included.map((item, idx) => {
    const cat = catalog.find(c => c.id === item.service_id);
    const unitPrice = cat?.price ?? item.price_visible ?? 0;
    const qty = item.quantity ?? 1;
    return {
      type: ((cat?.type ?? 'PRODUCT') as QuoteItem['type']),
      item_name: cat?.name ?? item.detected_name,
      description: cat?.description ?? undefined,
      quantity: qty, unit: item.unit ?? cat?.unit ?? 'und',
      unit_price: unitPrice, discount: item.discount_visible ?? 0,
      subtotal: computeItemSubtotal({ quantity: qty, unit_price: unitPrice, discount: item.discount_visible ?? 0 }),
      catalog_item_id: item.service_id ?? null, sort_order: idx,
    };
  });
  const costConfig: CostConfig = { ...DEFAULT_COST_CONFIG, advance_pct: (company as any).advance_pct ?? 50 };
  const label = docType === 'cotizacion' ? 'Cotización' : 'Pedido';

  return (
    <div style={{ background: C.bg, minHeight: '100dvh', animation: 'fadeUp .22s ease' }}>
      <PageHeader onBack={onBack} title={`Vista previa · ${label}`} />
      <div style={{ padding: '12px 0 170px' }}>
        <div style={{ margin: '0 16px 12px', background: C.purpleBg, borderRadius: 12, padding: '10px 14px', display: 'flex', gap: 8 }}>
          <Eye size={15} color={C.purple} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12.5, color: C.purpleText, margin: 0, lineHeight: 1.5 }}>
            Esta es la <strong>vista previa real</strong> del documento. Confírmalo para crearlo definitivamente en Shelwi.
          </p>
        </div>
        <div style={{ padding: '0 8px' }}>
          <PDFPreviewRenderer
            items={quoteItems}
            config={costConfig}
            clientName={result.client_name || 'Cliente sin identificar'}
            clientPhone={result.client_phone || null}
            clientEmail={result.client_email || null}
            quoteName={`${label} desde foto`}
            company={company as any}
            documentLabel={label.toUpperCase()}
          />
        </div>
      </div>
      <BottomAction onBack={onBack}>
        <button onClick={onConfirm} disabled={confirming} style={{ width: '100%', padding: '14px', border: 'none', borderRadius: 14, cursor: confirming ? 'not-allowed' : 'pointer', background: C.purple, color: '#fff', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: `0 8px 20px -6px ${C.purple}88`, opacity: confirming ? .7 : 1 }}>
          {confirming
            ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Creando {label}...</>
            : <><CheckCheck size={18} /> Confirmar y crear {label}</>
          }
        </button>
        <button onClick={onBack} style={{ width: '100%', padding: '11px', border: `1.5px solid ${C.border}`, borderRadius: 14, cursor: 'pointer', background: C.white, color: C.text, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          Editar resultados
        </button>
      </BottomAction>
      <style>{GLOBAL_CSS}</style>
    </div>
  );
}

// ─── ProductQuickCreateSheet ──────────────────────────────────────────────────

function ProductQuickCreateSheet({ open, item, onClose, onCreated }: {
  open: boolean; item: VisionItem | null; onClose: () => void; onCreated: (c: CatalogItem) => void;
}) {
  const { workspace } = useWorkspace();
  const { user }      = useAuth();
  const { showToast } = useToast();
  const [name,   setName]   = useState('');
  const [unit,   setUnit]   = useState('und');
  const [price,  setPrice]  = useState('0');
  const [type,   setType]   = useState<'PRODUCT' | 'SERVICE'>('PRODUCT');
  const [desc,   setDesc]   = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item && open) {
      setName(item.detected_name); setUnit(item.unit || 'und'); setPrice(String(item.price_visible ?? 0)); setType('PRODUCT');
      setDesc([item.brand, item.model, item.reference].filter(Boolean).join(' · '));
    }
    if (!open) { setName(''); setUnit('und'); setPrice('0'); setDesc(''); setSaving(false); }
  }, [open]); // eslint-disable-line

  async function handleSave() {
    if (!user || !name.trim() || saving) return;
    setSaving(true);
    try {
      const catalogItem = await createCatalogItem(workspace.id, user.id, { type, name: name.trim(), description: desc.trim() || undefined, unit, price: parseFloat(price) || 0 });
      showToast('Producto creado ✓');
      onCreated(catalogItem); onClose();
    } catch { showToast('No se pudo crear el producto'); }
    finally { setSaving(false); }
  }

  const IS: React.CSSProperties = { width: '100%', height: 44, border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '0 13px', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: C.text, background: C.white };
  const LS: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 };

  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 58, background: 'rgba(0,0,0,.45)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity .25s' }} />
      <div role="dialog" aria-modal="true" aria-label="Crear producto" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 59, background: C.white, borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,.18)', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))', transform: open ? 'translateY(0)' : 'translateY(100%)', transition: 'transform .28s cubic-bezier(.4,0,.2,1)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#E2E8F0' }} />
        </div>
        <div style={{ padding: '10px 20px 14px' }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Crear producto</span>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 1 }}>Prellenado por la IA — confirma antes de guardar</div>
        </div>
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={LS}>Nombre *</label><input style={IS} value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del producto" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={LS}>Tipo</label><select style={{ ...IS, cursor: 'pointer' }} value={type} onChange={e => setType(e.target.value as 'PRODUCT' | 'SERVICE')}><option value="PRODUCT">📦 Producto</option><option value="SERVICE">🔧 Servicio</option></select></div>
            <div><label style={LS}>Unidad</label><select style={{ ...IS, cursor: 'pointer' }} value={unit} onChange={e => setUnit(e.target.value)}>{UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}</select></div>
          </div>
          <div><label style={LS}>Precio unitario</label><input style={IS} type="number" value={price} onChange={e => setPrice(e.target.value)} /></div>
          <div><label style={LS}>Descripción</label><input style={IS} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Marca · Modelo · Referencia" /></div>
          <div style={{ background: C.amberBg, border: `1px solid #FDE68A`, borderRadius: 12, padding: '10px 13px', display: 'flex', gap: 8 }}>
            <AlertTriangle size={14} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: '#92400E', margin: 0 }}>Revisa antes de guardar. Zero Trust: no se crea automáticamente.</p>
          </div>
          <button onClick={handleSave} disabled={!name.trim() || saving} style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: name.trim() ? C.purple : '#E2E8F0', color: name.trim() ? '#fff' : '#94A3B8', fontWeight: 800, fontSize: 15, cursor: name.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', marginTop: 4 }}>
            {saving ? 'Guardando...' : '✓ Guardar en catálogo'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function DesdeImagenPage() {
  const navigate             = useNavigate();
  const { workspace, company } = useWorkspace();
  const creditsQ             = useAICredits();
  const invalidateAI         = useInvalidateAICredits();
  const { showToast }        = useToast();

  const [state, setState]           = useState<PageState>(INIT_STATE);
  const [confirming, setConfirming] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [catalog, setCatalog]       = useState<CatalogContextItem[]>([]);
  const [clients, setClients]       = useState<ClientContextItem[]>([]);

  // Sheets / modals
  const [clientSheetOpen,  setClientSheetOpen]  = useState(false);
  const [productSheetItem, setProductSheetItem] = useState<VisionItem | null>(null);
  const [discardConfirm,   setDiscardConfirm]   = useState(false);
  const [draftModal, setDraftModal]             = useState<{ savedAt: string; docType: DocType | null; itemCount: number; clientName: string } | null>(null);

  const processingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const imageUrlRef     = useRef<string | null>(null);

  // ── Draft auto-guardado ───────────────────────────────────────────────────

  const isDraftable = state.step === 'results' || state.step === 'preview';

  useIADraftAutosave(workspace.id, {
    docType:       state.docType,
    imageBase64:   state.imageBase64,
    extractResult: state.extractResult,
    items:         state.resolvedItems,
    lastStep:      state.step === 'preview' ? 'preview' : 'results',
  }, isDraftable);

  // ── Montar: cargar contexto + chequear borrador ────────────────────────────

  useEffect(() => {
    Promise.all([fetchCatalogContext(), fetchClientsContext()]).then(([cat, cli]) => {
      setCatalog(cat); setClients(cli);
    });
    const draft = loadIADraft(workspace.id);
    if (draft) {
      setDraftModal({ savedAt: draft.savedAt, docType: draft.docType, itemCount: draft.items.length, clientName: draft.extractResult?.client_name ?? '' });
    }
  }, [workspace.id]); // eslint-disable-line

  useEffect(() => () => { if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current); }, []);

  // ── Restaurar borrador ────────────────────────────────────────────────────

  function resumeDraft() {
    const draft = loadIADraft(workspace.id);
    if (!draft?.extractResult) return;
    setDraftModal(null);
    const imageUrl = draft.imageBase64 ? `data:image/jpeg;base64,${draft.imageBase64}` : null;
    setState({ ...INIT_STATE, step: draft.lastStep, docType: draft.docType, imageBase64: draft.imageBase64, imageUrl, extractResult: draft.extractResult, resolvedItems: draft.items });
  }

  function discardDraft() { clearIADraft(workspace.id); setDraftModal(null); }

  // ── Animación ─────────────────────────────────────────────────────────────

  function clearAnimTimer() {
    if (processingTimer.current) { clearInterval(processingTimer.current); processingTimer.current = null; }
  }

  function startProcessingAnimation() {
    let idx = 0;
    processingTimer.current = setInterval(() => {
      idx++;
      setState(prev => ({
        ...prev,
        processingPct:   Math.min(88, Math.round((idx / INIT_PROCESSING.length) * 88)),
        processingSteps: prev.processingSteps.map((s, i) => ({ ...s, status: i < idx - 1 ? 'done' : i === idx - 1 ? 'running' : 'pending' })),
        timeline:        prev.timeline.map((t, ti) => ({ ...t, status: ti < idx - 1 ? 'done' : ti === idx - 1 ? 'running' : 'pending' })),
      }));
      if (idx >= INIT_PROCESSING.length) clearAnimTimer();
    }, 1100);
  }

  function finishAnimation() {
    clearAnimTimer();
    setState(prev => ({
      ...prev,
      processingPct:   100,
      processingSteps: prev.processingSteps.map(s => ({ ...s, status: 'done' as const })),
      timeline:        prev.timeline.map(t => ({ ...t, status: 'done' as const })),
    }));
  }

  useEffect(() => () => clearAnimTimer(), []); // eslint-disable-line

  // ── Procesamiento ─────────────────────────────────────────────────────────

  async function handleImageCaptured(file: File) {
    if (imageUrlRef.current) { URL.revokeObjectURL(imageUrlRef.current); imageUrlRef.current = null; }
    const imageUrl = URL.createObjectURL(file);
    imageUrlRef.current = imageUrl;

    setState(prev => ({
      ...prev,
      step: 'processing', imageFile: file, imageUrl, imageBase64: null,
      processingSteps: INIT_PROCESSING.map(s => ({ ...s, status: 'pending' as const })),
      timeline:        TIMELINE_ENTRIES.map(t => ({ ...t, status: 'pending' as const })),
      processingPct: 0,
    }));
    startProcessingAnimation();

    try {
      const credits = creditsQ.data;
      if (credits && !credits.ai_enabled) throw new Error('La IA no está disponible en tu plan actual.');
      if (credits?.credits_remaining !== null && (credits?.credits_remaining ?? 99) < 3)
        throw new Error('No tienes créditos IA suficientes.\n\nSe necesitan 3 créditos para procesar una imagen.');

      const base64 = await compressImage(file, 1024, 0.87);

      // BUG FIX #2: Refetch siempre antes de enviar — datos frescos tras crear clientes/productos
      const [freshCatalog, freshClients] = await Promise.all([fetchCatalogContext(), fetchClientsContext()]);
      setCatalog(freshCatalog); setClients(freshClients);

      const result = await extractFromImage(base64, freshCatalog, freshClients);
      invalidateAI();
      finishAnimation();

      const resolvedItems = result.items.map(item => ({ ...item, resolution: 'include' as const }));
      setState(prev => ({ ...prev, step: 'results', imageBase64: base64, extractResult: result, resolvedItems }));

      // Guardar borrador inmediatamente tras análisis exitoso
      saveIADraft({ version: 2, workspaceId: workspace.id, savedAt: new Date().toISOString(), docType: state.docType, imageBase64: base64, extractResult: result, items: resolvedItems, lastStep: 'results' });

    } catch (err: unknown) {
      finishAnimation();
      let msg = 'No se pudo procesar la imagen.\n\nIntenta con una foto más clara y bien iluminada.';
      if (isAICreditsExhausted(err))    msg = 'No tienes créditos IA disponibles.\n\nSe reinician el 1 del próximo mes.';
      else if (isAIPlanNotIncluded(err)) msg = 'La IA no está disponible en tu plan.\n\nActualiza a PRO o PREMIUM.';
      else if (err instanceof Error)     msg = err.message;
      setError(msg);
      setState(prev => ({ ...prev, step: 'selector' }));
    }
  }

  function handleCamera()            { setState(prev => ({ ...prev, step: 'camera' })); }
  function handleGallery(file: File) { handleImageCaptured(file); }

  // ── Callbacks: cliente ────────────────────────────────────────────────────

  function handleClientCreated(client: Client) {
    // PASO 2: actualiza inmediatamente en pantalla
    setState(prev => ({
      ...prev,
      extractResult: prev.extractResult ? { ...prev.extractResult, client_id: client.id, client_name: client.name, client_found: true } : prev.extractResult,
    }));
    setClientSheetOpen(false);
    // BUG FIX #2: Refrescar lista → próximo análisis usará cliente nuevo
    fetchClientsContext().then(setClients);
    showToast('✓ Cliente creado y asociado al análisis');
  }

  // ── Callbacks: producto ───────────────────────────────────────────────────

  function handleProductCreated(detectedName: string, catalogItem: CatalogItem) {
    // PASO 2: actualiza inmediatamente en pantalla
    setState(prev => ({
      ...prev,
      extractResult: prev.extractResult ? {
        ...prev.extractResult,
        items: prev.extractResult.items.map(i => i.detected_name === detectedName ? { ...i, service_id: catalogItem.id, service_name: catalogItem.name, found_in_catalog: true } : i),
      } : prev.extractResult,
      resolvedItems: prev.resolvedItems.map(i => i.detected_name === detectedName ? { ...i, service_id: catalogItem.id, service_name: catalogItem.name, found_in_catalog: true, resolution: 'include' as const } : i),
    }));
    setProductSheetItem(null);
    // BUG FIX #2: Refrescar catálogo → próximo análisis usará producto nuevo
    fetchCatalogContext().then(setCatalog);
    showToast('✓ Producto creado y asociado al análisis');
  }

  function handleSkipProduct(detectedName: string) {
    setState(prev => ({ ...prev, resolvedItems: prev.resolvedItems.map(i => i.detected_name === detectedName ? { ...i, resolution: 'skip' as const } : i) }));
  }

  function handleSearchSimilar(detectedName: string) {
    navigate(`/app/catalogo?search=${encodeURIComponent(detectedName)}`);
  }

  // ── Confirmar: crear documento real ──────────────────────────────────────

  async function handleConfirm() {
    if (!state.extractResult || !state.docType || confirming) return;
    setConfirming(true);
    const included = state.resolvedItems.filter(i => i.resolution !== 'skip' && i.found_in_catalog);

    if (state.docType === 'cotizacion') {
      const preloadItems: QuoteItem[] = included.map((item, idx) => {
        const cat = catalog.find(c => c.id === item.service_id);
        const unitPrice = cat?.price ?? item.price_visible ?? 0;
        const qty = item.quantity ?? 1;
        return {
          type: ((cat?.type ?? 'PRODUCT') as QuoteItem['type']),
          item_name: cat?.name ?? item.service_name,
          description: cat?.description ?? undefined,
          quantity: qty, unit: item.unit ?? cat?.unit ?? 'und',
          unit_price: unitPrice, discount: item.discount_visible ?? 0,
          subtotal: computeItemSubtotal({ quantity: qty, unit_price: unitPrice, discount: item.discount_visible ?? 0 }),
          catalog_item_id: item.service_id ?? null, sort_order: idx,
        };
      });
      clearIADraft(workspace.id);
      navigate('/app/cotizaciones/nueva', {
        state: {
          iaPreload: {
            clientId: state.extractResult.client_id, clientName: state.extractResult.client_name,
            projectName: 'Desde foto', notes: state.extractResult.notes || '', items: preloadItems,
            advancePct: (company as any).advance_pct ?? 30,
          },
        },
      });
      setConfirming(false);

    } else {
      if (!state.extractResult.client_id) {
        setConfirming(false);
        showToast('Crea el cliente primero para generar el pedido');
        setState(prev => ({ ...prev, step: 'results' }));
        return;
      }
      try {
        const itemsSnapshot: IAItemResult[] = included.map(item => ({
          service_id: item.service_id, service_name: item.service_name,
          quantity: item.quantity, unit: item.unit, found_in_catalog: item.found_in_catalog,
        }));
        const { orderId } = await createDirectOrder({
          clientId: state.extractResult.client_id, title: 'Pedido desde foto',
          description: state.extractResult.notes || undefined, itemsSnapshot, notes: state.extractResult.notes || undefined,
        });
        clearIADraft(workspace.id);
        navigate(`/app/pedidos/${orderId}`);
      } catch (err) {
        setConfirming(false);
        setError((err as Error).message ?? 'Error al crear el pedido');
      }
    }
  }

  // ── Navegación con protección del borrador ────────────────────────────────

  function handleBack() {
    if (isDraftable) { setDiscardConfirm(true); } else { navigate(-1); }
  }

  function handleDiscardAndLeave() { clearIADraft(workspace.id); navigate(-1); }

  function resetFlow() {
    if (imageUrlRef.current) { URL.revokeObjectURL(imageUrlRef.current); imageUrlRef.current = null; }
    setState(INIT_STATE); setError(null);
  }

  // ── Datos para el SelectorStep ────────────────────────────────────────────

  const hasDraft = !!draftModal;

  // ── Render ────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div style={{ background: C.bg, minHeight: '100dvh' }}>
        <PageHeader onBack={resetFlow} title="Error" />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 24px', gap: 14, textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={26} color="#DC2626" />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Algo salió mal</div>
          <p style={{ fontSize: 14, color: C.sub, lineHeight: 1.6, whiteSpace: 'pre-line', maxWidth: 300 }}>{error}</p>
          <button onClick={() => { setError(null); setState(prev => ({ ...prev, step: 'selector' })); }} style={{ background: C.purple, border: 'none', color: '#fff', fontWeight: 700, fontSize: 15, padding: '14px 0', borderRadius: 14, cursor: 'pointer', width: '100%', maxWidth: 280 }}>Intentar de nuevo</button>
          <button onClick={resetFlow} style={{ background: 'none', border: `1.5px solid ${C.border}`, color: C.sub, fontWeight: 600, fontSize: 14, padding: '12px 0', borderRadius: 12, cursor: 'pointer', width: '100%', maxWidth: 280 }}>← Inicio</button>
        </div>
        <style>{GLOBAL_CSS}</style>
      </div>
    );
  }

  // Suprimir lint: `clients` se usa en el closure de handleImageCaptured pero no directamente en JSX
  void clients;

  return (
    <>
      {state.step === 'selector' && (
        <SelectorStep
          docType={state.docType}
          onDocType={dt => setState(prev => ({ ...prev, docType: dt }))}
          onCamera={handleCamera}
          onGallery={handleGallery}
          onBack={handleBack}
          hasDraft={hasDraft}
          draftSavedAt={draftModal?.savedAt ?? ''}
          draftItemCount={draftModal?.itemCount ?? 0}
          draftClientName={draftModal?.clientName ?? ''}
          draftDocType={draftModal?.docType ?? null}
          onResumeDraft={resumeDraft}
          onDiscardDraft={discardDraft}
        />
      )}

      {state.step === 'camera' && (
        <CameraStep onCapture={handleImageCaptured} onBack={() => setState(prev => ({ ...prev, step: 'selector' }))} />
      )}

      {state.step === 'processing' && (
        <ProcessingStep steps={state.processingSteps} pct={state.processingPct} imageUrl={state.imageUrl} timeline={state.timeline} />
      )}

      {state.step === 'results' && state.extractResult && (
        <ResultsStep
          result={state.extractResult}
          items={state.resolvedItems}
          imageUrl={state.imageUrl}
          onContinue={() => setState(prev => ({ ...prev, step: 'preview' }))}
          onBack={() => setState(prev => ({ ...prev, step: 'selector' }))}
          onCreateClient={() => setClientSheetOpen(true)}
          onOpenProductSheet={item => setProductSheetItem(item)}
          onSkipProduct={handleSkipProduct}
          onSearchSimilar={handleSearchSimilar}
        />
      )}

      {state.step === 'preview' && state.extractResult && (
        <PreviewStep
          result={state.extractResult}
          items={state.resolvedItems}
          docType={state.docType ?? 'cotizacion'}
          catalog={catalog}
          company={company as unknown as Record<string, unknown>}
          onConfirm={handleConfirm}
          onBack={() => setState(prev => ({ ...prev, step: 'results' }))}
          confirming={confirming}
        />
      )}

      {/* Modal: restaurar borrador — solo en selector */}
      {draftModal && state.step === 'selector' && (
        <ResumeDraftModal draft={draftModal} onContinue={resumeDraft} onDiscard={discardDraft} />
      )}

      {/* Modal: confirmar descartar al salir */}
      {discardConfirm && (
        <DiscardModal onConfirm={handleDiscardAndLeave} onCancel={() => setDiscardConfirm(false)} />
      )}

      {/* Sheets globales */}
      <ClientQuickCreateSheet
        open={clientSheetOpen}
        onClose={() => setClientSheetOpen(false)}
        onCreated={handleClientCreated}
        title="Crear cliente desde IA"
        initialValues={{
          name:  state.extractResult?.client_name  || '',
          phone: state.extractResult?.client_phone || '',
          email: state.extractResult?.client_email || '',
          meta:  state.extractResult?.client_address || '',
        }}
      />

      <ProductQuickCreateSheet
        open={!!productSheetItem}
        item={productSheetItem}
        onClose={() => setProductSheetItem(null)}
        onCreated={catalogItem => productSheetItem && handleProductCreated(productSheetItem.detected_name, catalogItem)}
      />

      <style>{GLOBAL_CSS}</style>
    </>
  );
}
