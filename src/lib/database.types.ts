// Tipos generados a mano a partir de supabase/migrations/0001_schema.sql.
// Si el esquema cambia, actualizar este archivo (o regenerar con
// `supabase gen types typescript`).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Helper: Row = forma completa de la fila. Insert requiere solo las columnas sin
 * default ni nullable; el resto (incluida Row) es opcional. Update = todo opcional. */
type Table<Row, RequiredInsert extends keyof Row = never> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, RequiredInsert>;
  Update: Partial<Row>;
  Relationships: [];
};

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export type PlanRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  currency_code: string;
  active: boolean;
  created_at: string;
};

export type WorkspaceRow = {
  id: string;
  name: string;
  type: 'independiente' | 'empresa';
  logo_path: string | null;
  currency_code: string;
  current_plan_id: string | null;
  settings: Json;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  status: string;
};

export type SubscriptionRow = {
  id: string;
  workspace_id: string;
  plan_id: string;
  status: 'trialing' | 'active' | 'past_due' | 'canceled';
  provider: 'manual' | 'stripe' | 'wompi' | 'mercadopago';
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  current_period_start: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
};

export type WorkspaceFeaturesRow = {
  workspace_id: string;
  ai_enabled: boolean;
  photo_quote_enabled: boolean;
  multiuser_enabled: boolean;
  advanced_reports_enabled: boolean;
  updated_at: string;
};

export type ProfileRow = {
  id: string;
  workspace_id: string;
  role: 'owner' | 'admin' | 'employee';
  full_name: string | null;
  email: string | null;
  avatar_path: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientRow = {
  id: string;
  workspace_id: string;
  created_by: string | null;
  name: string;
  meta: string | null;
  initial: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ProjectRow = {
  id: string;
  workspace_id: string;
  created_by: string | null;
  client_id: string | null;
  name: string;
  location: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type MaterialRow = {
  id: string;
  workspace_id: string;
  created_by: string | null;
  name: string;
  unit: string;
  category: string | null;
  price: number;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type QuoteTemplateRow = {
  id: string;
  workspace_id: string;
  created_by: string | null;
  name: string;
  services: Json;
  area: number;
  util: number;
  iva: boolean;
  service_lines: Json;
  admin_pct: number;
  imprevistos_pct: number;
  valid_days: number;
  discount: number;
  discount_on: boolean;
  tax_mode: 'none' | 'materials' | 'materials_labor' | 'custom';
  tax_rate: number;
  transport_cost: number;
  transport_enabled: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PdfTemplateRow = {
  id: string;
  workspace_id: string;
  created_by: string | null;
  name: string;
  is_default: boolean;
  config: Json;
  created_at: string;
  updated_at: string;
};

export type WorkspaceQuoteCounterRow = {
  workspace_id: string;
  year: number;
  last_number: number;
};

export type QuoteStatusDb = 'Borrador' | 'Enviada' | 'Aprobada' | 'Rechazada' | 'Vencida';

export type QuoteRow = {
  id: string;
  workspace_id: string;
  created_by: string | null;
  client_id: string | null;
  project_id: string | null;
  quote_number: string;
  title: string;
  location: string | null;
  project_type: string | null;
  notes: string | null;
  services: Json;
  area: number;
  height: number;
  util: number;
  iva: boolean;
  discount: number;
  discount_on: boolean;
  valid_days: number;
  currency_code: string;
  status: QuoteStatusDb;
  calc_snapshot: Json;
  doc_items: Json;
  service_lines: Json;
  admin_pct: number;
  imprevistos_pct: number;
  tax_mode: 'none' | 'materials' | 'materials_labor' | 'custom';
  tax_rate: number;
  transport_cost: number;
  transport_enabled: boolean;
  advance_pct: number;
  doc_detail_level: 'resumen' | 'estandar' | 'detallado' | 'tecnico';
  include_technical_annex: boolean;
  terms_conditions: Json;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CompanySettingsRow = {
  id: string;
  workspace_id: string;
  name: string;
  nit: string | null;
  phone: string | null;
  city: string | null;
  email: string | null;
  logo_path: string | null;
  tax_mode: 'none' | 'materials' | 'materials_labor' | 'custom';
  tax_rate: number;
  advance_pct: number;
  valid_days_default: number;
  terms_conditions: Json;
  white_label_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type LeadRow = {
  id: string;
  workspace_id: string;
  created_by: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type NotificationRow = {
  id: string;
  workspace_id: string;
  user_id: string | null;
  title: string;
  message: string | null;
  type: string;
  is_read: boolean;
  created_at: string;
};

export type AttachmentRow = {
  id: string;
  workspace_id: string;
  entity_type: string;
  entity_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  created_by: string | null;
  created_at: string;
};

export type AiUsageRow = {
  id: string;
  workspace_id: string;
  user_id: string | null;
  feature: string;
  provider: string;
  tokens_used: number;
  estimated_cost: number;
  created_at: string;
};

export type AuditLogRow = {
  id: string;
  workspace_id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Json;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Catálogo maestro V2 (catalog_*) — global, solo lectura para authenticated/anon
// ---------------------------------------------------------------------------

export type CatalogCategoryRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  image_path: string | null;
  supports_quality_tiers: boolean;
  sort_order: number;
  active: boolean;
};

export type CatalogServiceRow = {
  id: string;
  category_id: string;
  key: string;
  name: string;
  description: string | null;
  image_path: string | null;
  unit_basis: 'area' | 'point' | 'length' | 'global';
  unit_label: string;
  sort_order: number;
  active: boolean;
};

export type CatalogVariantRow = {
  id: string;
  service_id: string;
  key: string;
  name: string;
  description: string | null;
  sort_order: number;
  active: boolean;
};

export type CatalogQuestionRow = {
  id: string;
  service_id: string;
  variant_id: string | null;
  key: string;
  label: string;
  help_text: string | null;
  type: 'number' | 'boolean' | 'select' | 'multiselect';
  unit: string | null;
  default_value: Json;
  min: number | null;
  max: number | null;
  visible_if: Json;
  sort_order: number;
  required: boolean;
};

export type CatalogQuestionOptionRow = {
  id: string;
  question_id: string;
  value: string;
  label: string;
  sort_order: number;
  metadata: Json;
};

export type CatalogMaterialRow = {
  id: string;
  category_id: string | null;
  name: string;
  unit: string;
  description: string | null;
  image_path: string | null;
  precio_minimo: number;
  precio_sugerido: number;
  precio_maximo: number;
  packaging_unit: string | null;
  packaging_size: number | null;
  unidad_tecnica: string | null;
  precio_empaque: number | null;
  incluye_iva: boolean;
  active: boolean;
};

export type CatalogMaterialRuleRow = {
  id: string;
  service_id: string;
  variant_id: string | null;
  material_id: string;
  quantity_expr: Json;
  waste_pct: number;
  condition_expr: Json;
  round_to_package: boolean;
  label_override: string | null;
  is_primary: boolean;
  sort_order: number;
};

export type CatalogLaborRuleRow = {
  id: string;
  service_id: string;
  variant_id: string | null;
  name: string;
  unit: string;
  precio_minimo: number;
  precio_sugerido: number;
  precio_maximo: number;
  quantity_expr: Json;
  condition_expr: Json;
  sort_order: number;
};

export type CatalogEquipmentRuleRow = CatalogLaborRuleRow;

export type WorkspacePriceOverrideRow = {
  id: string;
  workspace_id: string;
  entity_type: 'material' | 'labor' | 'equipment';
  entity_id: string;
  custom_price: number;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Portal público — tokens, consentimientos y eventos comerciales
// ---------------------------------------------------------------------------

export type QuoteAccessTokenRow = {
  id: string;
  workspace_id: string;
  quote_id: string;
  token: string;
  created_at: string;
};

export type ClientConsentRow = {
  id: string;
  workspace_id: string;
  client_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  accepted_at: string | null;
  rejected_at: string | null;
  accepted_via: string | null;
  accepted_quote_id: string | null;
  consent_version: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

export type QuoteEventType =
  | 'proposal_sent'
  | 'proposal_opened'
  | 'proposal_downloaded'
  | 'proposal_accepted'
  | 'proposal_rejected'
  | 'proposal_changes_requested';

export type QuoteEventRow = {
  id: string;
  workspace_id: string;
  quote_id: string;
  event_type: QuoteEventType;
  metadata: Json | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      plans: Table<PlanRow, 'code' | 'name'>;
      workspaces: Table<WorkspaceRow, 'name'>;
      subscriptions: Table<SubscriptionRow, 'workspace_id' | 'plan_id'>;
      workspace_features: Table<WorkspaceFeaturesRow, 'workspace_id'>;
      profiles: Table<ProfileRow, 'id' | 'workspace_id'>;
      clients: Table<ClientRow, 'workspace_id' | 'name'>;
      projects: Table<ProjectRow, 'workspace_id' | 'name'>;
      materials: Table<MaterialRow, 'workspace_id' | 'name' | 'unit'>;
      quote_templates: Table<QuoteTemplateRow, 'workspace_id' | 'name'>;
      pdf_templates: Table<PdfTemplateRow, 'workspace_id'>;
      workspace_quote_counters: Table<WorkspaceQuoteCounterRow, 'workspace_id' | 'year'>;
      quotes: Table<QuoteRow, 'workspace_id' | 'title'>;
      company_settings: Table<CompanySettingsRow, 'workspace_id'>;
      leads: Table<LeadRow, 'workspace_id' | 'name'>;
      notifications: Table<NotificationRow, 'workspace_id' | 'title'>;
      attachments: Table<AttachmentRow, 'workspace_id' | 'entity_type' | 'entity_id' | 'file_name' | 'file_path'>;
      ai_usage: Table<AiUsageRow, 'workspace_id' | 'feature'>;
      audit_log: Table<AuditLogRow, 'workspace_id' | 'action' | 'entity_type'>;
      catalog_categories: Table<CatalogCategoryRow, 'key' | 'name'>;
      catalog_services: Table<CatalogServiceRow, 'category_id' | 'key' | 'name' | 'unit_basis'>;
      catalog_variants: Table<CatalogVariantRow, 'service_id' | 'key' | 'name'>;
      catalog_questions: Table<CatalogQuestionRow, 'service_id' | 'key' | 'label' | 'type'>;
      catalog_question_options: Table<CatalogQuestionOptionRow, 'question_id' | 'value' | 'label'>;
      catalog_materials: Table<CatalogMaterialRow, 'name' | 'unit'>;
      catalog_material_rules: Table<CatalogMaterialRuleRow, 'service_id' | 'material_id' | 'quantity_expr'>;
      catalog_labor_rules: Table<CatalogLaborRuleRow, 'service_id' | 'name' | 'unit'>;
      catalog_equipment_rules: Table<CatalogEquipmentRuleRow, 'service_id' | 'name' | 'unit'>;
      workspace_price_overrides: Table<WorkspacePriceOverrideRow, 'workspace_id' | 'entity_type' | 'entity_id' | 'custom_price'>;
      quote_access_tokens: Table<QuoteAccessTokenRow, 'workspace_id' | 'quote_id'>;
      client_consents: Table<ClientConsentRow, 'workspace_id' | 'client_id' | 'status'>;
      quote_events: Table<QuoteEventRow, 'workspace_id' | 'quote_id' | 'event_type'>;
    };
    Views: Record<string, never>;
    Functions: {
      get_public_quote: {
        Args: { p_token: string };
        Returns: Json;
      };
      register_quote_event: {
        Args: { p_token: string; p_event: string; p_metadata?: Json | null };
        Returns: undefined;
      };
      register_consent_and_event: {
        Args: { p_token: string; p_status: string; p_event: string; p_ip?: string | null; p_user_agent?: string | null };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
  };
}
