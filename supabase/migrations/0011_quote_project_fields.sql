-- ---------------------------------------------------------------------------
-- 0011: campos adicionales de proyecto en cotizaciones (Paso 1 del wizard)
-- ---------------------------------------------------------------------------

alter table public.quotes
  add column project_type text,
  add column notes text;
