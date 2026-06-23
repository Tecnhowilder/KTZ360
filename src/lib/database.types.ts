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
  storage_used_bytes: number;
};

export type SubscriptionRow = {
  id: string;
  workspace_id: string;
  plan_id: string;
  status: 'trial_active' | 'active' | 'past_due' | 'cancelled' | 'expired' | 'suspended' | 'free';
  provider: 'manual' | 'stripe' | 'wompi' | 'mercadopago';
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  billing_cycle: 'monthly' | 'annual';
  current_period_start: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
};

export type PaymentEventRow = {
  id: string;
  payment_id: string;
  workspace_id: string | null;
  user_id: string | null;
  plan_code: string | null;
  billing_cycle: string | null;
  status: string;
  amount: number | null;
  currency_code: string | null;
  event_type: string;
  payload: Json;
  created_at: string;
};

export type WorkspaceFeaturesRow = {
  workspace_id: string;
  ai_enabled: boolean;
  photo_quote_enabled: boolean;
  multiuser_enabled: boolean;
  advanced_reports_enabled: boolean;
  updated_at: string;
};

export type UserRole =
  | 'owner' | 'admin' | 'supervisor' | 'comercial' | 'operario'
  | 'super_admin' | 'support_admin';

export type OperationalStatus = 'off' | 'disponible' | 'en_ruta' | 'en_sitio' | 'finalizado';

export type ProfileRow = {
  id: string;
  workspace_id: string;
  role: UserRole;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_path: string | null;
  email_verified: boolean;
  status: 'active' | 'inactive' | 'invited' | 'removed';
  operational_status: OperationalStatus;
  gps_consent_at: string | null;
  created_at: string;
  updated_at: string;
  onboarding_seen: boolean;
  onboarding_card_collapsed: boolean;
  onboarding_card_hidden_at: string | null;
};

export type PlanFeaturesRow = {
  plan_code: string;
  ai_enabled: boolean;
  photo_quote_enabled: boolean;
  templates_enabled: boolean;
  branding_enabled: boolean;
  custom_qr_enabled: boolean;
  advanced_reports_enabled: boolean;
  multiuser_enabled: boolean;
  quote_editing_enabled: boolean;
  pdf_tier: 'free' | 'pro';
  pipeline_enabled: boolean;
  orders_enabled: boolean;
  work_orders_enabled: boolean;
  gps_enabled: boolean;
  ai_credits_enabled: boolean;
  founder_eligible: boolean;
  storage_enabled: boolean;
  // Sprint 13
  automation_enabled: boolean;
  updated_at: string;
};

export type PlanLimitsRow = {
  plan_code: string;
  max_quotes_month: number | null;
  max_clients: number | null;
  max_catalog_items: number | null;
  max_storage_gb: number | null;
  included_users: number;
  extra_user_price: number;
  ai_credits_monthly: number;
  // Sprint 13
  max_automations: number | null;
  automation_ai_credits_pct: number;
  updated_at: string;
};

export type SubscriptionUsageRow = {
  workspace_id: string;
  period_start: string;
  period_end: string;
  quotes_count: number;
  updated_at: string;
};

export type CompanyUserRow = {
  id: string;
  workspace_id: string;
  profile_id: string;
  billable: boolean;
  created_at: string;
};

export type SystemConfigurationRow = {
  key: string;
  category: string;
  value: Json;
  updated_at: string;
  updated_by: string | null;
};

export type AdminSettingRow = {
  key: string;
  value: Json;
  updated_at: string;
};

// ─── Sprint 9: tipos backoffice ───────────────────────────────────────────────

export type FounderPromotionRow = {
  id:                  string;
  plan_code:           string;
  name:                string;
  founder_price:       number;
  regular_price:       number;
  duration_months:     number;
  max_redemptions:     number | null;
  current_redemptions: number;
  active:              boolean;
  valid_until:         string | null;
  created_at:          string;
  updated_at:          string;
};

export type AiOperationCostRow = {
  operation:    string;
  credits_cost: number;
  description:  string | null;
  active:       boolean;
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

// ─── Sprint 6: Operaciones ────────────────────────────────────────────────────

export type OrderStatus =
  | 'pendiente' | 'programado' | 'en_ejecucion'
  | 'pausado'   | 'finalizado' | 'cancelado';

export type WorkOrderStatus =
  | 'pendiente' | 'asignada' | 'en_progreso'
  | 'pausada'   | 'finalizada' | 'cancelada';

export type WorkOrderPriority = 'baja' | 'media' | 'alta' | 'urgente';

export type WorkLogEventType =
  | 'order_created' | 'order_status_changed' | 'order_assigned'
  | 'work_order_created' | 'work_order_status_changed' | 'work_order_assigned'
  | 'comment' | 'completed'
  | 'evidence_uploaded' | 'evidence_deleted';

export type OrderRow = {
  id:             string;
  workspace_id:   string;
  quote_id:       string | null;
  client_id:      string | null;
  created_by:     string;
  assigned_to:    string | null;
  order_number:   string;
  title:          string;
  description:    string | null;
  status:         OrderStatus;
  order_snapshot: Json;
  total_amount:   number;
  scheduled_at:   string | null;
  started_at:     string | null;
  finished_at:    string | null;
  notes:          string | null;
  created_at:     string;
  updated_at:     string;
  deleted_at:     string | null;
};

export type WorkOrderRow = {
  id:                string;
  workspace_id:      string;
  order_id:          string;
  created_by:        string;
  assigned_to:       string | null;
  work_order_number: string;
  title:             string;
  description:       string | null;
  status:            WorkOrderStatus;
  priority:          WorkOrderPriority;
  sequence_num:      number;
  scheduled_at:      string | null;
  started_at:        string | null;
  finished_at:       string | null;
  notes:             string | null;
  created_at:        string;
  updated_at:        string;
};

export type WorkLogRow = {
  id:            string;
  workspace_id:  string;
  order_id:      string | null;
  work_order_id: string | null;
  user_id:       string;
  event_type:    WorkLogEventType;
  from_status:   string | null;
  to_status:     string | null;
  note:          string | null;
  metadata:      Json;
  created_at:    string;
};

export type WorkspaceOrderCounterRow = {
  workspace_id:           string;
  last_order_number:      number;
  last_work_order_number: number;
};

// ─── Tipos derivados para UI ──────────────────────────────────────────────────

export interface OrderWithRelations extends OrderRow {
  client_name:        string | null;
  assigned_name:      string | null;
  creator_name:       string | null;
  work_order_count:   number;
  work_orders_done:   number;
}

export interface WorkOrderWithRelations extends WorkOrderRow {
  order_number: string;
  order_title:  string;
  client_name:  string | null;
  assigned_name: string | null;
}

export interface WorkLogWithUser extends WorkLogRow {
  user_name: string | null;
}

export interface OperationsDashboard {
  orders: {
    total: number;
    pendiente: number;
    programado: number;
    en_ejecucion: number;
    pausado: number;
    finalizado: number;
    cancelado: number;
    activos: number;
  };
  work_orders: {
    total: number;
    pendiente: number;
    asignada: number;
    en_progreso: number;
    pausada: number;
    finalizada: number;
    cancelada: number;
    activas: number;
  };
  recent_orders: OrderWithRelations[];
  recent_work_orders: WorkOrderWithRelations[];
}

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
  commercial_status: CommercialStatus;
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
  color_primary: string;
  color_secondary: string;
  color_accent: string;
  // Sprint 10: portal del cliente
  portal_enabled: boolean;
  portal_show_evidences: boolean;
  portal_show_responsible: boolean;
  portal_show_comments: boolean;
  portal_show_timeline: boolean;
  // Sprint 16
  portal_show_reviews: boolean;
  portal_show_loyalty: boolean;
  loyalty_enabled: boolean;
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
// CRM Sprint 4
// ---------------------------------------------------------------------------

export type CommercialStatus =
  | 'borrador' | 'enviada' | 'vista' | 'negociacion'
  | 'aprobada' | 'rechazada' | 'vencida';

export type SeguimientoType =
  | 'llamada' | 'whatsapp' | 'correo' | 'visita' | 'reunion' | 'nota';

export type RecordatorioStatus = 'pendiente' | 'completado' | 'cancelado';

export type QuoteCommercialHistoryRow = {
  id: string;
  quote_id: string;
  workspace_id: string;
  from_status: CommercialStatus | null;
  to_status: CommercialStatus;
  changed_by: string | null;
  observacion: string | null;
  created_at: string;
};

export type SeguimientoRow = {
  id: string;
  workspace_id: string;
  quote_id: string | null;
  client_id: string | null;
  created_by: string;
  type: SeguimientoType;
  resultado: string | null;
  comentario: string | null;
  created_at: string;
  updated_at: string;
};

export type RecordatorioRow = {
  id: string;
  workspace_id: string;
  created_by: string;
  quote_id: string | null;
  client_id: string | null;
  scheduled_at: string;
  type: SeguimientoType;
  note: string | null;
  status: RecordatorioStatus;
  created_at: string;
  updated_at: string;
};

export type ClientTimelineEventType =
  | 'quote_created' | 'quote_sent' | 'quote_viewed' | 'quote_approved'
  | 'quote_rejected' | 'quote_expired' | 'status_changed'
  | 'seguimiento' | 'nota' | 'recordatorio_created' | 'recordatorio_done';

// ---------------------------------------------------------------------------
// Portal del Cliente Sprint 10
// ---------------------------------------------------------------------------

export type PortalAccessAction =
  | 'portal_opened' | 'quote_viewed' | 'order_viewed'
  | 'ot_viewed' | 'evidence_viewed' | 'timeline_viewed';

export type ClientPortalTokenRow = {
  id: string;
  workspace_id: string;
  client_id: string;
  token: string;
  created_by: string | null;
  expires_at: string;
  revoked_at: string | null;
  last_access_at: string | null;
  created_at: string;
};

export type PortalAccessLogRow = {
  id: string;
  workspace_id: string;
  client_id: string | null;
  token_id: string | null;
  ip: string | null;
  user_agent: string | null;
  action: PortalAccessAction;
  entity_id: string | null;
  created_at: string;
};

export interface PortalConfig {
  show_evidences:   boolean;
  show_responsible: boolean;
  show_comments:    boolean;
  show_timeline:    boolean;
  // Sprint 16
  show_reviews:    boolean;
  show_loyalty:    boolean;
  loyalty_enabled: boolean;
  active_survey:   { id: string; title: string } | null;
}

// Sprint 18 — order_cost_entries table
export type OrderCostType = 'materials' | 'labor' | 'equipment' | 'overhead' | 'subcontractor' | 'transport';
export type CostRateType  = 'hourly' | 'fixed' | 'commission';

export interface OrderCostEntryRow {
  id:              string;
  workspace_id:    string;
  order_id:        string;
  work_order_id:   string | null;
  type:            OrderCostType;
  description:     string;
  amount:          number;
  recorded_by:     string | null;
  recorded_at:     string;
}

// Sprint 17 — Referral info returned from get_portal_referral_info()
export interface PortalReferralInfo {
  active:          boolean;
  ref_code?:       string;
  ref_url?:        string;
  visits?:         number;
  conversions?:    number;
  referrer_points?: number;
  referee_points?:  number;
  program_name?:   string;
  error?:          string;
}

export interface PortalCompany {
  name:            string;
  logo_path:       string | null;
  color_primary:   string;
  color_secondary: string;
  color_accent:    string;
  phone:           string | null;
  email:           string | null;
  city:            string | null;
}

export interface PortalClient {
  id:    string;
  name:  string;
  email: string | null;
  phone: string | null;
}

export interface PortalSummary {
  total_quotes:    number;
  approved_quotes: number;
  pending_quotes:  number;
  total_value:     number;
}

export interface PortalOrder {
  id:               string;
  order_number:     string;
  title:            string;
  description:      string | null;
  status:           string;
  total_amount:     number;
  scheduled_at:     string | null;
  started_at:       string | null;
  finished_at:      string | null;
  created_at:       string;
  updated_at:       string;
  assigned_name:    string | null;
  work_order_count: number;
  work_orders_done: number;
}

export interface PortalWorkOrder {
  id:                string;
  work_order_number: string;
  title:             string;
  description:       string | null;
  status:            string;
  priority:          string;
  sequence_num:      number;
  scheduled_at:      string | null;
  started_at:        string | null;
  finished_at:       string | null;
  assigned_name:     string | null;
  comments:          Array<{ note: string; created_at: string }>;
}

export interface PortalEvidence {
  id:            string;
  file_name:     string;
  file_size:     number;
  file_type:     string;
  mime_type:     string;
  storage_path:  string;
  caption:       string | null;
  is_signature:  boolean;
  order_id:      string | null;
  work_order_id: string | null;
  created_at:    string;
}

export interface PortalTimelineEvent {
  type:       string;
  event_type: string;
  title:      string;
  description:string | null;
  entity_id:  string;
  amount?:    number;
  created_at: string;
}

export interface ClientPortalData {
  client:        PortalClient;
  company:       PortalCompany;
  config:        PortalConfig;
  summary:       PortalSummary;
  active_orders: PortalOrder[];
  recent_quote:  { id: string; quote_number: string; title: string; status: string; total: number; sent_at: string | null; updated_at: string } | null;
}

export interface PortalAnalytics {
  portal_enabled:      boolean;
  total_tokens:        number;
  active_tokens:       number;
  clientes_con_acceso: number;
  accesos_totales:     number;
  accesos_7d:          number;
  portal_openings_hoy: number;
  clientes_activos_hoy:number;
  by_action:           Partial<Record<PortalAccessAction, number>>;
  recent_accesses:     Array<{ client_name: string | null; action: string; created_at: string }>;
}

// ---------------------------------------------------------------------------
// GPS Sprint 8
// ---------------------------------------------------------------------------

export type GpsEventType = 'check_in' | 'check_out' | 'status_change' | 'manual_update';

export type MemberLocationRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  source: 'check_in' | 'check_out' | 'status_change' | 'manual';
  order_id: string | null;
  work_order_id: string | null;
  recorded_at: string;
};

export type GpsEventRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  event_type: GpsEventType;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  operational_status: OperationalStatus | null;
  order_id: string | null;
  work_order_id: string | null;
  metadata: Json;
  created_at: string;
};

export interface TeamMapMember {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  operational_status: OperationalStatus;
  gps_consent: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  location_source: string | null;
  location_updated: string | null;
  work_order_id: string | null;
  work_order_number: string | null;
  work_order_title: string | null;
  work_order_status: string | null;
  order_id: string | null;
  order_number: string | null;
  order_title: string | null;
}

export interface OperationalDashboard {
  team_status: Partial<Record<OperationalStatus, number>>;
  total_miembros: number;
  en_campo: number;
  checkins_hoy: number;
  checkouts_hoy: number;
  ot_activas: number;
  ot_finalizadas_hoy: number;
  miembros_en_campo: TeamMapMember[];
}

// ---------------------------------------------------------------------------
// Evidencias Sprint 7
// ---------------------------------------------------------------------------

export type EvidenceFileType = 'image' | 'video' | 'audio' | 'document' | 'signature';

export type EvidenceFileRow = {
  id: string;
  workspace_id: string;
  order_id: string | null;
  work_order_id: string | null;
  uploaded_by: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  file_type: EvidenceFileType;
  caption: string | null;
  is_signature: boolean;
  duration_sec: number | null;
  thumbnail_path: string | null;
  metadata: Json;
  deleted_at: string | null;
  created_at: string;
};

export type EvidenceFileWithUploader = EvidenceFileRow & {
  uploader_name: string | null;
};

export interface StorageUsage {
  used_bytes: number;
  max_bytes: number;
  available_bytes: number;
  pct_used: number;
  has_storage: boolean;
  by_type: Partial<Record<EvidenceFileType, { count: number; bytes: number }>>;
  recent_files: Array<{ id: string; file_name: string; file_type: EvidenceFileType; file_size: number; created_at: string }>;
}

export type ClientTimelineEventRow = {
  id: string;
  workspace_id: string;
  client_id: string;
  quote_id: string | null;
  seguimiento_id: string | null;
  recordatorio_id: string | null;
  type: ClientTimelineEventType;
  title: string;
  description: string | null;
  icon: string | null;
  metadata: Json;
  created_by: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Almacenamiento — paquetes adicionales Sprint 14
// ---------------------------------------------------------------------------

export type StorageAddonStatus = 'active' | 'cancelled';

export type WorkspaceStorageAddonRow = {
  id: string;
  workspace_id: string;
  gb: 10 | 25 | 50;
  unit_price: number;
  status: StorageAddonStatus;
  activated_at: string;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export const STORAGE_ADDON_TIERS: Array<{ gb: 10 | 25 | 50; price: number; label: string }> = [
  { gb: 10,  price: 14900, label: '+10 GB'  },
  { gb: 25,  price: 24900, label: '+25 GB'  },
  { gb: 50,  price: 35900, label: '+50 GB'  },
];

export type StorageAddonListResult = {
  ok: boolean;
  error?: string;
  addons: WorkspaceStorageAddonRow[];
};

export type ActivateAddonResult = {
  ok: boolean;
  error?: string;
  addon_id?: string;
  gb?: number;
  message?: string;
};

export type CancelAddonResult = {
  ok: boolean;
  error?: string;
  message?: string;
};

// ---------------------------------------------------------------------------
// Equipo y usuarios — invitaciones y licencias adicionales
// ---------------------------------------------------------------------------

export type WorkspaceInvitationRow = {
  id: string;
  workspace_id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'employee';
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  token: string;
  invited_by: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};

export type AdditionalUserLicenseRow = {
  workspace_id: string;
  quantity: number;
  unit_price: number;
  updated_at: string;
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
      payment_events: Table<PaymentEventRow, 'payment_id' | 'status' | 'event_type'>;
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
      plan_features: Table<PlanFeaturesRow, 'plan_code'>;
      plan_limits: Table<PlanLimitsRow, 'plan_code'>;
      subscription_usage: Table<SubscriptionUsageRow, 'workspace_id'>;
      company_users: Table<CompanyUserRow, 'workspace_id' | 'profile_id'>;
      system_configuration: Table<SystemConfigurationRow, 'key'>;
      admin_settings: Table<AdminSettingRow, 'key'>;
      workspace_invitations: Table<WorkspaceInvitationRow, 'workspace_id' | 'email' | 'role' | 'invited_by'>;
      additional_user_licenses: Table<AdditionalUserLicenseRow, 'workspace_id'>;
      workspace_storage_addons: Table<WorkspaceStorageAddonRow, 'workspace_id' | 'gb' | 'unit_price'>;
      quote_commercial_history: Table<QuoteCommercialHistoryRow, 'quote_id' | 'workspace_id' | 'to_status'>;
      seguimientos: Table<SeguimientoRow, 'workspace_id' | 'created_by' | 'type'>;
      recordatorios: Table<RecordatorioRow, 'workspace_id' | 'created_by' | 'scheduled_at'>;
      client_timeline_events: Table<ClientTimelineEventRow, 'workspace_id' | 'client_id' | 'type' | 'title'>;
      evidence_files: Table<EvidenceFileRow, 'workspace_id' | 'uploaded_by' | 'file_name' | 'file_size' | 'mime_type' | 'storage_path' | 'file_type'>;
      member_locations: Table<MemberLocationRow, 'workspace_id' | 'user_id' | 'latitude' | 'longitude'>;
      gps_events: Table<GpsEventRow, 'workspace_id' | 'user_id' | 'event_type'>;
      client_portal_tokens: Table<ClientPortalTokenRow, 'workspace_id' | 'client_id'>;
      portal_access_log: Table<PortalAccessLogRow, 'workspace_id' | 'action'>;
      integration_invoices: Table<Record<string, unknown>, 'workspace_id' | 'provider' | 'external_invoice_id'>;
      integration_entity_refs: Table<Record<string, unknown>, 'workspace_id' | 'entity_type' | 'entity_id' | 'provider' | 'external_id'>;
      communication_log: Table<Record<string, unknown>, 'workspace_id' | 'provider' | 'channel'>;
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
      is_super_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_support_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      get_effective_plan_code: {
        Args: { p_workspace_id: string };
        Returns: string;
      };
      check_feature_access: {
        Args: { p_workspace_id: string; p_feature: string };
        Returns: boolean;
      };
      check_plan_limit: {
        Args: { p_workspace_id: string; p_limit: string };
        Returns: Json;
      };
      check_subscription_status: {
        Args: { p_workspace_id: string };
        Returns: Json;
      };
      is_owner: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      get_team_seats: {
        Args: { p_workspace_id: string };
        Returns: Json;
      };
      invite_team_member: {
        Args: { p_workspace_id: string; p_email: string; p_role: string; p_full_name?: string | null };
        Returns: Json;
      };
      revoke_invitation: {
        Args: { p_invitation_id: string };
        Returns: undefined;
      };
      resend_invitation: {
        Args: { p_invitation_id: string };
        Returns: Json;
      };
      get_invitation_preview: {
        Args: { p_token: string };
        Returns: Json;
      };
      accept_invitation: {
        Args: { p_token: string };
        Returns: Json;
      };
      update_team_member_role: {
        Args: { p_profile_id: string; p_role: string };
        Returns: undefined;
      };
      set_team_member_status: {
        Args: { p_profile_id: string; p_status: string; p_reason?: string | null };
        Returns: undefined;
      };
      transfer_ownership: {
        Args: { p_new_owner_profile_id: string };
        Returns: undefined;
      };
      update_commercial_status: {
        Args: { p_quote_id: string; p_new_status: string; p_observacion?: string | null };
        Returns: Json;
      };
      get_pipeline: {
        Args: { p_workspace_id: string };
        Returns: Json;
      };
      create_seguimiento: {
        Args: { p_workspace_id: string; p_quote_id?: string | null; p_client_id?: string | null; p_type?: string; p_resultado?: string | null; p_comentario?: string | null };
        Returns: Json;
      };
      create_recordatorio: {
        Args: { p_workspace_id: string; p_scheduled_at: string; p_type?: string; p_note?: string | null; p_quote_id?: string | null; p_client_id?: string | null };
        Returns: Json;
      };
      get_client_timeline: {
        Args: { p_workspace_id: string; p_client_id: string; p_limit?: number };
        Returns: Json;
      };
      get_crm_dashboard: {
        Args: { p_workspace_id: string };
        Returns: Json;
      };
      get_quote_commercial_history: {
        Args: { p_quote_id: string };
        Returns: Json;
      };
      get_reports_summary: {
        Args: { p_workspace_id: string; p_period_start?: string | null; p_period_end?: string | null };
        Returns: Json;
      };
      get_funnel_report: {
        Args: { p_workspace_id: string; p_period_start?: string | null; p_period_end?: string | null };
        Returns: Json;
      };
      get_services_report: {
        Args: { p_workspace_id: string; p_period_start?: string | null; p_period_end?: string | null };
        Returns: Json;
      };
      get_clients_report: {
        Args: { p_workspace_id: string; p_period_start?: string | null; p_period_end?: string | null };
        Returns: Json;
      };
      get_executive_dashboard: {
        Args: { p_workspace_id: string };
        Returns: Json;
      };
      get_smart_alerts: {
        Args: { p_workspace_id: string };
        Returns: Json;
      };
      check_evidence_upload_allowed: {
        Args: { p_order_id?: string | null; p_work_order_id?: string | null; p_file_name?: string; p_file_size?: number; p_mime_type?: string };
        Returns: Json;
      };
      register_evidence_file: {
        Args: { p_storage_path: string; p_order_id?: string | null; p_work_order_id?: string | null; p_file_name?: string; p_file_size?: number; p_mime_type?: string; p_caption?: string | null; p_is_signature?: boolean; p_duration_sec?: number | null; p_thumbnail_path?: string | null };
        Returns: Json;
      };
      delete_evidence_file: {
        Args: { p_evidence_id: string };
        Returns: Json;
      };
      get_evidence_gallery: {
        Args: { p_order_id?: string | null; p_work_order_id?: string | null; p_file_type?: string | null; p_limit?: number };
        Returns: Json;
      };
      get_storage_usage: {
        Args: { p_workspace_id: string };
        Returns: Json;
      };
      check_evidence_quota: {
        Args: { p_workspace_id: string; p_additional_bytes?: number };
        Returns: Json;
      };
      recalculate_workspace_storage: {
        Args: { p_workspace_id?: string | null };
        Returns: number;
      };
      initiate_oauth: {
        Args: { p_workspace_id: string; p_provider: string; p_redirect_to?: string };
        Returns: Json;
      };
      get_integration_status: {
        Args: { p_workspace_id: string };
        Returns: Json;
      };
      disconnect_integration: {
        Args: { p_workspace_id: string; p_provider: string };
        Returns: Json;
      };
      configure_whatsapp: {
        Args: { p_workspace_id: string; p_config: Json };
        Returns: Json;
      };
      queue_integration_event: {
        Args: { p_workspace_id: string; p_provider: string; p_event_type: string; p_payload?: Json };
        Returns: string | null;
      };
      get_whatsapp_message: {
        Args: { p_workspace_id: string; p_event_type: string; p_entity_id?: string | null; p_extra_params?: Json };
        Returns: Json;
      };
      get_integrations_admin_overview: {
        Args: Record<string, never>;
        Returns: Json;
      };
      create_referral_link: {
        Args: { p_workspace_id: string; p_client_id?: string | null };
        Returns: Json;
      };
      track_referral_visit: {
        Args: { p_ref_code: string; p_utm_source?: string | null; p_utm_medium?: string | null; p_utm_campaign?: string | null; p_utm_content?: string | null; p_utm_term?: string | null; p_landing_url?: string | null; p_referrer_url?: string | null };
        Returns: Json;
      };
      register_referral_conversion: {
        Args: { p_ref_code: string; p_referee_client_id: string; p_trigger_event?: string };
        Returns: Json;
      };
      validate_coupon: {
        Args: { p_workspace_id: string; p_code: string; p_quote_total?: number };
        Returns: Json;
      };
      apply_promotion: {
        Args: { p_workspace_id: string; p_code: string; p_quote_id: string };
        Returns: Json;
      };
      track_utm: {
        Args: { p_workspace_id: string; p_utm_source?: string | null; p_utm_medium?: string | null; p_utm_campaign?: string | null; p_utm_content?: string | null; p_utm_term?: string | null; p_lead_id?: string | null; p_client_id?: string | null };
        Returns: string;
      };
      get_referral_dashboard: {
        Args: { p_workspace_id: string };
        Returns: Json;
      };
      get_utm_analytics: {
        Args: { p_workspace_id: string; p_days?: number };
        Returns: Json;
      };
      get_growth_dashboard: {
        Args: { p_workspace_id: string };
        Returns: Json;
      };
      install_growth_templates: {
        Args: { p_workspace_id: string };
        Returns: number;
      };
      get_portal_referral_info: {
        Args: { p_portal_token: string };
        Returns: Json;
      };
      get_order_cost_entries: {
        Args: { p_workspace_id: string; p_order_id: string };
        Returns: Json;
      };
      add_order_cost_entry: {
        Args: { p_workspace_id: string; p_order_id: string; p_type: string; p_description: string; p_amount: number; p_work_order_id?: string | null };
        Returns: Json;
      };
      get_order_profit: {
        Args: { p_workspace_id: string; p_order_id: string };
        Returns: Json;
      };
      get_client_profit: {
        Args: { p_workspace_id: string; p_client_id: string; p_period_start?: string | null; p_period_end?: string | null };
        Returns: Json;
      };
      get_service_profit: {
        Args: { p_workspace_id: string; p_period_start?: string | null; p_period_end?: string | null };
        Returns: Json;
      };
      get_workspace_profitability: {
        Args: { p_workspace_id: string; p_period_start?: string | null; p_period_end?: string | null };
        Returns: Json;
      };
      get_finance_dashboard: {
        Args: { p_workspace_id: string; p_period_start?: string | null; p_period_end?: string | null };
        Returns: Json;
      };
      get_admin_finance_summary: {
        Args: Record<string, never>;
        Returns: Json;
      };
      update_invoice_status: {
        Args: { p_workspace_id: string; p_external_invoice_id: string; p_new_status: string; p_pdf_url?: string | null; p_xml_url?: string | null; p_paid_at?: string | null };
        Returns: Json;
      };
      void_invoice: {
        Args: { p_workspace_id: string; p_invoice_id: string };
        Returns: Json;
      };
      get_invoice_detail: {
        Args: { p_workspace_id: string; p_invoice_id: string };
        Returns: Json;
      };
      register_saas_invoice: {
        Args: { p_payment_event_id: string; p_workspace_id: string; p_user_id: string; p_plan_code: string; p_billing_cycle: string; p_amount: number; p_currency?: string };
        Returns: Json;
      };
      get_saas_invoice_reconciliation: {
        Args: { p_days?: number };
        Returns: Json;
      };
      store_alegra_credentials: {
        Args: { p_workspace_id: string; p_encrypted_data: string; p_encryption_iv: string; p_expires_at?: string | null };
        Returns: Json;
      };
      upsert_entity_ref: {
        Args: { p_workspace_id: string; p_entity_type: string; p_entity_id: string; p_provider: string; p_external_id: string; p_external_url?: string | null; p_metadata?: Json };
        Returns: string;
      };
      get_entity_refs: {
        Args: { p_workspace_id: string; p_entity_type: string; p_entity_id: string };
        Returns: Json;
      };
      log_communication: {
        Args: { p_workspace_id: string; p_entity_type?: string | null; p_entity_id?: string | null; p_provider?: string; p_channel?: string; p_recipient?: string | null; p_subject?: string | null; p_content_preview?: string | null; p_status?: string; p_metadata?: Json };
        Returns: string;
      };
      get_communication_history: {
        Args: { p_workspace_id: string; p_entity_type?: string | null; p_entity_id?: string | null; p_provider?: string | null; p_limit?: number };
        Returns: Json;
      };
      queue_invoice_generation: {
        Args: { p_order_id: string };
        Returns: Json;
      };
      queue_email_send: {
        Args: { p_quote_id: string; p_provider?: string };
        Returns: Json;
      };
      get_invoice_history: {
        Args: { p_workspace_id: string; p_limit?: number };
        Returns: Json;
      };
      evaluate_and_queue_automations: {
        Args: { p_workspace_id: string; p_trigger_event: string; p_entity_type: string; p_entity_id: string; p_payload?: Json; p_execution_depth?: number; p_parent_event_id?: string | null };
        Returns: number;
      };
      install_automation_templates: {
        Args: { p_workspace_id: string; p_template_keys?: string[] | null };
        Returns: Json;
      };
      toggle_automation_rule: {
        Args: { p_rule_id: string; p_enabled: boolean };
        Returns: Json;
      };
      create_automation_rule: {
        Args: { p_workspace_id: string; p_name: string; p_trigger_event: string; p_action_type: string; p_action_payload?: Json; p_delay_hours?: number; p_conditions?: Json; p_description?: string | null };
        Returns: Json;
      };
      list_automation_rules: {
        Args: { p_workspace_id: string };
        Returns: Json;
      };
      evaluate_periodic_automations: {
        Args: { p_workspace_id?: string | null };
        Returns: number;
      };
      evaluate_automation_conditions: {
        Args: { p_conditions: Json; p_entity_type: string; p_entity_id: string; p_extra_data?: Json };
        Returns: boolean;
      };
      cleanup_automation_logs: {
        Args: Record<string, never>;
        Returns: number;
      };
      cleanup_processed_integration_events: {
        Args: Record<string, never>;
        Returns: number;
      };
      calculate_customer_health: {
        Args: { p_workspace_id: string; p_client_id?: string | null };
        Returns: number;
      };
      get_customer_success_dashboard: {
        Args: { p_workspace_id: string };
        Returns: Json;
      };
      get_clients_at_risk: {
        Args: { p_workspace_id: string };
        Returns: Json;
      };
      get_vip_clients: {
        Args: { p_workspace_id: string };
        Returns: Json;
      };
      get_repurchase_opportunities: {
        Args: { p_workspace_id: string };
        Returns: Json;
      };
      recalculate_all_health_scores: {
        Args: { p_workspace_id?: string | null };
        Returns: number;
      };
      get_workspace_storage_addons: {
        Args: { p_workspace_id: string };
        Returns: Json;
      };
      activate_storage_addon: {
        Args: { p_workspace_id: string; p_gb: number; p_unit_price: number };
        Returns: Json;
      };
      cancel_storage_addon: {
        Args: { p_addon_id: string };
        Returns: Json;
      };
      grant_gps_consent: {
        Args: Record<string, never>;
        Returns: Json;
      };
      record_check_in: {
        Args: { p_latitude: number; p_longitude: number; p_accuracy?: number | null; p_order_id?: string | null; p_work_order_id?: string | null };
        Returns: Json;
      };
      record_check_out: {
        Args: { p_latitude: number; p_longitude: number; p_accuracy?: number | null; p_order_id?: string | null; p_work_order_id?: string | null };
        Returns: Json;
      };
      update_operational_status: {
        Args: { p_new_status: string };
        Returns: Json;
      };
      update_location_manual: {
        Args: { p_latitude: number; p_longitude: number; p_accuracy?: number | null };
        Returns: Json;
      };
      get_team_map: {
        Args: { p_workspace_id: string };
        Returns: Json;
      };
      get_member_detail: {
        Args: { p_user_id: string; p_workspace_id: string };
        Returns: Json;
      };
      get_operational_dashboard: {
        Args: { p_workspace_id: string };
        Returns: Json;
      };
      can_view_full_team: {
        Args: { p_workspace_id: string };
        Returns: boolean;
      };
      create_client_portal_token: {
        Args: { p_workspace_id: string; p_client_id: string; p_days_valid?: number };
        Returns: Json;
      };
      revoke_client_portal_token: {
        Args: { p_workspace_id: string; p_client_id: string };
        Returns: Json;
      };
      get_client_portal: {
        Args: { p_token: string };
        Returns: Json;
      };
      get_portal_quotes: {
        Args: { p_token: string };
        Returns: Json;
      };
      get_portal_orders: {
        Args: { p_token: string };
        Returns: Json;
      };
      get_portal_work_orders: {
        Args: { p_token: string; p_order_id: string };
        Returns: Json;
      };
      get_portal_evidences: {
        Args: { p_token: string; p_order_id?: string | null };
        Returns: Json;
      };
      get_portal_timeline: {
        Args: { p_token: string };
        Returns: Json;
      };
      get_portal_analytics: {
        Args: { p_workspace_id: string };
        Returns: Json;
      };
      log_access_denied: {
        Args: { p_route: string };
        Returns: undefined;
      };
      log_auth_event: {
        Args: { p_action: string };
        Returns: undefined;
      };
      log_login_failed: {
        Args: { p_email: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
  };
}
