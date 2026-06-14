-- ---------------------------------------------------------------------------
-- 0009: modelo de empaques y presentación comercial de materiales.
-- Pegante en bultos de 25kg, fragua con selector de presentación
-- (caja 2kg / 5kg), y cerámica/porcelanato cotizados por caja según
-- cobertura. El cálculo técnico (kg/m²) sigue igual; el motor convierte
-- a empaques comerciales para mostrar en cotización/PDF.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. catalog_materials: nuevas columnas para el modo "empaque"
-- ---------------------------------------------------------------------------
alter table public.catalog_materials
  add column unidad_tecnica text,
  add column precio_empaque numeric;

-- ---------------------------------------------------------------------------
-- 2. Pegante para cerámica / porcelanato -> Bulto 25 kg
-- ---------------------------------------------------------------------------
update public.catalog_materials set
  unit = 'Bulto', unidad_tecnica = 'kg', packaging_size = 25, precio_empaque = 45000
where name = 'Pegante para cerámica';

update public.catalog_materials set
  unit = 'Bulto', unidad_tecnica = 'kg', packaging_size = 25, precio_empaque = 55000
where name = 'Pegante para porcelanato';

-- ---------------------------------------------------------------------------
-- 3. Fragua -> selector de presentación "Caja 2 kg" / "Caja 5 kg"
-- ---------------------------------------------------------------------------
insert into public.catalog_questions (service_id, key, label, type, default_value, sort_order, required) values
  ((select id from public.catalog_services where key = 'ceramica'), 'presentacion_fragua', 'Presentación de la fragua', 'select', '"5"'::jsonb, 3, true),
  ((select id from public.catalog_services where key = 'porcelanato'), 'presentacion_fragua', 'Presentación de la fragua', 'select', '"5"'::jsonb, 1, true);

insert into public.catalog_question_options (question_id, value, label, sort_order) values
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'ceramica') and key = 'presentacion_fragua'), '2', 'Caja 2 kg', 1),
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'ceramica') and key = 'presentacion_fragua'), '5', 'Caja 5 kg', 2),
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'porcelanato') and key = 'presentacion_fragua'), '2', 'Caja 2 kg', 1),
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'porcelanato') and key = 'presentacion_fragua'), '5', 'Caja 5 kg', 2);

-- Nuevos materiales de fragua por presentación (caja 2kg / 5kg)
insert into public.catalog_materials (category_id, name, unit, description, precio_minimo, precio_sugerido, precio_maximo, unidad_tecnica, packaging_size, precio_empaque) values
  ((select id from public.catalog_categories where key = 'pisos_enchapes'), 'Fragua para cerámica (caja 2 kg)', 'Caja', 'Fragua en caja de 2 kg', 8000, 11000, 14000, 'kg', 2, 11000),
  ((select id from public.catalog_categories where key = 'pisos_enchapes'), 'Fragua para cerámica (caja 5 kg)', 'Caja', 'Fragua en caja de 5 kg', 18000, 24900, 32000, 'kg', 5, 24900),
  ((select id from public.catalog_categories where key = 'pisos_enchapes'), 'Fragua para porcelanato (caja 2 kg)', 'Caja', 'Fragua para porcelanato en caja de 2 kg', 9000, 12500, 16000, 'kg', 2, 12500),
  ((select id from public.catalog_categories where key = 'pisos_enchapes'), 'Fragua para porcelanato (caja 5 kg)', 'Caja', 'Fragua para porcelanato en caja de 5 kg', 20000, 27000, 35000, 'kg', 5, 27000);

-- Duplicar la regla de fragua de cerámica por presentación (mismo quantity_expr técnico en kg)
insert into public.catalog_material_rules (service_id, material_id, quantity_expr, waste_pct, condition_expr, sort_order) values
  ((select id from public.catalog_services where key = 'ceramica'),
   (select id from public.catalog_materials where name = 'Fragua para cerámica (caja 2 kg)'),
   '{"op":"mul","args":[{"var":"area"},{"op":"lookup","keys":["formato","fragua_mm"],"table":{
      "30x30|1.5":0.4,"30x30|2":0.5,"30x30|3":0.75,"30x30|5":1.25,
      "45x45|1.5":0.27,"45x45|2":0.35,"45x45|3":0.5,"45x45|5":0.85,
      "60x60|1.5":0.2,"60x60|2":0.27,"60x60|3":0.4,"60x60|5":0.65
    }}]}'::jsonb, 10,
   '{"op":"eq","args":[{"var":"presentacion_fragua"},{"const":"2"}]}'::jsonb, 2),
  ((select id from public.catalog_services where key = 'ceramica'),
   (select id from public.catalog_materials where name = 'Fragua para cerámica (caja 5 kg)'),
   '{"op":"mul","args":[{"var":"area"},{"op":"lookup","keys":["formato","fragua_mm"],"table":{
      "30x30|1.5":0.4,"30x30|2":0.5,"30x30|3":0.75,"30x30|5":1.25,
      "45x45|1.5":0.27,"45x45|2":0.35,"45x45|3":0.5,"45x45|5":0.85,
      "60x60|1.5":0.2,"60x60|2":0.27,"60x60|3":0.4,"60x60|5":0.65
    }}]}'::jsonb, 10,
   '{"op":"eq","args":[{"var":"presentacion_fragua"},{"const":"5"}]}'::jsonb, 2);

-- Duplicar la regla de fragua de porcelanato por presentación (mismo quantity_expr técnico en kg)
insert into public.catalog_material_rules (service_id, material_id, quantity_expr, waste_pct, condition_expr, sort_order) values
  ((select id from public.catalog_services where key = 'porcelanato'),
   (select id from public.catalog_materials where name = 'Fragua para porcelanato (caja 2 kg)'),
   '{"op":"mul","args":[{"var":"area"},{"const":0.3}]}'::jsonb, 10,
   '{"op":"eq","args":[{"var":"presentacion_fragua"},{"const":"2"}]}'::jsonb, 2),
  ((select id from public.catalog_services where key = 'porcelanato'),
   (select id from public.catalog_materials where name = 'Fragua para porcelanato (caja 5 kg)'),
   '{"op":"mul","args":[{"var":"area"},{"const":0.3}]}'::jsonb, 10,
   '{"op":"eq","args":[{"var":"presentacion_fragua"},{"const":"5"}]}'::jsonb, 2);

-- Eliminar las reglas viejas de fragua (sin presentación) y desactivar los materiales viejos
delete from public.catalog_material_rules
where material_id = (select id from public.catalog_materials where name = 'Fragua para cerámica')
   or material_id = (select id from public.catalog_materials where name = 'Fragua para porcelanato');

update public.catalog_materials set active = false
where name in ('Fragua para cerámica', 'Fragua para porcelanato');

-- ---------------------------------------------------------------------------
-- 4. Cerámica / porcelanato: material principal -> Caja con cobertura por caja
-- ---------------------------------------------------------------------------
update public.catalog_materials set unit = 'Caja', unidad_tecnica = 'm²', packaging_size = 1.62, precio_empaque = 52000
where name = 'Baldosa cerámica 30x30';

update public.catalog_materials set unit = 'Caja', unidad_tecnica = 'm²', packaging_size = 1.62, precio_empaque = 61500
where name = 'Baldosa cerámica 45x45';

update public.catalog_materials set unit = 'Caja', unidad_tecnica = 'm²', packaging_size = 1.44, precio_empaque = 65000
where name = 'Baldosa cerámica 60x60';

update public.catalog_materials set unit = 'Caja', unidad_tecnica = 'm²', packaging_size = 1.44, precio_empaque = 86000
where name = 'Porcelanato 60x60';

update public.catalog_materials set unit = 'Caja', unidad_tecnica = 'm²', packaging_size = 1.92, precio_empaque = 154000
where name = 'Porcelanato 80x80';

update public.catalog_materials set unit = 'Caja', unidad_tecnica = 'm²', packaging_size = 1.44, precio_empaque = 158000
where name = 'Porcelanato 60x120';

update public.catalog_materials set unit = 'Caja', unidad_tecnica = 'm²', packaging_size = 2.88, precio_empaque = 374000
where name = 'Porcelanato 120x120';
