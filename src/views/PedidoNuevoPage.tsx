/**
 * PedidoNuevoPage — /app/pedidos/nuevo
 * Wizard de 4 pasos para crear un Pedido directo (sin cotización previa).
 *
 * Arquitectura:
 *   - Reutiliza StepClient, StepItems, StepCosts desde document-wizard/
 *   - Usa WizardStepPreview (genérico, no StepPreviewShare de quotes)
 *   - Draft independiente con useOrderDraft (clave ktz_order_draft_v2)
 *   - Portal público vía order_access_tokens (migration 0124)
 *   - Zero Trust: workspace_id del JWT en create_direct_order RPC
 *   - Feature gated: orders_enabled (PREMIUM)
 *
 * Cotizaciones NO se toca. Este archivo es 100% independiente.
 */
import { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { User, Package, DollarSign, Eye } from 'lucide-react';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useAuth } from '../features/auth/AuthProvider';
import { useFeatureAccess } from '../hooks/usePermissions';
import { useUI } from '../features/app/UIProvider';
import { useToast } from '../components/ui/Toast';
import { WizardProgress } from '../components/document-wizard/WizardProgress';
import {
  StepClient, type StepClientData,
  StepItems, StepCosts,
} from '../components/document-wizard';
import { WizardStepPreview } from '../components/document-wizard/WizardStepPreview';
import { OrderDocumentOverlay } from '../components/overlays/OrderDocumentOverlay';
import {
  buildQuoteTitle, DEFAULT_COST_CONFIG, computeTotals,
  type QuoteItem, type LaborItem, type CostConfig,
  type WizardStepConfig,
} from '../lib/document-engine';
import { createDirectOrder } from '../services/iaCrear';
import { getOrCreateOrderToken } from '../services/orderPortal';
import {
  EMPTY_ORDER_CLIENT, useOrderAutosave, loadOrderDraft, clearOrderDraft, hasOrderDraft,
} from '../hooks/useOrderDraft';

// ─── Configuración de pasos ───────────────────────────────────────────────────

const WIZARD_STEPS: WizardStepConfig[] = [
  { icon: User,       label: 'Cliente' },
  { icon: Package,    label: 'Ítems' },
  { icon: DollarSign, label: 'Costos' },
  { icon: Eye,        label: 'Vista previa' },
];

const STEP_LABELS = ['Cliente y proyecto', 'Ítems', 'Costos y totales', 'Vista previa'];

// ─── Componente principal ─────────────────────────────────────────────────────

export function PedidoNuevoPage() {
  const navigate              = useNavigate();
  const location              = useLocation();
  const { workspace }         = useWorkspace();
  const { user }              = useAuth();
  const { showToast }         = useToast();
  const { openUpgradeModal }  = useUI();
  const featureQ              = useFeatureAccess('orders_enabled');

  // Datos pre-cargados desde IA (navigate state)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iaPreload = (location.state as any)?.iaPreload ?? null;

  const [currentStep,    setCurrentStep]    = useState<number>(iaPreload ? 2 : 1);
  const [showDraftPrompt,setShowDraftPrompt]= useState(() => !iaPreload && hasOrderDraft(workspace.id));
  const [isSaving,       setIsSaving]       = useState(false);
  const [savedOrderId,   setSavedOrderId]   = useState<string | null>(null);
  const [showDocOverlay, setShowDocOverlay] = useState(false);

  const [clientData, setClientData] = useState<StepClientData>(
    iaPreload
      ? { ...EMPTY_ORDER_CLIENT, clientId: iaPreload.clientId, clientName: iaPreload.clientName, projectName: iaPreload.projectName, description: iaPreload.notes ?? '' }
      : EMPTY_ORDER_CLIENT,
  );
  const [items,      setItems]      = useState<QuoteItem[]>(iaPreload?.items  ?? []);
  const [laborItems, setLaborItems] = useState<LaborItem[]>([]);
  const [costConfig, setCostConfig] = useState<CostConfig>(DEFAULT_COST_CONFIG);
  const [orderName,  setOrderName]  = useState<string>(iaPreload?.projectName ?? '');

  const stepRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);

  // Autosave (solo si hay contenido y aún no se guardó)
  const hasContent = items.length > 0 || laborItems.length > 0 || clientData.clientName.trim().length > 0;
  useOrderAutosave(workspace.id, { currentStep, clientData, items, laborItems, costConfig, orderName }, hasContent && !savedOrderId);

  const displayName = orderName || buildQuoteTitle(items, clientData.projectName);

  // ── Feature gate ──────────────────────────────────────────────────────────
  if (featureQ.data === false) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 14 }}>📦</div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>Pedidos — Plan PREMIUM</h2>
        <p style={{ fontSize: 14, color: '#64748B', marginBottom: 20 }}>
          El módulo de Pedidos está disponible en el plan PREMIUM.
        </p>
        <button onClick={() => openUpgradeModal({ title: 'Pedidos en PREMIUM', message: 'Crea y gestiona pedidos directos sin necesidad de cotización previa.', targetPlan: 'premium', ctaLabel: 'Actualizar a PREMIUM' })}
          style={{ border: 'none', background: '#7C3AED', color: '#fff', fontWeight: 700, fontSize: 14, padding: '12px 24px', borderRadius: 12, cursor: 'pointer' }}>
          Actualizar a PREMIUM
        </button>
      </div>
    );
  }

  // ── Guardar pedido ────────────────────────────────────────────────────────
  async function handleSave(): Promise<string | null> {
    if (savedOrderId) return savedOrderId;
    if (!user || !clientData.clientId) {
      showToast('Selecciona un cliente para continuar');
      return null;
    }
    setIsSaving(true);
    try {
      const title = displayName.trim() || 'Pedido sin título';
      // Calcular totales REALES incluyendo IVA, descuentos, etc. (igual que el preview)
      const fullTotals = computeTotals(items, costConfig, laborItems);

      // Snapshot: items con todos los campos para reconstruir el PDF
      const itemsSnapshot = items.map(it => ({
        service_id:       it.catalog_item_id ?? null,
        service_name:     it.item_name,
        item_name:        it.item_name,
        description:      it.description ?? undefined,
        quantity:         it.quantity,
        unit:             it.unit ?? null,
        unit_price:       it.unit_price,
        discount:         it.discount,
        subtotal:         it.subtotal,
        found_in_catalog: !!it.catalog_item_id,
        catalog_item_id:  it.catalog_item_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any[];

      const totalAmount = fullTotals.total; // total REAL con IVA incluido

      // Guardamos costConfig en notes como JSON (si notes está vacío) para que
      // el OrderDocumentOverlay pueda reconstruir los totales correctamente en el PDF.
      // Formato: __cfg:{...}
      const notesWithConfig = `__cfg:${JSON.stringify({
        tax_rate:      costConfig.tax_rate,
        discount_pct:  costConfig.discount_pct,
        overhead_pct:  costConfig.overhead_pct,
        advance_pct:   costConfig.advance_pct,
        transport_cost: costConfig.transport_cost,
        include_transport: costConfig.include_transport,
      })}}`;

      const { orderId } = await createDirectOrder({
        clientId:      clientData.clientId,
        title,
        description:   clientData.description || undefined,
        itemsSnapshot,
        totalAmount,
        notes: notesWithConfig,
      });

      clearOrderDraft(workspace.id);
      setSavedOrderId(orderId);
      showToast('Pedido guardado ✓');
      return orderId;
    } catch (err: unknown) {
      showToast((err as Error)?.message ?? 'Error al guardar el pedido');
      return null;
    } finally { setIsSaving(false); }
  }

  async function getShareUrl(orderId: string): Promise<string> {
    const token = await getOrCreateOrderToken(orderId);
    return `${window.location.origin}/o/${token}`;
  }

  function goToStep(step: number) {
    setCurrentStep(step);
    setTimeout(() => stepRefs.current[step - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  function loadExistingDraft() {
    const draft = loadOrderDraft(workspace.id);
    if (!draft) return;
    setClientData(draft.clientData);
    setItems(draft.items);
    setLaborItems(draft.laborItems ?? []);
    setCostConfig(draft.costConfig);
    setOrderName(draft.orderName ?? '');
    setCurrentStep(draft.currentStep);
    setShowDraftPrompt(false);
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>

      {/* Prompt borrador */}
      {showDraftPrompt && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,.4)' }} />
          <div style={{ position: 'fixed', bottom: 88, left: 12, right: 12, zIndex: 55, background: '#fff', borderRadius: 20, padding: '20px 18px', boxShadow: '0 8px 40px rgba(15,23,42,.2)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 6 }}>📦 Borrador encontrado</div>
            <div style={{ fontSize: 13.5, color: '#64748B', marginBottom: 18 }}>Tienes un pedido en progreso. ¿Continuar donde lo dejaste?</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={loadExistingDraft}
                style={{ flex: 1, height: 46, border: 'none', background: '#7C3AED', color: '#fff', fontWeight: 700, fontSize: 14.5, borderRadius: 12, cursor: 'pointer' }}>
                Continuar borrador
              </button>
              <button onClick={() => { clearOrderDraft(workspace.id); setShowDraftPrompt(false); }}
                style={{ flex: 1, height: 46, border: '1px solid #E2E8F0', background: 'none', color: '#475569', fontWeight: 600, fontSize: 14, borderRadius: 12, cursor: 'pointer' }}>
                Empezar nuevo
              </button>
            </div>
          </div>
        </>
      )}

      {/* Header sticky */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <button
            onClick={() => {
              if (currentStep === 1) navigate('/app/pedidos');
              else goToStep(currentStep - 1);
            }}
            style={{ border: 'none', background: '#F1F5F9', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#0F172A', flexShrink: 0 }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Nuevo pedido</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>Paso {currentStep} de 4</div>
          </div>
        </div>
        <WizardProgress steps={WIZARD_STEPS} current={currentStep} />
      </div>

      {/* Pasos acordeón */}
      <div style={{ marginTop: 8 }}>
        {STEP_LABELS.map((label, idx) => {
          const step    = idx + 1;
          const isActive = currentStep === step;
          const isDone   = currentStep > step;
          const isLocked = step > currentStep;

          return (
            <div key={step} ref={el => { stepRefs.current[idx] = el; }}
              style={{ background: '#fff', marginBottom: 6, overflow: 'hidden' }}>
              <button onClick={() => !isLocked && goToStep(step)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '15px 16px', border: 'none', background: 'none', cursor: isLocked ? 'default' : 'pointer', textAlign: 'left', borderBottom: isActive ? '1px solid #E2E8F0' : 'none', fontFamily: 'inherit' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDone ? '#DCFCE7' : isActive ? '#EDE9FE' : '#F1F5F9', color: isDone ? '#16A34A' : isActive ? '#7C3AED' : '#94A3B8', fontWeight: 800, fontSize: 13 }}>
                  {isDone ? '✓' : step}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: isActive ? '#0F172A' : isDone ? '#16A34A' : '#94A3B8' }}>{label}</div>
                  {isDone && step === 1 && clientData.clientName && (
                    <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{clientData.clientName}</div>
                  )}
                  {isDone && step === 2 && (
                    <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>{items.length} ítem{items.length !== 1 ? 's' : ''}</div>
                  )}
                </div>
                {isActive ? <ChevronUp size={16} color="#CBD5E1" /> : <ChevronDown size={16} color="#CBD5E1" />}
              </button>

              {isActive && (
                <div style={{ paddingBottom: 16 }}>
                  {step === 1 && <StepClient data={clientData} onChange={setClientData} onContinue={() => goToStep(2)} />}
                  {step === 2 && <StepItems items={items} laborItems={laborItems} onChangeItems={setItems} onChangeLaborItems={setLaborItems} onContinue={() => goToStep(3)} />}
                  {step === 3 && <StepCosts items={items} laborItems={laborItems} config={costConfig} onChange={setCostConfig} onContinue={() => goToStep(4)} />}
                  {step === 4 && (
                    <WizardStepPreview
                      items={items} laborItems={laborItems} config={costConfig}
                      clientName={clientData.clientName}
                      clientPhone={undefined}
                      clientEmail={clientData.clientEmail}
                      documentName={displayName}
                      documentNumber={savedOrderId ? undefined : undefined}
                      entityLabel="Pedido"
                      documentLabel="PEDIDO"
                      onChangeDocumentName={setOrderName}
                      onSave={handleSave}
                      isSaving={isSaving}
                      onGetShareUrl={getShareUrl}
                      onOpenDocument={(id) => { setSavedOrderId(id); setShowDocOverlay(true); }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showDocOverlay && savedOrderId && (
        <OrderDocumentOverlay orderId={savedOrderId} onClose={() => setShowDocOverlay(false)} />
      )}
    </div>
  );
}
