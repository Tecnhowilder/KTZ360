-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0135: Email Templates Enterprise
-- Mueve los 8 templates hardcodeados de templates.ts a base de datos.
-- Incluye versionado, historial, rollback, multi-idioma y administración
-- completa desde el Backoffice.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Tabla principal ───────────────────────────────────────────────────────

CREATE TABLE public.email_templates (
  key         text        PRIMARY KEY,
  name        text        NOT NULL,
  description text,
  subject     text        NOT NULL,
  body_html   text        NOT NULL,
  variables   text[]      NOT NULL DEFAULT '{}',
  locale      text        NOT NULL DEFAULT 'es',
  version     int         NOT NULL DEFAULT 1,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_templates IS 'Templates de correo transaccional administrables desde el Backoffice. Usa {{variable}} para interpolación.';
COMMENT ON COLUMN public.email_templates.key IS 'Identificador único del template (ej: team_invite). Inmutable.';
COMMENT ON COLUMN public.email_templates.variables IS 'Variables disponibles en subject y body_html. Ejemplo: {inviterName,workspaceName}.';
COMMENT ON COLUMN public.email_templates.version IS 'Versión actual. Se incrementa en cada edición.';

-- ─── 2. Tabla de versiones / historial ───────────────────────────────────────

CREATE TABLE public.email_template_versions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text        NOT NULL REFERENCES public.email_templates(key) ON DELETE CASCADE,
  version      int         NOT NULL,
  subject      text        NOT NULL,
  body_html    text        NOT NULL,
  variables    text[]      NOT NULL DEFAULT '{}',
  locale       text        NOT NULL DEFAULT 'es',
  note         text,
  saved_at     timestamptz NOT NULL DEFAULT now(),
  saved_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (template_key, version)
);

COMMENT ON TABLE public.email_template_versions IS 'Historial inmutable de versiones anteriores de cada template. Permite rollback.';

-- ─── 3. Índices ───────────────────────────────────────────────────────────────

CREATE INDEX ON public.email_templates (is_active);
CREATE INDEX ON public.email_template_versions (template_key, version DESC);
CREATE INDEX ON public.email_template_versions (saved_at DESC);

-- ─── 4. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.email_templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_admin_email_templates"
  ON public.email_templates FOR ALL
  USING (public.is_support_admin());

CREATE POLICY "support_admin_email_template_versions"
  ON public.email_template_versions FOR ALL
  USING (public.is_support_admin());

-- ─── 5. RPC: admin_list_email_templates ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_list_email_templates()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rows jsonb;
BEGIN
  IF NOT public.is_support_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Acceso denegado');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'key',        key,
    'name',       name,
    'description',description,
    'subject',    subject,
    'body_html',  body_html,
    'variables',  variables,
    'locale',     locale,
    'version',    version,
    'is_active',  is_active,
    'updated_at', updated_at
  ) ORDER BY name), '[]'::jsonb)
  INTO v_rows
  FROM public.email_templates;

  RETURN jsonb_build_object('ok', true, 'templates', v_rows);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_email_templates() TO authenticated;

-- ─── 6. RPC: admin_upsert_email_template ─────────────────────────────────────
-- Crea o actualiza un template. En cada actualización guarda la versión
-- anterior en email_template_versions antes de sobreescribir.

CREATE OR REPLACE FUNCTION public.admin_upsert_email_template(
  p_key         text,
  p_name        text,
  p_description text    DEFAULT NULL,
  p_subject     text    DEFAULT '',
  p_body_html   text    DEFAULT '',
  p_variables   text[]  DEFAULT '{}',
  p_locale      text    DEFAULT 'es',
  p_note        text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller      uuid := auth.uid();
  v_existing    record;
  v_new_version int;
BEGIN
  IF NOT public.is_support_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Acceso denegado');
  END IF;

  IF p_key IS NULL OR trim(p_key) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'key es requerido');
  END IF;
  IF p_subject IS NULL OR trim(p_subject) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'subject es requerido');
  END IF;
  IF p_body_html IS NULL OR trim(p_body_html) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'body_html es requerido');
  END IF;

  SELECT * INTO v_existing FROM public.email_templates WHERE key = p_key;

  IF FOUND THEN
    -- Guardar versión actual en historial antes de sobreescribir
    INSERT INTO public.email_template_versions
      (template_key, version, subject, body_html, variables, locale, note, saved_by)
    VALUES
      (p_key, v_existing.version, v_existing.subject, v_existing.body_html,
       v_existing.variables, v_existing.locale, p_note, v_caller)
    ON CONFLICT (template_key, version) DO NOTHING;

    v_new_version := v_existing.version + 1;

    UPDATE public.email_templates SET
      name        = p_name,
      description = p_description,
      subject     = p_subject,
      body_html   = p_body_html,
      variables   = p_variables,
      locale      = p_locale,
      version     = v_new_version,
      updated_at  = now()
    WHERE key = p_key;
  ELSE
    v_new_version := 1;
    INSERT INTO public.email_templates
      (key, name, description, subject, body_html, variables, locale, version)
    VALUES
      (p_key, p_name, p_description, p_subject, p_body_html, p_variables, p_locale, v_new_version);
  END IF;

  PERFORM public.admin_audit(
    'admin_email_template_saved', 'email_templates', p_key,
    jsonb_build_object('version', v_new_version, 'locale', p_locale)
  );

  RETURN jsonb_build_object('ok', true, 'version', v_new_version,
    'message', format('Template "%s" guardado (v%s).', p_key, v_new_version));
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_upsert_email_template(text,text,text,text,text,text[],text,text) TO authenticated;

-- ─── 7. RPC: admin_toggle_email_template ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_toggle_email_template(
  p_key    text,
  p_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_support_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Acceso denegado');
  END IF;

  UPDATE public.email_templates
  SET is_active = p_active, updated_at = now()
  WHERE key = p_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Template no encontrado');
  END IF;

  PERFORM public.admin_audit(
    CASE WHEN p_active THEN 'admin_email_template_activated' ELSE 'admin_email_template_deactivated' END,
    'email_templates', p_key, '{}'::jsonb
  );

  RETURN jsonb_build_object('ok', true,
    'message', format('Template "%s" %s.', p_key, CASE WHEN p_active THEN 'activado' ELSE 'desactivado' END));
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_toggle_email_template(text,boolean) TO authenticated;

-- ─── 8. RPC: admin_get_email_template_versions ───────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_get_email_template_versions(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_versions jsonb;
BEGIN
  IF NOT public.is_support_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Acceso denegado');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',        id,
    'version',   version,
    'subject',   subject,
    'body_html', body_html,
    'variables', variables,
    'locale',    locale,
    'note',      note,
    'saved_at',  saved_at
  ) ORDER BY version DESC), '[]'::jsonb)
  INTO v_versions
  FROM public.email_template_versions
  WHERE template_key = p_key;

  RETURN jsonb_build_object('ok', true, 'versions', v_versions);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_get_email_template_versions(text) TO authenticated;

-- ─── 9. RPC: admin_rollback_email_template ───────────────────────────────────
-- Restaura una versión anterior. Guarda el estado actual como nueva versión
-- antes de sobreescribir (historial siempre crece, nunca pierde nada).

CREATE OR REPLACE FUNCTION public.admin_rollback_email_template(
  p_key     text,
  p_version int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hist  record;
  v_curr  record;
BEGIN
  IF NOT public.is_support_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Acceso denegado');
  END IF;

  SELECT * INTO v_hist
  FROM public.email_template_versions
  WHERE template_key = p_key AND version = p_version;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', format('Versión %s no encontrada para "%s"', p_version, p_key));
  END IF;

  SELECT * INTO v_curr FROM public.email_templates WHERE key = p_key;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Template no encontrado');
  END IF;

  -- Guardar estado actual en historial
  INSERT INTO public.email_template_versions
    (template_key, version, subject, body_html, variables, locale, note, saved_by)
  VALUES
    (p_key, v_curr.version, v_curr.subject, v_curr.body_html, v_curr.variables, v_curr.locale,
     format('Antes de rollback a v%s', p_version), auth.uid())
  ON CONFLICT (template_key, version) DO NOTHING;

  -- Aplicar rollback
  UPDATE public.email_templates SET
    subject    = v_hist.subject,
    body_html  = v_hist.body_html,
    variables  = v_hist.variables,
    locale     = v_hist.locale,
    version    = v_curr.version + 1,
    updated_at = now()
  WHERE key = p_key;

  PERFORM public.admin_audit(
    'admin_email_template_rollback', 'email_templates', p_key,
    jsonb_build_object('from_version', v_curr.version, 'restored_version', p_version)
  );

  RETURN jsonb_build_object('ok', true,
    'message', format('Rollback a v%s aplicado. Ahora en v%s.', p_version, v_curr.version + 1));
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_rollback_email_template(text,int) TO authenticated;

-- ─── 10. Seed: 8 templates existentes migrados desde templates.ts ─────────────
-- Variables comunes:
--   appName       → nombre de la plataforma (inyectado por la EF)
--   inviteLink    → appUrl + /invite/ + token (calculado por la EF)
--   verifyLink    → appUrl + /verificar/ + token
--   resetLink     → appUrl + /restablecer/ + token
--   dashboardLink → appUrl + /app/dashboard
--   billingLink   → appUrl + /app/planes

INSERT INTO public.email_templates (key, name, description, subject, body_html, variables, locale) VALUES

-- ── 1. team_invite ────────────────────────────────────────────────────────────
('team_invite',
 'Invitación de equipo',
 'Se envía cuando un administrador invita a un nuevo usuario al workspace.',
 '{{inviterName}} te invitó a unirse a {{workspaceName}}',
$t1$<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>{{appName}}</title></head><body style="margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px;"><table role="presentation" width="100%" style="max-width:520px;margin:0 auto;"><tr><td style="padding-bottom:24px;border-bottom:1px solid #E2E8F0;"><span style="font-size:17px;font-weight:700;color:#0F172A;">{{appName}}</span></td></tr><tr><td style="padding:28px 0;font-size:14px;line-height:1.7;color:#64748B;"><p style="font-size:15px;color:#0F172A;font-weight:600;margin:0 0 12px;">Hola,</p><p style="margin:0 0 16px;"><strong style="color:#0F172A;">{{inviterName}}</strong> te ha invitado a unirte a <strong style="color:#0F172A;">{{workspaceName}}</strong> en {{appName}} como <strong style="color:#0F172A;">{{role}}</strong>.</p><p style="margin:0 0 4px;">Haz clic en el botón para aceptar la invitación:</p><table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td><a href="{{inviteLink}}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px;letter-spacing:0.1px;">Aceptar invitación</a></td></tr></table><p style="margin:16px 0 0;font-size:12px;color:#94A3B8;">Si el botón no funciona, copia este enlace en tu navegador:<br/><a href="{{inviteLink}}" style="color:#2563EB;word-break:break-all;">{{inviteLink}}</a></p><p style="margin:12px 0 0;font-size:12px;color:#94A3B8;">Esta invitación vence en 7 días.</p></td></tr><tr><td style="padding-top:20px;border-top:1px solid #E2E8F0;font-size:12px;color:#94A3B8;line-height:1.6;">Este mensaje fue enviado por {{appName}}. Si no lo esperabas, puedes ignorarlo sin problema.</td></tr></table></td></tr></table></body></html>$t1$,
 ARRAY['appName','inviterName','workspaceName','role','inviteLink'],
 'es'),

-- ── 2. email_verification ─────────────────────────────────────────────────────
('email_verification',
 'Verificación de correo',
 'Confirma la dirección de correo electrónico al registrarse.',
 'Confirma tu correo en {{appName}}',
$t2$<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>{{appName}}</title></head><body style="margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px;"><table role="presentation" width="100%" style="max-width:520px;margin:0 auto;"><tr><td style="padding-bottom:24px;border-bottom:1px solid #E2E8F0;"><span style="font-size:17px;font-weight:700;color:#0F172A;">{{appName}}</span></td></tr><tr><td style="padding:28px 0;font-size:14px;line-height:1.7;color:#64748B;"><p style="font-size:15px;color:#0F172A;font-weight:600;margin:0 0 12px;">Confirma tu dirección de correo</p><p style="margin:0 0 16px;">Para activar tu cuenta en {{appName}} confirma tu correo electrónico.</p><table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td><a href="{{verifyLink}}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px;">Confirmar correo</a></td></tr></table><p style="margin:16px 0 0;font-size:12px;color:#94A3B8;">Si el botón no funciona: <a href="{{verifyLink}}" style="color:#2563EB;word-break:break-all;">{{verifyLink}}</a></p></td></tr><tr><td style="padding-top:20px;border-top:1px solid #E2E8F0;font-size:12px;color:#94A3B8;line-height:1.6;">Este mensaje fue enviado por {{appName}}. Si no lo esperabas, puedes ignorarlo sin problema.</td></tr></table></td></tr></table></body></html>$t2$,
 ARRAY['appName','verifyLink'],
 'es'),

-- ── 3. welcome ────────────────────────────────────────────────────────────────
('welcome',
 'Bienvenida',
 'Se envía al completar el registro. Presenta la plataforma.',
 'Bienvenido a {{appName}}',
$t3$<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>{{appName}}</title></head><body style="margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px;"><table role="presentation" width="100%" style="max-width:520px;margin:0 auto;"><tr><td style="padding-bottom:24px;border-bottom:1px solid #E2E8F0;"><span style="font-size:17px;font-weight:700;color:#0F172A;">{{appName}}</span></td></tr><tr><td style="padding:28px 0;font-size:14px;line-height:1.7;color:#64748B;"><p style="font-size:15px;color:#0F172A;font-weight:600;margin:0 0 12px;">Hola{{fullName}},</p><p style="margin:0 0 16px;">Tu cuenta en {{appName}} está lista. Ya puedes crear cotizaciones, gestionar clientes y mucho más.</p><table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td><a href="{{dashboardLink}}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px;">Ir a mi panel</a></td></tr></table></td></tr><tr><td style="padding-top:20px;border-top:1px solid #E2E8F0;font-size:12px;color:#94A3B8;line-height:1.6;">Este mensaje fue enviado por {{appName}}. Si no lo esperabas, puedes ignorarlo sin problema.</td></tr></table></td></tr></table></body></html>$t3$,
 ARRAY['appName','fullName','dashboardLink'],
 'es'),

-- ── 4. payment_approved ───────────────────────────────────────────────────────
('payment_approved',
 'Pago confirmado',
 'Se envía al completarse un pago exitoso.',
 'Pago confirmado — {{appName}}',
$t4$<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>{{appName}}</title></head><body style="margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px;"><table role="presentation" width="100%" style="max-width:520px;margin:0 auto;"><tr><td style="padding-bottom:24px;border-bottom:1px solid #E2E8F0;"><span style="font-size:17px;font-weight:700;color:#0F172A;">{{appName}}</span></td></tr><tr><td style="padding:28px 0;font-size:14px;line-height:1.7;color:#64748B;"><p style="font-size:15px;color:#0F172A;font-weight:600;margin:0 0 12px;">Pago confirmado</p><p style="margin:0 0 16px;">Recibimos tu pago de <strong style="color:#0F172A;">{{amount}}</strong> para el plan <strong style="color:#0F172A;">{{planName}}</strong>. Gracias por confiar en {{appName}}.</p></td></tr><tr><td style="padding-top:20px;border-top:1px solid #E2E8F0;font-size:12px;color:#94A3B8;line-height:1.6;">Este mensaje fue enviado por {{appName}}. Si no lo esperabas, puedes ignorarlo sin problema.</td></tr></table></td></tr></table></body></html>$t4$,
 ARRAY['appName','amount','planName'],
 'es'),

-- ── 5. subscription_renewed ───────────────────────────────────────────────────
('subscription_renewed',
 'Suscripción renovada',
 'Confirmación de renovación automática de suscripción.',
 'Suscripción renovada — {{appName}}',
$t5$<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>{{appName}}</title></head><body style="margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px;"><table role="presentation" width="100%" style="max-width:520px;margin:0 auto;"><tr><td style="padding-bottom:24px;border-bottom:1px solid #E2E8F0;"><span style="font-size:17px;font-weight:700;color:#0F172A;">{{appName}}</span></td></tr><tr><td style="padding:28px 0;font-size:14px;line-height:1.7;color:#64748B;"><p style="font-size:15px;color:#0F172A;font-weight:600;margin:0 0 12px;">Tu suscripción se renovó</p><p style="margin:0;">Tu plan <strong style="color:#0F172A;">{{planName}}</strong> fue renovado correctamente y está activo hasta <strong style="color:#0F172A;">{{periodEnd}}</strong>.</p></td></tr><tr><td style="padding-top:20px;border-top:1px solid #E2E8F0;font-size:12px;color:#94A3B8;line-height:1.6;">Este mensaje fue enviado por {{appName}}. Si no lo esperabas, puedes ignorarlo sin problema.</td></tr></table></td></tr></table></body></html>$t5$,
 ARRAY['appName','planName','periodEnd'],
 'es'),

-- ── 6. payment_failed ─────────────────────────────────────────────────────────
('payment_failed',
 'Pago fallido',
 'Alerta de fallo en el cobro. Incluye CTA para actualizar método de pago.',
 'Problema con tu pago — {{appName}}',
$t6$<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>{{appName}}</title></head><body style="margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px;"><table role="presentation" width="100%" style="max-width:520px;margin:0 auto;"><tr><td style="padding-bottom:24px;border-bottom:1px solid #E2E8F0;"><span style="font-size:17px;font-weight:700;color:#0F172A;">{{appName}}</span></td></tr><tr><td style="padding:28px 0;font-size:14px;line-height:1.7;color:#64748B;"><p style="font-size:15px;color:#0F172A;font-weight:600;margin:0 0 12px;">No pudimos procesar tu pago</p><p style="margin:0 0 16px;">Hubo un problema con el pago de tu suscripción. Actualiza tu método de pago para evitar interrupciones en el servicio.</p><table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td><a href="{{billingLink}}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px;">Actualizar método de pago</a></td></tr></table></td></tr><tr><td style="padding-top:20px;border-top:1px solid #E2E8F0;font-size:12px;color:#94A3B8;line-height:1.6;">Este mensaje fue enviado por {{appName}}. Si no lo esperabas, puedes ignorarlo sin problema.</td></tr></table></td></tr></table></body></html>$t6$,
 ARRAY['appName','billingLink'],
 'es'),

-- ── 7. subscription_cancelled ─────────────────────────────────────────────────
('subscription_cancelled',
 'Suscripción cancelada',
 'Notificación de cancelación de suscripción.',
 'Suscripción cancelada — {{appName}}',
$t7$<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>{{appName}}</title></head><body style="margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px;"><table role="presentation" width="100%" style="max-width:520px;margin:0 auto;"><tr><td style="padding-bottom:24px;border-bottom:1px solid #E2E8F0;"><span style="font-size:17px;font-weight:700;color:#0F172A;">{{appName}}</span></td></tr><tr><td style="padding:28px 0;font-size:14px;line-height:1.7;color:#64748B;"><p style="font-size:15px;color:#0F172A;font-weight:600;margin:0 0 12px;">Suscripción cancelada</p><p style="margin:0;">Tu plan <strong style="color:#0F172A;">{{planName}}</strong> fue cancelado. Puedes reactivarlo cuando quieras desde tu panel.</p></td></tr><tr><td style="padding-top:20px;border-top:1px solid #E2E8F0;font-size:12px;color:#94A3B8;line-height:1.6;">Este mensaje fue enviado por {{appName}}. Si no lo esperabas, puedes ignorarlo sin problema.</td></tr></table></td></tr></table></body></html>$t7$,
 ARRAY['appName','planName'],
 'es'),

-- ── 8. password_reset ─────────────────────────────────────────────────────────
('password_reset',
 'Restablecer contraseña',
 'Enlace para restablecer la contraseña del usuario.',
 'Restablece tu contraseña — {{appName}}',
$t8$<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>{{appName}}</title></head><body style="margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px;"><table role="presentation" width="100%" style="max-width:520px;margin:0 auto;"><tr><td style="padding-bottom:24px;border-bottom:1px solid #E2E8F0;"><span style="font-size:17px;font-weight:700;color:#0F172A;">{{appName}}</span></td></tr><tr><td style="padding:28px 0;font-size:14px;line-height:1.7;color:#64748B;"><p style="font-size:15px;color:#0F172A;font-weight:600;margin:0 0 12px;">Restablecer contraseña</p><p style="margin:0 0 16px;">Recibimos una solicitud para restablecer tu contraseña. Si no fuiste tú, ignora este correo.</p><table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td><a href="{{resetLink}}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px;">Restablecer contraseña</a></td></tr></table><p style="margin:16px 0 0;font-size:12px;color:#94A3B8;">Si el botón no funciona: <a href="{{resetLink}}" style="color:#2563EB;word-break:break-all;">{{resetLink}}</a></p></td></tr><tr><td style="padding-top:20px;border-top:1px solid #E2E8F0;font-size:12px;color:#94A3B8;line-height:1.6;">Este mensaje fue enviado por {{appName}}. Si no lo esperabas, puedes ignorarlo sin problema.</td></tr></table></td></tr></table></body></html>$t8$,
 ARRAY['appName','resetLink'],
 'es');
