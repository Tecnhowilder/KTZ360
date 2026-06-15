-- KTZ360 — Sembrar 19 clientes en el workspace de free@test.ktz360.com
-- Pegar manualmente en el editor SQL de Supabase.
--
-- Plan FREE: max_clients = 20 (0016). Con 19 clientes ya creados, el límite
-- queda en 19/20 — al crear el cliente #20 desde la app, check_plan_limit
-- debe seguir permitiendo (19 < 20); al intentar crear el #21, debe bloquear.
--
-- Idempotente: si ya existen clientes de prueba con estos nombres, no los
-- duplica (valida por nombre dentro del workspace).

do $$
declare
  v_workspace_id uuid;
  i int;
begin
  select workspace_id into v_workspace_id
    from public.profiles
    where id = (select id from auth.users where email = 'free@test.ktz360.com');

  if v_workspace_id is null then
    raise exception 'No existe el workspace de free@test.ktz360.com (ejecuta primero 0021_seed_test_users.sql)';
  end if;

  for i in 1..19 loop
    if not exists (
      select 1 from public.clients
      where workspace_id = v_workspace_id and name = 'Cliente Prueba ' || i
    ) then
      insert into public.clients (workspace_id, name, meta, phone, email, status)
      values (
        v_workspace_id,
        'Cliente Prueba ' || i,
        'Bogotá · Cliente de prueba',
        '300' || lpad(i::text, 7, '0'),
        'cliente' || i || '@prueba.ktz360.com',
        'active'
      );
    end if;
  end loop;
end $$;
