import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUI } from '../../features/app/UIProvider';
import { useWorkspace } from '../../features/auth/WorkspaceProvider';
import { useAuth } from '../../features/auth/AuthProvider';
import { useClients, useInvalidateClients, useInvalidateQuotes } from '../../hooks/useQuotes';
import { createQuote, updateQuoteStatus, duplicateQuote, type QuoteInput } from '../../services/quotes';
import { listTemplates, createTemplate } from '../../services/templates';
import { listCategories, listServicesByCategory, getServiceWithRules, listPriceOverrides, upsertPriceOverride, searchServices } from '../../services/catalogV2';
import { getOrCreateQuoteToken, registerQuoteEvent } from '../../services/publicPortal';
import { getLatestClientConsent } from '../../services/events';
import { computeServiceLine, computeQuote, groupLineItems, materialGroupKey, type LineItemKind, type ServiceLine, type ServiceWithRules, type TaxMode, type DocDetailLevel } from '../../lib/engine';
import { fmt, fmtDateY, dueDate, TODAY, serviceLabel, followMessage, openWhats } from '../../lib/calc';
import { saveQuoteDraft, loadQuoteDraft, clearQuoteDraft, hasMeaningfulDraft, type QuoteDraft } from '../../lib/draftStorage';
import { useFeatureAccess } from '../../hooks/usePermissions';
import { APP_NAME } from '../../lib/brand';
import { useToast } from '../../components/ui/Toast';
import { CategoryPicker } from '../quote-flow/CategoryPicker';
import { ServicePicker } from '../quote-flow/ServicePicker';
import { DynamicQuestions } from '../quote-flow/DynamicQuestions';
import { ServiceLinesList } from '../quote-flow/ServiceLinesList';
import { ReviewPanel } from '../quote-flow/ReviewPanel';
import { ClientFormModal } from '../clients/ClientFormModal';
import { NumberField } from '../ui/NumberField';
import { QuotationStepper } from '../quote-flow/QuotationStepper';
import { QuoteSummarySidebar, SidebarRow } from '../quote-flow/QuoteSummarySidebar';
import { Search, MapPin, Phone, Mail, Plus, ChevronDown, Calendar, Briefcase, Info, Pencil, Wrench, Ruler, Lightbulb, Calculator, Percent, Receipt, CircleDollarSign, CheckCircle, ArrowRight, Package, HardHat, MoreVertical, Truck, MessageCircle, Globe, Download, Printer, Copy, Bookmark, Files, ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react';
import type { QConfig } from '../../lib/types';

const STEP_TITLES = ['Cliente y proyecto', 'Categoría', 'Servicio', 'Revisión', 'Costos y resumen', 'Compartir'];
const STEP_SUBTITLES = [
  'Selecciona un cliente y define los datos generales del proyecto.',
  'Elige la categoría del servicio que vas a cotizar.',
  'Configura el servicio, sus variantes y cantidades.',
  'Revisa los ítems y materiales antes de continuar.',
  'Ajusta los costos y revisa el resumen final.',
  'Comparte la propuesta con tu cliente.',
];
const TOTAL_STEPS = STEP_TITLES.length;

function buildQuoteInput(cfg: QConfig, termsConditions: string[]): QuoteInput {
  return {
    client_id: cfg.clientId,
    title: `${serviceLabel(cfg.serviceLines)} · ${cfg.proj}`,
    location: cfg.loc || null,
    project_type: cfg.projectType || null,
    notes: cfg.notes || null,
    service_lines: cfg.serviceLines,
    admin_pct: cfg.adminPct,
    imprevistos_pct: cfg.imprevistosPct,
    util: cfg.util,
    tax_mode: cfg.taxMode,
    tax_rate: cfg.taxRate,
    advance_pct: cfg.advancePct,
    doc_detail_level: cfg.docDetailLevel,
    include_technical_annex: cfg.includeTechnicalAnnex,
    terms_conditions: termsConditions,
    discount: cfg.discount,
    discount_on: cfg.discountOn,
    transport_cost: cfg.transportCost,
    transport_enabled: cfg.transportEnabled,
    valid_days: cfg.validDays,
  };
}

const UNIT_BASIS_LABEL: Record<string, string> = {
  area: 'Área a intervenir',
  point: 'Cantidad de puntos',
  length: 'Longitud',
  global: 'Cantidad',
};

function CostBlockHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{title}</div>
    </div>
  );
}

function CostRowMenu({ open, onToggle, onEdit, onDetail }: { open: boolean; onToggle: () => void; onEdit: () => void; onDetail: () => void }) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={onToggle}
        style={{ width: 30, height: 30, borderRadius: '50%', background: '#F1F5F9', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748B' }}
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 36, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, boxShadow: '0 8px 24px -8px rgba(15,23,42,.18)', zIndex: 10, minWidth: 160, overflow: 'hidden' }}>
          <button onClick={onEdit} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#0F172A', cursor: 'pointer', fontFamily: 'inherit' }}>Editar precio</button>
          <button onClick={onEdit} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#0F172A', cursor: 'pointer', fontFamily: 'inherit', borderTop: '1px solid #F1F5F9' }}>Editar cantidad</button>
          <button onClick={onDetail} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#0F172A', cursor: 'pointer', fontFamily: 'inherit', borderTop: '1px solid #F1F5F9' }}>Ver detalle</button>
        </div>
      )}
    </div>
  );
}

function CostDirectRow({ icon, title, sub, value, isLast, menuOpen, onToggleMenu, onEdit, detail, detailOpen, onToggleDetail }: { icon: React.ReactNode; title: string; sub: string; value: number; isLast?: boolean; menuOpen: boolean; onToggleMenu: () => void; onEdit: () => void; detail?: React.ReactNode; detailOpen: boolean; onToggleDetail: () => void }) {
  return (
    <div style={{ borderBottom: isLast && !detailOpen ? 'none' : '1px solid #F1F5F9' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0' }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: '#F8FAFC', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>{title}</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>{sub}</div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmt(value)}</div>
        <CostRowMenu open={menuOpen} onToggle={onToggleMenu} onEdit={onEdit} onDetail={onToggleDetail} />
      </div>
      {detailOpen && detail && (
        <div style={{ padding: '0 0 13px 50px', display: 'flex', flexDirection: 'column', gap: 6 }}>{detail}</div>
      )}
    </div>
  );
}

function IndirectRow({ icon, label, sub, pct, max, amt, onChange, isLast }: { icon: React.ReactNode; label: string; sub: string; pct: number; max: number; amt: number; onChange: (v: number) => void; isLast?: boolean }) {
  return (
    <div style={{ padding: '14px 0', borderBottom: isLast ? 'none' : '1px solid #F1F5F9' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: '#F8FAFC', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>{label}</div>
          <div style={{ fontSize: 12, color: '#64748B' }}>{sub}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input type="range" min={0} max={max} value={pct} onChange={(e) => onChange(parseInt(e.target.value, 10))} style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1.5px solid #E5E7EB', borderRadius: 10, padding: '6px 8px', flexShrink: 0 }}>
          <NumberField min={0} max={max} value={pct} onChange={onChange} style={{ width: 36, border: 'none', outline: 'none', fontSize: 13, fontWeight: 700, textAlign: 'right' }} />
          <span style={{ fontSize: 13, color: '#64748B' }}>%</span>
        </div>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: '#2563EB', minWidth: 88, textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmt(amt)}</span>
      </div>
    </div>
  );
}

export function QuoteFlowOverlay() {
  const { quoteFlow, closeQuoteFlow, setQuoteFlowStep, setQuoteCfg, openDocument, openUpgradeModal } = useUI();
  const { workspace, company } = useWorkspace();
  const { user } = useAuth();
  const templatesAccess = useFeatureAccess('templates_enabled');
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const clientsQuery = useClients();
  const invalidateClients = useInvalidateClients();
  const invalidateQuotes = useInvalidateQuotes();

  const templatesQuery = useQuery({
    queryKey: ['templates', workspace.id],
    queryFn: () => listTemplates(workspace.id),
    enabled: quoteFlow.open,
  });

  const [newClientOpen, setNewClientOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [showCalc, setShowCalc] = useState(false);
  const [showIndirectos, setShowIndirectos] = useState(false);
  const [openCostMenu, setOpenCostMenu] = useState<string | null>(null);
  const [openCostDetail, setOpenCostDetail] = useState<string | null>(null);
  const [editQty, setEditQty] = useState(false);
  const [createdQuoteId, setCreatedQuoteId] = useState<string | null>(null);
  const [createdQuoteNumber, setCreatedQuoteNumber] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const createdRef = useRef(false);
  const [draftPrompt, setDraftPrompt] = useState<QuoteDraft | null>(null);
  const draftCheckedRef = useRef(false);

  // Selección de servicio en curso (paso "Categoría"/"Servicio")
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [quantity, setQuantity] = useState<number>(10);
  const [serviceSearch, setServiceSearch] = useState('');
  const [changingService, setChangingService] = useState(false);

  const { step, cfg } = quoteFlow;

  const categoriesQuery = useQuery({
    queryKey: ['catalogCategories'],
    queryFn: listCategories,
    enabled: quoteFlow.open,
  });

  const servicesQuery = useQuery({
    queryKey: ['catalogServices', categoryId],
    queryFn: () => listServicesByCategory(categoryId!),
    enabled: !!categoryId,
  });

  const serviceQuery = useQuery({
    queryKey: ['catalogServiceRules', serviceId],
    queryFn: () => getServiceWithRules(serviceId!),
    enabled: !!serviceId,
  });

  const serviceSearchQuery = useQuery({
    queryKey: ['serviceSearch', serviceSearch],
    queryFn: () => searchServices(serviceSearch.trim()),
    enabled: quoteFlow.open && serviceSearch.trim().length >= 2,
  });

  const priceOverridesQuery = useQuery({
    queryKey: ['priceOverrides', workspace.id],
    queryFn: () => listPriceOverrides(workspace.id),
    enabled: quoteFlow.open,
  });

  const [initializedService, setInitializedService] = useState<ServiceWithRules | null>(null);
  if (serviceQuery.data && serviceQuery.data !== initializedService) {
    const svc = serviceQuery.data;
    setInitializedService(svc);
    setVariantId(svc.variants[0]?.id ?? null);
    const defaults: Record<string, unknown> = {};
    svc.questions.forEach((q) => {
      if (q.default_value !== null && q.default_value !== undefined) defaults[q.key] = q.default_value;
    });
    setAnswers(defaults);
    setQuantity(svc.unit_basis === 'global' ? 1 : svc.unit_basis === 'point' ? 1 : 10);
  }

  const C = computeQuote(cfg.serviceLines, { adminPct: cfg.adminPct, imprevistosPct: cfg.imprevistosPct, util: cfg.util, taxMode: cfg.taxMode, taxRate: cfg.taxRate, discount: cfg.discount, discountOn: cfg.discountOn, transportCost: cfg.transportCost, transportEnabled: cfg.transportEnabled });
  const groups = groupLineItems(cfg.serviceLines);
  const subtotalMateriales = [...groups.principal, ...groups.auxiliares].reduce((a, i) => a + i.subtotal, 0);
  const subtotalManoDeObra = groups.labor.reduce((a, i) => a + i.subtotal, 0);
  const subtotalOtros = groups.otros.reduce((a, i) => a + i.subtotal, 0);

  const createQuoteMutation = useMutation({
    mutationFn: () => createQuote(workspace.id, user!.id, buildQuoteInput(cfg, company.terms_conditions)),
    onSuccess: (q) => {
      setCreatedQuoteId(q.id);
      setCreatedQuoteNumber(q.quote_number);
      invalidateQuotes();
      queryClient.invalidateQueries({ queryKey: ['planLimit', workspace.id, 'quotes_month'] });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('plan_limit_exceeded')) {
        closeQuoteFlow();
        openUpgradeModal({
          title: 'Has alcanzado el límite de tu plan',
          message: 'Tu plan FREE permite hasta 10 cotizaciones por mes. Actualiza a PRO por $39.900/mes para crear cotizaciones ilimitadas.',
          targetPlan: 'pro',
          ctaLabel: 'Actualizar a PRO',
        });
      } else {
        showToast('No se pudo crear la cotización');
      }
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: () =>
      createTemplate(workspace.id, user!.id, { name: `${serviceLabel(cfg.serviceLines)} · ${cfg.proj}`, service_lines: cfg.serviceLines, admin_pct: cfg.adminPct, imprevistos_pct: cfg.imprevistosPct, util: cfg.util, valid_days: cfg.validDays, discount: cfg.discount, discount_on: cfg.discountOn, tax_mode: cfg.taxMode, tax_rate: cfg.taxRate, transport_cost: cfg.transportCost, transport_enabled: cfg.transportEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', workspace.id] });
      showToast('⭐ Guardada como plantilla');
    },
    onError: (err: Error) => {
      if (err.message.includes('feature_not_available')) {
        openUpgradeModal({
          title: 'Plantillas disponibles en PRO',
          message: 'Guardar cotizaciones como plantilla está disponible desde el plan PRO por $39.900/mes.',
          targetPlan: 'pro',
          ctaLabel: 'Actualizar a PRO',
        });
      } else {
        showToast('No se pudo guardar la plantilla');
      }
    },
  });

  const sendStatusMutation = useMutation({
    mutationFn: (id: string) => updateQuoteStatus(id, 'Enviada'),
    onSuccess: () => invalidateQuotes(),
  });

  const duplicateQuoteMutation = useMutation({
    mutationFn: () => duplicateQuote(createdQuoteId!),
    onSuccess: () => {
      invalidateQuotes();
      showToast('Cotización duplicada');
    },
  });

  const consentQuery = useQuery({
    queryKey: ['clientConsent', cfg.clientId],
    queryFn: () => getLatestClientConsent(cfg.clientId!),
    enabled: !!cfg.clientId && step === TOTAL_STEPS - 1,
  });

  const overridePriceMutation = useMutation({
    mutationFn: ({ entityType, entityId, price }: { entityType: LineItemKind; entityId: string; price: number }) =>
      upsertPriceOverride(workspace.id, entityType, entityId, price),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['priceOverrides', workspace.id] }),
  });

  useEffect(() => {
    if (quoteFlow.open && step === TOTAL_STEPS - 1 && !createdRef.current && !createdQuoteId) {
      createdRef.current = true;
      createQuoteMutation.mutate();
    }
    if (!quoteFlow.open || step !== TOTAL_STEPS - 1) {
      createdRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteFlow.open, step, createdQuoteId]);

  // Detecta un borrador guardado al abrir una cotización nueva (no al editar una existente)
  useEffect(() => {
    if (quoteFlow.open && !quoteFlow.quoteId && !draftCheckedRef.current) {
      draftCheckedRef.current = true;
      const draft = loadQuoteDraft(workspace.id);
      if (hasMeaningfulDraft(draft)) setDraftPrompt(draft);
    }
    if (!quoteFlow.open) draftCheckedRef.current = false;
  }, [quoteFlow.open, quoteFlow.quoteId, workspace.id]);

  // Autoguardado del borrador en cada cambio relevante
  useEffect(() => {
    if (!quoteFlow.open || quoteFlow.quoteId || draftPrompt) return;
    const draft: QuoteDraft = { step, cfg, createdQuoteId, createdQuoteNumber, savedAt: new Date().toISOString() };
    const t = setTimeout(() => saveQuoteDraft(workspace.id, draft), 400);
    return () => clearTimeout(t);
  }, [quoteFlow.open, quoteFlow.quoteId, draftPrompt, step, cfg, createdQuoteId, createdQuoteNumber, workspace.id]);

  function continueDraft() {
    if (!draftPrompt) return;
    setQuoteCfg(() => draftPrompt.cfg);
    setQuoteFlowStep(draftPrompt.step);
    setCreatedQuoteId(draftPrompt.createdQuoteId);
    setCreatedQuoteNumber(draftPrompt.createdQuoteNumber);
    setDraftPrompt(null);
  }

  function discardDraft() {
    clearQuoteDraft(workspace.id);
    setDraftPrompt(null);
  }

  if (!quoteFlow.open) return null;

  function setField<K extends keyof QConfig>(k: K, v: QConfig[K]) {
    setQuoteCfg({ [k]: v } as Partial<QConfig>);
  }

  function resetServiceSelection() {
    setCategoryId(null);
    setServiceId(null);
    setVariantId(null);
    setAnswers({});
    setQuantity(10);
  }

  function addLine() {
    const svc = serviceQuery.data;
    if (!svc) return;
    const line: ServiceLine = computeServiceLine(svc, variantId, quantity, answers, priceOverridesQuery.data ?? new Map());
    setQuoteCfg((c) => ({ ...c, serviceLines: [...c.serviceLines, line] }));
    showToast('Agregado · busca otro producto o continúa');
    setServiceId(null);
    setVariantId(null);
    setAnswers({});
    setQuantity(10);
    setServiceSearch('');
  }

  function selectSearchResult(s: { id: string; category_id: string }) {
    setCategoryId(s.category_id);
    setServiceId(s.id);
    setVariantId(null);
    setAnswers({});
    setServiceSearch('');
  }

  function removeLine(id: string) {
    setQuoteCfg((c) => ({ ...c, serviceLines: c.serviceLines.filter((l) => l.id !== id) }));
  }

  function handlePriceChange(lineId: string, kind: LineItemKind, itemIndex: number, price: number) {
    const line = cfg.serviceLines.find((l) => l.id === lineId);
    if (!line) return;
    const items = kind === 'material' ? line.materials : kind === 'labor' ? line.labor : line.equipment;
    const item = items[itemIndex];
    if (!item) return;
    const entityId = kind === 'material' ? (item.selected_material_id ?? item.ref_id) : item.ref_id;

    setQuoteCfg((c) => ({
      ...c,
      serviceLines: c.serviceLines.map((l) => {
        if (l.id !== lineId) return l;
        const key = kind === 'material' ? 'materials' : kind === 'labor' ? 'labor' : 'equipment';
        const newItems = (l[key] as typeof items).map((it, i) => (i === itemIndex ? { ...it, unitPrice: price, subtotal: it.qty * price } : it));
        const updated = { ...l, [key]: newItems };
        updated.lineTotal = [...updated.materials, ...updated.labor, ...updated.equipment].reduce((a, i) => a + i.subtotal, 0);
        return updated;
      }),
    }));

    overridePriceMutation.mutate({ entityType: kind, entityId, price });
  }

  function handleQtyChange(lineId: string, kind: LineItemKind, itemIndex: number, qty: number) {
    setQuoteCfg((c) => ({
      ...c,
      serviceLines: c.serviceLines.map((l) => {
        if (l.id !== lineId) return l;
        const key = kind === 'material' ? 'materials' : kind === 'labor' ? 'labor' : 'equipment';
        const items = l[key] as ServiceLine['materials'];
        const newItems = items.map((it, i) => (i === itemIndex ? { ...it, qty, subtotal: qty * it.unitPrice } : it));
        const updated = { ...l, [key]: newItems };
        updated.lineTotal = [...updated.materials, ...updated.labor, ...updated.equipment].reduce((a, i) => a + i.subtotal, 0);
        return updated;
      }),
    }));
  }

  /** Cambia el precio de un material en TODAS las líneas donde aparece (materiales consolidados). */
  function handleGroupPriceChange(key: string, price: number) {
    setQuoteCfg((c) => ({
      ...c,
      serviceLines: c.serviceLines.map((l) => {
        let changed = false;
        const materials = l.materials.map((m) => {
          if (materialGroupKey(m) !== key) return m;
          changed = true;
          return { ...m, unitPrice: price, subtotal: m.qty * price };
        });
        if (!changed) return l;
        const updated = { ...l, materials };
        updated.lineTotal = [...updated.materials, ...updated.labor, ...updated.equipment].reduce((a, i) => a + i.subtotal, 0);
        return updated;
      }),
    }));
    overridePriceMutation.mutate({ entityType: 'material', entityId: key, price });
  }

  /** Cambia la cantidad total de un material consolidado, redistribuyéndola proporcionalmente entre las líneas que lo usan. */
  function handleGroupQtyChange(key: string, newQty: number) {
    setQuoteCfg((c) => {
      const matches: { lineId: string; itemIndex: number; qty: number }[] = [];
      c.serviceLines.forEach((l) => l.materials.forEach((m, i) => {
        if (materialGroupKey(m) === key) matches.push({ lineId: l.id, itemIndex: i, qty: m.qty });
      }));
      if (matches.length === 0) return c;
      const oldTotal = matches.reduce((a, m) => a + m.qty, 0) || 1;
      let remaining = newQty;
      const serviceLines = c.serviceLines.map((l) => ({ ...l, materials: [...l.materials] }));
      matches.forEach((m, idx) => {
        const isLast = idx === matches.length - 1;
        const share = isLast ? remaining : Math.round((m.qty / oldTotal) * newQty * 100) / 100;
        remaining = Math.round((remaining - share) * 100) / 100;
        const line = serviceLines.find((l) => l.id === m.lineId)!;
        const item = line.materials[m.itemIndex];
        line.materials[m.itemIndex] = { ...item, qty: share, subtotal: share * item.unitPrice };
      });
      serviceLines.forEach((l) => {
        l.lineTotal = [...l.materials, ...l.labor, ...l.equipment].reduce((a, i) => a + i.subtotal, 0);
      });
      return { ...c, serviceLines };
    });
  }

  function reset() {
    setCreatedQuoteId(null);
    setCreatedQuoteNumber(null);
    setNewClientOpen(false);
    resetServiceSelection();
  }

  function close() {
    reset();
    closeQuoteFlow();
  }

  function finishAndClose() {
    clearQuoteDraft(workspace.id);
    close();
  }

  function back() {
    if (step === 0) close();
    else setQuoteFlowStep(step - 1);
  }

  function goToEditRevision() {
    setOpenCostMenu(null);
    setEditQty(true);
    setQuoteFlowStep(3);
  }

  function next() {
    if (step === 1 && !categoryId && cfg.serviceLines.length > 0) {
      setQuoteFlowStep(3);
      return;
    }
    if (step < TOTAL_STEPS - 1) setQuoteFlowStep(step + 1);
  }

  function applyTemplate(t: { service_lines: ServiceLine[]; admin_pct: number; imprevistos_pct: number; util: number; valid_days: number; discount: number; discount_on: boolean; tax_mode: TaxMode; tax_rate: number; transport_cost: number; transport_enabled: boolean }) {
    setQuoteCfg({ serviceLines: t.service_lines, adminPct: t.admin_pct, imprevistosPct: t.imprevistos_pct, util: t.util, validDays: t.valid_days, discount: t.discount, discountOn: t.discount_on, taxMode: t.tax_mode, taxRate: t.tax_rate, transportCost: t.transport_cost, transportEnabled: t.transport_enabled });
    setQuoteFlowStep(4);
    showToast('Plantilla aplicada · ajusta y envía');
  }

  async function shareWhatsAppAction() {
    if (!createdQuoteId) return;
    const clientName = selectedClient?.name || 'Cliente';
    const token = await getOrCreateQuoteToken(createdQuoteId);
    registerQuoteEvent(token, 'proposal_sent').catch(() => {});
    const portalUrl = `${window.location.origin}/p/${token}`;
    openWhats(followMessage(clientName, cfg.proj, C.total, workspace.name, portalUrl));
    sendStatusMutation.mutate(createdQuoteId);
    showToast('WhatsApp abierto con la propuesta');
  }

  async function copyPortalLinkAction() {
    if (!createdQuoteId) return;
    const token = await getOrCreateQuoteToken(createdQuoteId);
    const portalUrl = `${window.location.origin}/p/${token}`;
    await navigator.clipboard.writeText(portalUrl);
    setLinkCopied(true);
    showToast('Enlace copiado');
    setTimeout(() => setLinkCopied(false), 2500);
  }

  async function sendEmailAction() {
    if (!createdQuoteId) return;
    const clientName = selectedClient?.name || 'Cliente';
    const token = await getOrCreateQuoteToken(createdQuoteId);
    const portalUrl = `${window.location.origin}/p/${token}`;
    const subject = `Cotización ${createdQuoteNumber ?? ''} - ${cfg.proj || ''}`.trim();
    const bodyLines = [
      `Hola ${clientName},`,
      '',
      'Te comparto la cotización correspondiente a:',
      cfg.proj || 'tu proyecto',
      '',
      'Valor estimado:',
      fmt(C.total),
      '',
      'Puedes revisar la propuesta completa en el siguiente enlace:',
      portalUrl,
      '',
      'Saludos,',
      workspace.name,
      '',
      `Generado con ${APP_NAME}`,
    ];
    const body = bodyLines.join('\n');

    registerQuoteEvent(token, 'proposal_sent').catch(() => {});
    sendStatusMutation.mutate(createdQuoteId);

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile && navigator.share) {
      try {
        await navigator.share({ title: subject, text: body });
        return;
      } catch {
        // usuario canceló o navigator.share no disponible: continuar con mailto
      }
    }

    const mailto = `mailto:${selectedClient?.email ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  }

  function downloadPdfAction() {
    if (!createdQuoteId) return;
    openDocument(createdQuoteId);
  }

  async function printProposalAction() {
    if (!createdQuoteId) return;
    const token = await getOrCreateQuoteToken(createdQuoteId);
    const portalUrl = `${window.location.origin}/p/${token}?print=1`;
    window.open(portalUrl, '_blank', 'noopener,noreferrer');
  }

  function editQuoteAction() {
    setOpenCostMenu(null);
    setQuoteFlowStep(4);
  }

  const selectedClient = clientsQuery.data?.find((c) => c.id === cfg.clientId);
  const due = dueDate(TODAY(), cfg.validDays || 15);
  const showFooter = step < TOTAL_STEPS - 1;
  const nextLabel = step === 4 ? 'Generar propuesta' : 'Continuar';
  const nextDisabled = step === 1 && !categoryId && cfg.serviceLines.length === 0;

  const inputStyle: React.CSSProperties = { width: '100%', border: '1.5px solid #E2E8F0', borderRadius: 12, padding: 13, fontSize: 14, outline: 'none' };
  const inputStyle56: React.CSSProperties = { width: '100%', height: 56, border: '1px solid #E2E8F0', borderRadius: 16, padding: '0 16px', fontSize: 14, outline: 'none', background: '#fff', color: '#0F172A' };
  const labelStyle: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 };
  const selectedCategory = categoriesQuery.data?.find((c) => c.id === categoryId);
  const svc = serviceQuery.data;
  const canAddLine = !!svc && (svc.variants.length === 0 || !!variantId) && quantity > 0;
  const serviceSummary = (() => {
    const parts: string[] = [];
    const variantName = svc?.variants.find((v) => v.id === variantId)?.name;
    if (variantName) parts.push(variantName);
    if (typeof answers['exterior'] === 'boolean') parts.push(answers['exterior'] ? 'Exterior' : 'Interior');
    if (typeof answers['manos'] === 'number') parts.push(`${answers['manos']} ${answers['manos'] === 1 ? 'mano' : 'manos'}`);
    return parts.join(' · ') || undefined;
  })();
  const subtotalDirectos = C.subtotal + C.transportAmt;
  const indirectosTotal = C.adminAmt + C.imprevistosAmt + C.utilAmt;
  const lastLine = cfg.serviceLines[cfg.serviceLines.length - 1] as (typeof cfg.serviceLines)[number] | undefined;
  const lastLineSummary = (() => {
    if (!lastLine) return undefined;
    const parts: string[] = [];
    if (lastLine.variant_name) parts.push(lastLine.variant_name);
    const a = lastLine.answers ?? {};
    if (typeof a['exterior'] === 'boolean') parts.push(a['exterior'] ? 'Exterior' : 'Interior');
    if (typeof a['manos'] === 'number') parts.push(`${a['manos']} ${a['manos'] === 1 ? 'mano' : 'manos'}`);
    return parts.join(' · ') || undefined;
  })();

  return (
    <>
    {draftPrompt && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadein .2s ease', padding: 16 }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: 26, maxWidth: 420, width: '100%', boxShadow: '0 20px 60px -20px rgba(15,23,42,.4)' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>Tienes una cotización en proceso</div>
          <div style={{ fontSize: 13.5, color: '#64748B', lineHeight: 1.5, marginBottom: 20 }}>
            Encontramos un borrador sin terminar{draftPrompt.cfg.proj ? ` de "${draftPrompt.cfg.proj}"` : ''}. ¿Quieres continuar donde lo dejaste o iniciar una cotización nueva?
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={continueDraft} style={{ height: 50, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 14, borderRadius: 14, cursor: 'pointer' }}>
              Continuar cotización
            </button>
            <button onClick={discardDraft} style={{ height: 50, border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 14, borderRadius: 14, cursor: 'pointer' }}>
              Iniciar nueva
            </button>
          </div>
        </div>
      </div>
    )}
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fadein .2s ease' }}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`qf-modal${step === 0 || step === 1 || step === 2 || step === 3 || step === 4 || step === 5 ? ' qf-modal--wide' : ''}`}
        style={{ background: '#F8FAFC', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'slideUp .3s ease', boxShadow: '0 -10px 50px rgba(0,0,0,.3)' }}
      >
        {/* header */}
        <div className="qf-header" style={{ background: '#fff', borderBottom: '1px solid #EEF2F7' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
              <button onClick={back} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#F1F5F9', color: '#475569', fontSize: 18, cursor: 'pointer', flexShrink: 0 }}>‹</button>
              <div>
                <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginBottom: 2 }}>Paso {step + 1} de {TOTAL_STEPS}</div>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.4px', color: '#0F172A' }}>{STEP_TITLES[step]}</div>
                {STEP_SUBTITLES[step] && (
                  <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>{STEP_SUBTITLES[step]}</div>
                )}
              </div>
            </div>
            <button onClick={close} style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: '#F1F5F9', color: '#475569', fontSize: 16, cursor: 'pointer', flexShrink: 0 }}>✕</button>
          </div>
          <div className="qf-stepper-wrap">
            <QuotationStepper currentStep={step} labels={STEP_TITLES} />
          </div>
        </div>

        {/* body */}
        <div className="qf-body" style={{ flex: 1, overflowY: 'auto' }}>
          {step === 0 && (
            <div className="qf-step0-grid">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {(templatesQuery.data?.length ?? 0) > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 9 }}>Empieza rápido desde una plantilla</div>
                    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                      {templatesQuery.data!.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => applyTemplate({ service_lines: Array.isArray(t.service_lines) ? (t.service_lines as unknown as ServiceLine[]) : [], admin_pct: t.admin_pct, imprevistos_pct: t.imprevistos_pct, util: t.util, valid_days: t.valid_days, discount: t.discount, discount_on: t.discount_on, tax_mode: t.tax_mode, tax_rate: t.tax_rate, transport_cost: t.transport_cost, transport_enabled: t.transport_enabled })}
                          style={{ whiteSpace: 'nowrap', border: '1.5px solid #FDE68A', background: '#FFFBEB', color: '#92400E', fontWeight: 700, fontSize: 12.5, padding: '9px 14px', borderRadius: 12, cursor: 'pointer', flexShrink: 0 }}
                        >
                          ⭐ {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cliente */}
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#0F172A', letterSpacing: '-.2px' }}>Cliente</div>
                  <div style={{ fontSize: 13, color: '#64748B', marginTop: 2, marginBottom: 16 }}>Selecciona un cliente existente o crea uno nuevo.</div>

                  <div style={{ position: 'relative', marginBottom: 16 }}>
                    <Search size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                    <input
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Buscar cliente por nombre, teléfono o correo..."
                      style={{ ...inputStyle56, paddingLeft: 44, paddingRight: 44 }}
                    />
                    <ChevronDown size={18} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                  </div>

                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 10 }}>
                    {clientSearch.trim() ? 'Resultados' : 'Clientes recientes'}
                  </div>
                  <div className="qf-client-grid" style={{ marginBottom: 12 }}>
                    {(clientsQuery.data ?? [])
                      .filter((c) => c.name.toLowerCase().includes(clientSearch.trim().toLowerCase()))
                      .slice(0, clientSearch.trim() ? undefined : 3)
                      .map((c) => {
                        const selected = cfg.clientId === c.id;
                        return (
                          <button
                            key={c.id}
                            onClick={() => setField('clientId', c.id)}
                            style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minHeight: 96, border: `1.5px solid ${selected ? '#2563EB' : '#E2E8F0'}`, background: '#fff', borderRadius: 20, padding: 16, cursor: 'pointer', textAlign: 'left' }}
                          >
                            <div style={{ width: 44, height: 44, borderRadius: 12, background: selected ? '#2563EB' : '#EEF2FF', color: selected ? '#fff' : '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                              {c.initial}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>{c.name}</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {c.phone && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748B' }}>
                                    <Phone size={12} /> {c.phone}
                                  </div>
                                )}
                                {c.email && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748B' }}>
                                    <Mail size={12} /> {c.email}
                                  </div>
                                )}
                                {c.meta && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748B' }}>
                                    <MapPin size={12} /> {c.meta}
                                  </div>
                                )}
                              </div>
                            </div>
                            {selected && (
                              <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#2563EB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>✓</span>
                            )}
                          </button>
                        );
                      })}
                  </div>
                  {clientSearch.trim() && (clientsQuery.data ?? []).filter((c) => c.name.toLowerCase().includes(clientSearch.trim().toLowerCase())).length === 0 && (
                    <div style={{ fontSize: 12.5, color: '#94A3B8', padding: '4px 2px', marginBottom: 12 }}>Sin resultados para "{clientSearch.trim()}".</div>
                  )}
                  <button
                    onClick={() => setNewClientOpen(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', border: '2px dashed #93C5FD', background: '#fff', borderRadius: 20, padding: 16, cursor: 'pointer', textAlign: 'left' }}
                  >
                    <span style={{ width: 44, height: 44, borderRadius: 12, background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Plus size={20} />
                    </span>
                    <span>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#2563EB' }}>Nuevo cliente</div>
                      <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Crear un cliente nuevo</div>
                    </span>
                  </button>
                  {newClientOpen && (
                    <ClientFormModal
                      onClose={() => setNewClientOpen(false)}
                      onCreated={(c) => {
                        invalidateClients();
                        setQuoteCfg({ clientId: c.id });
                      }}
                    />
                  )}
                </div>

                {/* Proyecto */}
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#0F172A', letterSpacing: '-.2px' }}>Proyecto</div>
                  <div style={{ fontSize: 13, color: '#64748B', marginTop: 2, marginBottom: 16 }}>Define los detalles generales del proyecto.</div>

                  <div className="qf-project-grid" style={{ marginBottom: 16 }}>
                    <div>
                      <label style={labelStyle}>Nombre del proyecto</label>
                      <input style={inputStyle56} value={cfg.proj} onChange={(e) => setField('proj', e.target.value)} placeholder="Nuevo proyecto" />
                    </div>
                    <div>
                      <label style={labelStyle}>Ubicación</label>
                      <div style={{ position: 'relative' }}>
                        <input style={{ ...inputStyle56, paddingRight: 44 }} value={cfg.loc} onChange={(e) => setField('loc', e.target.value)} placeholder="Ciudad, departamento" />
                        <MapPin size={18} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Tipo de proyecto</label>
                      <input style={inputStyle56} value={cfg.projectType} onChange={(e) => setField('projectType', e.target.value)} placeholder="Ej. Remodelación, obra nueva..." />
                    </div>
                    <div>
                      <label style={labelStyle}>Observaciones</label>
                      <input style={inputStyle56} value={cfg.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="Notas adicionales (opcional)" />
                    </div>
                  </div>

                  <div style={{ marginBottom: 32 }}>
                    <label style={labelStyle}>Validez de la propuesta</label>
                    <div className="qf-vcard-grid">
                      {[7, 15, 30, 45, 60].map((n) => {
                        const active = (cfg.validDays || 15) === n;
                        return (
                          <button key={n} onClick={() => setField('validDays', n)} className={`qf-vcard${active ? ' qf-vcard--active' : ''}`}>
                            {n} días
                          </button>
                        );
                      })}
                      {(() => {
                        const isCustom = ![7, 15, 30, 45, 60].includes(cfg.validDays || 15);
                        return (
                          <button
                            onClick={() => setField('validDays', isCustom ? cfg.validDays : 21)}
                            className={`qf-vcard${isCustom ? ' qf-vcard--active' : ''}`}
                          >
                            Personalizada
                          </button>
                        );
                      })()}
                    </div>
                    {![7, 15, 30, 45, 60].includes(cfg.validDays || 15) && (
                      <NumberField
                        min={1}
                        value={cfg.validDays}
                        onChange={(v) => setField('validDays', v)}
                        style={{ ...inputStyle, marginTop: 8 }}
                      />
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 500, color: '#64748B', marginTop: 8 }}>
                      <Calendar size={16} />
                      Válida hasta <strong style={{ color: '#0F172A' }}>{fmtDateY(due)}</strong>
                    </div>
                  </div>

                  <div style={{ marginBottom: 32 }}>
                    <label style={labelStyle}>Anticipo requerido</label>
                    <div className="qf-vcard-grid">
                      {[0, 30, 50, 70].map((n) => {
                        const active = (cfg.advancePct ?? 50) === n;
                        return (
                          <button key={n} onClick={() => setField('advancePct', n)} className={`qf-vcard${active ? ' qf-vcard--active' : ''}`}>
                            {n}%
                          </button>
                        );
                      })}
                      {(() => {
                        const isCustom = ![0, 30, 50, 70].includes(cfg.advancePct ?? 50);
                        return (
                          <button
                            onClick={() => setField('advancePct', isCustom ? cfg.advancePct : 40)}
                            className={`qf-vcard${isCustom ? ' qf-vcard--active' : ''}`}
                          >
                            Otro
                          </button>
                        );
                      })()}
                    </div>
                    {![0, 30, 50, 70].includes(cfg.advancePct ?? 50) && (
                      <div style={{ position: 'relative', marginTop: 8 }}>
                        <NumberField
                          min={0}
                          max={100}
                          value={cfg.advancePct}
                          onChange={(v) => setField('advancePct', v)}
                          placeholder="Ejemplo: 40"
                          style={{ ...inputStyle56, paddingRight: 36 }}
                        />
                        <span style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', fontSize: 14, fontWeight: 600 }}>%</span>
                      </div>
                    )}
                  </div>

                  {/* Resumen del proyecto */}
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 16, padding: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <Briefcase size={18} style={{ color: '#2563EB' }} />
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Resumen del proyecto</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                        <span style={{ color: '#64748B' }}>Proyecto</span>
                        <span style={{ fontWeight: 600, color: '#0F172A' }}>{cfg.proj || 'Nuevo proyecto'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                        <span style={{ color: '#64748B' }}>Ubicación</span>
                        <span style={{ fontWeight: 600, color: '#0F172A' }}>{cfg.loc || 'Sin definir'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                        <span style={{ color: '#64748B' }}>Vigencia</span>
                        <span style={{ fontWeight: 600, color: '#0F172A' }}>{cfg.validDays || 15} días</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                        <span style={{ color: '#64748B' }}>Anticipo</span>
                        <span style={{ fontWeight: 600, color: '#0F172A' }}>{cfg.advancePct ?? 50}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar: Resumen de la cotización (desktop) */}
              <QuoteSummarySidebar
                clientName={selectedClient?.name}
                proj={cfg.proj}
                loc={cfg.loc}
                validDays={cfg.validDays || 15}
                due={due}
                advancePct={cfg.advancePct ?? 50}
                infoText="Esta información se puede editar más adelante si lo necesitas."
              />
            </div>
          )}

          {step === 1 && (
            <div className="qf-step0-grid">
              <CategoryPicker
                categories={categoriesQuery.data ?? []}
                selectedId={categoryId}
                onSelect={(id) => {
                  setCategoryId(id);
                  setServiceId(null);
                  setVariantId(null);
                  setAnswers({});
                }}
              />
              <QuoteSummarySidebar
                clientName={selectedClient?.name}
                proj={cfg.proj}
                loc={cfg.loc}
                validDays={cfg.validDays || 15}
                due={due}
                advancePct={cfg.advancePct ?? 50}
                infoText="Puedes cambiar la información del proyecto en el paso anterior."
              />
            </div>
          )}

          {step === 2 && (
            <div className="qf-step0-grid">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                {cfg.serviceLines.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>Productos agregados a esta cotización</div>
                    <ServiceLinesList lines={cfg.serviceLines} onRemove={removeLine} />
                  </div>
                )}

                {svc && !changingService ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 18, padding: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <span style={{ width: 48, height: 48, borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Info size={22} />
                      </span>
                      <div>
                        <div style={{ fontSize: 15, color: '#334155' }}>Estás cotizando: <strong style={{ color: '#2563EB', fontWeight: 700 }}>{svc.name}</strong></div>
                        <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>Completa los detalles del servicio para obtener cálculos precisos.</div>
                      </div>
                    </div>
                    <button onClick={() => setChangingService(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#2563EB', fontWeight: 700, fontSize: 13.5, padding: '12px 16px', borderRadius: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <Pencil size={15} /> Cambiar servicio
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      <label style={labelStyle}>Buscar otro producto o servicio</label>
                      <input
                        value={serviceSearch}
                        onChange={(e) => setServiceSearch(e.target.value)}
                        placeholder="Ej. pintura, pegante, baldosa…"
                        style={inputStyle}
                      />
                      {serviceSearch.trim().length >= 2 && (
                        <div style={{ marginTop: 8, border: '1.5px solid #E2E8F0', borderRadius: 12, overflow: 'hidden' }}>
                          {serviceSearchQuery.isLoading && (
                            <div style={{ padding: 12, fontSize: 12.5, color: '#94A3B8' }}>Buscando…</div>
                          )}
                          {!serviceSearchQuery.isLoading && (serviceSearchQuery.data ?? []).length === 0 && (
                            <div style={{ padding: 12, fontSize: 12.5, color: '#94A3B8' }}>Sin resultados. Elige la categoría manualmente abajo.</div>
                          )}
                          {(serviceSearchQuery.data ?? []).map((s) => (
                            <button
                              key={s.id}
                              onClick={() => { selectSearchResult(s); setChangingService(false); }}
                              style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderBottom: '1px solid #F1F5F9', background: '#fff', padding: '10px 12px', cursor: 'pointer' }}
                            >
                              <div style={{ fontSize: 13, fontWeight: 700 }}>{s.name}</div>
                              {s.category_name && <div style={{ fontSize: 11, color: '#94A3B8' }}>{s.category_name}</div>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {selectedCategory && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: 13, color: '#64748B' }}>Categoría: <strong style={{ color: '#0F172A' }}>{selectedCategory.name}</strong></div>
                        <button onClick={() => setQuoteFlowStep(1)} style={{ border: 'none', background: 'none', color: '#2563EB', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Cambiar</button>
                      </div>
                    )}

                    {!categoryId && (
                      <p style={{ fontSize: 13.5, color: '#64748B' }}>Busca un producto arriba o elige una categoría en el paso anterior.</p>
                    )}

                    {categoryId && (
                      <ServicePicker
                        services={servicesQuery.data ?? []}
                        selectedServiceId={serviceId}
                        onSelectService={(id) => { setServiceId(id); setChangingService(false); }}
                        variants={svc?.variants ?? []}
                        selectedVariantId={variantId}
                        onSelectVariant={setVariantId}
                      />
                    )}
                  </>
                )}

                {svc && (
                  <>
                    <DynamicQuestions questions={svc.questions} variantId={variantId} answers={answers} onChange={(key, value) => setAnswers((a) => ({ ...a, [key]: value }))} />

                    {svc.unit_basis !== 'global' && (
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 2 }}>{UNIT_BASIS_LABEL[svc.unit_basis]}</div>
                        <div style={{ fontSize: 13, color: '#64748B', marginBottom: 12 }}>Ingresa el área total en {svc.unit_label === 'm²' ? 'metros cuadrados (m²)' : svc.unit_label}.</div>
                        <div style={{ position: 'relative' }}>
                          <NumberField
                            min={0}
                            value={quantity}
                            onChange={setQuantity}
                            style={{ width: '100%', height: 72, border: '1px solid #E2E8F0', borderRadius: 16, padding: '0 84px 0 20px', fontSize: 24, fontWeight: 700, outline: 'none', background: '#fff', color: '#0F172A' }}
                          />
                          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, fontWeight: 700, color: '#64748B', background: '#F1F5F9', padding: '8px 14px', borderRadius: 10 }}>{svc.unit_label}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 10, background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 16, padding: 20, marginTop: 12 }}>
                          <Lightbulb size={18} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
                          <div style={{ fontSize: 13, color: '#92400E', lineHeight: 1.5 }}><strong>Consejo:</strong> Verifica muy bien el área a intervenir para obtener una cotización más precisa.</div>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={addLine}
                      disabled={!canAddLine}
                      style={{ width: '100%', height: 60, border: 'none', background: canAddLine ? '#2E63EB' : '#CBD5E1', color: '#fff', fontWeight: 700, fontSize: 18, borderRadius: 16, cursor: canAddLine ? 'pointer' : 'not-allowed' }}
                    >
                      + Agregar a la cotización
                    </button>
                  </>
                )}
              </div>

              <QuoteSummarySidebar
                clientName={selectedClient?.name}
                proj={cfg.proj}
                loc={cfg.loc}
                validDays={cfg.validDays || 15}
                due={due}
                advancePct={cfg.advancePct ?? 50}
                infoText="La información se actualizará automáticamente en los siguientes pasos."
                extraRows={svc && (
                  <>
                    <SidebarRow icon={<Wrench size={16} />} label="Servicio seleccionado" value={svc.name} sub={serviceSummary} />
                    {svc.unit_basis !== 'global' && (
                      <SidebarRow icon={<Ruler size={16} />} label={UNIT_BASIS_LABEL[svc.unit_basis]} value={`${quantity} ${svc.unit_label}`} />
                    )}
                  </>
                )}
              />
            </div>
          )}

          {step === 3 && (
            <div className="qf-step0-grid">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 16, padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <Info size={20} style={{ color: '#2563EB', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1E3A8A' }}>Los cálculos están basados en parámetros técnicos de referencia del mercado colombiano 2026.</div>
                      <div style={{ fontSize: 13, color: '#3B82F6', marginTop: 2 }}>Puedes ajustar cantidades o eliminar ítems si lo necesitas antes de continuar.</div>
                    </div>
                  </div>
                  <button onClick={() => setEditQty((e) => !e)} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #93C5FD', background: '#fff', color: '#2563EB', fontWeight: 700, fontSize: 13.5, padding: '12px 16px', borderRadius: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <Pencil size={15} /> {editQty ? 'Listo' : 'Editar cantidades'}
                  </button>
                </div>

                <ReviewPanel lines={cfg.serviceLines} onPriceChange={handlePriceChange} onQtyChange={handleQtyChange} onGroupPriceChange={handleGroupPriceChange} onGroupQtyChange={handleGroupQtyChange} materialsIvaAmt={C.materialsIvaAmt} materialsTotal={C.materialsTotal} editMode={editQty} onToggleEdit={() => setEditQty((e) => !e)} />
              </div>

              <QuoteSummarySidebar
                clientName={selectedClient?.name}
                proj={cfg.proj}
                loc={cfg.loc}
                validDays={cfg.validDays || 15}
                due={due}
                advancePct={cfg.advancePct ?? 50}
                infoText="Los valores pueden variar según las condiciones reales de la obra."
                extraRows={lastLine && (
                  <>
                    <SidebarRow icon={<Wrench size={16} />} label="Servicio seleccionado" value={lastLine.service_name} sub={lastLineSummary} />
                    {lastLine.unit_basis !== 'global' && (
                      <SidebarRow icon={<Ruler size={16} />} label={UNIT_BASIS_LABEL[lastLine.unit_basis]} value={`${lastLine.quantity_basis} ${lastLine.unit_label}`} />
                    )}
                  </>
                )}
              />
            </div>
          )}

          {step === 4 && (
            <div className="qf-step5-grid">
              {/* Columna izquierda (~50%) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Banner informativo */}
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 16, padding: 18, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ width: 40, height: 40, borderRadius: 12, background: '#fff', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Info size={20} />
                  </span>
                  <div style={{ fontSize: 13, color: '#1E40AF', lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 700 }}>Los porcentajes sugeridos están basados en mejores prácticas del sector.</div>
                    Puedes ajustarlos según tus necesidades.
                  </div>
                </div>

                {/* Costos directos */}
                <div className="qf-step5-card">
                  <CostBlockHeader icon={<Calculator size={18} />} title="Costos directos" />
                  <div>
                    <CostDirectRow
                      icon={<Package size={17} />} title="Materiales" sub="Suministro de materiales para la obra" value={C.materials}
                      menuOpen={openCostMenu === 'materiales'} onToggleMenu={() => setOpenCostMenu((k) => (k === 'materiales' ? null : 'materiales'))}
                      onEdit={goToEditRevision}
                      detailOpen={openCostDetail === 'materiales'} onToggleDetail={() => { setOpenCostDetail((k) => (k === 'materiales' ? null : 'materiales')); setOpenCostMenu(null); }}
                      detail={cfg.serviceLines.map((l) => (
                        <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748B' }}><span>{l.service_name}</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(l.materials.reduce((a, i) => a + i.subtotal, 0))}</span></div>
                      ))}
                    />
                    <CostDirectRow
                      icon={<HardHat size={17} />} title="Mano de obra" sub="Costo de personal y ejecución" value={C.labor}
                      menuOpen={openCostMenu === 'labor'} onToggleMenu={() => setOpenCostMenu((k) => (k === 'labor' ? null : 'labor'))}
                      onEdit={goToEditRevision}
                      detailOpen={openCostDetail === 'labor'} onToggleDetail={() => { setOpenCostDetail((k) => (k === 'labor' ? null : 'labor')); setOpenCostMenu(null); }}
                      detail={cfg.serviceLines.map((l) => (
                        <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748B' }}><span>{l.service_name}</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(l.labor.reduce((a, i) => a + i.subtotal, 0))}</span></div>
                      ))}
                    />
                    <CostDirectRow
                      icon={<Wrench size={17} />} title="Equipos y herramientas" sub="Alquiler y uso de equipos" value={C.equipment}
                      menuOpen={openCostMenu === 'equipos'} onToggleMenu={() => setOpenCostMenu((k) => (k === 'equipos' ? null : 'equipos'))}
                      onEdit={goToEditRevision}
                      detailOpen={openCostDetail === 'equipos'} onToggleDetail={() => { setOpenCostDetail((k) => (k === 'equipos' ? null : 'equipos')); setOpenCostMenu(null); }}
                      detail={cfg.serviceLines.map((l) => (
                        <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748B' }}><span>{l.service_name}</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(l.equipment.reduce((a, i) => a + i.subtotal, 0))}</span></div>
                      ))}
                    />
                    <CostDirectRow
                      icon={<Truck size={17} />} title="Transporte" sub="Transporte de materiales a obra" value={C.transportAmt} isLast
                      menuOpen={openCostMenu === 'transporte'} onToggleMenu={() => setOpenCostMenu((k) => (k === 'transporte' ? null : 'transporte'))}
                      onEdit={goToEditRevision}
                      detailOpen={openCostDetail === 'transporte'} onToggleDetail={() => { setOpenCostDetail((k) => (k === 'transporte' ? null : 'transporte')); setOpenCostMenu(null); }}
                      detail={<div style={{ fontSize: 12, color: '#64748B' }}>{cfg.transportEnabled ? 'Valor editable en la sección "Transporte de materiales" más abajo.' : 'El transporte no está habilitado para esta cotización.'}</div>}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 14, borderTop: '1px solid #E5E7EB' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#64748B' }}>Subtotal costos directos</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#2563EB', fontVariantNumeric: 'tabular-nums' }}>{fmt(subtotalDirectos)}</span>
                  </div>
                </div>

                {/* Costos indirectos y utilidad */}
                <div className="qf-step5-card">
                  <CostBlockHeader icon={<Percent size={18} />} title="Costos indirectos y utilidad" />
                  <div>
                    <IndirectRow icon={<Briefcase size={17} />} label="Administración" sub="Gastos administrativos y de gestión del proyecto" pct={cfg.adminPct} max={30} amt={C.adminAmt} onChange={(v) => setField('adminPct', v)} />
                    <IndirectRow icon={<Lightbulb size={17} />} label="Imprevistos" sub="Reserva para contingencias durante la obra" pct={cfg.imprevistosPct} max={20} amt={C.imprevistosAmt} onChange={(v) => setField('imprevistosPct', v)} />
                    <IndirectRow icon={<CircleDollarSign size={17} />} label="Utilidad" sub="Margen de ganancia del proyecto" pct={cfg.util} max={60} amt={C.utilAmt} onChange={(v) => setField('util', v)} isLast />
                  </div>

                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #E5E7EB' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <span style={{ width: 36, height: 36, borderRadius: 10, background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Receipt size={18} /></span>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Impuestos</div>
                    </div>
                    <select
                      value={cfg.taxMode}
                      onChange={(e) => {
                        const mode = e.target.value as TaxMode;
                        setQuoteCfg({ taxMode: mode, taxRate: mode === 'none' ? 0 : (cfg.taxRate || 19) });
                      }}
                      style={{ ...inputStyle, height: 48, padding: '0 14px' }}
                    >
                      <option value="none">Sin IVA</option>
                      <option value="materials">IVA sobre materiales</option>
                      <option value="materials_labor">IVA sobre materiales + mano de obra</option>
                      <option value="custom">Personalizado</option>
                    </select>
                    {cfg.taxMode !== 'none' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                        <span style={{ fontSize: 13, color: '#64748B' }}>Tasa</span>
                        <NumberField
                          min={0}
                          max={100}
                          value={cfg.taxRate}
                          onChange={(v) => setField('taxRate', v)}
                          style={{ width: 70, border: '1.5px solid #E5E7EB', borderRadius: 10, padding: '8px 10px', fontSize: 13.5, fontWeight: 700 }}
                        />
                        <span style={{ fontSize: 13, color: '#64748B' }}>%</span>
                        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(C.ivaAmt)}</span>
                      </div>
                    )}
                    <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 10 }}>Configurables según la lógica existente.</div>
                  </div>
                </div>

                {/* Transporte de materiales */}
                <div className="qf-step5-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div style={{ lineHeight: 1.35 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>Transporte de materiales</div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>Valor aproximado, editable. No afecta impuestos ni AIU; se suma directo al total.</div>
                    </div>
                    <button
                      onClick={() => setField('transportEnabled', !cfg.transportEnabled)}
                      style={{ width: 48, height: 28, borderRadius: 99, border: 'none', background: cfg.transportEnabled ? '#2563EB' : '#CBD5E1', position: 'relative', cursor: 'pointer', transition: 'background .2s', flexShrink: 0 }}
                    >
                      <div style={{ position: 'absolute', top: 3, left: cfg.transportEnabled ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)', transition: 'left .2s' }} />
                    </button>
                  </div>
                  {cfg.transportEnabled && (
                    <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #E5E7EB', borderRadius: 12, padding: '0 15px' }}>
                      <span style={{ fontSize: 13, color: '#94A3B8', marginRight: 8 }}>$</span>
                      <NumberField
                        min={0}
                        value={cfg.transportCost}
                        onChange={(v) => setField('transportCost', v)}
                        style={{ flex: 1, border: 'none', padding: '12px 0', fontSize: 16, fontWeight: 700, outline: 'none' }}
                      />
                    </div>
                  )}
                </div>

                {/* Nivel de detalle del documento */}
                <div className="qf-step5-card" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>Nivel de detalle del documento</div>
                  <select
                    value={cfg.docDetailLevel}
                    onChange={(e) => {
                      const level = e.target.value as DocDetailLevel;
                      setQuoteCfg({ docDetailLevel: level, includeTechnicalAnnex: level === 'tecnico' ? true : cfg.includeTechnicalAnnex });
                    }}
                    style={{ ...inputStyle, height: 48, padding: '0 14px' }}
                  >
                    <option value="resumen">Resumen ejecutivo</option>
                    <option value="estandar">Propuesta estándar</option>
                    <option value="detallado">Propuesta detallada</option>
                    <option value="tecnico">Propuesta técnica completa</option>
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
                    <input type="checkbox" checked={cfg.includeTechnicalAnnex} onChange={(e) => setField('includeTechnicalAnnex', e.target.checked)} style={{ width: 17, height: 17 }} />
                    Anexar detalle técnico (memoria de cálculo)
                  </label>
                </div>

                {/* Descuento al cliente */}
                <div className="qf-step5-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div style={{ lineHeight: 1.35 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>Descuento al cliente</div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>Solo aparece en la propuesta al cliente</div>
                    </div>
                    <button
                      onClick={() => setField('discountOn', !cfg.discountOn)}
                      style={{ width: 48, height: 28, borderRadius: 99, border: 'none', background: cfg.discountOn ? '#2563EB' : '#CBD5E1', position: 'relative', cursor: 'pointer', transition: 'background .2s', flexShrink: 0 }}
                    >
                      <div style={{ position: 'absolute', top: 3, left: cfg.discountOn ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)', transition: 'left .2s' }} />
                    </button>
                  </div>
                  {cfg.discountOn && (
                    <div style={{ background: '#EEF2FF', borderRadius: 14, padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1E40AF' }}>Porcentaje de descuento</span>
                        <span style={{ fontSize: 16, fontWeight: 800, color: '#2563EB' }}>{cfg.discount}%</span>
                      </div>
                      <input type="range" min={0} max={30} value={cfg.discount} onChange={(e) => setField('discount', parseInt(e.target.value, 10))} style={{ width: '100%' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 8 }}>
                        <span style={{ color: '#1E40AF' }}>Ahorro para el cliente</span>
                        <span style={{ fontWeight: 800, color: '#22C55E', fontVariantNumeric: 'tabular-nums' }}>{fmt(C.discAmt)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Columna central (~22%) — Resumen final */}
              <div className="qf-step5-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <CostBlockHeader icon={<CircleDollarSign size={18} />} title="Resumen final" />

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                  <span style={{ color: '#64748B' }}>Subtotal costos directos</span>
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(subtotalDirectos)}</span>
                </div>

                <div>
                  <button onClick={() => setShowIndirectos((s) => !s)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 13.5, fontFamily: 'inherit' }}>
                    <span style={{ color: '#64748B' }}>Más costos indirectos</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(indirectosTotal)}</span>
                      <ChevronDown size={15} style={{ color: '#94A3B8', transform: showIndirectos ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                    </span>
                  </button>
                  {showIndirectos && (
                    <div style={{ background: '#F8FAFC', borderRadius: 12, padding: 12, marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span style={{ color: '#64748B' }}>Administración ({cfg.adminPct}%)</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(C.adminAmt)}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span style={{ color: '#64748B' }}>Imprevistos ({cfg.imprevistosPct}%)</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(C.imprevistosAmt)}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span style={{ color: '#64748B' }}>Utilidad ({cfg.util}%)</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(C.utilAmt)}</span></div>
                    </div>
                  )}
                </div>

                {cfg.discountOn && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                    <span style={{ color: '#64748B' }}>Descuento ({cfg.discount}%)</span>
                    <span style={{ fontWeight: 700, color: '#DC2626', fontVariantNumeric: 'tabular-nums' }}>-{fmt(C.discAmt)}</span>
                  </div>
                )}

                {cfg.taxMode !== 'none' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                    <span style={{ color: '#64748B' }}>Impuestos (IVA {cfg.taxRate}%)</span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(C.ivaAmt)}</span>
                  </div>
                )}

                <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 16 }}>
                  <div style={{ fontSize: 13, color: '#475569', fontWeight: 600, marginBottom: 6 }}>TOTAL PROYECTADO</div>
                  <div style={{ fontSize: 36, fontWeight: 800, color: '#2563EB', letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{fmt(C.total)}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 14, padding: '16px 18px' }}>
                  <CheckCircle size={20} style={{ color: '#22C55E', flexShrink: 0 }} />
                  <div style={{ fontSize: 12.5, color: '#166534', lineHeight: 1.5, textAlign: 'left' }}>Este es el valor estimado de tu proyecto. Puedes generar la propuesta y compartirla con tu cliente.</div>
                </div>

                <div>
                  <button onClick={() => setShowCalc((s) => !s)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', border: '1px solid #BFDBFE', background: '#fff', borderRadius: 16, padding: '14px 16px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>
                      <Lightbulb size={17} style={{ color: '#2563EB' }} /> Ver cómo se calculó
                    </span>
                    <ChevronDown size={17} style={{ color: '#2563EB', transform: showCalc ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                  </button>
                  {showCalc && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Subtotal materiales</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(subtotalMateriales)}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Subtotal mano de obra</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(subtotalManoDeObra)}</span></div>
                      {subtotalOtros > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Subtotal otros</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(subtotalOtros)}</span></div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #F1F5F9', paddingTop: 6, marginTop: 2 }}><span style={{ color: '#64748B' }}>Subtotal</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(C.subtotal)}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Administración ({cfg.adminPct}%)</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(C.adminAmt)}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Imprevistos ({cfg.imprevistosPct}%)</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(C.imprevistosAmt)}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Utilidad ({cfg.util}%)</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(C.utilAmt)}</span></div>
                      {cfg.discountOn && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Descuento ({cfg.discount}%)</span><span style={{ fontWeight: 700, color: '#DC2626', fontVariantNumeric: 'tabular-nums' }}>-{fmt(C.discAmt)}</span></div>
                      )}
                      {cfg.taxMode !== 'none' && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>IVA ({cfg.taxRate}%)</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(C.ivaAmt)}</span></div>
                      )}
                      {cfg.transportEnabled && C.transportAmt > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Transporte</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(C.transportAmt)}</span></div>
                      )}
                      {(cfg.advancePct ?? 0) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Anticipo ({cfg.advancePct}%)</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(C.total * (cfg.advancePct || 0) / 100)}</span></div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #F1F5F9', paddingTop: 6, marginTop: 2 }}><span style={{ fontWeight: 700 }}>Total proyectado</span><span style={{ fontWeight: 800, color: '#2563EB', fontVariantNumeric: 'tabular-nums' }}>{fmt(C.total)}</span></div>
                    </div>
                  )}
                </div>
              </div>

              {/* Columna derecha (~28%) — Resumen de la cotización */}
              <QuoteSummarySidebar
                clientName={selectedClient?.name}
                proj={cfg.proj}
                loc={cfg.loc}
                validDays={cfg.validDays || 15}
                due={due}
                advancePct={cfg.advancePct ?? 50}
                infoText="Los valores pueden variar según las condiciones reales de la obra."
                extraRows={lastLine && (
                  <>
                    <SidebarRow icon={<Wrench size={16} />} label="Servicio seleccionado" value={lastLine.service_name} sub={lastLineSummary} />
                    {lastLine.unit_basis !== 'global' && (
                      <SidebarRow icon={<Ruler size={16} />} label={UNIT_BASIS_LABEL[lastLine.unit_basis]} value={`${lastLine.quantity_basis} ${lastLine.unit_label}`} />
                    )}
                  </>
                )}
              />
            </div>
          )}

          {step === 5 && (
            <div className="qf-step6-grid">
              {/* Columna izquierda */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Banner superior de éxito */}
                <div className="qf-step6-banner">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 240 }}>
                    <span style={{ width: 56, height: 56, borderRadius: '50%', background: '#fff', border: '2px solid #BBF7D0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <CheckCircle size={28} style={{ color: '#22C55E' }} />
                    </span>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', letterSpacing: '-.3px' }}>¡Tu cotización está lista!</div>
                      <div style={{ fontSize: 13, color: '#15803D', marginTop: 3, lineHeight: 1.5 }}>
                        Cotización de {fmt(C.total)} para {selectedClient?.name || 'tu cliente'}.<br />Compártela ahora y comienza tu proyecto.
                      </div>
                    </div>
                  </div>
                  <div style={{ background: '#fff', borderRadius: 14, padding: '14px 22px', textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.5px' }}>Total proyectado</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmt(C.total)}</div>
                  </div>
                </div>

                {/* Compartir por canales */}
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Compartir por canales</div>
                  <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2, marginBottom: 14 }}>Elige el canal más conveniente para enviar tu propuesta al cliente.</div>
                  <div className="qf-step6-channels">
                    {/* WhatsApp */}
                    <div className="qf-step5-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10 }}>
                      <span style={{ width: 48, height: 48, borderRadius: '50%', background: '#DCFCE7', color: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MessageCircle size={22} /></span>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>WhatsApp</div>
                      <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.4, flex: 1 }}>Envía la propuesta por WhatsApp al cliente.</div>
                      <button onClick={shareWhatsAppAction} disabled={!createdQuoteId} style={{ width: '100%', border: 'none', background: '#22C55E', color: '#fff', fontWeight: 700, fontSize: 12.5, padding: '11px 10px', borderRadius: 11, cursor: createdQuoteId ? 'pointer' : 'not-allowed', opacity: createdQuoteId ? 1 : 0.6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <MessageCircle size={14} /> Compartir por WhatsApp
                      </button>
                    </div>

                    {/* Correo electrónico */}
                    <div className="qf-step5-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10 }}>
                      <span style={{ width: 48, height: 48, borderRadius: '50%', background: '#DBEAFE', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Mail size={22} /></span>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>Correo electrónico</div>
                      <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.4, flex: 1 }}>Envía la propuesta por correo electrónico.</div>
                      <button onClick={sendEmailAction} disabled={!createdQuoteId} style={{ width: '100%', border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 12.5, padding: '11px 10px', borderRadius: 11, cursor: !createdQuoteId ? 'not-allowed' : 'pointer', opacity: !createdQuoteId ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <Mail size={14} /> Enviar por correo
                      </button>
                    </div>

                    {/* Portal del cliente */}
                    <div className="qf-step5-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10 }}>
                      <span style={{ width: 48, height: 48, borderRadius: '50%', background: '#EDE9FE', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Globe size={22} /></span>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>Portal del cliente</div>
                      <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.4, flex: 1 }}>Comparte un enlace para que el cliente vea la propuesta online.</div>
                      <button onClick={copyPortalLinkAction} disabled={!createdQuoteId} style={{ width: '100%', border: 'none', background: '#7C3AED', color: '#fff', fontWeight: 700, fontSize: 12.5, padding: '11px 10px', borderRadius: 11, cursor: createdQuoteId ? 'pointer' : 'not-allowed', opacity: createdQuoteId ? 1 : 0.6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <Copy size={14} /> {linkCopied ? '¡Enlace copiado!' : 'Copiar enlace'}
                      </button>
                    </div>

                    {/* Descargar PDF */}
                    <div className="qf-step5-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10 }}>
                      <span style={{ width: 48, height: 48, borderRadius: '50%', background: '#FEE2E2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Download size={22} /></span>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>Descargar PDF</div>
                      <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.4, flex: 1 }}>Descarga la propuesta en formato PDF.</div>
                      <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                        <button onClick={downloadPdfAction} disabled={!createdQuoteId} style={{ flex: 1, border: 'none', background: '#DC2626', color: '#fff', fontWeight: 700, fontSize: 12.5, padding: '11px 6px', borderRadius: 11, cursor: createdQuoteId ? 'pointer' : 'not-allowed', opacity: createdQuoteId ? 1 : 0.6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <Download size={14} /> PDF
                        </button>
                        <button onClick={printProposalAction} disabled={!createdQuoteId} title="Imprimir" style={{ border: '1.5px solid #E5E7EB', background: '#fff', color: '#475569', fontWeight: 700, padding: '11px 12px', borderRadius: 11, cursor: createdQuoteId ? 'pointer' : 'not-allowed', opacity: createdQuoteId ? 1 : 0.6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Printer size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Opciones adicionales */}
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Opciones adicionales</div>
                  <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2, marginBottom: 14 }}>Guarda, edita o reutiliza esta cotización cuando lo necesites.</div>
                  <div className="qf-step6-options">
                    <button
                      className="qf-step6-option"
                      onClick={() => {
                        if (templatesAccess.data === false) {
                          openUpgradeModal({
                            title: 'Plantillas disponibles en PRO',
                            message: 'Guardar cotizaciones como plantilla está disponible desde el plan PRO por $39.900/mes.',
                            targetPlan: 'pro',
                            ctaLabel: 'Actualizar a PRO',
                          });
                          return;
                        }
                        createTemplateMutation.mutate();
                      }}
                      disabled={createTemplateMutation.isPending}
                    >
                      <span style={{ width: 38, height: 38, borderRadius: 10, background: '#F8FAFC', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Bookmark size={17} /></span>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                          Guardar como plantilla
                          {templatesAccess.data === false && (
                            <span style={{ fontSize: 10, fontWeight: 800, color: '#D97706', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: '1px 6px' }}>PRO</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748B' }}>Úsala como base para futuras cotizaciones</div>
                      </div>
                    </button>
                    <button className="qf-step6-option" onClick={() => duplicateQuoteMutation.mutate()} disabled={!createdQuoteId || duplicateQuoteMutation.isPending}>
                      <span style={{ width: 38, height: 38, borderRadius: 10, background: '#F8FAFC', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Files size={17} /></span>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>Duplicar cotización</div>
                        <div style={{ fontSize: 12, color: '#64748B' }}>Crea una nueva cotización similar</div>
                      </div>
                    </button>
                    <button className="qf-step6-option" onClick={editQuoteAction}>
                      <span style={{ width: 38, height: 38, borderRadius: 10, background: '#F8FAFC', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Pencil size={17} /></span>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>Editar cotización</div>
                        <div style={{ fontSize: 12, color: '#64748B' }}>Realiza ajustes antes de compartir</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Estado legal de la cotización */}
                <div className="qf-step5-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flex: 1, minWidth: 220 }}>
                    <span style={{ width: 36, height: 36, borderRadius: 10, background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Info size={17} /></span>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>Estado legal de la cotización</div>
                      <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Para compartir esta propuesta, asegúrate de que el cliente haya aceptado el tratamiento de datos.</div>
                    </div>
                  </div>
                  {consentQuery.data?.status === 'accepted' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: '10px 14px' }}>
                      <ShieldCheck size={16} style={{ color: '#22C55E', flexShrink: 0 }} />
                      <div style={{ fontSize: 12, color: '#166534', lineHeight: 1.4 }}>
                        <div style={{ fontWeight: 700 }}>Tratamiento de datos aceptado</div>
                        {consentQuery.data.accepted_at && <div>Aceptado el {fmtDateY(new Date(consentQuery.data.accepted_at))}</div>}
                      </div>
                    </div>
                  )}
                  {consentQuery.data?.status === 'rejected' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '10px 14px' }}>
                      <ShieldAlert size={16} style={{ color: '#DC2626', flexShrink: 0 }} />
                      <div style={{ fontSize: 12, color: '#991B1B', fontWeight: 700 }}>Tratamiento de datos rechazado</div>
                    </div>
                  )}
                  {(!consentQuery.data || consentQuery.data.status === 'pending') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: '10px 14px' }}>
                      <AlertTriangle size={16} style={{ color: '#D97706', flexShrink: 0 }} />
                      <div style={{ fontSize: 12, color: '#92400E', fontWeight: 700 }}>Pendiente de autorización</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Columna derecha — Resumen de la cotización */}
              <QuoteSummarySidebar
                clientName={selectedClient?.name}
                proj={cfg.proj}
                loc={cfg.loc}
                validDays={cfg.validDays || 15}
                due={due}
                advancePct={cfg.advancePct ?? 50}
                extraRows={lastLine && (
                  <>
                    <SidebarRow icon={<Wrench size={16} />} label="Servicio seleccionado" value={lastLine.service_name} sub={lastLineSummary} />
                    {lastLine.unit_basis !== 'global' && (
                      <SidebarRow icon={<Ruler size={16} />} label={UNIT_BASIS_LABEL[lastLine.unit_basis]} value={`${lastLine.quantity_basis} ${lastLine.unit_label}`} />
                    )}
                  </>
                )}
                footerExtra={(
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 14, borderTop: '1px dashed #E2E8F0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#64748B' }}>Subtotal costos directos</span>
                      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(subtotalDirectos)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#64748B' }}>Más costos indirectos</span>
                      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(indirectosTotal)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid #E2E8F0' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>TOTAL PROYECTADO</span>
                      <span style={{ fontSize: 19, fontWeight: 800, color: '#2563EB', fontVariantNumeric: 'tabular-nums' }}>{fmt(C.total)}</span>
                    </div>
                  </div>
                )}
              />
            </div>
          )}
        </div>

        {/* footer */}
        {showFooter && (
          <div style={{ background: '#fff', borderTop: '1px solid #EEF2F7' }}>
            {step < 4 && (
              <div style={{ borderBottom: '1px solid #F1F5F9' }}>
                <button
                  onClick={() => setShowCalc((s) => !s)}
                  className="qf-body"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', border: 'none', background: 'none', paddingTop: 10, paddingBottom: 10, cursor: 'pointer' }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#475569' }}>Resumen parcial</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(C.total)}</span>
                    <span style={{ fontSize: 11, color: '#94A3B8' }}>{showCalc ? '▲' : '▼'}</span>
                  </span>
                </button>
                {showCalc && (
                  <div className="qf-body" style={{ paddingTop: 0, paddingBottom: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Subtotal</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(C.subtotal)}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Administración ({cfg.adminPct}%)</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(C.adminAmt)}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Imprevistos ({cfg.imprevistosPct}%)</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(C.imprevistosAmt)}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Utilidad ({cfg.util}%)</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(C.utilAmt)}</span></div>
                    {cfg.taxMode !== 'none' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>IVA ({cfg.taxRate}%)</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(C.ivaAmt)}</span></div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #F1F5F9', paddingTop: 6, marginTop: 2 }}><span style={{ fontWeight: 700 }}>Total</span><span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(C.total)}</span></div>
                  </div>
                )}
              </div>
            )}
            {step === 4 && (
              <div className="qf-body qf-step5-footer-stats" style={{ paddingTop: 12, paddingBottom: 12, borderBottom: '1px solid #F1F5F9' }}>
                <div className="qf-step5-footer-stat">
                  <span style={{ width: 32, height: 32, borderRadius: 9, background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Package size={15} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.4px' }}>Materiales</div>
                    <div style={{ fontSize: 13.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(C.materials)}</div>
                  </div>
                </div>
                <div className="qf-step5-footer-stat">
                  <span style={{ width: 32, height: 32, borderRadius: 9, background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><HardHat size={15} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.4px' }}>Mano de obra</div>
                    <div style={{ fontSize: 13.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(C.labor)}</div>
                  </div>
                </div>
                <div className="qf-step5-footer-stat">
                  <span style={{ width: 32, height: 32, borderRadius: 9, background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Calculator size={15} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.4px' }}>Directos</div>
                    <div style={{ fontSize: 13.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(subtotalDirectos)}</div>
                  </div>
                </div>
                <div className="qf-step5-footer-stat">
                  <span style={{ width: 32, height: 32, borderRadius: 9, background: '#2563EB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><CircleDollarSign size={15} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.4px' }}>Total proyectado</div>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: '#2563EB', fontVariantNumeric: 'tabular-nums' }}>{fmt(C.total)}</div>
                  </div>
                </div>
              </div>
            )}
            <div className="qf-body" style={{ paddingTop: 14, paddingBottom: 'calc(14px + env(safe-area-inset-bottom))', display: 'flex', gap: 10 }}>
              <button onClick={back} style={{ height: 56, border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 14, padding: '0 20px', borderRadius: 16, cursor: 'pointer' }}>
                Atrás
              </button>
              <button onClick={next} disabled={nextDisabled} style={{ flex: 1, height: 56, border: 'none', background: nextDisabled ? '#CBD5E1' : '#2563EB', color: '#fff', fontWeight: 700, fontSize: 15, borderRadius: 16, cursor: nextDisabled ? 'not-allowed' : 'pointer', boxShadow: nextDisabled ? 'none' : '0 8px 18px -8px rgba(37,99,235,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {nextLabel}
                {step === 4 && <ArrowRight size={18} />}
              </button>
            </div>
          </div>
        )}

        {step === TOTAL_STEPS - 1 && (
          <div style={{ background: '#fff', borderTop: '1px solid #EEF2F7' }}>
            <div className="qf-body" style={{ paddingTop: 14, paddingBottom: 'calc(14px + env(safe-area-inset-bottom))', display: 'flex', gap: 10 }}>
              <button onClick={back} style={{ height: 56, border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 14, padding: '0 20px', borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                ← Volver al resumen
              </button>
              <button onClick={finishAndClose} style={{ flex: 1, height: 56, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 15, borderRadius: 16, cursor: 'pointer', boxShadow: '0 8px 18px -8px rgba(37,99,235,.6)' }}>
                Finalizar y salir
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
