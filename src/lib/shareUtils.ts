/**
 * Utilidades de compartición profesional para KTZ360.
 * Mensajes diferenciados por canal: WhatsApp (cercano), Email (corporativo), Link (corto).
 * Nunca usa fmtM() — siempre formatCurrencyCOP() para mostrar el valor completo.
 */
import { formatCurrencyCOP } from './currency';

export interface ShareParams {
  clientName: string;
  projectName: string;
  companyName: string;
  publicUrl: string;
  total?: number;
  phone?: string;
  quoteNumber?: string;
}

// ─── WhatsApp: cercano, emojis, negrita ─────────────────────────────────────

export function buildWhatsAppMessage(params: ShareParams): string {
  const { clientName, projectName, companyName, publicUrl, total, quoteNumber } = params;
  const firstName = clientName ? clientName.split(' ')[0] : '';
  const valorFmt  = total != null ? formatCurrencyCOP(total) : null;

  const lines = [
    `Hola ${firstName} 👋`,
    '',
    `Preparé una propuesta personalizada para *${projectName || 'tu proyecto'}*.`,
  ];

  if (valorFmt) {
    lines.push('', `💰 Valor estimado: *${valorFmt}*`);
  }

  if (quoteNumber) {
    lines.push(`📋 Referencia: ${quoteNumber}`);
  }

  lines.push(
    '',
    'Puedes revisar todos los detalles desde el siguiente enlace:',
    `🔗 ${publicUrl}`,
    '',
    'Si tienes preguntas o deseas realizar ajustes estaré atento para ayudarte.',
    '',
    'Muchas gracias por tu tiempo.',
    '',
    `Saludos,\n${companyName || 'El equipo'}`,
  );

  return lines.join('\n');
}

export function openWhatsAppShare(params: ShareParams): void {
  const msg   = buildWhatsAppMessage(params);
  const phone = params.phone?.replace(/\D/g, '') ?? '';
  const base  = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
  window.open(`${base}?text=${encodeURIComponent(msg)}`, '_blank');
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

  window.open(
    `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    '_blank',
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
