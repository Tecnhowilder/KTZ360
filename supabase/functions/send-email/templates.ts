// Plantillas de correo para la Edge Function send-email.
// Solo `team_invite` se dispara hoy; el resto queda preparado para flujos
// futuros (verificación de correo, bienvenida, pagos, cancelación, reset).

const BRAND = {
  primary: '#2563EB',
  accent: '#06B6D4',
  dark: '#0F172A',
  white: '#FFFFFF',
};

const APP_NAME = 'KTZ360';

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
  html: string;
}

function renderLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px;background:${BRAND.white};border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:${BRAND.dark};padding:20px 28px;">
                <span style="color:${BRAND.white};font-size:18px;font-weight:800;letter-spacing:-0.5px;">${APP_NAME}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 14px;font-size:20px;color:${BRAND.dark};">${title}</h1>
                <div style="font-size:14px;line-height:1.6;color:#475569;">${bodyHtml}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;border-top:1px solid #E2E8F0;font-size:11px;color:#94A3B8;">
                Este correo fue enviado por ${APP_NAME}. Si no esperabas este mensaje, puedes ignorarlo.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;margin-top:18px;background:${BRAND.primary};color:${BRAND.white};text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;">${label}</a>`;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  employee: 'Empleado',
};

export const templates: Record<TemplateId, (data: Record<string, unknown>) => RenderedEmail> = {
  team_invite: (data) => {
    const inviter = String(data.inviterName ?? 'Un administrador');
    const workspaceName = String(data.workspaceName ?? 'tu equipo');
    const role = ROLE_LABELS[String(data.role ?? '')] ?? String(data.role ?? '');
    const appUrl = String(data.appUrl ?? '');
    const token = String(data.token ?? '');
    const link = `${appUrl}/invite/${token}`;
    return {
      subject: `${inviter} te invitó a unirte a ${workspaceName} en ${APP_NAME}`,
      html: renderLayout(
        'Te invitaron a un equipo',
        `<p>${inviter} te invitó a unirte a <strong>${workspaceName}</strong> en ${APP_NAME} como <strong>${role}</strong>.</p>
         <p>Esta invitación vence en 7 días.</p>
         ${button('Aceptar invitación', link)}
         <p style="margin-top:18px;font-size:12px;color:#94A3B8;">Si el botón no funciona, copia este enlace: ${link}</p>`
      ),
    };
  },

  email_verification: (data) => {
    const appUrl = String(data.appUrl ?? '');
    const token = String(data.token ?? '');
    const link = `${appUrl}/verificar/${token}`;
    return {
      subject: `Verifica tu correo en ${APP_NAME}`,
      html: renderLayout(
        'Verifica tu correo',
        `<p>Confirma tu dirección de correo para activar tu cuenta en ${APP_NAME}.</p>
         ${button('Verificar correo', link)}`
      ),
    };
  },

  welcome: (data) => {
    const fullName = String(data.fullName ?? '');
    const appUrl = String(data.appUrl ?? '');
    return {
      subject: `¡Bienvenido a ${APP_NAME}!`,
      html: renderLayout(
        `¡Bienvenido${fullName ? `, ${fullName}` : ''}!`,
        `<p>Tu cuenta en ${APP_NAME} está lista. Ya puedes crear cotizaciones, gestionar clientes y mucho más.</p>
         ${button('Ir a mi panel', `${appUrl}/app/dashboard`)}`
      ),
    };
  },

  payment_approved: (data) => {
    const planName = String(data.planName ?? '');
    const amount = String(data.amount ?? '');
    return {
      subject: `Pago aprobado — ${APP_NAME}`,
      html: renderLayout(
        'Pago aprobado',
        `<p>Recibimos tu pago${amount ? ` por ${amount}` : ''}${planName ? ` para el plan <strong>${planName}</strong>` : ''}. ¡Gracias por confiar en ${APP_NAME}!</p>`
      ),
    };
  },

  subscription_renewed: (data) => {
    const planName = String(data.planName ?? '');
    const periodEnd = String(data.periodEnd ?? '');
    return {
      subject: `Tu suscripción se renovó — ${APP_NAME}`,
      html: renderLayout(
        'Suscripción renovada',
        `<p>Tu plan${planName ? ` <strong>${planName}</strong>` : ''} se renovó correctamente${periodEnd ? ` y está activo hasta ${periodEnd}` : ''}.</p>`
      ),
    };
  },

  payment_failed: (data) => {
    const appUrl = String(data.appUrl ?? '');
    return {
      subject: `Problema con tu pago — ${APP_NAME}`,
      html: renderLayout(
        'No pudimos procesar tu pago',
        `<p>Hubo un problema al procesar el pago de tu suscripción. Actualiza tu método de pago para evitar interrupciones en el servicio.</p>
         ${button('Revisar suscripción', `${appUrl}/app/planes`)}`
      ),
    };
  },

  subscription_cancelled: (data) => {
    const planName = String(data.planName ?? '');
    return {
      subject: `Tu suscripción fue cancelada — ${APP_NAME}`,
      html: renderLayout(
        'Suscripción cancelada',
        `<p>Tu plan${planName ? ` <strong>${planName}</strong>` : ''} fue cancelado. Puedes reactivarlo cuando quieras desde tu panel.</p>`
      ),
    };
  },

  password_reset: (data) => {
    const appUrl = String(data.appUrl ?? '');
    const token = String(data.token ?? '');
    const link = `${appUrl}/restablecer/${token}`;
    return {
      subject: `Restablece tu contraseña — ${APP_NAME}`,
      html: renderLayout(
        'Restablece tu contraseña',
        `<p>Recibimos una solicitud para restablecer tu contraseña en ${APP_NAME}.</p>
         ${button('Restablecer contraseña', link)}
         <p style="margin-top:18px;font-size:12px;color:#94A3B8;">Si no solicitaste esto, ignora este correo.</p>`
      ),
    };
  },
};
