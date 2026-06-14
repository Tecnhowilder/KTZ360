import { supabase } from '../lib/supabaseClient';
import type { ClientConsentRow, QuoteEventRow } from '../lib/database.types';

export async function getLatestClientConsent(clientId: string): Promise<ClientConsentRow | null> {
  const { data, error } = await supabase
    .from('client_consents')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listQuoteEvents(workspaceId: string): Promise<QuoteEventRow[]> {
  const { data, error } = await supabase
    .from('quote_events')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function listQuoteEventsForQuote(quoteId: string): Promise<QuoteEventRow[]> {
  const { data, error } = await supabase
    .from('quote_events')
    .select('*')
    .eq('quote_id', quoteId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}
