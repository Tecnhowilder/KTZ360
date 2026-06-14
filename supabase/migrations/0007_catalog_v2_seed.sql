-- BRIVIA ENGINE V2 — Datos semilla del catálogo maestro
-- 12 categorías. Pintura, Pisos y Enchapes (cerámica/porcelanato/estuco),
-- Electricidad y Plomería con reglas detalladas según el brief.
-- Drywall, Mampostería, Remodelación de Baños/Cocinas, Cubiertas,
-- Impermeabilización, Piscinas y Obra Gris quedan como categorías "stub"
-- (1 servicio simple área->materiales+mano de obra), listas para enriquecerse
-- después solo con SQL. Precios en COP, marcados -- TODO donde son estimados.

-- ---------------------------------------------------------------------------
-- 1. Categorías
-- ---------------------------------------------------------------------------
insert into public.catalog_categories (key, name, description, icon, image_path, supports_quality_tiers, sort_order) values
  ('pintura', 'Pintura', 'Pintura interior y exterior, estuco y selladores', 'pintura', '/img/pintura.jpg', true, 1),
  ('pisos_enchapes', 'Pisos y Enchapes', 'Cerámica, porcelanato y estuco de muros', 'pisos', '/img/pisos_enchapes.jpg', true, 2),
  ('drywall', 'Drywall', 'Muros y cielos en drywall', 'drywall', '/img/drywall.jpg', false, 3),
  ('electricidad', 'Electricidad', 'Puntos eléctricos, iluminación, circuitos y tableros', 'electricidad', '/img/electricidad.jpg', false, 4),
  ('plomeria', 'Plomería', 'Puntos hidráulicos, sanitarios y redes', 'plomeria', '/img/plomeria.jpg', false, 5),
  ('mamposteria', 'Mampostería', 'Muros en ladrillo y bloque', 'mamposteria', '/img/mamposteria.jpg', false, 6),
  ('remodelacion_banos', 'Remodelación de Baños', 'Remodelación integral de baños', 'remodelacion_banos', '/img/remodelacion_banos.jpg', true, 7),
  ('remodelacion_cocinas', 'Remodelación de Cocinas', 'Remodelación integral de cocinas', 'remodelacion_cocinas', '/img/remodelacion_cocinas.jpg', true, 8),
  ('cubiertas', 'Cubiertas', 'Techos y cubiertas', 'cubiertas', '/img/cubiertas.jpg', false, 9),
  ('impermeabilizacion', 'Impermeabilización', 'Impermeabilización de losas y muros', 'impermeabilizacion', '/img/impermeabilizacion.jpg', false, 10),
  ('piscinas', 'Piscinas', 'Construcción y acabados de piscinas', 'piscinas', '/img/piscinas.jpg', false, 11),
  ('obra_gris', 'Obra Gris', 'Cimentación, estructura y obra gris en general', 'obra_gris', '/img/obra_gris.jpg', false, 12);

-- ---------------------------------------------------------------------------
-- 2. PINTURA
-- ---------------------------------------------------------------------------
insert into public.catalog_services (category_id, key, name, description, image_path, unit_basis, unit_label, sort_order) values
  ((select id from public.catalog_categories where key = 'pintura'), 'pintura', 'Pintura de muros',
   'Pintura vinilo interior o exterior, con estuco y sellador opcionales', '/img/pintura.jpg', 'area', 'm²', 1);

insert into public.catalog_questions (service_id, key, label, type, default_value, sort_order, required) values
  ((select id from public.catalog_services where key = 'pintura'), 'exterior', '¿La superficie es exterior?', 'boolean', 'false'::jsonb, 1, true),
  ((select id from public.catalog_services where key = 'pintura'), 'manos', 'Número de manos de pintura', 'number', '2'::jsonb, 2, true),
  ((select id from public.catalog_services where key = 'pintura'), 'incluye_estuco', '¿Incluye aplicación de estuco?', 'boolean', 'false'::jsonb, 3, true),
  ((select id from public.catalog_services where key = 'pintura'), 'incluye_sellador', '¿Incluye sellador antes de pintar?', 'boolean', 'false'::jsonb, 4, true);

update public.catalog_questions set min = 1, max = 4 where service_id = (select id from public.catalog_services where key = 'pintura') and key = 'manos';

insert into public.catalog_materials (category_id, name, unit, description, precio_minimo, precio_sugerido, precio_maximo) values
  ((select id from public.catalog_categories where key = 'pintura'), 'Pintura vinilo tipo 1', 'Galón', 'Rendimiento 30 m²/galón interior, 25 m²/galón exterior, por mano', 55000, 68000, 85000),
  ((select id from public.catalog_categories where key = 'pintura'), 'Sellador acrílico', 'Galón', 'Rendimiento aproximado 40 m²/galón', 45000, 55000, 70000),
  ((select id from public.catalog_categories where key = 'pintura'), 'Estuco plástico', 'Kg', 'Rendimiento aproximado 1 kg/m² por mano', 3000, 4000, 5500);

insert into public.catalog_material_rules (service_id, material_id, quantity_expr, waste_pct, sort_order) values
  ((select id from public.catalog_services where key = 'pintura'),
   (select id from public.catalog_materials where name = 'Pintura vinilo tipo 1'),
   '{"op":"mul","args":[{"op":"div","args":[{"var":"area"},{"op":"if","cond":{"var":"exterior"},"then":{"const":25},"else":{"const":30}}]},{"var":"manos"}]}'::jsonb,
   5, 1);

insert into public.catalog_material_rules (service_id, material_id, quantity_expr, waste_pct, condition_expr, sort_order) values
  ((select id from public.catalog_services where key = 'pintura'),
   (select id from public.catalog_materials where name = 'Sellador acrílico'),
   '{"op":"div","args":[{"var":"area"},{"const":40}]}'::jsonb,
   5, '{"var":"incluye_sellador"}'::jsonb, 2),
  ((select id from public.catalog_services where key = 'pintura'),
   (select id from public.catalog_materials where name = 'Estuco plástico'),
   '{"op":"mul","args":[{"var":"area"},{"const":1}]}'::jsonb,
   10, '{"var":"incluye_estuco"}'::jsonb, 3);

insert into public.catalog_labor_rules (service_id, name, unit, precio_minimo, precio_sugerido, precio_maximo, condition_expr, sort_order) values
  ((select id from public.catalog_services where key = 'pintura'), 'Mano de obra pintura', 'm²', 6000, 7500, 9000,
   '{"op":"not","args":[{"var":"incluye_estuco"}]}'::jsonb, 1),
  ((select id from public.catalog_services where key = 'pintura'), 'Mano de obra estuco + pintura', 'm²', 12000, 15000, 18000,
   '{"var":"incluye_estuco"}'::jsonb, 2);

-- ---------------------------------------------------------------------------
-- 3. PISOS Y ENCHAPES — Cerámica
-- ---------------------------------------------------------------------------
insert into public.catalog_services (category_id, key, name, description, image_path, unit_basis, unit_label, sort_order) values
  ((select id from public.catalog_categories where key = 'pisos_enchapes'), 'ceramica', 'Cerámica',
   'Instalación de cerámica en piso o pared, interior o exterior', '/img/pisos_enchapes.jpg', 'area', 'm²', 1);

insert into public.catalog_variants (service_id, key, name, sort_order) values
  ((select id from public.catalog_services where key = 'ceramica'), 'piso_interior', 'Piso interior', 1),
  ((select id from public.catalog_services where key = 'ceramica'), 'piso_exterior', 'Piso exterior', 2),
  ((select id from public.catalog_services where key = 'ceramica'), 'pared_interior', 'Pared interior', 3),
  ((select id from public.catalog_services where key = 'ceramica'), 'pared_exterior', 'Pared exterior', 4);

insert into public.catalog_questions (service_id, key, label, type, default_value, sort_order, required) values
  ((select id from public.catalog_services where key = 'ceramica'), 'formato', 'Formato de la cerámica', 'select', '"30x30"'::jsonb, 1, true),
  ((select id from public.catalog_services where key = 'ceramica'), 'fragua_mm', 'Espesor de fragua (mm)', 'select', '"2"'::jsonb, 2, true);

insert into public.catalog_question_options (question_id, value, label, sort_order) values
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'ceramica') and key = 'formato'), '30x30', '30 x 30 cm', 1),
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'ceramica') and key = 'formato'), '45x45', '45 x 45 cm', 2),
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'ceramica') and key = 'formato'), '60x60', '60 x 60 cm', 3),
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'ceramica') and key = 'fragua_mm'), '1.5', '1.5 mm', 1),
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'ceramica') and key = 'fragua_mm'), '2', '2 mm', 2),
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'ceramica') and key = 'fragua_mm'), '3', '3 mm', 3),
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'ceramica') and key = 'fragua_mm'), '5', '5 mm', 4);

insert into public.catalog_materials (category_id, name, unit, description, precio_minimo, precio_sugerido, precio_maximo) values
  ((select id from public.catalog_categories where key = 'pisos_enchapes'), 'Pegante para cerámica', 'Kg', 'Rendimiento 4.5 a 6 kg/m² según variante', 1500, 2000, 2800),
  ((select id from public.catalog_categories where key = 'pisos_enchapes'), 'Fragua para cerámica', 'Kg', 'Rendimiento según formato y espesor de junta', 4000, 5500, 8000);

insert into public.catalog_material_rules (service_id, variant_id, material_id, quantity_expr, waste_pct, sort_order) values
  ((select id from public.catalog_services where key = 'ceramica'),
   (select id from public.catalog_variants where service_id = (select id from public.catalog_services where key = 'ceramica') and key = 'piso_interior'),
   (select id from public.catalog_materials where name = 'Pegante para cerámica'),
   '{"op":"mul","args":[{"var":"area"},{"const":5}]}'::jsonb, 10, 1),
  ((select id from public.catalog_services where key = 'ceramica'),
   (select id from public.catalog_variants where service_id = (select id from public.catalog_services where key = 'ceramica') and key = 'piso_exterior'),
   (select id from public.catalog_materials where name = 'Pegante para cerámica'),
   '{"op":"mul","args":[{"var":"area"},{"const":6}]}'::jsonb, 10, 1),
  ((select id from public.catalog_services where key = 'ceramica'),
   (select id from public.catalog_variants where service_id = (select id from public.catalog_services where key = 'ceramica') and key = 'pared_interior'),
   (select id from public.catalog_materials where name = 'Pegante para cerámica'),
   '{"op":"mul","args":[{"var":"area"},{"const":4.5}]}'::jsonb, 10, 1),
  ((select id from public.catalog_services where key = 'ceramica'),
   (select id from public.catalog_variants where service_id = (select id from public.catalog_services where key = 'ceramica') and key = 'pared_exterior'),
   (select id from public.catalog_materials where name = 'Pegante para cerámica'),
   '{"op":"mul","args":[{"var":"area"},{"const":6}]}'::jsonb, 10, 1);

-- Fragua: kg/m² según formato x espesor (rendimiento estimado, ajustable vía SQL)
insert into public.catalog_material_rules (service_id, material_id, quantity_expr, waste_pct, sort_order) values
  ((select id from public.catalog_services where key = 'ceramica'),
   (select id from public.catalog_materials where name = 'Fragua para cerámica'),
   '{"op":"mul","args":[{"var":"area"},{"op":"lookup","keys":["formato","fragua_mm"],"table":{
      "30x30|1.5":0.4,"30x30|2":0.5,"30x30|3":0.75,"30x30|5":1.25,
      "45x45|1.5":0.27,"45x45|2":0.35,"45x45|3":0.5,"45x45|5":0.85,
      "60x60|1.5":0.2,"60x60|2":0.27,"60x60|3":0.4,"60x60|5":0.65
    }}]}'::jsonb, 10, 2);

insert into public.catalog_labor_rules (service_id, name, unit, precio_minimo, precio_sugerido, precio_maximo, sort_order) values
  ((select id from public.catalog_services where key = 'ceramica'), 'Mano de obra instalación cerámica', 'm²', 20000, 25000, 30000, 1);

-- ---------------------------------------------------------------------------
-- 4. PISOS Y ENCHAPES — Porcelanato
-- ---------------------------------------------------------------------------
insert into public.catalog_services (category_id, key, name, description, image_path, unit_basis, unit_label, sort_order) values
  ((select id from public.catalog_categories where key = 'pisos_enchapes'), 'porcelanato', 'Porcelanato',
   'Instalación de porcelanato en piso o pared', '/img/pisos_enchapes.jpg', 'area', 'm²', 2);

insert into public.catalog_variants (service_id, key, name, sort_order) values
  ((select id from public.catalog_services where key = 'porcelanato'), '60x60', '60 x 60 cm', 1),
  ((select id from public.catalog_services where key = 'porcelanato'), '80x80', '80 x 80 cm', 2),
  ((select id from public.catalog_services where key = 'porcelanato'), '60x120', '60 x 120 cm', 3),
  ((select id from public.catalog_services where key = 'porcelanato'), '120x120', '120 x 120 cm', 4);

insert into public.catalog_materials (category_id, name, unit, description, precio_minimo, precio_sugerido, precio_maximo) values
  ((select id from public.catalog_categories where key = 'pisos_enchapes'), 'Pegante para porcelanato', 'Kg', 'Rendimiento 5 a 9 kg/m² según formato', 1800, 2400, 3200),
  ((select id from public.catalog_categories where key = 'pisos_enchapes'), 'Fragua para porcelanato', 'Kg', 'Rendimiento aproximado 0.3 kg/m² (junta fina)', 5000, 7000, 10000);

insert into public.catalog_material_rules (service_id, variant_id, material_id, quantity_expr, waste_pct, sort_order) values
  ((select id from public.catalog_services where key = 'porcelanato'),
   (select id from public.catalog_variants where service_id = (select id from public.catalog_services where key = 'porcelanato') and key = '60x60'),
   (select id from public.catalog_materials where name = 'Pegante para porcelanato'),
   '{"op":"mul","args":[{"var":"area"},{"const":5}]}'::jsonb, 10, 1),
  ((select id from public.catalog_services where key = 'porcelanato'),
   (select id from public.catalog_variants where service_id = (select id from public.catalog_services where key = 'porcelanato') and key = '80x80'),
   (select id from public.catalog_materials where name = 'Pegante para porcelanato'),
   '{"op":"mul","args":[{"var":"area"},{"const":6}]}'::jsonb, 10, 1),
  ((select id from public.catalog_services where key = 'porcelanato'),
   (select id from public.catalog_variants where service_id = (select id from public.catalog_services where key = 'porcelanato') and key = '60x120'),
   (select id from public.catalog_materials where name = 'Pegante para porcelanato'),
   '{"op":"mul","args":[{"var":"area"},{"const":8}]}'::jsonb, 10, 1),
  ((select id from public.catalog_services where key = 'porcelanato'),
   (select id from public.catalog_variants where service_id = (select id from public.catalog_services where key = 'porcelanato') and key = '120x120'),
   (select id from public.catalog_materials where name = 'Pegante para porcelanato'),
   '{"op":"mul","args":[{"var":"area"},{"const":9}]}'::jsonb, 10, 1);

insert into public.catalog_material_rules (service_id, material_id, quantity_expr, waste_pct, sort_order) values
  ((select id from public.catalog_services where key = 'porcelanato'),
   (select id from public.catalog_materials where name = 'Fragua para porcelanato'),
   '{"op":"mul","args":[{"var":"area"},{"const":0.3}]}'::jsonb, 10, 2);

insert into public.catalog_labor_rules (service_id, variant_id, name, unit, precio_minimo, precio_sugerido, precio_maximo, sort_order) values
  ((select id from public.catalog_services where key = 'porcelanato'),
   (select id from public.catalog_variants where service_id = (select id from public.catalog_services where key = 'porcelanato') and key = '60x60'),
   'Mano de obra instalación porcelanato 60x60', 'm²', 25000, 28500, 32000, 1),
  ((select id from public.catalog_services where key = 'porcelanato'),
   (select id from public.catalog_variants where service_id = (select id from public.catalog_services where key = 'porcelanato') and key = '80x80'),
   'Mano de obra instalación porcelanato 80x80', 'm²', 28000, 34000, 40000, 1),
  ((select id from public.catalog_services where key = 'porcelanato'),
   (select id from public.catalog_variants where service_id = (select id from public.catalog_services where key = 'porcelanato') and key = '60x120'),
   'Mano de obra instalación porcelanato 60x120', 'm²', 35000, 42500, 50000, 1),
  -- TODO: 120x120 sin dato propio en el brief, se aproxima con el rango de 60x120
  ((select id from public.catalog_services where key = 'porcelanato'),
   (select id from public.catalog_variants where service_id = (select id from public.catalog_services where key = 'porcelanato') and key = '120x120'),
   'Mano de obra instalación porcelanato 120x120', 'm²', 35000, 42500, 50000, 1);

-- ---------------------------------------------------------------------------
-- 5. PISOS Y ENCHAPES — Estuco de muros
-- ---------------------------------------------------------------------------
insert into public.catalog_services (category_id, key, name, description, image_path, unit_basis, unit_label, sort_order) values
  ((select id from public.catalog_categories where key = 'pisos_enchapes'), 'estuco_muros', 'Estuco de muros',
   'Aplicación de estuco listo o plástico sobre distintas superficies', '/img/pisos_enchapes.jpg', 'area', 'm²', 3);

insert into public.catalog_questions (service_id, key, label, type, default_value, sort_order, required) values
  ((select id from public.catalog_services where key = 'estuco_muros'), 'tipo', 'Tipo de estuco', 'select', '"listo"'::jsonb, 1, true),
  ((select id from public.catalog_services where key = 'estuco_muros'), 'superficie', 'Tipo de superficie', 'select', '"panete"'::jsonb, 2, true);

insert into public.catalog_question_options (question_id, value, label, sort_order) values
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'estuco_muros') and key = 'tipo'), 'listo', 'Estuco listo (bulto)', 1),
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'estuco_muros') and key = 'tipo'), 'plastico', 'Estuco plástico (cuñete)', 2),
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'estuco_muros') and key = 'superficie'), 'ladrillo', 'Ladrillo', 1),
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'estuco_muros') and key = 'superficie'), 'bloque', 'Bloque', 2),
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'estuco_muros') and key = 'superficie'), 'panete', 'Pañete', 3),
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'estuco_muros') and key = 'superficie'), 'drywall', 'Drywall', 4);

insert into public.catalog_materials (category_id, name, unit, description, precio_minimo, precio_sugerido, precio_maximo, packaging_unit, packaging_size) values
  ((select id from public.catalog_categories where key = 'pisos_enchapes'), 'Estuco listo (bulto 25kg)', 'Bulto', 'Rendimiento aproximado 3 a 5 m²/bulto según superficie', 28000, 35000, 45000, 'bulto', 25),
  ((select id from public.catalog_categories where key = 'pisos_enchapes'), 'Estuco plástico (cuñete 5gal)', 'Cuñete', 'Rendimiento aproximado 8 a 14 m²/cuñete según superficie', 90000, 110000, 140000, 'cuñete', 1);

-- Rendimiento (m²/empaque) por tipo+superficie: quantity_expr = area / rendimiento
insert into public.catalog_material_rules (service_id, material_id, quantity_expr, condition_expr, sort_order) values
  ((select id from public.catalog_services where key = 'estuco_muros'),
   (select id from public.catalog_materials where name = 'Estuco listo (bulto 25kg)'),
   '{"op":"div","args":[{"var":"area"},{"op":"lookup","keys":["superficie"],"table":{"ladrillo":3,"bloque":3.5,"panete":5,"drywall":6}}]}'::jsonb,
   '{"op":"eq","args":[{"var":"tipo"},{"const":"listo"}]}'::jsonb, 1),
  ((select id from public.catalog_services where key = 'estuco_muros'),
   (select id from public.catalog_materials where name = 'Estuco plástico (cuñete 5gal)'),
   '{"op":"div","args":[{"var":"area"},{"op":"lookup","keys":["superficie"],"table":{"ladrillo":8,"bloque":9,"panete":12,"drywall":14}}]}'::jsonb,
   '{"op":"eq","args":[{"var":"tipo"},{"const":"plastico"}]}'::jsonb, 1);

insert into public.catalog_labor_rules (service_id, name, unit, precio_minimo, precio_sugerido, precio_maximo, sort_order) values
  ((select id from public.catalog_services where key = 'estuco_muros'), 'Mano de obra aplicación de estuco', 'm²', 8000, 10000, 12000, 1);

-- ---------------------------------------------------------------------------
-- 6. DRYWALL (stub)
-- ---------------------------------------------------------------------------
insert into public.catalog_services (category_id, key, name, description, image_path, unit_basis, unit_label, sort_order) values
  ((select id from public.catalog_categories where key = 'drywall'), 'drywall_muro', 'Muro en drywall',
   'Instalación de muro divisorio en drywall', '/img/drywall.jpg', 'area', 'm²', 1);

insert into public.catalog_materials (category_id, name, unit, description, precio_minimo, precio_sugerido, precio_maximo, packaging_unit, packaging_size) values
  ((select id from public.catalog_categories where key = 'drywall'), 'Lámina Drywall 1.20x2.40', 'Lámina', 'Cubre 2.88 m² por lámina', 35000, 42000, 55000, 'lámina', 1),
  ((select id from public.catalog_categories where key = 'drywall'), 'Cinta y masilla para drywall', 'Kg', 'Rendimiento aproximado 0.3 kg/m²', 3000, 4000, 5500, null, null);

insert into public.catalog_material_rules (service_id, material_id, quantity_expr, waste_pct, round_to_package, sort_order) values
  ((select id from public.catalog_services where key = 'drywall_muro'),
   (select id from public.catalog_materials where name = 'Lámina Drywall 1.20x2.40'),
   '{"op":"div","args":[{"var":"area"},{"const":2.88}]}'::jsonb, 10, true, 1),
  ((select id from public.catalog_services where key = 'drywall_muro'),
   (select id from public.catalog_materials where name = 'Cinta y masilla para drywall'),
   '{"op":"mul","args":[{"var":"area"},{"const":0.3}]}'::jsonb, 5, false, 2);

insert into public.catalog_labor_rules (service_id, name, unit, precio_minimo, precio_sugerido, precio_maximo, sort_order) values
  ((select id from public.catalog_services where key = 'drywall_muro'), 'Mano de obra instalación drywall', 'm²', 22000, 28000, 35000, 1);

-- ---------------------------------------------------------------------------
-- 7. ELECTRICIDAD
-- ---------------------------------------------------------------------------
insert into public.catalog_services (category_id, key, name, description, image_path, unit_basis, unit_label, sort_order) values
  ((select id from public.catalog_categories where key = 'electricidad'), 'punto_electrico', 'Punto eléctrico',
   'Punto de toma eléctrica (tomacorriente)', '/img/electricidad.jpg', 'point', 'punto', 1),
  ((select id from public.catalog_categories where key = 'electricidad'), 'punto_iluminacion', 'Punto de iluminación',
   'Punto para luminaria con interruptor', '/img/electricidad.jpg', 'point', 'punto', 2),
  ((select id from public.catalog_categories where key = 'electricidad'), 'circuito_independiente', 'Circuito independiente',
   'Circuito eléctrico independiente con breaker propio', '/img/electricidad.jpg', 'point', 'circuito', 3),
  ((select id from public.catalog_categories where key = 'electricidad'), 'tablero', 'Tablero eléctrico',
   'Suministro e instalación de tablero de distribución', '/img/electricidad.jpg', 'global', 'global', 4);

insert into public.catalog_questions (service_id, key, label, type, default_value, sort_order, required) values
  ((select id from public.catalog_services where key = 'punto_electrico'), 'instalacion', 'Tipo de instalación', 'select', '"empotrado"'::jsonb, 1, true),
  ((select id from public.catalog_services where key = 'punto_electrico'), 'longitud_promedio', 'Longitud promedio de cableado por punto (m)', 'number', '12'::jsonb, 2, true);

insert into public.catalog_question_options (question_id, value, label, sort_order) values
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'punto_electrico') and key = 'instalacion'), 'empotrado', 'Empotrado', 1),
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'punto_electrico') and key = 'instalacion'), 'superficial', 'Superficial', 2);

insert into public.catalog_questions (service_id, key, label, type, default_value, sort_order, required) values
  ((select id from public.catalog_services where key = 'circuito_independiente'), 'calibre', 'Calibre del cable', 'select', '"#10 AWG"'::jsonb, 1, true);

insert into public.catalog_question_options (question_id, value, label, sort_order) values
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'circuito_independiente') and key = 'calibre'), '#10 AWG', '#10 AWG', 1),
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'circuito_independiente') and key = 'calibre'), '#8 AWG', '#8 AWG', 2);

insert into public.catalog_materials (category_id, name, unit, precio_minimo, precio_sugerido, precio_maximo) values
  ((select id from public.catalog_categories where key = 'electricidad'), 'Cable THHN #12 AWG', 'ml', 1200, 1500, 2000),
  ((select id from public.catalog_categories where key = 'electricidad'), 'Conduit PVC 1/2"', 'ml', 1500, 1800, 2400),
  ((select id from public.catalog_categories where key = 'electricidad'), 'Caja eléctrica 4x2', 'unidad', 2500, 3500, 5000),
  ((select id from public.catalog_categories where key = 'electricidad'), 'Tomacorriente doble', 'unidad', 6000, 9000, 15000),
  ((select id from public.catalog_categories where key = 'electricidad'), 'Cable THHN #14 AWG', 'ml', 900, 1100, 1500),
  ((select id from public.catalog_categories where key = 'electricidad'), 'Caja octogonal', 'unidad', 2500, 3500, 5000),
  ((select id from public.catalog_categories where key = 'electricidad'), 'Interruptor sencillo', 'unidad', 6000, 9000, 15000),
  ((select id from public.catalog_categories where key = 'electricidad'), 'Portalámparas', 'unidad', 3000, 4500, 7000),
  ((select id from public.catalog_categories where key = 'electricidad'), 'Cable THHN #10 AWG', 'ml', 2000, 2500, 3500),
  ((select id from public.catalog_categories where key = 'electricidad'), 'Cable THHN #8 AWG', 'ml', 3200, 4000, 5500),
  ((select id from public.catalog_categories where key = 'electricidad'), 'Breaker (totalizador)', 'unidad', 15000, 22000, 35000),
  ((select id from public.catalog_categories where key = 'electricidad'), 'Tablero eléctrico 12 circuitos', 'unidad', 120000, 160000, 220000);

-- Punto eléctrico: cable#12 (12 ml/punto), conduit (4 ml/punto), caja y tomacorriente (1 u/punto)
insert into public.catalog_material_rules (service_id, material_id, quantity_expr, waste_pct, sort_order) values
  ((select id from public.catalog_services where key = 'punto_electrico'),
   (select id from public.catalog_materials where name = 'Cable THHN #12 AWG'),
   '{"op":"mul","args":[{"var":"qty"},{"const":12}]}'::jsonb, 5, 1),
  ((select id from public.catalog_services where key = 'punto_electrico'),
   (select id from public.catalog_materials where name = 'Conduit PVC 1/2"'),
   '{"op":"mul","args":[{"var":"qty"},{"const":4}]}'::jsonb, 5, 2),
  ((select id from public.catalog_services where key = 'punto_electrico'),
   (select id from public.catalog_materials where name = 'Caja eléctrica 4x2'),
   '{"var":"qty"}'::jsonb, 0, 3),
  ((select id from public.catalog_services where key = 'punto_electrico'),
   (select id from public.catalog_materials where name = 'Tomacorriente doble'),
   '{"var":"qty"}'::jsonb, 0, 4);

insert into public.catalog_labor_rules (service_id, name, unit, precio_minimo, precio_sugerido, precio_maximo, sort_order) values
  ((select id from public.catalog_services where key = 'punto_electrico'), 'Mano de obra punto eléctrico', 'punto', 35000, 45000, 55000, 1);

-- Punto de iluminación: cable#14 (8 ml/punto), caja octogonal, interruptor, portalámparas (1 u/punto)
insert into public.catalog_material_rules (service_id, material_id, quantity_expr, waste_pct, sort_order) values
  ((select id from public.catalog_services where key = 'punto_iluminacion'),
   (select id from public.catalog_materials where name = 'Cable THHN #14 AWG'),
   '{"op":"mul","args":[{"var":"qty"},{"const":8}]}'::jsonb, 5, 1),
  ((select id from public.catalog_services where key = 'punto_iluminacion'),
   (select id from public.catalog_materials where name = 'Caja octogonal'),
   '{"var":"qty"}'::jsonb, 0, 2),
  ((select id from public.catalog_services where key = 'punto_iluminacion'),
   (select id from public.catalog_materials where name = 'Interruptor sencillo'),
   '{"var":"qty"}'::jsonb, 0, 3),
  ((select id from public.catalog_services where key = 'punto_iluminacion'),
   (select id from public.catalog_materials where name = 'Portalámparas'),
   '{"var":"qty"}'::jsonb, 0, 4);

insert into public.catalog_labor_rules (service_id, name, unit, precio_minimo, precio_sugerido, precio_maximo, sort_order) values
  ((select id from public.catalog_services where key = 'punto_iluminacion'), 'Mano de obra punto de iluminación', 'punto', 30000, 37500, 45000, 1);

-- Circuito independiente: cable según calibre (lookup para la longitud, condition_expr para elegir el material)
insert into public.catalog_material_rules (service_id, material_id, quantity_expr, waste_pct, condition_expr, sort_order) values
  ((select id from public.catalog_services where key = 'circuito_independiente'),
   (select id from public.catalog_materials where name = 'Cable THHN #10 AWG'),
   '{"op":"mul","args":[{"var":"qty"},{"op":"lookup","keys":["calibre"],"table":{"#10 AWG":25,"#8 AWG":30}}]}'::jsonb, 5,
   '{"op":"eq","args":[{"var":"calibre"},{"const":"#10 AWG"}]}'::jsonb, 1),
  ((select id from public.catalog_services where key = 'circuito_independiente'),
   (select id from public.catalog_materials where name = 'Cable THHN #8 AWG'),
   '{"op":"mul","args":[{"var":"qty"},{"op":"lookup","keys":["calibre"],"table":{"#10 AWG":25,"#8 AWG":30}}]}'::jsonb, 5,
   '{"op":"eq","args":[{"var":"calibre"},{"const":"#8 AWG"}]}'::jsonb, 2);

insert into public.catalog_material_rules (service_id, material_id, quantity_expr, sort_order) values
  ((select id from public.catalog_services where key = 'circuito_independiente'),
   (select id from public.catalog_materials where name = 'Breaker (totalizador)'),
   '{"var":"qty"}'::jsonb, 3);

insert into public.catalog_labor_rules (service_id, name, unit, precio_minimo, precio_sugerido, precio_maximo, sort_order) values
  ((select id from public.catalog_services where key = 'circuito_independiente'), 'Mano de obra circuito independiente', 'circuito', 80000, 115000, 150000, 1);

-- Tablero (stub global)
insert into public.catalog_material_rules (service_id, material_id, quantity_expr, sort_order) values
  ((select id from public.catalog_services where key = 'tablero'),
   (select id from public.catalog_materials where name = 'Tablero eléctrico 12 circuitos'),
   '{"var":"qty"}'::jsonb, 1);

insert into public.catalog_labor_rules (service_id, name, unit, precio_minimo, precio_sugerido, precio_maximo, sort_order) values
  ((select id from public.catalog_services where key = 'tablero'), 'Instalación de tablero', 'global', 100000, 150000, 250000, 1);

-- ---------------------------------------------------------------------------
-- 8. PLOMERÍA
-- ---------------------------------------------------------------------------
insert into public.catalog_services (category_id, key, name, description, image_path, unit_basis, unit_label, sort_order) values
  ((select id from public.catalog_categories where key = 'plomeria'), 'punto_hidraulico', 'Punto hidráulico',
   'Punto de suministro de agua fría y/o caliente', '/img/plomeria.jpg', 'point', 'punto', 1),
  ((select id from public.catalog_categories where key = 'plomeria'), 'punto_sanitario', 'Punto sanitario',
   'Punto de desagüe sanitario', '/img/plomeria.jpg', 'point', 'punto', 2),
  ((select id from public.catalog_categories where key = 'plomeria'), 'red_completa', 'Red hidrosanitaria completa',
   'Red hidrosanitaria completa para una vivienda', '/img/plomeria.jpg', 'global', 'global', 3);

insert into public.catalog_questions (service_id, key, label, type, default_value, sort_order, required) values
  ((select id from public.catalog_services where key = 'punto_hidraulico'), 'agua_fria', '¿Incluye agua fría?', 'boolean', 'true'::jsonb, 1, true),
  ((select id from public.catalog_services where key = 'punto_hidraulico'), 'agua_caliente', '¿Incluye agua caliente?', 'boolean', 'false'::jsonb, 2, true);

insert into public.catalog_materials (category_id, name, unit, precio_minimo, precio_sugerido, precio_maximo) values
  ((select id from public.catalog_categories where key = 'plomeria'), 'Tubería PVC presión 1/2"', 'ml', 3000, 4000, 5500),
  ((select id from public.catalog_categories where key = 'plomeria'), 'Tubería CPVC 1/2"', 'ml', 6000, 8000, 11000),
  ((select id from public.catalog_categories where key = 'plomeria'), 'Accesorios hidráulicos (codos/uniones)', 'unidad', 2000, 3000, 4500),
  ((select id from public.catalog_categories where key = 'plomeria'), 'Tubería PVC sanitaria 3"', 'ml', 8000, 11000, 15000),
  ((select id from public.catalog_categories where key = 'plomeria'), 'Kit tubería red hidrosanitaria', 'global', 600000, 900000, 1400000);

insert into public.catalog_material_rules (service_id, material_id, quantity_expr, waste_pct, condition_expr, sort_order) values
  ((select id from public.catalog_services where key = 'punto_hidraulico'),
   (select id from public.catalog_materials where name = 'Tubería PVC presión 1/2"'),
   '{"op":"mul","args":[{"var":"qty"},{"const":3}]}'::jsonb, 5, '{"var":"agua_fria"}'::jsonb, 1),
  ((select id from public.catalog_services where key = 'punto_hidraulico'),
   (select id from public.catalog_materials where name = 'Tubería CPVC 1/2"'),
   '{"op":"mul","args":[{"var":"qty"},{"const":3}]}'::jsonb, 5, '{"var":"agua_caliente"}'::jsonb, 2);

insert into public.catalog_material_rules (service_id, material_id, quantity_expr, sort_order) values
  ((select id from public.catalog_services where key = 'punto_hidraulico'),
   (select id from public.catalog_materials where name = 'Accesorios hidráulicos (codos/uniones)'),
   '{"op":"mul","args":[{"var":"qty"},{"const":3}]}'::jsonb, 3);

insert into public.catalog_labor_rules (service_id, name, unit, precio_minimo, precio_sugerido, precio_maximo, sort_order) values
  ((select id from public.catalog_services where key = 'punto_hidraulico'), 'Mano de obra punto hidráulico', 'punto', 65000, 80000, 95000, 1);

-- Punto sanitario (stub)
insert into public.catalog_material_rules (service_id, material_id, quantity_expr, waste_pct, sort_order) values
  ((select id from public.catalog_services where key = 'punto_sanitario'),
   (select id from public.catalog_materials where name = 'Tubería PVC sanitaria 3"'),
   '{"op":"mul","args":[{"var":"qty"},{"const":2}]}'::jsonb, 5, 1);

insert into public.catalog_labor_rules (service_id, name, unit, precio_minimo, precio_sugerido, precio_maximo, sort_order) values
  -- TODO: ajustar con datos reales
  ((select id from public.catalog_services where key = 'punto_sanitario'), 'Mano de obra punto sanitario', 'punto', 50000, 70000, 100000, 1);

-- Red hidrosanitaria completa (stub global)
insert into public.catalog_material_rules (service_id, material_id, quantity_expr, sort_order) values
  ((select id from public.catalog_services where key = 'red_completa'),
   (select id from public.catalog_materials where name = 'Kit tubería red hidrosanitaria'),
   '{"var":"qty"}'::jsonb, 1);

insert into public.catalog_labor_rules (service_id, name, unit, precio_minimo, precio_sugerido, precio_maximo, sort_order) values
  -- TODO: ajustar con datos reales
  ((select id from public.catalog_services where key = 'red_completa'), 'Mano de obra red hidrosanitaria completa', 'global', 800000, 1500000, 3000000, 1);

-- ---------------------------------------------------------------------------
-- 9. MAMPOSTERÍA (stub)
-- ---------------------------------------------------------------------------
insert into public.catalog_services (category_id, key, name, description, image_path, unit_basis, unit_label, sort_order) values
  ((select id from public.catalog_categories where key = 'mamposteria'), 'muro_ladrillo', 'Muro en ladrillo',
   'Construcción de muro en ladrillo tolete', '/img/mamposteria.jpg', 'area', 'm²', 1);

insert into public.catalog_materials (category_id, name, unit, precio_minimo, precio_sugerido, precio_maximo) values
  ((select id from public.catalog_categories where key = 'mamposteria'), 'Ladrillo tolete', 'unidad', 700, 900, 1200),
  ((select id from public.catalog_categories where key = 'mamposteria'), 'Mortero de pega', 'm³', 280000, 350000, 450000);

insert into public.catalog_material_rules (service_id, material_id, quantity_expr, waste_pct, sort_order) values
  ((select id from public.catalog_services where key = 'muro_ladrillo'),
   (select id from public.catalog_materials where name = 'Ladrillo tolete'),
   '{"op":"mul","args":[{"var":"area"},{"const":25}]}'::jsonb, 5, 1),
  ((select id from public.catalog_services where key = 'muro_ladrillo'),
   (select id from public.catalog_materials where name = 'Mortero de pega'),
   '{"op":"mul","args":[{"var":"area"},{"const":0.025}]}'::jsonb, 10, 2);

insert into public.catalog_labor_rules (service_id, name, unit, precio_minimo, precio_sugerido, precio_maximo, sort_order) values
  -- TODO: ajustar con datos reales
  ((select id from public.catalog_services where key = 'muro_ladrillo'), 'Mano de obra mampostería', 'm²', 18000, 25000, 32000, 1);

-- ---------------------------------------------------------------------------
-- 10. REMODELACIÓN DE BAÑOS (stub — el preset/bundle completo llega en V2.1 §9.9)
-- ---------------------------------------------------------------------------
insert into public.catalog_services (category_id, key, name, description, image_path, unit_basis, unit_label, sort_order) values
  ((select id from public.catalog_categories where key = 'remodelacion_banos'), 'bano_basico', 'Remodelación básica de baño',
   'Acabados básicos de remodelación de baño (servicio simple; el paquete completo con piso, enchape, pintura, etc. se agrega como bundle)',
   '/img/remodelacion_banos.jpg', 'global', 'global', 1);

insert into public.catalog_materials (category_id, name, unit, description, precio_minimo, precio_sugerido, precio_maximo) values
  -- TODO: ajustar con datos reales
  ((select id from public.catalog_categories where key = 'remodelacion_banos'), 'Kit acabados básicos baño', 'global', 'Sanitario, lavamanos, grifería y accesorios básicos', 300000, 450000, 650000);

insert into public.catalog_material_rules (service_id, material_id, quantity_expr, sort_order) values
  ((select id from public.catalog_services where key = 'bano_basico'),
   (select id from public.catalog_materials where name = 'Kit acabados básicos baño'),
   '{"var":"qty"}'::jsonb, 1);

insert into public.catalog_labor_rules (service_id, name, unit, precio_minimo, precio_sugerido, precio_maximo, sort_order) values
  -- TODO: ajustar con datos reales
  ((select id from public.catalog_services where key = 'bano_basico'), 'Mano de obra instalación de acabados', 'global', 200000, 300000, 450000, 1);

-- ---------------------------------------------------------------------------
-- 11. REMODELACIÓN DE COCINAS (stub)
-- ---------------------------------------------------------------------------
insert into public.catalog_services (category_id, key, name, description, image_path, unit_basis, unit_label, sort_order) values
  ((select id from public.catalog_categories where key = 'remodelacion_cocinas'), 'cocina_basica', 'Remodelación básica de cocina',
   'Acabados básicos de remodelación de cocina (servicio simple; el paquete completo se agrega como bundle)',
   '/img/remodelacion_cocinas.jpg', 'global', 'global', 1);

insert into public.catalog_materials (category_id, name, unit, description, precio_minimo, precio_sugerido, precio_maximo) values
  -- TODO: ajustar con datos reales
  ((select id from public.catalog_categories where key = 'remodelacion_cocinas'), 'Kit acabados básicos cocina', 'global', 'Mesón, grifería y accesorios básicos', 500000, 750000, 1100000);

insert into public.catalog_material_rules (service_id, material_id, quantity_expr, sort_order) values
  ((select id from public.catalog_services where key = 'cocina_basica'),
   (select id from public.catalog_materials where name = 'Kit acabados básicos cocina'),
   '{"var":"qty"}'::jsonb, 1);

insert into public.catalog_labor_rules (service_id, name, unit, precio_minimo, precio_sugerido, precio_maximo, sort_order) values
  -- TODO: ajustar con datos reales
  ((select id from public.catalog_services where key = 'cocina_basica'), 'Mano de obra instalación de acabados', 'global', 250000, 400000, 600000, 1);

-- ---------------------------------------------------------------------------
-- 12. CUBIERTAS (stub)
-- ---------------------------------------------------------------------------
insert into public.catalog_services (category_id, key, name, description, image_path, unit_basis, unit_label, sort_order) values
  ((select id from public.catalog_categories where key = 'cubiertas'), 'cubierta_teja', 'Cubierta en teja termoacústica',
   'Instalación de cubierta con teja termoacústica y estructura de soporte', '/img/cubiertas.jpg', 'area', 'm²', 1);

insert into public.catalog_materials (category_id, name, unit, description, precio_minimo, precio_sugerido, precio_maximo) values
  -- TODO: ajustar con datos reales
  ((select id from public.catalog_categories where key = 'cubiertas'), 'Teja termoacústica', 'm²', 'Incluye solape', 45000, 58000, 75000),
  ((select id from public.catalog_categories where key = 'cubiertas'), 'Correa metálica', 'ml', 'Estructura de soporte', 18000, 24000, 32000);

insert into public.catalog_material_rules (service_id, material_id, quantity_expr, waste_pct, sort_order) values
  ((select id from public.catalog_services where key = 'cubierta_teja'),
   (select id from public.catalog_materials where name = 'Teja termoacústica'),
   '{"var":"area"}'::jsonb, 10, 1),
  ((select id from public.catalog_services where key = 'cubierta_teja'),
   (select id from public.catalog_materials where name = 'Correa metálica'),
   '{"op":"mul","args":[{"var":"area"},{"const":0.5}]}'::jsonb, 5, 2);

insert into public.catalog_labor_rules (service_id, name, unit, precio_minimo, precio_sugerido, precio_maximo, sort_order) values
  -- TODO: ajustar con datos reales
  ((select id from public.catalog_services where key = 'cubierta_teja'), 'Mano de obra instalación de cubierta', 'm²', 25000, 35000, 50000, 1);

-- ---------------------------------------------------------------------------
-- 13. IMPERMEABILIZACIÓN (stub)
-- ---------------------------------------------------------------------------
insert into public.catalog_services (category_id, key, name, description, image_path, unit_basis, unit_label, sort_order) values
  ((select id from public.catalog_categories where key = 'impermeabilizacion'), 'impermeabilizacion_losa', 'Impermeabilización de losa',
   'Aplicación de impermeabilizante acrílico sobre losa o muro', '/img/impermeabilizacion.jpg', 'area', 'm²', 1);

insert into public.catalog_materials (category_id, name, unit, description, precio_minimo, precio_sugerido, precio_maximo) values
  -- TODO: ajustar con datos reales
  ((select id from public.catalog_categories where key = 'impermeabilizacion'), 'Impermeabilizante acrílico', 'Kg', 'Rendimiento aproximado 1 kg/m²', 8000, 11000, 15000);

insert into public.catalog_material_rules (service_id, material_id, quantity_expr, waste_pct, sort_order) values
  ((select id from public.catalog_services where key = 'impermeabilizacion_losa'),
   (select id from public.catalog_materials where name = 'Impermeabilizante acrílico'),
   '{"var":"area"}'::jsonb, 10, 1);

insert into public.catalog_labor_rules (service_id, name, unit, precio_minimo, precio_sugerido, precio_maximo, sort_order) values
  -- TODO: ajustar con datos reales
  ((select id from public.catalog_services where key = 'impermeabilizacion_losa'), 'Mano de obra impermeabilización', 'm²', 15000, 20000, 30000, 1);

-- ---------------------------------------------------------------------------
-- 14. PISCINAS (stub)
-- ---------------------------------------------------------------------------
insert into public.catalog_services (category_id, key, name, description, image_path, unit_basis, unit_label, sort_order) values
  ((select id from public.catalog_categories where key = 'piscinas'), 'piscina_enchape', 'Enchape de piscina',
   'Instalación de enchape para piscina', '/img/piscinas.jpg', 'area', 'm²', 1);

insert into public.catalog_materials (category_id, name, unit, description, precio_minimo, precio_sugerido, precio_maximo) values
  -- TODO: ajustar con datos reales
  ((select id from public.catalog_categories where key = 'piscinas'), 'Pegante para enchape de piscina', 'Kg', 'Rendimiento aproximado 6 kg/m²', 2000, 2700, 3800);

insert into public.catalog_material_rules (service_id, material_id, quantity_expr, waste_pct, sort_order) values
  ((select id from public.catalog_services where key = 'piscina_enchape'),
   (select id from public.catalog_materials where name = 'Pegante para enchape de piscina'),
   '{"op":"mul","args":[{"var":"area"},{"const":6}]}'::jsonb, 10, 1);

insert into public.catalog_labor_rules (service_id, name, unit, precio_minimo, precio_sugerido, precio_maximo, sort_order) values
  -- TODO: ajustar con datos reales
  ((select id from public.catalog_services where key = 'piscina_enchape'), 'Mano de obra enchape de piscina', 'm²', 35000, 45000, 60000, 1);

-- ---------------------------------------------------------------------------
-- 15. OBRA GRIS (stub)
-- ---------------------------------------------------------------------------
insert into public.catalog_services (category_id, key, name, description, image_path, unit_basis, unit_label, sort_order) values
  ((select id from public.catalog_categories where key = 'obra_gris'), 'obra_gris_general', 'Obra gris general',
   'Cimentación y estructura en concreto, por m²', '/img/obra_gris.jpg', 'area', 'm²', 1);

insert into public.catalog_materials (category_id, name, unit, description, precio_minimo, precio_sugerido, precio_maximo, packaging_unit, packaging_size) values
  -- TODO: ajustar con datos reales
  ((select id from public.catalog_categories where key = 'obra_gris'), 'Cemento gris', 'Bulto', 'Bulto de 50 kg', 28000, 32000, 40000, 'bulto', 50),
  ((select id from public.catalog_categories where key = 'obra_gris'), 'Arena de río', 'm³', null, 80000, 100000, 130000, null, null);

insert into public.catalog_material_rules (service_id, material_id, quantity_expr, waste_pct, sort_order) values
  ((select id from public.catalog_services where key = 'obra_gris_general'),
   (select id from public.catalog_materials where name = 'Cemento gris'),
   '{"op":"mul","args":[{"var":"area"},{"const":0.5}]}'::jsonb, 5, 1),
  ((select id from public.catalog_services where key = 'obra_gris_general'),
   (select id from public.catalog_materials where name = 'Arena de río'),
   '{"op":"mul","args":[{"var":"area"},{"const":0.05}]}'::jsonb, 5, 2);

insert into public.catalog_labor_rules (service_id, name, unit, precio_minimo, precio_sugerido, precio_maximo, sort_order) values
  -- TODO: ajustar con datos reales
  ((select id from public.catalog_services where key = 'obra_gris_general'), 'Mano de obra obra gris', 'm²', 20000, 30000, 45000, 1);
