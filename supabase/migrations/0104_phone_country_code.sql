-- ════════════════════════════════════════════════════════════════════════════
-- Migr 0104: Hotfix WhatsApp — Agregar country_code a clientes
-- ════════════════════════════════════════════════════════════════════════════
-- Causa raíz: phone sin código de país → WhatsApp interpreta primeros dígitos
-- como código internacional incorrecto (ej: 31→Países Bajos en vez de +57 Colombia).
-- Solución: campo country_code separado, default '+57'. URL: wa.me/{cc}{phone_digits}
-- ════════════════════════════════════════════════════════════════════════════

-- ─── clients: añadir country_code ────────────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT '+57';

-- Migrar: clientes existentes asumen +57 (Colombia)
-- Clientes sin teléfono quedan con +57 como default inofensivo.
UPDATE public.clients
SET country_code = '+57'
WHERE country_code IS NULL OR country_code = '';

COMMENT ON COLUMN public.clients.country_code IS
  'Código de país para WhatsApp. Ejemplo: +57 (Colombia). Default +57.';

-- ─── company_settings: country_code del teléfono de la empresa ───────────────

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS phone_country_code text NOT NULL DEFAULT '+57';

UPDATE public.company_settings
SET phone_country_code = '+57'
WHERE phone_country_code IS NULL OR phone_country_code = '';

COMMENT ON COLUMN public.company_settings.phone_country_code IS
  'Código de país del teléfono de la empresa. Default +57.';

-- ─── profiles: country_code del teléfono del usuario (para GPS / equipos) ────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_country_code text NOT NULL DEFAULT '+57';

UPDATE public.profiles
SET phone_country_code = '+57'
WHERE phone_country_code IS NULL OR phone_country_code = '';

-- ─── RPC: build_whatsapp_url — construcción segura de URLs WhatsApp ──────────
-- Centraliza la lógica. Frontend llama este RPC para obtener la URL final.
-- Zero Trust: nunca confiar en la URL construida por el frontend.

CREATE OR REPLACE FUNCTION public.build_whatsapp_url(
  p_country_code text,
  p_phone        text,
  p_message      text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cc    text;
  v_phone text;
  v_url   text;
BEGIN
  -- Limpiar código de país: solo dígitos
  v_cc := regexp_replace(COALESCE(p_country_code, '57'), '[^0-9]', '', 'g');
  IF v_cc = '' THEN v_cc := '57'; END IF;

  -- Limpiar teléfono: solo dígitos
  v_phone := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');

  IF LENGTH(v_phone) < 7 THEN
    RETURN NULL; -- número inválido
  END IF;

  v_url := 'https://wa.me/' || v_cc || v_phone;

  IF p_message IS NOT NULL AND LENGTH(p_message) > 0 THEN
    v_url := v_url || '?text=' || encode(convert_to(p_message, 'UTF8'), 'escape');
  END IF;

  RETURN v_url;
END;
$$;

GRANT EXECUTE ON FUNCTION public.build_whatsapp_url(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.build_whatsapp_url IS
  'Hotfix 0104: construye URL WhatsApp correcta con código de país explícito. Ejemplo: wa.me/573154823475';
