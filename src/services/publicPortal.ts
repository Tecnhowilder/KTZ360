import { supabase } from '../lib/supabaseClient';
import { getQuote } from './quotes';
import type { ClientRow, CompanySettingsRow, Json, QuoteEventType, QuoteRow } from '../lib/database.types';

export interface PublicQuoteData {
  quote: QuoteRow;
  client: ClientRow | null;
  company: CompanySettingsRow | null;
  consent_status: 'pending' | 'accepted' | 'rejected' | null;
}

export async function getOrCreateQuoteToken(quoteId: string): Promise<string> {
  const { data: existing, error: selError } = await supabase
    .from('quote_access_tokens')
    .select('token')
    .eq('quote_id', quoteId)
    .maybeSingle();
  if (selError) throw selError;
  if (existing) return existing.token;

  const quote = await getQuote(quoteId);
  const { data, error } = await supabase
    .from('quote_access_tokens')
    .insert({ workspace_id: quote.workspace_id, quote_id: quoteId })
    .select('token')
    .single();
  if (error) throw error;
  return data.token;
}

export async function getPublicQuote(token: string): Promise<PublicQuoteData> {
  const { data, error } = await supabase.rpc('get_public_quote', { p_token: token });
  if (error) throw error;
  return data as unknown as PublicQuoteData;
}

export async function registerQuoteEvent(token: string, event: QuoteEventType, metadata?: Json | null): Promise<void> {
  const { error } = await supabase.rpc('register_quote_event', { p_token: token, p_event: event, p_metadata: metadata ?? null });
  if (error) throw error;
}

export async function registerConsentAndEvent(token: string, status: 'accepted' | 'rejected', event: QuoteEventType): Promise<void> {
  const { error } = await supabase.rpc('register_consent_and_event', {
    p_token: token,
    p_status: status,
    p_event: event,
    p_ip: null,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
}
