import { supabase } from '../lib/supabaseClient';

export interface QuoteViewRow {
  quote_id: string;
  opened_at: string;
  device: string | null;
  browser: string | null;
}

export interface QuoteViewStats {
  quote_id:    string;
  total:       number;
  today:       number;
  lastViewed:  string;
  firstViewed: string;
  devices:     string[];
}

function parseUserAgent(ua: string): { device: string; browser: string } {
  const isTablet  = /iPad|tablet|Tablet/.test(ua);
  const isMobile  = !isTablet && /Mobile|Android|iPhone/.test(ua);
  const device    = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';
  const browser   = /Edg/.test(ua)     ? 'Edge'
    : /Chrome/.test(ua)   ? 'Chrome'
    : /Firefox/.test(ua)  ? 'Firefox'
    : /Safari/.test(ua)   ? 'Safari'
    : 'Other';
  return { device, browser };
}

export async function trackQuoteView(quoteId: string): Promise<void> {
  const ua             = navigator.userAgent;
  const { device, browser } = parseUserAgent(ua);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('quote_views').insert({
    quote_id:   quoteId,
    user_agent: ua,
    device,
    browser,
  });
}

export async function getQuoteViewStats(quoteIds: string[]): Promise<QuoteViewStats[]> {
  if (!quoteIds.length) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('quote_views')
    .select('quote_id, opened_at, device')
    .in('quote_id', quoteIds)
    .order('opened_at', { ascending: false });

  if (error || !data) return [];

  const todayStr = new Date().toDateString();
  const acc: Record<string, QuoteViewStats> = {};

  (data as QuoteViewRow[]).forEach(v => {
    if (!acc[v.quote_id]) {
      acc[v.quote_id] = {
        quote_id:    v.quote_id,
        total:       0,
        today:       0,
        lastViewed:  v.opened_at,
        firstViewed: v.opened_at,
        devices:     [],
      };
    }
    const s = acc[v.quote_id];
    s.total++;
    if (new Date(v.opened_at).toDateString() === todayStr) s.today++;
    if (v.opened_at > s.lastViewed)  s.lastViewed  = v.opened_at;
    if (v.opened_at < s.firstViewed) s.firstViewed = v.opened_at;
    if (v.device && !s.devices.includes(v.device)) s.devices.push(v.device);
  });

  return Object.values(acc);
}
