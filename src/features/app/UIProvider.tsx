import { createContext, useContext, useState, type ReactNode } from 'react';
import type { CompanySettings, QConfig } from '../../lib/types';

export interface QuoteFlowState {
  open: boolean;
  step: number;
  quoteId: string | null; // si se está editando/duplicando una cotización existente
  mode: 'create' | 'edit';
  cfg: QConfig;
}

interface UIContextValue {
  quoteFlow: QuoteFlowState;
  openQuoteFlow: (opts?: { step?: number; quoteId?: string | null; mode?: 'create' | 'edit'; cfg?: Partial<QConfig> }) => void;
  closeQuoteFlow: () => void;
  setQuoteFlowStep: (step: number) => void;
  setQuoteCfg: (patch: Partial<QConfig> | ((cfg: QConfig) => QConfig)) => void;

  detailQuoteId: string | null;
  openQuoteDetail: (id: string) => void;
  closeQuoteDetail: () => void;

  detailClientId: string | null;
  openClientDetail: (id: string) => void;
  closeClientDetail: () => void;

  docQuoteId: string | null;
  openDocument: (id: string) => void;
  closeDocument: () => void;

  upgradeModal: UpgradeModalInfo | null;
  openUpgradeModal: (info: UpgradeModalInfo) => void;
  closeUpgradeModal: () => void;
}

export interface UpgradeModalInfo {
  title: string;
  message: string;
  targetPlan: 'pro' | 'premium';
  ctaLabel: string;
  bullets?: string[];
  secondaryLabel?: string;
}

const UIContext = createContext<UIContextValue | undefined>(undefined);

/** Configuración inicial para una cotización nueva. Si se pasa `company`
 * (de `company_settings`), se usan sus valores fiscales/comerciales por
 * defecto en lugar de los genéricos. */
export function defaultQConfig(company?: Pick<CompanySettings, 'tax_mode' | 'tax_rate' | 'advance_pct' | 'valid_days_default'>): QConfig {
  return {
    clientId: null,
    proj: 'Nuevo proyecto',
    loc: '',
    projectType: '',
    notes: '',
    serviceLines: [],
    adminPct: 0,
    imprevistosPct: 0,
    util: 25,
    taxMode: company?.tax_mode ?? 'materials_labor',
    taxRate: company?.tax_rate ?? 19,
    advancePct: company?.advance_pct ?? 50,
    docDetailLevel: 'estandar',
    includeTechnicalAnnex: false,
    validDays: company?.valid_days_default ?? 15,
    discount: 0,
    discountOn: false,
    transportCost: 0,
    transportEnabled: false,
  };
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [quoteFlow, setQuoteFlow] = useState<QuoteFlowState>({
    open: false,
    step: 0,
    quoteId: null,
    mode: 'create',
    cfg: defaultQConfig(),
  });
  const [detailQuoteId, setDetailQuoteId] = useState<string | null>(null);
  const [detailClientId, setDetailClientId] = useState<string | null>(null);
  const [docQuoteId, setDocQuoteId] = useState<string | null>(null);
  const [upgradeModal, setUpgradeModal] = useState<UpgradeModalInfo | null>(null);

  function openQuoteFlow(opts?: { step?: number; quoteId?: string | null; mode?: 'create' | 'edit'; cfg?: Partial<QConfig> }) {
    setQuoteFlow({
      open: true,
      step: opts?.step ?? 0,
      quoteId: opts?.quoteId ?? null,
      mode: opts?.mode ?? 'create',
      cfg: { ...defaultQConfig(), ...(opts?.cfg ?? {}) },
    });
  }

  function closeQuoteFlow() {
    setQuoteFlow((s) => ({ ...s, open: false }));
  }

  function setQuoteFlowStep(step: number) {
    setQuoteFlow((s) => ({ ...s, step }));
  }

  function setQuoteCfg(patch: Partial<QConfig> | ((cfg: QConfig) => QConfig)) {
    setQuoteFlow((s) => ({ ...s, cfg: typeof patch === 'function' ? patch(s.cfg) : { ...s.cfg, ...patch } }));
  }

  return (
    <UIContext.Provider
      value={{
        quoteFlow,
        openQuoteFlow,
        closeQuoteFlow,
        setQuoteFlowStep,
        setQuoteCfg,
        detailQuoteId,
        openQuoteDetail: setDetailQuoteId,
        closeQuoteDetail: () => setDetailQuoteId(null),
        detailClientId,
        openClientDetail: setDetailClientId,
        closeClientDetail: () => setDetailClientId(null),
        docQuoteId,
        openDocument: setDocQuoteId,
        closeDocument: () => setDocQuoteId(null),
        upgradeModal,
        openUpgradeModal: setUpgradeModal,
        closeUpgradeModal: () => setUpgradeModal(null),
      }}
    >
      {children}
    </UIContext.Provider>
  );
}

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI debe usarse dentro de UIProvider');
  return ctx;
}
