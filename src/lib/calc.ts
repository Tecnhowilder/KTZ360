import { MONTHS, MONTHS_LONG } from './data';
import { computeQuote, type ServiceLine } from './engine';
import type { Quote, DerivedQuote, QuoteStatus, ChartPoint, Client, TaxMode, DocDetailLevel } from './types';
export { formatCurrencyCOP, formatCurrencyCOPCompact } from './currency';

export function TODAY(): Date {
  return new Date();
}

export function daysAgo(dateStr: string): number {
  const ms = TODAY().getTime() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function dueDate(created: Date, validDays: number): Date {
  const d = new Date(created);
  d.setDate(d.getDate() + validDays);
  return d;
}

export function fmtDate(date: Date): string {
  return date.getDate() + ' ' + MONTHS[date.getMonth()];
}

export function fmtDateY(date: Date): string {
  return date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
}

export function fmtDateLong(date: Date): string {
  return date.getDate() + ' de ' + MONTHS_LONG[date.getMonth()] + ' ' + date.getFullYear();
}

export function fmt(n: number): string {
  return '$ ' + Math.round(n).toLocaleString('es-CO');
}

/** @deprecated Usar formatCurrencyCOP() — nunca abreviar montos en KTZ360 */
export function fmtM(n: number): string {
  // Redirigido a formatCurrencyCOP: muestra valor completo (ej. $ 1.741.927)
  return '$ ' + Math.round(n).toLocaleString('es-CO');
}

/** Nombres de los servicios incluidos en una cotización, para mostrar en listados. */
export function serviceLabel(lines: ServiceLine[]): string {
  if (lines.length === 0) return 'Sin servicios';
  return lines.map(l => l.service_name + (l.variant_name ? ' · ' + l.variant_name : '')).join(' + ');
}

/** Serie de cotizaciones aprobadas por mes (para Reportes). */
export function chartData(quotes: Quote[]): ChartPoint[] {
  const now = TODAY();
  const points: ChartPoint[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const total = quotes
      .filter(q => q.status === 'Aprobada')
      .filter(q => {
        const c = new Date(q.created_at);
        return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
      })
      .reduce((a, q) => a + (q.calc_snapshot && typeof q.calc_snapshot === 'object' && 'total' in (q.calc_snapshot as object) ? Number((q.calc_snapshot as Record<string, unknown>).total) || 0 : 0), 0);
    points.push({ label: MONTHS[d.getMonth()], value: total });
  }
  return points;
}

/** Monto del anticipo requerido sobre el total de la cotización. */
export function advanceAmount(total: number, advancePct: number): number {
  return total * (advancePct || 0) / 100;
}

export function deriveQuote(quote: Quote, client: Client | undefined): DerivedQuote {
  const serviceLines = Array.isArray(quote.service_lines) ? (quote.service_lines as unknown as ServiceLine[]) : [];
  // Compatibilidad: cotizaciones creadas antes de tax_mode/tax_rate usaban el
  // booleano `iva` (19% fijo). Si iva === false, fuerza "Sin IVA" para que el
  // resultado no cambie respecto a lo que el cliente vio originalmente.
  const taxMode: TaxMode = quote.iva === false ? 'none' : ((quote.tax_mode ?? 'materials_labor') as TaxMode);
  const taxRate = quote.iva === false ? 0 : (quote.tax_rate ?? 19);
  const cfg = {
    serviceLines,
    adminPct: quote.admin_pct || 0,
    imprevistosPct: quote.imprevistos_pct || 0,
    util: quote.util,
    taxMode,
    taxRate,
    advancePct: quote.advance_pct ?? 50,
    docDetailLevel: (quote.doc_detail_level ?? 'estandar') as DocDetailLevel,
    includeTechnicalAnnex: quote.include_technical_annex ?? false,
    discount: quote.discount || 0,
    discountOn: quote.discount_on || false,
    transportCost: quote.transport_cost ?? 0,
    transportEnabled: quote.transport_enabled ?? false,
    validDays: quote.valid_days || 15,
    termsConditions: Array.isArray(quote.terms_conditions) ? (quote.terms_conditions as unknown as string[]) : [],
  };
  const C = computeQuote(serviceLines, cfg);
  const created = new Date(quote.created_at);
  const due = dueDate(created, cfg.validDays);
  const expired = TODAY() > due && (quote.status === 'Enviada' || quote.status === 'Borrador');
  const status: QuoteStatus = expired ? 'Vencida' : quote.status;
  return {
    ...quote, cfg, status, baseStatus: quote.status,
    calc: C,
    clientName: client ? client.name : 'Sin cliente',
    clientInitial: client?.initial || (client ? client.name.charAt(0).toUpperCase() : '?'),
    initial: serviceLabel(serviceLines).charAt(0).toUpperCase(),
    dateLabel: fmtDate(created), dueLabel: fmtDate(due), dueLabelY: fmtDateY(due),
  };
}

export interface StatusStyle { c: string; b: string; dot: string; }

export function statusStyle(s: QuoteStatus | string): StatusStyle {
  const map: Record<string, StatusStyle> = {
    'Aprobada': { c: '#15803D', b: '#F0FDF4', dot: '#22C55E' },
    'Enviada': { c: '#B45309', b: '#FFFBEB', dot: '#F59E0B' },
    'Borrador': { c: '#475569', b: '#F1F5F9', dot: '#94A3B8' },
    'Rechazada': { c: '#DC2626', b: '#FEF2F2', dot: '#EF4444' },
    'Vencida': { c: '#7C3AED', b: '#F5F3FF', dot: '#8B5CF6' },
  };
  return map[s] || map['Borrador'];
}

export function followMessage(clientName: string, proj: string, total: number, companyName: string, portalUrl?: string): string {
  const first = (clientName || 'Hola').split(' ')[0];
  const valorFmt = '$ ' + Math.round(total).toLocaleString('es-CO');
  let msg = [
    `Hola ${first} 👋`,
    '',
    `Preparé una propuesta personalizada para *${proj}*.`,
    '',
    `Valor estimado: *${valorFmt}*`,
  ].join('\n');
  if (portalUrl) msg += `\n\nPuedes revisar todos los detalles aquí:\n${portalUrl}`;
  msg += `\n\nQuedo atento a cualquier ajuste. Saludos,\n${companyName}`;
  return msg;
}

export function openWhats(msg: string) {
  try {
    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
  } catch {
    // ignore
  }
}
