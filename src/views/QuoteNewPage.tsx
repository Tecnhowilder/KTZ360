import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useAuth } from '../features/auth/AuthProvider';
import { QuoteProgress } from '../components/quote-new/QuoteProgress';
import { StepClient, type StepClientData } from '../components/quote-new/StepClient';
import { StepItems } from '../components/quote-new/StepItems';
import { StepCosts } from '../components/quote-new/StepCosts';
import { StepPreviewShare } from '../components/quote-new/StepPreviewShare';
import { createQuoteWithItems } from '../services/quotes';
import {
  buildQuoteTitle, DEFAULT_COST_CONFIG,
  type QuoteItem, type LaborItem, type CostConfig,
} from '../lib/itemEngine';
import { useToast } from '../components/ui/Toast';
import {
  useDraftAutosave, loadDraft, clearDraft, hasDraft,
  EMPTY_CLIENT_DATA,
} from '../hooks/useDraftQuote';

const STEP_LABELS = ['Cliente y proyecto', 'Ítems', 'Costos y totales', 'Vista previa'];

export function QuoteNewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { workspace, company } = useWorkspace();
  const { user } = useAuth();
  const { showToast } = useToast();

  // Datos pre-cargados desde el flujo IA (navigate state)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iaPreload = (location.state as any)?.iaPreload ?? null;

  const [currentStep, setCurrentStep] = useState(iaPreload ? 2 : 1);
  const [isSaving, setIsSaving]       = useState(false);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);

  const [clientData, setClientData]   = useState<StepClientData>(
    iaPreload
      ? { ...EMPTY_CLIENT_DATA, clientId: iaPreload.clientId, clientName: iaPreload.clientName, projectName: iaPreload.projectName, description: iaPreload.notes }
      : EMPTY_CLIENT_DATA,
  );
  const [items, setItems]             = useState<QuoteItem[]>(iaPreload?.items ?? []);
  const [laborItems, setLaborItems]   = useState<LaborItem[]>([]);
  const [costConfig, setCostConfig]   = useState<CostConfig>(
    iaPreload?.advancePct != null
      ? { ...DEFAULT_COST_CONFIG, advance_pct: iaPreload.advancePct }
      : DEFAULT_COST_CONFIG,
  );
  const [quoteName, setQuoteName]     = useState(iaPreload?.projectName ?? '');

  const stepRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);

  // Nombre derivado de ítems + proyecto
  useEffect(() => {
    const derived = buildQuoteTitle(items, clientData.projectName);
    setQuoteName(prev => (!prev || prev === buildQuoteTitle(items)) ? derived : prev);
  }, [items, clientData.projectName]);

  // Detectar borrador al iniciar — no mostrar si venimos del flujo IA
  useEffect(() => {
    if (!iaPreload && hasDraft(workspace.id)) setShowDraftPrompt(true);
  }, [workspace.id]); // eslint-disable-line

  // Autosave con debounce — solo si hay contenido
  const hasContent = items.length > 0 || laborItems.length > 0 || clientData.clientName.trim().length > 0;
  useDraftAutosave(workspace.id, { currentStep, clientData, items, costConfig, quoteName }, hasContent);

  function loadExistingDraft() {
    const draft = loadDraft(workspace.id);
    if (!draft) return;
    setClientData(draft.clientData);
    setItems(draft.items);
    setCostConfig(draft.costConfig);
    setQuoteName(draft.quoteName);
    setCurrentStep(draft.currentStep);
    setShowDraftPrompt(false);
  }

  function discardDraft() {
    clearDraft(workspace.id);
    setShowDraftPrompt(false);
  }

  function goToStep(step: number) {
    setCurrentStep(step);
    setTimeout(() => {
      stepRefs.current[step - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  async function handleSave(): Promise<string | null> {
    if (!user) return null;
    setIsSaving(true);
    try {
      const title = quoteName.trim() || buildQuoteTitle(items, clientData.projectName);
      const quote = await createQuoteWithItems(workspace.id, user.id, {
        client_id: clientData.clientId,
        title,
        notes: clientData.description || null,
        valid_days: costConfig.valid_days,
        items,
        laborItems,
        termsConditions: Array.isArray(company?.terms_conditions) ? (company.terms_conditions as unknown as string[]) : [],
        costConfig,
      });
      clearDraft(workspace.id);
      showToast('Cotización guardada ✓');
      return quote.id;
    } catch {
      showToast('Error al guardar la cotización');
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      {/* Prompt borrador */}
      {showDraftPrompt && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,.4)' }} />
          <div style={{ position: 'fixed', bottom: 88, left: 12, right: 12, zIndex: 55, background: '#fff', borderRadius: 20, padding: '20px 18px', boxShadow: '0 8px 40px rgba(15,23,42,.2)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 6 }}>📝 Borrador encontrado</div>
            <div style={{ fontSize: 13.5, color: '#64748B', marginBottom: 18 }}>Tienes una cotización en progreso. ¿Continuar donde lo dejaste?</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={loadExistingDraft} style={{ flex: 1, height: 46, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 14.5, borderRadius: 12, cursor: 'pointer' }}>
                Continuar borrador
              </button>
              <button onClick={discardDraft} style={{ flex: 1, height: 46, border: '1px solid #E2E8F0', background: 'none', color: '#475569', fontWeight: 600, fontSize: 14, borderRadius: 12, cursor: 'pointer' }}>
                Empezar nuevo
              </button>
            </div>
          </div>
        </>
      )}

      {/* Header sticky */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <button onClick={() => navigate(-1)} style={{ border: 'none', background: '#F1F5F9', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#0F172A', flexShrink: 0 }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Nueva cotización</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>Paso {currentStep} de 4</div>
          </div>
        </div>
        <QuoteProgress current={currentStep} />
      </div>

      {/* Pasos acordeón */}
      <div style={{ marginTop: 8 }}>
        {STEP_LABELS.map((label, idx) => {
          const step = idx + 1;
          const isActive = currentStep === step;
          const isDone   = currentStep > step;
          const isLocked = step > currentStep;

          return (
            <div key={step} ref={el => { stepRefs.current[idx] = el; }}
              style={{ background: '#fff', marginBottom: 6, overflow: 'hidden' }}>
              <button onClick={() => !isLocked && goToStep(step)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '15px 16px', border: 'none', background: 'none', cursor: isLocked ? 'default' : 'pointer', textAlign: 'left', borderBottom: isActive ? '1px solid #E2E8F0' : 'none', fontFamily: 'inherit' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDone ? '#DCFCE7' : isActive ? '#EFF6FF' : '#F1F5F9', color: isDone ? '#16A34A' : isActive ? '#2563EB' : '#94A3B8', fontWeight: 800, fontSize: 13 }}>
                  {isDone ? '✓' : step}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: isActive ? '#0F172A' : isDone ? '#16A34A' : '#94A3B8' }}>{label}</div>
                  {isDone && step === 1 && clientData.clientName && (
                    <div style={{ fontSize: 12, color: '#64748B' }}>
                      {clientData.clientName}{clientData.projectName ? ` · ${clientData.projectName}` : ''}
                    </div>
                  )}
                  {isDone && step === 2 && (items.length > 0 || laborItems.length > 0) && (
                    <div style={{ fontSize: 12, color: '#64748B' }}>
                      {items.length > 0 ? `${items.length} ítem${items.length > 1 ? 's' : ''}` : ''}
                      {items.length > 0 && laborItems.length > 0 ? ' · ' : ''}
                      {laborItems.length > 0 ? `${laborItems.length} mano de obra` : ''}
                    </div>
                  )}
                </div>
                {!isLocked && (isActive ? <ChevronUp size={18} color="#94A3B8" /> : <ChevronDown size={18} color="#94A3B8" />)}
              </button>

              {isActive && (
                <div style={{ padding: '16px 0 20px', animation: 'fadeIn .2s ease' }}>
                  {step === 1 && (
                    <StepClient data={clientData} onChange={setClientData} onContinue={() => goToStep(2)} />
                  )}
                  {step === 2 && (
                    <StepItems
                      items={items} laborItems={laborItems}
                      onChangeItems={setItems} onChangeLaborItems={setLaborItems}
                      onContinue={() => goToStep(3)}
                    />
                  )}
                  {step === 3 && (
                    <StepCosts
                      items={items} laborItems={laborItems}
                      config={costConfig} onChange={setCostConfig}
                      onContinue={() => goToStep(4)}
                    />
                  )}
                  {step === 4 && (
                    <StepPreviewShare
                      items={items} laborItems={laborItems}
                      config={costConfig}
                      clientName={clientData.clientName}
                      clientEmail={clientData.clientEmail}
                      quoteName={quoteName}
                      onChangeQuoteName={setQuoteName}
                      onSave={handleSave}
                      isSaving={isSaving}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }`}</style>
    </div>
  );
}
