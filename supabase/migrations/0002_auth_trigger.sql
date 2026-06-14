-- BRIVIA — Trigger de creación de usuario
-- Al registrarse un usuario en auth.users, se crea automáticamente:
--   workspace (tipo 'independiente'), profile (role='owner'), company_settings,
--   workspace_features (defaults), subscription en plan 'free', y se seedea el
--   catálogo de servicios/materiales (igual a src/lib/data.ts::SERVICES).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_free_plan_id uuid;
  v_services jsonb := '[
    {
      "key": "pintura", "name": "Pintura", "description": "Interior y exterior", "labor_per_m2": 9000,
      "materials": [
        { "name": "Pintura vinilo tipo 1", "unit": "Galón", "yield": 0.11, "price": 68000 },
        { "name": "Estuco plástico", "unit": "Saco", "yield": 0.05, "price": 28000 },
        { "name": "Lija y sellador", "unit": "Unidad", "yield": 0.08, "price": 9500 }
      ]
    },
    {
      "key": "drywall", "name": "Drywall", "description": "Muros y cielos", "labor_per_m2": 14000,
      "materials": [
        { "name": "Lámina drywall 1/2\"", "unit": "Lámina", "yield": 0.34, "price": 42000 },
        { "name": "Perfilería metálica", "unit": "Metro", "yield": 1.2, "price": 6800 },
        { "name": "Masilla y cinta", "unit": "Kit", "yield": 0.06, "price": 32000 }
      ]
    },
    {
      "key": "electricidad", "name": "Electricidad", "description": "Instalación", "labor_per_m2": 16000,
      "materials": [
        { "name": "Cable #12 AWG", "unit": "Metro", "yield": 1.6, "price": 3200 },
        { "name": "Tomas y switches", "unit": "Unidad", "yield": 0.12, "price": 8500 },
        { "name": "Tubería conduit", "unit": "Metro", "yield": 0.9, "price": 4200 }
      ]
    },
    {
      "key": "plomeria", "name": "Plomería", "description": "Agua y desagüe", "labor_per_m2": 15000,
      "materials": [
        { "name": "Tubería PVC presión", "unit": "Metro", "yield": 0.7, "price": 7800 },
        { "name": "Accesorios y codos", "unit": "Unidad", "yield": 0.4, "price": 4500 }
      ]
    },
    {
      "key": "pisos", "name": "Pisos", "description": "Cerámica / porcelanato", "labor_per_m2": 22000,
      "materials": [
        { "name": "Porcelanato 60x60", "unit": "m²", "yield": 1.07, "price": 48000 },
        { "name": "Pegante para piso", "unit": "Saco", "yield": 0.2, "price": 26000 },
        { "name": "Boquilla", "unit": "Kg", "yield": 0.3, "price": 9000 }
      ]
    },
    {
      "key": "enchape", "name": "Enchape", "description": "Baños y cocinas", "labor_per_m2": 24000,
      "materials": [
        { "name": "Cerámica de pared", "unit": "m²", "yield": 1.07, "price": 39000 },
        { "name": "Pegacor", "unit": "Saco", "yield": 0.22, "price": 27000 }
      ]
    },
    {
      "key": "remodelacion", "name": "Remodelación", "description": "Integral", "labor_per_m2": 28000,
      "materials": [
        { "name": "Demolición y retiro", "unit": "m²", "yield": 1, "price": 12000 },
        { "name": "Materiales varios", "unit": "Global", "yield": 0.3, "price": 45000 }
      ]
    },
    {
      "key": "techos", "name": "Techos", "description": "Cubiertas", "labor_per_m2": 19000,
      "materials": [
        { "name": "Teja termoacústica", "unit": "Lámina", "yield": 0.5, "price": 58000 },
        { "name": "Estructura metálica", "unit": "Metro", "yield": 0.8, "price": 18000 }
      ]
    },
    {
      "key": "mamposteria", "name": "Mampostería", "description": "Muros en ladrillo", "labor_per_m2": 21000,
      "materials": [
        { "name": "Ladrillo estructural", "unit": "Unidad", "yield": 12.5, "price": 1600 },
        { "name": "Mortero", "unit": "Saco", "yield": 0.25, "price": 24000 }
      ]
    }
  ]'::jsonb;
  v_service jsonb;
  v_material jsonb;
  v_sort int;
  v_service_type_id uuid;
  v_material_id uuid;
begin
  insert into public.workspaces (name, type, currency_code, created_by)
  values (coalesce(new.raw_user_meta_data->>'company_name', 'Mi negocio'), 'independiente', 'COP', new.id)
  returning id into v_workspace_id;

  select id into v_free_plan_id from public.plans where code = 'free';
  update public.workspaces set current_plan_id = v_free_plan_id where id = v_workspace_id;

  insert into public.profiles (id, workspace_id, role, full_name, email)
  values (new.id, v_workspace_id, 'owner', coalesce(new.raw_user_meta_data->>'full_name', ''), new.email);

  insert into public.company_settings (workspace_id, name, email)
  values (v_workspace_id, coalesce(new.raw_user_meta_data->>'company_name', ''), new.email);

  insert into public.workspace_features (workspace_id)
  values (v_workspace_id);

  insert into public.subscriptions (workspace_id, plan_id, status)
  values (v_workspace_id, v_free_plan_id, 'active');

  for v_service in select * from jsonb_array_elements(v_services)
  loop
    insert into public.service_types (workspace_id, key, name, description, labor_per_m2)
    values (
      v_workspace_id,
      v_service->>'key',
      v_service->>'name',
      v_service->>'description',
      (v_service->>'labor_per_m2')::numeric
    )
    returning id into v_service_type_id;

    v_sort := 0;
    for v_material in select * from jsonb_array_elements(v_service->'materials')
    loop
      insert into public.materials (workspace_id, name, unit, category, price)
      values (
        v_workspace_id,
        v_material->>'name',
        v_material->>'unit',
        v_service->>'name',
        (v_material->>'price')::numeric
      )
      returning id into v_material_id;

      insert into public.service_materials (service_type_id, material_id, yield_per_m2, sort_order)
      values (v_service_type_id, v_material_id, (v_material->>'yield')::numeric, v_sort);

      v_sort := v_sort + 1;
    end loop;
  end loop;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
