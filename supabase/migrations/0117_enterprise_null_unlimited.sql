-- ============================================================
-- Migration 0117 — Enterprise = NULL (ilimitado real) + schema adicional_licenses
--
-- MEJORAS ARQUITECTÓNICAS:
--
--   1. Enterprise: included_users = NULL (semántica correcta: sin límite)
--      Antes usábamos 9999 como hack. NULL significa "sin límite" de forma
--      explícita y sin riesgo de que alguien crea que el límite es 9999.
--
--   2. additional_licenses: schema completo con auditoría histórica.
--      Guardar el precio de compra al momento del pago es CRÍTICO para:
--      - No depender del precio actual si sube en el futuro
--      - Auditoría y facturación exacta
--      - Conciliación de pagos
--
--   3. Idempotencia: UNIQUE(payment_id) evita duplicados aunque MercadoPago
--      reenvíe el webhook múltiples veces.
--
--   4. compute_team_seats: NULL incluido_users → seats_limit = NULL (JSON null)
--      El frontend detecta null como "ilimitado" y muestra ∞.
--
-- Zero Trust: workspace_id siempre del JWT.
-- ============================================================

-- ─── 1. ENTERPRISE = NULL (ilimitado real) ───────────────────────────────────
-- Primero quitar el NOT NULL para permitir NULL como "ilimitado"

ALTER TABLE public.plan_limits
  ALTER COLUMN included_users DROP NOT NULL;

UPDATE public.plan_limits
   SET included_users = NULL,
       updated_at     = now()
 WHERE plan_code = 'enterprise';

-- ─── 2. SCHEMA COMPLETO DE additional_licenses ───────────────────────────────
-- Agregar todos los campos de auditoría histórica.

ALTER TABLE public.additional_licenses
  ADD COLUMN IF NOT EXISTS purchase_price    numeric(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS currency          text          DEFAULT 'COP',
  ADD COLUMN IF NOT EXISTS payment_id        text          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mp_preference_id  text          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS invoice_number    text          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS purchased_at      timestamptz   DEFAULT now(),
  ADD COLUMN IF NOT EXISTS activated_at      timestamptz   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS expires_at        timestamptz   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS created_by        uuid          DEFAULT NULL REFERENCES auth.users(id);

-- UNIQUE en payment_id para idempotencia del webhook
-- Si MP reenvía el webhook 10 veces, solo se insertan las licencias una vez.
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_additional_licenses_payment_id
    ON public.additional_licenses(payment_id)
    WHERE payment_id IS NOT NULL;
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- Llenar purchased_at para registros existentes (si los hay)
UPDATE public.additional_licenses
   SET purchased_at = created_at
 WHERE purchased_at IS NULL AND created_at IS NOT NULL;

-- ─── 3. compute_team_seats: NULL = ilimitado ────────────────────────────────
-- Cuando included_users IS NULL (Enterprise) → seats_limit es NULL en JSON.
-- El frontend chequea `seats.seats_limit === null` para mostrar ∞.

CREATE OR REPLACE FUNCTION public.compute_team_seats(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_code       text;
  v_multiuser       boolean;
  v_included_users  integer;    -- NULL = ilimitado (Enterprise)
  v_extra_price     numeric;
  v_additional_qty  integer := 0;
  v_active_members  integer;
  v_pending_invites integer;
  v_seats_limit     integer;    -- NULL = ilimitado
BEGIN
  v_plan_code := public.get_effective_plan_code(p_workspace_id);

  SELECT
    COALESCE(pf.multiuser_enabled, false),
    pl.included_users,              -- NO COALESCE: NULL = ilimitado
    COALESCE(pl.extra_user_price, 0)
  INTO v_multiuser, v_included_users, v_extra_price
  FROM public.plan_features pf
  JOIN public.plan_limits   pl ON pl.plan_code = pf.plan_code
  WHERE pf.plan_code = v_plan_code;

  -- Licencias adicionales compradas (resiliente si tabla no existe)
  BEGIN
    SELECT COALESCE(SUM(quantity), 0)
      INTO v_additional_qty
      FROM public.additional_licenses
     WHERE workspace_id = p_workspace_id AND status = 'active';
  EXCEPTION WHEN undefined_table THEN
    v_additional_qty := 0;
  END;

  SELECT COUNT(*) INTO v_active_members
    FROM public.profiles
   WHERE workspace_id = p_workspace_id AND status = 'active';

  SELECT COUNT(*) INTO v_pending_invites
    FROM public.workspace_invitations
   WHERE workspace_id = p_workspace_id AND status = 'pending';

  -- Calcular seats_limit:
  --   NULL (Enterprise)   → NULL (ilimitado, frontend muestra ∞)
  --   FALSE multiuser     → 1 (plan FREE/sin multiuser)
  --   Número + adicionales → número total
  v_seats_limit := CASE
    WHEN NOT COALESCE(v_multiuser, false) THEN 1
    WHEN v_included_users IS NULL          THEN NULL        -- ilimitado
    ELSE v_included_users + v_additional_qty
  END;

  RETURN jsonb_build_object(
    'plan_code',           COALESCE(v_plan_code, 'free'),
    'multiuser_enabled',   COALESCE(v_multiuser, false),
    'included_users',      v_included_users,   -- NULL para Enterprise
    'extra_user_price',    COALESCE(v_extra_price, 0),
    'additional_licenses', v_additional_qty,
    'active_members',      v_active_members,
    'pending_invites',     v_pending_invites,
    'seats_used',          v_active_members + v_pending_invites,
    'seats_limit',         v_seats_limit       -- NULL = ilimitado
  );
END;
$$;
