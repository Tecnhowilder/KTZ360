/**
 * automations.ts — Servicio de Automatizaciones Sprint 13
 * Zero Trust: workspace_id siempre del JWT en backend.
 */
import { supabase } from '../lib/supabaseClient';

export interface AutomationRule {
  id:               string;
  name:             string;
  description:      string | null;
  template_key:     string | null;
  enabled:          boolean;
  trigger_event:    string;
  trigger_type:     'event' | 'periodic';
  delay_hours:      number;
  conditions:       AutomationCondition[];
  action_type:      string;
  action_payload:   Record<string, unknown>;
  executions_count: number;
  created_at:       string;
}

export interface AutomationCondition {
  field:    string;
  operator: 'eq' | 'neq' | 'gte' | 'lte' | 'in' | 'not_in';
  value:    unknown;
}

export interface AutomationTemplate {
  key:           string;
  name:          string;
  description:   string | null;
  category:      'crm' | 'operations' | 'retention' | 'billing';
  trigger_event: string;
  delay_hours:   number;
  action_type:   string;
  plan_required: string;
  installed:     boolean;
}

export interface AutomationLog {
  id:            string;
  rule_name:     string | null;
  trigger_event: string | null;
  action_type:   string | null;
  status:        string;
  entity_type:   string | null;
  created_at:    string;
  executed_at:   string | null;
  error_message: string | null;
}

export interface AutomationsData {
  plan_code:       string;
  max_automations: number | null;
  rules:           AutomationRule[];
  templates:       AutomationTemplate[];
  recent_logs:     AutomationLog[];
}

// ─── Helper RPC ───────────────────────────────────────────────────────────────

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  const result = data as { ok: boolean; error?: string } & T;
  if (result && typeof result === 'object' && 'ok' in result && !result.ok) {
    throw new Error(result.error ?? `Error en ${name}`);
  }
  return result as T;
}

// ─── API ──────────────────────────────────────────────────────────────────────

export async function listAutomationRules(workspaceId: string): Promise<AutomationsData> {
  return rpc<AutomationsData>('list_automation_rules', { p_workspace_id: workspaceId });
}

export async function installAutomationTemplates(
  workspaceId: string,
  templateKeys?: string[]
): Promise<{ installed: number }> {
  return rpc('install_automation_templates', {
    p_workspace_id:  workspaceId,
    p_template_keys: templateKeys ?? null,
  });
}

export async function toggleAutomationRule(
  ruleId:  string,
  enabled: boolean
): Promise<void> {
  await rpc('toggle_automation_rule', { p_rule_id: ruleId, p_enabled: enabled });
}

export async function createAutomationRule(
  workspaceId:   string,
  name:          string,
  triggerEvent:  string,
  actionType:    string,
  opts?: {
    actionPayload?: Record<string, unknown>;
    delayHours?:   number;
    conditions?:   AutomationCondition[];
    description?:  string;
  }
): Promise<{ rule_id: string }> {
  return rpc('create_automation_rule', {
    p_workspace_id:  workspaceId,
    p_name:          name,
    p_trigger_event: triggerEvent,
    p_action_type:   actionType,
    p_action_payload:opts?.actionPayload ?? {},
    p_delay_hours:   opts?.delayHours ?? 0,
    p_conditions:    opts?.conditions ?? [],
    p_description:   opts?.description ?? null,
  });
}

// ─── Labels y metadatos ───────────────────────────────────────────────────────

export const TRIGGER_EVENT_LABELS: Record<string, string> = {
  quote_created:           'Cotización creada',
  quote_sent:              'Cotización enviada',
  quote_viewed_multiple:   'Cotización vista varias veces',
  quote_approved:          'Cotización aprobada',
  quote_rejected:          'Cotización rechazada',
  order_created:           'Pedido creado',
  order_completed:         'Pedido finalizado',
  work_order_created:      'OT creada',
  work_order_assigned:     'OT asignada',
  work_order_started:      'OT iniciada',
  work_order_completed:    'OT finalizada',
  client_created:          'Cliente creado',
  client_inactive:         'Cliente inactivo (periódico)',
  work_order_delayed:      'OT retrasada (periódico)',
  followup_created:        'Seguimiento creado',
};

export const ACTION_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  create_followup_and_notify: { label: 'Crear seguimiento + notificar',  icon: '📞' },
  notify_user:                { label: 'Notificar al asesor',            icon: '🔔' },
  notify_supervisor:          { label: 'Notificar al supervisor',        icon: '⚠️' },
  send_whatsapp:              { label: 'Enviar WhatsApp',                icon: '💬' },
  send_email:                 { label: 'Enviar correo',                  icon: '✉️' },
  change_commercial_status:   { label: 'Cambiar estado comercial',       icon: '🔄' },
};

export const CATEGORY_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  crm:        { label: 'CRM',        color: '#2563EB', bg: '#EFF6FF' },
  operations: { label: 'Operaciones',color: '#D97706', bg: '#FFFBEB' },
  retention:  { label: 'Retención',  color: '#DC2626', bg: '#FEF2F2' },
  billing:    { label: 'Facturación',color: '#16A34A', bg: '#F0FDF4' },
};

export const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  queued:          { label: 'En cola',     color: '#D97706' },
  executed:        { label: 'Ejecutado',   color: '#16A34A' },
  failed:          { label: 'Error',       color: '#DC2626' },
  skipped:         { label: 'Omitido',     color: '#64748B' },
  blocked_loop:    { label: '🔒 Anti-loop',color: '#7C3AED' },
  blocked_credits: { label: '🔒 Sin créditos', color: '#EF4444' },
  blocked_limit:   { label: '🔒 Límite',   color: '#EF4444' },
};
