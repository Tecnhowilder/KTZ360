// Plantillas de correo transaccionales para Shelwi.
// Diseño minimalista para maximizar entrega en bandeja principal (no Promociones).
// Reglas: sin imágenes de fondo, sin columnas múltiples, sin estilos decorativos excesivos.

const BRAND_COLOR  = '#2563EB';   // Shelwi blue — solo para el CTA
const TEXT_DARK    = '#0F172A';
const TEXT_MUTED   = '#64748B';
const BG           = '#ffffff';
const APP_NAME     = 'Shelwi';

export type TemplateId =
  | 'team_invite'
  | 'email_verification'
  | 'welcome'
  | 'payment_approved'
  | 'subscription_renewed'
  | 'payment_failed'
  | 'subscription_cancelled'
  | 'password_reset';

export interface RenderedEmail {
  subject: string;
  html:    string;
}

// ─── Layout transaccional ─────────────────────────────────────────────────────
// Sin header visual pesado. Logo como texto. Sin columnas. Ancho máximo 520px.
// El objetivo es que Gmail lo reconozca como "Personal" o al menos "Updates",
// no como "Promotions".

function renderLayout(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:32px 16px;">
        <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;">

          <!-- Logo texto -->
          <tr>
            <td style="padding-bottom:24px;border-bottom:1px solid #E2E8F0;">
              <span style="font-size:17px;font-weight:700;color:${TEXT_DARK};letter-spacing:-0.3px;">${APP_NAME}</span>
            </td>
          </tr>

          <!-- Cuerpo -->
          <tr>
            <td style="padding:28px 0;font-size:14px;line-height:1.7;color:${TEXT_MUTED};">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:20px;border-top:1px solid #E2E8F0;font-size:12px;color:#94A3B8;line-height:1.6;">
              Este mensaje fue enviado por ${APP_NAME}. Si no lo esperabas, puedes ignorarlo sin problema.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr>
      <td>
        <a href="${url}"
           style="display:inline-block;background:${BRAND_COLOR};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px;letter-spacing:0.1px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

// ─── Templates ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  admin:      'Administrador',
  supervisor: 'Supervisor',
  operario:   'Operario',
  comercial:  'Comercial',
  employee:   'Colaborador',
};

export const templates: Record<TemplateId, (data: Record<string, unknown>) => RenderedEmail> = {

  team_invite: (data) => {
    const inviter       = String(data.inviterName   ?? 'Un administrador');
    const workspaceName = String(data.workspaceName ?? 'tu equipo');
    const role          = ROLE_LABELS[String(data.role ?? '')] ?? String(data.role ?? '');
    const appUrl        = String(data.appUrl        ?? '');
    const token         = String(data.token         ?? '');
    const link          = `${appUrl}/invite/${token}`;

    return {
      subject: `${inviter} te invitó a unirse a ${workspaceName}`,
      html: renderLayout(`
        <p style="font-size:15px;color:${TEXT_DARK};font-weight:600;margin:0 0 12px;">Hola,</p>
        <p style="margin:0 0 16px;">
          <strong style="color:${TEXT_DARK};">${inviter}</strong> te ha invitado a unirte a
          <strong style="color:${TEXT_DARK};">${workspaceName}</strong> en ${APP_NAME}
          como <strong style="color:${TEXT_DARK};">${role}</strong>.
        </p>
        <p style="margin:0 0 4px;">Haz clic en el botón para aceptar la invitación:</p>
        ${ctaButton('Aceptar invitación', link)}
        <p style="margin:16px 0 0;font-size:12px;color:#94A3B8;">
          Si el botón no funciona, copia este enlace en tu navegador:<br/>
          <a href="${link}" style="color:${BRAND_COLOR};word-break:break-all;">${link}</a>
        </p>
        <p style="margin:12px 0 0;font-size:12px;color:#94A3B8;">
          Esta invitación vence en 7 días.
        </p>
      `),
    };
  },

  email_verification: (data) => {
    const appUrl = String(data.appUrl ?? '');
    const token  = String(data.token  ?? '');
    const link   = `${appUrl}/verificar/${token}`;
    return {
      subject: `Confirma tu correo en ${APP_NAME}`,
      html: renderLayout(`
        <p style="font-size:15px;color:${TEXT_DARK};font-weight:600;margin:0 0 12px;">Confirma tu dirección de correo</p>
        <p style="margin:0 0 16px;">Para activar tu cuenta en ${APP_NAME} confirma tu correo electrónico.</p>
        ${ctaButton('Confirmar correo', link)}
        <p style="margin:16px 0 0;font-size:12px;color:#94A3B8;">
          Enlace alternativo: <a href="${link}" style="color:${BRAND_COLOR};word-break:break-all;">${link}</a>
        </p>
      `),
    };
  },

  welcome: (data) => {
    const fullName = String(data.fullName ?? '');
    const appUrl   = String(data.appUrl   ?? '');
    return {
      subject: `Bienvenido a ${APP_NAME}`,
      html: renderLayout(`
        <p style="font-size:15px;color:${TEXT_DARK};font-weight:600;margin:0 0 12px;">
          Hola${fullName ? `, ${fullName}` : ''}
        </p>
        <p style="margin:0 0 16px;">Tu cuenta en ${APP_NAME} está lista. Ya puedes crear cotizaciones, gestionar clientes y mucho más.</p>
        ${ctaButton('Ir a mi panel', `${appUrl}/app/dashboard`)}
      `),
    };
  },

  payment_approved: (data) => {
    const planName = String(data.planName ?? '');
    const amount   = String(data.amount   ?? '');
    return {
      subject: `Pago confirmado — ${APP_NAME}`,
      html: renderLayout(`
        <p style="font-size:15px;color:${TEXT_DARK};font-weight:600;margin:0 0 12px;">Pago confirmado</p>
        <p style="margin:0 0 16px;">
          Recibimos tu pago${amount ? ` de <strong>${amount}</strong>` : ''}${planName ? ` para el plan <strong>${planName}</strong>` : ''}.
          Gracias por confiar en ${APP_NAME}.
        </p>
      `),
    };
  },

  subscription_renewed: (data) => {
    const planName  = String(data.planName  ?? '');
    const periodEnd = String(data.periodEnd ?? '');
    return {
      subject: `Suscripción renovada — ${APP_NAME}`,
      html: renderLayout(`
        <p style="font-size:15px;color:${TEXT_DARK};font-weight:600;margin:0 0 12px;">Tu suscripción se renovó</p>
        <p style="margin:0;">
          Tu plan${planName ? ` <strong>${planName}</strong>` : ''} fue renovado correctamente
          ${periodEnd ? ` y está activo hasta <strong>${periodEnd}</strong>` : ''}.
        </p>
      `),
    };
  },

  payment_failed: (data) => {
    const appUrl = String(data.appUrl ?? '');
    return {
      subject: `Problema con tu pago — ${APP_NAME}`,
      html: renderLayout(`
        <p style="font-size:15px;color:${TEXT_DARK};font-weight:600;margin:0 0 12px;">No pudimos procesar tu pago</p>
        <p style="margin:0 0 16px;">Hubo un problema con el pago de tu suscripción. Actualiza tu método de pago para evitar interrupciones.</p>
        ${ctaButton('Actualizar método de pago', `${appUrl}/app/planes`)}
      `),
    };
  },

  subscription_cancelled: (data) => {
    const planName = String(data.planName ?? '');
    return {
      subject: `Suscripción cancelada — ${APP_NAME}`,
      html: renderLayout(`
        <p style="font-size:15px;color:${TEXT_DARK};font-weight:600;margin:0 0 12px;">Suscripción cancelada</p>
        <p style="margin:0;">Tu plan${planName ? ` <strong>${planName}</strong>` : ''} fue cancelado. Puedes reactivarlo cuando quieras desde tu panel.</p>
      `),
    };
  },

  password_reset: (data) => {
    const appUrl = String(data.appUrl ?? '');
    const token  = String(data.token  ?? '');
    const link   = `${appUrl}/restablecer/${token}`;
    return {
      subject: `Restablece tu contraseña — ${APP_NAME}`,
      html: renderLayout(`
        <p style="font-size:15px;color:${TEXT_DARK};font-weight:600;margin:0 0 12px;">Restablecer contraseña</p>
        <p style="margin:0 0 16px;">Recibimos una solicitud para restablecer tu contraseña. Si no fuiste tú, ignora este correo.</p>
        ${ctaButton('Restablecer contraseña', link)}
        <p style="margin:16px 0 0;font-size:12px;color:#94A3B8;">
          Enlace alternativo: <a href="${link}" style="color:${BRAND_COLOR};word-break:break-all;">${link}</a>
        </p>
      `),
    };
  },

};
