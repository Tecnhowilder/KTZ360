-- ---------------------------------------------------------------------------
-- 0008: motor de impuestos configurable, vigencia/anticipo/términos
-- dinámicos, y material principal de cerámica/porcelanato.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. company_settings: configuración fiscal y comercial por defecto
-- ---------------------------------------------------------------------------
alter table public.company_settings
  add column tax_mode text not null default 'materials_labor'
    check (tax_mode in ('none', 'materials', 'materials_labor', 'custom')),
  add column tax_rate numeric(5,2) not null default 19,
  add column advance_pct numeric(5,2) not null default 50,
  add column valid_days_default int not null default 15,
  add column terms_conditions jsonb not null default '[
    "Esta propuesta tiene una validez según la fecha indicada arriba.",
    "Los precios incluyen materiales y mano de obra descritos en cada renglón.",
    "Cualquier trabajo adicional no contemplado será cotizado por separado.",
    "Se requiere un anticipo del 50% para iniciar la obra.",
    "El saldo restante se cancela contra entrega del trabajo terminado.",
    "Los tiempos de ejecución se confirman al aprobar la propuesta.",
    "El cliente debe garantizar acceso al lugar de trabajo en el horario acordado.",
    "Cambios en el alcance pueden modificar el valor y tiempo de entrega."
  ]'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. quotes: snapshot fiscal/comercial inmutable por cotización
-- ---------------------------------------------------------------------------
alter table public.quotes
  add column tax_mode text not null default 'materials_labor'
    check (tax_mode in ('none', 'materials', 'materials_labor', 'custom')),
  add column tax_rate numeric(5,2) not null default 19,
  add column advance_pct numeric(5,2) not null default 50,
  add column doc_detail_level text not null default 'estandar'
    check (doc_detail_level in ('resumen', 'estandar', 'detallado', 'tecnico')),
  add column include_technical_annex boolean not null default false,
  add column terms_conditions jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 3. quote_templates: vigencia/descuento/impuestos guardados en plantilla
-- ---------------------------------------------------------------------------
alter table public.quote_templates
  add column valid_days int not null default 15,
  add column discount numeric(5,2) not null default 0,
  add column discount_on boolean not null default false,
  add column tax_mode text not null default 'materials_labor'
    check (tax_mode in ('none', 'materials', 'materials_labor', 'custom')),
  add column tax_rate numeric(5,2) not null default 19;

-- ---------------------------------------------------------------------------
-- 4. catalog_material_rules: marca de "material principal"
-- ---------------------------------------------------------------------------
alter table public.catalog_material_rules
  add column is_primary boolean not null default false;

-- ---------------------------------------------------------------------------
-- 5. Material principal — Cerámica (por formato, aplica a las 4 variantes)
-- ---------------------------------------------------------------------------
insert into public.catalog_materials (category_id, name, unit, description, precio_minimo, precio_sugerido, precio_maximo) values
  ((select id from public.catalog_categories where key = 'pisos_enchapes'), 'Baldosa cerámica 30x30', 'm²', 'Cerámica formato 30x30 cm', 25000, 32000, 45000),
  ((select id from public.catalog_categories where key = 'pisos_enchapes'), 'Baldosa cerámica 45x45', 'm²', 'Cerámica formato 45x45 cm', 28000, 38000, 50000),
  ((select id from public.catalog_categories where key = 'pisos_enchapes'), 'Baldosa cerámica 60x60', 'm²', 'Cerámica formato 60x60 cm', 35000, 45000, 60000);

insert into public.catalog_material_rules (service_id, material_id, quantity_expr, waste_pct, condition_expr, is_primary, sort_order) values
  ((select id from public.catalog_services where key = 'ceramica'),
   (select id from public.catalog_materials where name = 'Baldosa cerámica 30x30'),
   '{"var":"area"}'::jsonb, 10,
   '{"op":"eq","args":[{"var":"formato"},{"const":"30x30"}]}'::jsonb, true, 0),
  ((select id from public.catalog_services where key = 'ceramica'),
   (select id from public.catalog_materials where name = 'Baldosa cerámica 45x45'),
   '{"var":"area"}'::jsonb, 10,
   '{"op":"eq","args":[{"var":"formato"},{"const":"45x45"}]}'::jsonb, true, 0),
  ((select id from public.catalog_services where key = 'ceramica'),
   (select id from public.catalog_materials where name = 'Baldosa cerámica 60x60'),
   '{"var":"area"}'::jsonb, 10,
   '{"op":"eq","args":[{"var":"formato"},{"const":"60x60"}]}'::jsonb, true, 0);

-- ---------------------------------------------------------------------------
-- 6. Material principal — Porcelanato (la variante ya es el formato)
-- ---------------------------------------------------------------------------
insert into public.catalog_materials (category_id, name, unit, description, precio_minimo, precio_sugerido, precio_maximo) values
  ((select id from public.catalog_categories where key = 'pisos_enchapes'), 'Porcelanato 60x60', 'm²', 'Porcelanato formato 60x60 cm', 45000, 60000, 85000),
  ((select id from public.catalog_categories where key = 'pisos_enchapes'), 'Porcelanato 80x80', 'm²', 'Porcelanato formato 80x80 cm', 60000, 80000, 110000),
  ((select id from public.catalog_categories where key = 'pisos_enchapes'), 'Porcelanato 60x120', 'm²', 'Porcelanato formato 60x120 cm', 80000, 110000, 150000),
  ((select id from public.catalog_categories where key = 'pisos_enchapes'), 'Porcelanato 120x120', 'm²', 'Porcelanato formato 120x120 cm', 95000, 130000, 180000);

insert into public.catalog_material_rules (service_id, variant_id, material_id, quantity_expr, waste_pct, is_primary, sort_order) values
  ((select id from public.catalog_services where key = 'porcelanato'),
   (select id from public.catalog_variants where service_id = (select id from public.catalog_services where key = 'porcelanato') and key = '60x60'),
   (select id from public.catalog_materials where name = 'Porcelanato 60x60'),
   '{"var":"area"}'::jsonb, 10, true, 0),
  ((select id from public.catalog_services where key = 'porcelanato'),
   (select id from public.catalog_variants where service_id = (select id from public.catalog_services where key = 'porcelanato') and key = '80x80'),
   (select id from public.catalog_materials where name = 'Porcelanato 80x80'),
   '{"var":"area"}'::jsonb, 10, true, 0),
  ((select id from public.catalog_services where key = 'porcelanato'),
   (select id from public.catalog_variants where service_id = (select id from public.catalog_services where key = 'porcelanato') and key = '60x120'),
   (select id from public.catalog_materials where name = 'Porcelanato 60x120'),
   '{"var":"area"}'::jsonb, 10, true, 0),
  ((select id from public.catalog_services where key = 'porcelanato'),
   (select id from public.catalog_variants where service_id = (select id from public.catalog_services where key = 'porcelanato') and key = '120x120'),
   (select id from public.catalog_materials where name = 'Porcelanato 120x120'),
   '{"var":"area"}'::jsonb, 10, true, 0);
