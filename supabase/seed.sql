-- BRIVIA — Datos de ejemplo para desarrollo local
-- NO se ejecuta en producción. Requiere que ya exista al menos un workspace
-- (creado automáticamente por el trigger on_auth_user_created al registrar un usuario).
-- Ajusta el `select id from public.workspaces limit 1` si quieres apuntar a otro workspace.

do $$
declare
  v_workspace_id uuid;
  v_client_andina uuid;
  v_client_sur uuid;
  v_client_meridiano uuid;
  v_client_rojas uuid;
  v_service_pintura uuid;
  v_service_electricidad uuid;
  v_service_drywall uuid;
  v_service_pisos uuid;
  v_service_remodelacion uuid;
  v_service_enchape uuid;
  v_service_plomeria uuid;
begin
  select id into v_workspace_id from public.workspaces order by created_at limit 1;

  if v_workspace_id is null then
    raise notice 'No hay ningún workspace todavía. Registra un usuario antes de ejecutar el seed.';
    return;
  end if;

  -- Clientes de ejemplo
  insert into public.clients (workspace_id, name, meta, initial)
  values
    (v_workspace_id, 'Constructora Andina', 'Bogotá · Constructora', 'CA'),
    (v_workspace_id, 'Inmobiliaria Sur', 'Cali · Inmobiliaria', 'IS'),
    (v_workspace_id, 'Grupo Meridiano', 'Medellín · Constructora', 'GM'),
    (v_workspace_id, 'Familia Rojas', 'Bogotá · Particular', 'FR');

  select id into v_client_andina from public.clients where workspace_id = v_workspace_id and name = 'Constructora Andina';
  select id into v_client_sur from public.clients where workspace_id = v_workspace_id and name = 'Inmobiliaria Sur';
  select id into v_client_meridiano from public.clients where workspace_id = v_workspace_id and name = 'Grupo Meridiano';
  select id into v_client_rojas from public.clients where workspace_id = v_workspace_id and name = 'Familia Rojas';

  select id into v_service_pintura from public.service_types where workspace_id = v_workspace_id and key = 'pintura';
  select id into v_service_electricidad from public.service_types where workspace_id = v_workspace_id and key = 'electricidad';
  select id into v_service_drywall from public.service_types where workspace_id = v_workspace_id and key = 'drywall';
  select id into v_service_pisos from public.service_types where workspace_id = v_workspace_id and key = 'pisos';
  select id into v_service_remodelacion from public.service_types where workspace_id = v_workspace_id and key = 'remodelacion';
  select id into v_service_enchape from public.service_types where workspace_id = v_workspace_id and key = 'enchape';
  select id into v_service_plomeria from public.service_types where workspace_id = v_workspace_id and key = 'plomeria';

  -- Cotizaciones de ejemplo
  insert into public.quotes (workspace_id, client_id, title, services, area, util, iva, status, created_at, valid_days)
  values
    (v_workspace_id, v_client_andina, 'Pintura · Apto 502', jsonb_build_array(v_service_pintura), 120, 25, true, 'Aprobada', now() - interval '3 days', 15),
    (v_workspace_id, v_client_sur, 'Eléctrico · Local 12', jsonb_build_array(v_service_electricidad), 45, 22, true, 'Enviada', now() - interval '4 days', 15),
    (v_workspace_id, v_client_meridiano, 'Drywall · Oficina 3', jsonb_build_array(v_service_drywall), 85, 28, true, 'Borrador', now() - interval '5 days', 15),
    (v_workspace_id, v_client_rojas, 'Pisos · Casa Rojas', jsonb_build_array(v_service_pisos), 95, 25, true, 'Aprobada', now() - interval '7 days', 30),
    (v_workspace_id, v_client_andina, 'Remodelación · Cocina', jsonb_build_array(v_service_remodelacion, v_service_enchape), 22, 30, true, 'Enviada', now() - interval '9 days', 8),
    (v_workspace_id, v_client_rojas, 'Enchape · Baño principal', jsonb_build_array(v_service_enchape), 16, 25, true, 'Rechazada', now() - interval '12 days', 15),
    (v_workspace_id, v_client_sur, 'Plomería · Edificio Norte', jsonb_build_array(v_service_plomeria), 60, 20, true, 'Enviada', now() - interval '2 days', 15);

  -- Plantillas de ejemplo
  insert into public.quote_templates (workspace_id, name, services, area, util, iva)
  values
    (v_workspace_id, 'Pintura Casa 100m²', jsonb_build_array(v_service_pintura), 100, 25, true),
    (v_workspace_id, 'Drywall Oficina 60m²', jsonb_build_array(v_service_drywall), 60, 28, true),
    (v_workspace_id, 'Remodelación Baño 12m²', jsonb_build_array(v_service_remodelacion, v_service_enchape), 12, 30, true);
end;
$$;
