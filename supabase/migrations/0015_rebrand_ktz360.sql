-- KTZ360 — Rebranding: actualiza textos de marca "Brivia" almacenados en datos
-- de configuración (planes de suscripción). No afecta datos operativos
-- (workspaces, cotizaciones, clientes, etc.).

update public.plans
set description = 'Todo Pro + KTZ360 IA, cotización desde foto, reportes avanzados, multiusuario'
where code = 'premium';
