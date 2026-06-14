import { supabase } from '../lib/supabaseClient';
import type { QuoteTemplate, ServiceLine, TaxMode } from '../lib/types';

export async function listTemplates(workspaceId: string): Promise<QuoteTemplate[]> {
  const { data, error } = await supabase
    .from('quote_templates')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export interface TemplateInput {
  name: string;
  service_lines: ServiceLine[];
  admin_pct: number;
  imprevistos_pct: number;
  util: number;
  valid_days: number;
  discount: number;
  discount_on: boolean;
  tax_mode: TaxMode;
  tax_rate: number;
  transport_cost: number;
  transport_enabled: boolean;
}

export async function createTemplate(workspaceId: string, userId: string, input: TemplateInput): Promise<QuoteTemplate> {
  const { data, error } = await supabase
    .from('quote_templates')
    .insert({ workspace_id: workspaceId, created_by: userId, ...input, service_lines: input.service_lines as never })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('quote_templates').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
