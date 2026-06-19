import { supabase } from '../lib/supabaseClient';

export interface PdfTemplate {
  id: string;
  workspace_id: string;
  name: string;
  is_default: boolean;
  primary_color: string;
  logo_position: 'left' | 'center' | 'right';
  show_qr: boolean;
  show_signature: boolean;
  show_bank_info: boolean;
  footer_text: string | null;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const tbl = () => (supabase as any).from('pdf_templates');

export async function getDefaultTemplate(workspaceId: string): Promise<PdfTemplate | null> {
  const { data, error } = await tbl()
    .select('*').eq('workspace_id', workspaceId).eq('is_default', true).maybeSingle();
  if (error) throw error;
  return data as PdfTemplate | null;
}

export async function listPdfTemplates(workspaceId: string): Promise<PdfTemplate[]> {
  const { data, error } = await tbl()
    .select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PdfTemplate[];
}

export async function updatePdfTemplate(
  id: string,
  patch: Partial<Pick<PdfTemplate, 'name' | 'primary_color' | 'logo_position' | 'show_qr' | 'show_signature' | 'show_bank_info' | 'footer_text' | 'is_default'>>
): Promise<PdfTemplate> {
  const { data, error } = await tbl().update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data as PdfTemplate;
}

export async function ensureDefaultTemplate(workspaceId: string, userId: string): Promise<PdfTemplate> {
  const existing = await getDefaultTemplate(workspaceId);
  if (existing) return existing;
  const { data, error } = await tbl()
    .insert({ workspace_id: workspaceId, created_by: userId, name: 'Predeterminada', is_default: true })
    .select('*').single();
  if (error) throw error;
  return data as PdfTemplate;
}
