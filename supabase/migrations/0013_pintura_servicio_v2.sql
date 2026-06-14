-- ---------------------------------------------------------------------------
-- 0013: ajustes al servicio "Pintura de muros" (Paso 3 del wizard)
-- agrega subtítulos, tipo de pintura y resanes como "trabajos incluidos"
-- ---------------------------------------------------------------------------

-- Subtítulos (help_text) para las preguntas existentes
update public.catalog_questions set label = 'Tipo de trabajo', help_text = '¿La superficie es interior o exterior?'
  where service_id = (select id from public.catalog_services where key = 'pintura') and key = 'exterior';

update public.catalog_questions set help_text = '¿Cuántas manos de pintura se aplicarán?'
  where service_id = (select id from public.catalog_services where key = 'pintura') and key = 'manos';

update public.catalog_questions set label = 'Aplicación de estuco', help_text = 'Incluye estuco plástico o acrílico.', sort_order = 4
  where service_id = (select id from public.catalog_services where key = 'pintura') and key = 'incluye_estuco';

update public.catalog_questions set label = 'Sellador', help_text = 'Incluye sellador antes de pintar.', sort_order = 5
  where service_id = (select id from public.catalog_services where key = 'pintura') and key = 'incluye_sellador';

-- Nueva pregunta: Tipo de pintura (select, una sola opción por ahora)
insert into public.catalog_questions (service_id, key, label, help_text, type, default_value, sort_order, required)
values
  ((select id from public.catalog_services where key = 'pintura'), 'tipo_pintura', 'Tipo de pintura', 'Selecciona el tipo de pintura a aplicar.', 'select', '"vinilo_tipo1"'::jsonb, 3, true);

insert into public.catalog_question_options (question_id, value, label, sort_order)
values
  ((select id from public.catalog_questions where service_id = (select id from public.catalog_services where key = 'pintura') and key = 'tipo_pintura'), 'vinilo_tipo1', 'Vinilo tipo 1', 1);

-- Nueva pregunta: Resanes (boolean, agrupada en "Trabajos incluidos")
insert into public.catalog_questions (service_id, key, label, help_text, type, default_value, sort_order, required)
values
  ((select id from public.catalog_services where key = 'pintura'), 'resanes', 'Resanes', 'Incluye resanes menores y preparación de superficie.', 'boolean', 'false'::jsonb, 6, true);

-- Mano de obra adicional cuando se incluyen resanes
insert into public.catalog_labor_rules (service_id, name, unit, precio_minimo, precio_sugerido, precio_maximo, condition_expr, sort_order)
values
  ((select id from public.catalog_services where key = 'pintura'), 'Mano de obra resanes y preparación', 'm²', 3000, 4000, 5000, '{"var":"resanes"}'::jsonb, 3);
