import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { useWorkspace } from '../features/auth/WorkspaceProvider';
import { useAuth } from '../features/auth/AuthProvider';
import { QuoteProgress } from '../components/quote-new/QuoteProgress';
import { StepClient, type StepClientData } from '../components/quote-new/StepClient';
import { StepItems } from '../components/quote-new/StepItems';
import { StepCosts } from '../components/quote-new/StepCosts';
import { StepPreviewShare } from '../components/quote-new/StepPreviewShare';
import { getQuote, updateQuoteWithItems } from '../services/quotes';
import { listQuoteItems, rowToQuoteItem } from '../services/quoteItems';
import { getClient } from '../services/clients';
import { useToast } from '../components/ui/Toast';
import {
  buildQuoteTitle, DEFAULT_COST_CONFIG,
  type QuoteItem, type LaborItem, type CostConfig,
} from '../lib/itemEngine';

const STEP_LABELS = ['Cliente y proyecto', 'Ítems', 'Costos y totales', 'Vista previa'];

export function EditQuotePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { workspace } = useWorkspace();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [currentStep, setCurrentStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [clientData, setClientData] = useState<StepClientData>({
    clientId: null, clientName: '', projectName: '', description: '',
  });
  const [items, setItems]           = useState<QuoteItem[]>([]);
  const [laborItems, setLaborItems] = useState<LaborItem[]>([]);
  const [costConfig, setCostConfig] = useState<CostConfig>(DEFAULT_COST_CONFIG);
  const [quoteName, setQuoteName]   = useState('');

  const stepRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);

  // Cargar datos existentes
  const quoteQ     = useQuery({ queryKey: ['quote', id],      queryFn: () => getQuote(id!),           enabled: !!id });
  const itemsQ     = useQuery({ queryKey: ['quoteItems', id], queryFn: () => listQuoteItems(id!),      enabled: !!id });

  useEffect(() => {
    if (loaded || !quoteQ.data || !itemsQ.data) return;

    const q = quoteQ.data;
    const snapshot = (q as any).snapshot_items as any;

    // Nombre y proyecto
    setQuoteName(q.title);

    // Cargar ítems relacionales primero, luego snapshot como fallback
    if (itemsQ.data.length > 0) {
      setItems(itemsQ.data.map(rowToQuoteItem));
    } else if (snapshot?.items?.length) {
      setItems(snapshot.items);
    }

    // Labor del snapshot
    if (snapshot?.labor_items?.length) {
      setLaborItems(snapshot.labor_items);
    }

    // Config de costos del snapshot o de los campos de la quote
    if (snapshot?.config) {
      setCostConfig({
        ...DEFAULT_COST_CONFIG,
        ...snapshot.config,
      });
    } else {
      setCostConfig({
        ...DEFAULT_COST_CONFIG,
        tax_rate:      q.tax_rate ?? 19,
        advance_pct:   q.advance_pct ?? 0,
        discount_pct:  q.discount ?? 0,
        valid_days:    q.valid_days ?? 15,
      });
    }

    // Cliente
    if (q.client_id) {
      getClient(q.client_id).then(c => {
        setClientData({ clientId: c.id, clientName: c.name, projectName: q.title, description: q.notes ?? '' });
      }).catch(() => {
        setClientData({ clientId: q.client_id, clientName: '', projectName: q.title, description: q.notes ?? '' });
      });
    } else {
      setClientData({ clientId: null, clientName: '', projectName: q.title, description: q.notes ?? '' });
    }

    setLoaded(true);
  }, [quoteQ.data, itemsQ.data, loaded]);

  function goToStep(step: number) {
    setCurrentStep(step);
    setTimeout(() => {
      stepRefs.current[step - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  async function handleSave(): Promise<string | null> {
    if (!user || !id) return null;
    setIsSaving(true);
    try {
      const title = quoteName.trim() || buildQuoteTitle(items, clientData.projectName);
      await updateQuoteWithItems(id, workspace.id, user.id, {
        client_id: clientData.clientId,
        title,
        notes: clientData.description || null,
        valid_days: costConfig.valid_days,
        items,
        laborItems,
        costConfig,
      });
      showToast('Cotización actualizada ✓');
      navigate(`/app/cotizaciones/${id}`);
      return id;
    } catch {
      showToast('Error al guardar los cambios');
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  if (quoteQ.isLoading || itemsQ.isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 14 }}>
        Cargando cotización...
      </div>
    );
  }

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      {/* Aviso de edición */}
      <div style={{ background: '#FEF3C7', borderBottom: '1px solid #FDE68A', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>✏️</span>
        <span style={{ fontSize: 13, color: '#92400E', fontWeight: 600 }}>
          Editando cotización {quoteQ.data?.quote_number ?? ''} — Los cambios reemplazarán la versión actual.
        </span>
      </div>

      {/* Header sticky */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #F1F5F9', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <button onClick={() => navigate(-1)} style={{ border: 'none', background: '#F1F5F9', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#0F172A', flexShrink: 0 }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Editar cotización</div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>Paso {currentStep} de 4</div>
          </div>
        </div>
        <QuoteProgress current={currentStep} />
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
                <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDone ? '#DCFCE7' : isActive ? '#EFF6FF' : '#F1F5F9', color: isDone ? '#16A34A' : isActive ? '#2563EB' : '#94A3B8', fontWeight: 800, fontSize: 13 }}>
                  {isDone ? '✓' : step}
                </div>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: isActive ? '#0F172A' : isDone ? '#16A34A' : '#94A3B8' }}>{label}</span>
                {!isLocked && (isActive ? <ChevronUp size={18} color="#94A3B8" style={{ marginLeft: 'auto' }} /> : <ChevronDown size={18} color="#94A3B8" style={{ marginLeft: 'auto' }} />)}
              </button>

              {isActive && (
                <div style={{ padding: '16px 0 20px', animation: 'fadeIn .2s ease' }}>
                  {step === 1 && <StepClient data={clientData} onChange={setClientData} onContinue={() => goToStep(2)} />}
                  {step === 2 && <StepItems items={items} laborItems={laborItems} onChangeItems={setItems} onChangeLaborItems={setLaborItems} onContinue={() => goToStep(3)} />}
                  {step === 3 && <StepCosts items={items} laborItems={laborItems} config={costConfig} onChange={setCostConfig} onContinue={() => goToStep(4)} />}
                  {step === 4 && (
                    <StepPreviewShare
                      items={items} laborItems={laborItems} config={costConfig}
                      clientName={clientData.clientName}
                      quoteName={quoteName}
                      quoteNumber={quoteQ.data?.quote_number}
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
