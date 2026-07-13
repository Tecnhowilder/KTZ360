-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0133: push_notification_templates — Gestión de plantillas push
-- ════════════════════════════════════════════════════════════════════════════
-- Propósito:
--   Centralizar el contenido de las notificaciones push en base de datos.
--   Super Admin puede crear/editar plantillas desde el Backoffice sin deploy.
--
-- Uso en send-push Edge Function:
--   En lugar de hardcodear título/cuerpo, la EF consulta la plantilla
--   y reemplaza {{variables}} con el contexto del evento.
--
-- Zero Trust:
--   • Lectura: autenticados (para que la EF pueda leerlas via service_role)
--   • Escritura: solo super_admin via RPC
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Tabla push_notification_templates ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_notification_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text        NOT NULL UNIQUE,   -- matches PushNotificationType
  name        text        NOT NULL,          -- nombre legible
  description text,                          -- descripción del evento

  -- Contenido de la plantilla (soporte para variables {{var}})
  title       text        NOT NULL,          -- título push con variables
  body        text        NOT NULL,          -- cuerpo push con variables
  deep_link   text,                          -- ruta destino, e.g. '/app/pedidos/{{entity_id}}'
  image_url   text,                          -- URL de imagen opcional

  -- Variables declaradas disponibles para esta plantilla
  variables   text[]      NOT NULL DEFAULT '{}', -- e.g., ['user_name','entity_id','amount']

  -- Configuración de entrega
  priority    text        NOT NULL DEFAULT 'normal'
                          CHECK (priority IN ('normal','high')),
  active      boolean     NOT NULL DEFAULT true,

  -- Metadata
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_push_templates_key
  ON public.push_notification_templates (key) WHERE active = true;

ALTER TABLE public.push_notification_templates ENABLE ROW LEVEL SECURITY;

-- Super/support admin pueden leer todas las plantillas
CREATE POLICY "push_templates_select_admin"
  ON public.push_notification_templates FOR SELECT
  USING (public.is_support_admin());

-- Solo super_admin puede escribir
CREATE POLICY "push_templates_write_super"
  ON public.push_notification_templates FOR INSERT
  WITH CHECK (public.is_super_admin());

CREATE POLICY "push_templates_update_super"
  ON public.push_notification_templates FOR UPDATE
  USING (public.is_super_admin());

-- ─── 2. RPC: admin_upsert_push_template ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_upsert_push_template(
  p_key         text,
  p_name        text,
  p_description text         DEFAULT NULL,
  p_title       text         DEFAULT '',
  p_body        text         DEFAULT '',
  p_deep_link   text         DEFAULT NULL,
  p_image_url   text         DEFAULT NULL,
  p_variables   text[]       DEFAULT '{}',
  p_priority    text         DEFAULT 'normal',
  p_active      boolean      DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'requires_super_admin');
  END IF;

  IF p_priority NOT IN ('normal','high') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_priority');
  END IF;

  INSERT INTO public.push_notification_templates
    (key, name, description, title, body, deep_link, image_url,
     variables, priority, active, created_by, updated_by)
  VALUES
    (p_key, p_name, p_description, p_title, p_body, p_deep_link, p_image_url,
     coalesce(p_variables,'{}'), p_priority, p_active, v_actor, v_actor)
  ON CONFLICT (key) DO UPDATE SET
    name        = excluded.name,
    description = excluded.description,
    title       = excluded.title,
    body        = excluded.body,
    deep_link   = excluded.deep_link,
    image_url   = excluded.image_url,
    variables   = excluded.variables,
    priority    = excluded.priority,
    active      = excluded.active,
    updated_at  = now(),
    updated_by  = v_actor;

  PERFORM public.admin_audit(
    'push_template_upserted', 'push_notification_templates', p_key,
    jsonb_build_object('key', p_key, 'active', p_active)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_push_template(
  text, text, text, text, text, text, text, text[], text, boolean
) TO authenticated;

-- ─── 3. RPC: admin_toggle_push_template ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_toggle_push_template(p_key text, p_active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'requires_super_admin');
  END IF;

  UPDATE public.push_notification_templates
     SET active = p_active, updated_at = now(), updated_by = auth.uid()
   WHERE key = p_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'template_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_push_template(text, boolean) TO authenticated;

-- ─── 4. Plantillas por defecto del sistema ────────────────────────────────────

INSERT INTO public.push_notification_templates
  (key, name, description, title, body, deep_link, variables, priority)
VALUES
  (
    'order_created',
    'Nuevo Pedido',
    'Se crea un nuevo pedido en el sistema',
    '🛒 Nuevo pedido recibido',
    'Pedido de {{client_name}} por {{amount}} — tap para ver detalles',
    '/app/pedidos/{{entity_id}}',
    ARRAY['client_name','amount','entity_id'],
    'high'
  ),
  (
    'work_order_assigned',
    'Orden de Trabajo Asignada',
    'Una OT es asignada al usuario',
    '🔧 Nueva orden de trabajo',
    'Tienes una nueva OT asignada: {{title}}',
    '/app/ot/{{entity_id}}',
    ARRAY['title','entity_id'],
    'high'
  ),
  (
    'work_order_completed',
    'Orden de Trabajo Completada',
    'Una OT es marcada como completada',
    '✅ Orden de trabajo completada',
    '{{user_name}} completó la OT: {{title}}',
    '/app/ot/{{entity_id}}',
    ARRAY['user_name','title','entity_id'],
    'normal'
  ),
  (
    'check_in_reminder',
    'Recordatorio Check-In',
    'Recordatorio de registro de asistencia',
    '📍 Recuerda registrar tu asistencia',
    'No olvides hacer check-in en {{location}}',
    '/app/asistencia',
    ARRAY['location'],
    'normal'
  ),
  (
    'quote_viewed',
    'Cotización Vista',
    'El cliente vio la cotización enviada',
    '👀 Tu cotización fue vista',
    '{{client_name}} revisó tu cotización por {{amount}}',
    '/app/cotizaciones/{{entity_id}}',
    ARRAY['client_name','amount','entity_id'],
    'normal'
  ),
  (
    'quote_approved',
    'Cotización Aprobada',
    'El cliente aprobó la cotización',
    '🎉 ¡Cotización aprobada!',
    '{{client_name}} aprobó tu cotización por {{amount}}',
    '/app/cotizaciones/{{entity_id}}',
    ARRAY['client_name','amount','entity_id'],
    'high'
  ),
  (
    'ai_credits_80',
    'Créditos IA al 80%',
    'El workspace consumió el 80% de sus créditos IA',
    '⚠️ Créditos IA al 80%',
    'Has usado el 80% de tus créditos IA este mes. Quedan {{remaining}} créditos.',
    '/app/planes',
    ARRAY['remaining'],
    'normal'
  ),
  (
    'ai_credits_100',
    'Créditos IA Agotados',
    'El workspace agotó sus créditos IA del mes',
    '🚫 Créditos IA agotados',
    'Agotaste tus créditos IA de este mes. Actualiza tu plan para continuar.',
    '/app/planes',
    ARRAY[]::text[],
    'high'
  ),
  (
    'general',
    'Notificación General',
    'Notificación genérica del sistema',
    '{{title}}',
    '{{body}}',
    NULL,
    ARRAY['title','body'],
    'normal'
  )
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.push_notification_templates
  IS 'Plantillas de push notifications administrables desde el Backoffice. Soporta variables {{var}}.';
