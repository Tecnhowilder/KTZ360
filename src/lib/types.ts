import type {
  WorkspaceRow, ProfileRow, ClientRow, ProjectRow, MaterialRow,
  QuoteTemplateRow, PdfTemplateRow, QuoteRow, CompanySettingsRow,
  LeadRow, QuoteStatusDb,
} from './database.types';
import type { ServiceLine, CalcResultV2, TaxMode, DocDetailLevel } from './engine';

export type { ServiceWithRules, ServiceLine, LineItem, DocItem, CalcResultV2, CalcDocResultV2, QuoteCalcConfig, TaxMode, DocDetailLevel } from './engine';

// ---------------------------------------------------------------------------
// Entidades de dominio (= filas de Supabase)
// ---------------------------------------------------------------------------

export type Workspace = WorkspaceRow;
export type Profile = ProfileRow;
export type Client = ClientRow;
export type Project = ProjectRow;
export type Material = MaterialRow;
export type QuoteTemplate = QuoteTemplateRow;
export type PdfTemplate = PdfTemplateRow;
export type Quote = QuoteRow;
export type CompanySettings = Omit<CompanySettingsRow, 'terms_conditions'> & { terms_conditions: string[] };
export type Lead = LeadRow;

// ---------------------------------------------------------------------------
// Tipos de UI / cálculo
// ---------------------------------------------------------------------------

export type QuoteStatus = QuoteStatusDb;

export interface QConfig {
  clientId: string | null;
  proj: string;
  loc: string;
  projectType: string;
  notes: string;
  serviceLines: ServiceLine[];
  adminPct: number;
  imprevistosPct: number;
  util: number;
  taxMode: TaxMode;
  taxRate: number;
  advancePct: number;
  docDetailLevel: DocDetailLevel;
  includeTechnicalAnnex: boolean;
  validDays: number;
  discount: number;
  discountOn: boolean;
  transportCost: number;
  transportEnabled: boolean;
}

export interface Company {
  name: string;
  nit: string;
  phone: string;
  city: string;
  email: string;
}

export type View =
  | 'dashboard' | 'cotizaciones' | 'clientes' | 'plantillas' | 'materiales'
  | 'reportes' | 'ia' | 'empresa' | 'config' | 'proyectos';

/** Cotización enriquecida para la UI: datos calculados + cliente resuelto. */
export interface DerivedQuote extends Quote {
  cfg: {
    serviceLines: ServiceLine[];
    adminPct: number;
    imprevistosPct: number;
    util: number;
    taxMode: TaxMode;
    taxRate: number;
    advancePct: number;
    docDetailLevel: DocDetailLevel;
    includeTechnicalAnnex: boolean;
    discount: number;
    discountOn: boolean;
    transportCost: number;
    transportEnabled: boolean;
    validDays: number;
    termsConditions: string[];
  };
  baseStatus: QuoteStatus;
  calc: CalcResultV2;
  clientName: string;
  clientInitial: string;
  initial: string;
  dateLabel: string;
  dueLabel: string;
  dueLabelY: string;
}

export interface ChartPoint {
  label: string;
  value: number;
}

export interface IaEstimate {
  area: number;
  categoryKey: string;
  serviceLine: ServiceLine;
  total: number;
}
