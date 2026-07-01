-- ============================================================================
-- 0102 — custom_permissions: Capa 4 de visibilidad — Permisos personalizados
-- ============================================================================
-- Permite al Owner activar permisos específicos para usuarios de cualquier rol.
-- Ejemplo: Comercial normalmente no ve Reportes, pero el Owner puede habilitarlo.
--
-- Estructura:
--   workspace_user_permissions (workspace_id, user_id, permission, granted_by)
--
-- Zero Trust: el backend valida estos permisos en cada acción relevante.
-- RLS: solo owner/admin del workspace puede leer/escribir.
-- ============================================================================

-- ─── Catálogo de permisos personalizados posibles ────────────────────────────

CREATE TABLE IF NOT EXISTS public.custom_permission_catalog (
  permission   text PRIMARY KEY,
  label        text NOT NULL,
  description  text,
  category     text NOT NULL DEFAULT 'general',  -- 'ventas' | 'operacion' | 'reportes' | 'admin'
  default_roles text[] NOT NULL DEFAULT '{}'     -- roles que ya tienen este permiso por defecto
);

INSERT INTO public.custom_permission_catalog (permission, label, description, category, default_roles)
VALUES
  -- Ventas
  ('ver_reportes_comerciales',   'Ver Reportes Comerciales',    'Acceso a reportes de ventas y pipeline', 'reportes', ARRAY['owner','admin']),
  ('exportar_pdf',               'Exportar PDF',                'Descargar cotizaciones como PDF', 'ventas', ARRAY['owner','admin','comercial']),
  ('aprobar_descuentos',         'Aprobar Descuentos',          'Aplicar descuentos en cotizaciones', 'ventas', ARRAY['owner','admin']),
  ('crear_pedidos_directos',     'Crear Pedidos Directos',      'Convertir cotizaciones en pedidos sin aprobación', 'operacion', ARRAY['owner','admin']),
  ('ver_costos_materiales',      'Ver Costos de Materiales',    'Acceso a precios de costo en el catálogo', 'ventas', ARRAY['owner','admin']),
  -- IA
  ('usar_ia_comercial',          'Usar IA Comercial',           'Acceso a funciones IA de ventas y propuestas', 'ventas', ARRAY['owner','admin','comercial']),
  ('usar_ia_operativa',          'Usar IA Operativa',           'Acceso a IA para reportes de campo y OTs', 'operacion', ARRAY['owner','admin','supervisor']),
  -- Operación
  ('ver_todos_pedidos',          'Ver Todos los Pedidos',       'Ver pedidos de todos los clientes (no solo asignados)', 'operacion', ARRAY['owner','admin','supervisor']),
  ('ver_todas_ots',              'Ver Todas las OTs',           'Ver órdenes de trabajo de todo el equipo', 'operacion', ARRAY['owner','admin','supervisor']),
  ('asignar_tecnicos',           'Asignar Técnicos',            'Asignar operarios a órdenes de trabajo', 'operacion', ARRAY['owner','admin','supervisor']),
  -- Reportes
  ('ver_reportes_operativos',    'Ver Reportes Operativos',     'Acceso a reportes de campo y productividad', 'reportes', ARRAY['owner','admin','supervisor']),
  ('ver_bi_dashboard',           'Ver BI y Analítica',          'Acceso al dashboard de Business Intelligence', 'reportes', ARRAY['owner','admin']),
  ('ver_finanzas',               'Ver Módulo Finanzas',         'Acceso a reportes financieros', 'reportes', ARRAY['owner']),
  -- Admin
  ('gestionar_equipo',           'Gestionar Equipo',            'Invitar y gestionar miembros del workspace', 'admin', ARRAY['owner','admin']),
  ('ver_customer_success',       'Ver Customer Success',        'Acceso al módulo de éxito del cliente', 'reportes', ARRAY['owner','admin'])
ON CONFLICT (permission) DO UPDATE SET
  label        = excluded.label,
  description  = excluded.description,
  category     = excluded.category,
  default_roles = excluded.default_roles;

-- ─── Tabla de permisos personalizados por usuario ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.workspace_user_permissions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission   text        NOT NULL REFERENCES public.custom_permission_catalog(permission),
  granted      boolean     NOT NULL DEFAULT true,   -- true = activado, false = revocado explícitamente
  granted_by   uuid        NOT NULL REFERENCES auth.users(id),
  granted_at   timestamptz NOT NULL DEFAULT now(),
  notes        text,
  UNIQUE (workspace_id, user_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_wup_user_workspace
  ON public.workspace_user_permissions(workspace_id, user_id);

ALTER TABLE public.workspace_user_permissions ENABLE ROW LEVEL SECURITY;

-- Solo owner/admin del workspace puede leer y escribir permisos
CREATE POLICY "owner_admin_manage_permissions"
  ON public.workspace_user_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND workspace_id = workspace_user_permissions.workspace_id
        AND role IN ('owner', 'admin')
    )
  );

-- El propio usuario puede leer sus permisos
CREATE POLICY "user_reads_own_permissions"
  ON public.workspace_user_permissions FOR SELECT
  USING (user_id = auth.uid());

ALTER TABLE public.custom_permission_catalog ENABLE ROW LEVEL SECURITY;

-- Catálogo público de solo lectura
CREATE POLICY "public_read_catalog"
  ON public.custom_permission_catalog FOR SELECT
  USING (true);

-- ─── RPC: check_custom_permission — verifica permiso personalizado ────────────

CREATE OR REPLACE FUNCTION public.check_custom_permission(
  p_workspace_id uuid,
  p_permission   text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role    text;
  v_custom  boolean;
  v_default_roles text[];
BEGIN
  -- Obtener rol del usuario
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = v_user_id AND workspace_id = p_workspace_id;

  IF NOT FOUND THEN RETURN false; END IF;

  -- Support/Super admin: acceso total
  IF v_role IN ('super_admin', 'support_admin') THEN RETURN true; END IF;

  -- ¿El rol ya tiene este permiso por defecto?
  SELECT default_roles INTO v_default_roles
  FROM public.custom_permission_catalog
  WHERE permission = p_permission;

  IF v_role = ANY(COALESCE(v_default_roles, ARRAY[]::text[])) THEN
    -- Verificar si fue revocado explícitamente
    SELECT granted INTO v_custom
    FROM public.workspace_user_permissions
    WHERE workspace_id = p_workspace_id AND user_id = v_user_id AND permission = p_permission;
    RETURN COALESCE(v_custom, true);  -- default: permitido si es rol base
  END IF;

  -- El rol NO tiene el permiso por defecto — verificar permiso personalizado
  SELECT granted INTO v_custom
  FROM public.workspace_user_permissions
  WHERE workspace_id = p_workspace_id AND user_id = v_user_id AND permission = p_permission;

  RETURN COALESCE(v_custom, false);  -- default: denegado si no es rol base
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_custom_permission(uuid, text) TO authenticated;

-- ─── RPC: set_custom_permission — owner/admin asigna permiso ─────────────────

CREATE OR REPLACE FUNCTION public.set_custom_permission(
  p_workspace_id uuid,
  p_user_id      uuid,
  p_permission   text,
  p_granted      boolean,
  p_notes        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_caller_role text;
BEGIN
  -- Solo owner/admin puede asignar permisos
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id AND workspace_id = p_workspace_id;

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo owner o admin puede gestionar permisos');
  END IF;

  -- Validar que el permiso existe
  IF NOT EXISTS (SELECT 1 FROM public.custom_permission_catalog WHERE permission = p_permission) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Permiso no válido: ' || p_permission);
  END IF;

  -- Validar que el usuario pertenece al workspace
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND workspace_id = p_workspace_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no pertenece al workspace');
  END IF;

  INSERT INTO public.workspace_user_permissions
    (workspace_id, user_id, permission, granted, granted_by, notes)
  VALUES
    (p_workspace_id, p_user_id, p_permission, p_granted, v_caller_id, p_notes)
  ON CONFLICT (workspace_id, user_id, permission) DO UPDATE SET
    granted    = excluded.granted,
    granted_by = excluded.granted_by,
    granted_at = now(),
    notes      = excluded.notes;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_custom_permission(uuid, uuid, text, boolean, text) TO authenticated;

-- ─── RPC: get_user_permissions — obtiene permisos de un usuario ──────────────

CREATE OR REPLACE FUNCTION public.get_user_permissions(p_workspace_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id   uuid := auth.uid();
  v_caller_role text;
  v_user_role   text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id AND workspace_id = p_workspace_id;
  SELECT role INTO v_user_role   FROM public.profiles WHERE id = p_user_id    AND workspace_id = p_workspace_id;

  -- Solo owner/admin puede ver permisos de otros; el propio usuario puede ver los suyos
  IF v_caller_role NOT IN ('owner','admin') AND v_caller_id != p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin acceso');
  END IF;

  RETURN jsonb_build_object(
    'ok',   true,
    'role', v_user_role,
    'custom_permissions', (
      SELECT jsonb_agg(jsonb_build_object(
        'permission', wup.permission,
        'granted',    wup.granted,
        'granted_at', wup.granted_at,
        'label',      cpc.label,
        'category',   cpc.category
      ))
      FROM public.workspace_user_permissions wup
      JOIN public.custom_permission_catalog cpc ON cpc.permission = wup.permission
      WHERE wup.workspace_id = p_workspace_id AND wup.user_id = p_user_id
    ),
    'effective_permissions', (
      SELECT jsonb_object_agg(
        cpc.permission,
        (
          CASE
            WHEN v_user_role = ANY(cpc.default_roles) THEN
              COALESCE((SELECT granted FROM public.workspace_user_permissions
                        WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND permission = cpc.permission), true)
            ELSE
              COALESCE((SELECT granted FROM public.workspace_user_permissions
                        WHERE workspace_id = p_workspace_id AND user_id = p_user_id AND permission = cpc.permission), false)
          END
        )
      )
      FROM public.custom_permission_catalog cpc
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_permissions(uuid, uuid) TO authenticated;

COMMENT ON TABLE public.workspace_user_permissions IS
  'Sprint 25: Capa 4 — Permisos personalizados por usuario. Override de permisos del rol base.';
COMMENT ON TABLE public.custom_permission_catalog IS
  'Catálogo oficial de permisos personalizables. Gestionado por Shelwi, no por workspaces.';
COMMENT ON FUNCTION public.check_custom_permission IS
  'Verifica si el usuario tiene un permiso (combinando rol base + overrides personalizados).';
COMMENT ON FUNCTION public.set_custom_permission IS
  'Owner/admin asigna o revoca permisos personalizados para usuarios del workspace.';
