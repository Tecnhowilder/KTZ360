/**
 * shareUtils.ts — Utilidades de compartición profesional para Shelwi.
 *
 * FUENTE DE VERDAD:
 *   - WhatsApp: usar services/whatsapp.ts (Sprint 11 unificó todo)
 *   - Email API (Gmail/Outlook): usar services/integrations.ts + integration-worker
 *   - Email fallback (mailto/native): usar shareByEmail() de ESTE archivo
 *
 * Este archivo mantiene únicamente:
 *   - Email (mailto/navigator.share) — fallback browser nativo
 *   - Copy link
 */
import { formatCurrencyCOP } from './currency';
import { openExternalUrl, openEmail } from './capacitorBridge';

export interface ShareParams {
  clientName: string;
  projectName: string;
  companyName: string;
  publicUrl: string;
  total?: number;
  phone?: string;
  clientEmail?: string;
  quoteNumber?: string;
}

/**
 * @deprecated Usar services/whatsapp.ts → openWhatsApp() o getWhatsAppMessage()
 * Se mantiene solo para compatibilidad. Será eliminado en Sprint 13.
 */
export async function openWhatsAppShare(params: ShareParams): Promise<void> {
  const { clientName, projectName, companyName, publicUrl, total } = params;
  const firstName = clientName ? clientName.split(' ')[0] : '';
  const valorFmt  = total != null ? formatCurrencyCOP(total) : null;
  const lines = [
    `Hola ${firstName} 👋`, '',
    'Preparé una propuesta personalizada para:', '',
    `📌 ${projectName || 'tu proyecto'}`,
    ...(valorFmt ? ['', `💰 Valor estimado:\n${valorFmt}`] : []),
    '', 'Puedes revisarla aquí:', '', `🔗 ${publicUrl}`, '',
    'Quedo atento a cualquier consulta.', '',
    companyName || 'El equipo',
  ];
  const msg   = lines.join('\n');
  const phone = params.phone?.replace(/\D/g, '') ?? '';
  const base  = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
  // Sprint 22: capacitorBridge — native WhatsApp app o web
  await openExternalUrl(`${base}?text=${encodeURIComponent(msg)}`);
}

// ─── Email: corporativo, sin emojis, completo ────────────────────────────────

export function buildEmailSubject(params: Pick<ShareParams, 'projectName' | 'quoteNumber'>): string {
  const ref = params.quoteNumber ? ` (${params.quoteNumber})` : '';
  return `Propuesta para ${params.projectName || 'tu proyecto'}${ref}`;
}

export function buildEmailBody(params: ShareParams): string {
  const { clientName, projectName, companyName, publicUrl, total } = params;
  const greeting  = clientName ? `Hola ${clientName},` : 'Estimado cliente,';
  const valorLine = total != null ? `\nValor de la propuesta: ${formatCurrencyCOP(total)}\n` : '';

  return [
    greeting,
    '',
    `He preparado una propuesta personalizada basada en lo que conversamos sobre ${projectName || 'su proyecto'}.${valorLine}`,
    'Puede revisar todos los detalles en el siguiente enlace:',
    '',
    publicUrl,
    '',
    'Si tiene alguna pregunta, comentario o desea realizar ajustes, quedo completamente a su disposición.',
    '',
    'Muchas gracias por su tiempo y por la oportunidad de presentarle esta propuesta.',
    '',
    'Atentamente,',
    companyName || 'El equipo',
  ].join('\n');
}

/**
 * Comparte por correo usando navigator.share() en mobile (selector nativo: Gmail, Outlook, Mail, etc.)
 * o mailto: fallback en desktop.
 */
export async function shareByEmail(params: ShareParams): Promise<void> {
  const subject = buildEmailSubject(params);
  const body    = buildEmailBody(params);

  if (navigator.share) {
    try {
      await navigator.share({ title: subject, text: body + '\n\n', url: params.publicUrl });
      return;
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return; // usuario canceló
      // fallback a mailto
    }
  }

  // Sprint 22: capacitorBridge para mailto nativo
  await openEmail(
    params.clientEmail ?? '',
    buildEmailSubject(params),
    buildEmailBody(params),
  );
}

// ─── Link corto: solo URL con confirmación ────────────────────────────────────

export function buildCopyMessage(params: ShareParams): string {
  const { projectName, quoteNumber, publicUrl } = params;
  const ref = quoteNumber ? ` (${quoteNumber})` : '';
  return `Propuesta${projectName ? ' para ' + projectName : ''}${ref}: ${publicUrl}`;
}

export async function copyLinkToClipboard(params: ShareParams): Promise<void> {
  const text = buildCopyMessage(params);
  await navigator.clipboard.writeText(text);
}
