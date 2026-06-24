-- ════════════════════════════════════════════════════════════════════════════
-- AUDITORÍA DE MIGRACIONES — Shelwi
-- Ejecutar en Supabase SQL Editor para ver qué falta aplicar.
-- Resultado: OK = existe | FALTA = no existe
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. TABLAS ────────────────────────────────────────────────────────────────

SELECT
  t.expected_table                     AS "tabla",
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = t.expected_table
  ) THEN '✅ OK' ELSE '❌ FALTA' END   AS "estado",
  t.sprint                             AS "sprint"
FROM (VALUES
  -- Sprint 1-3 (base)
  ('workspaces',              'Sprint 1'),
  ('profiles',                'Sprint 1'),
  ('plans',                   'Sprint 1'),
  ('plan_limits',             'Sprint 1'),
  ('plan_features',           'Sprint 1'),
  ('subscriptions',           'Sprint 1'),
  ('clients',                 'Sprint 1'),
  ('quotes',                  'Sprint 1'),
  ('payment_events',          'Sprint 1'),
  -- Sprint 4-5 (CRM + Reportes)
  ('seguimientos',            'Sprint 4'),
  ('recordatorios',           'Sprint 4'),
  ('quote_commercial_history','Sprint 4'),
  ('quote_views',             'Sprint 5'),
  -- Sprint 6 (Pedidos)
  ('orders',                  'Sprint 6'),
  ('work_orders',             'Sprint 6'),
  ('work_logs',               'Sprint 6'),
  ('workspace_order_counters','Sprint 6'),
  -- Sprint 7 (Evidencias)
  ('evidence_files',          'Sprint 7'),
  -- Sprint 8 (GPS)
  ('gps_events',              'Sprint 8'),
  ('member_locations',        'Sprint 8'),
  -- Sprint 9 (Admin + Founder)
  ('founder_promotions',      'Sprint 9'),
  -- Sprint 10 (Portal)
  ('client_portal_tokens',    'Sprint 10'),
  ('portal_access_log',       'Sprint 10'),
  ('client_timeline_events',  'Sprint 10'),
  -- Sprint 11-12 (Integraciones)
  ('integrations',            'Sprint 11'),
  ('integration_credentials', 'Sprint 11'),
  ('integration_events',      'Sprint 11'),
  ('integration_entity_refs', 'Sprint 12'),
  ('communication_log',       'Sprint 12'),
  ('integration_invoices',    'Sprint 12'),
  ('oauth_states',            'Sprint 11'),
  -- Sprint 13 (Automatizaciones)
  ('automation_templates',    'Sprint 13'),
  ('automation_rules',        'Sprint 13'),
  ('automation_logs',         'Sprint 13'),
  -- Sprint 14 (Storage + Drive)
  ('workspace_storage_addons','Sprint 14'),
  -- Sprint 15 (Customer Success)
  ('customer_health_scores',  'Sprint 15'),
  -- Sprint 16 (Loyalty · Reviews · Surveys)
  ('loyalty_programs',        'Sprint 16'),
  ('loyalty_transactions',    'Sprint 16'),
  ('loyalty_rewards',         'Sprint 16'),
  ('reviews',                 'Sprint 16'),
  ('review_responses',        'Sprint 16'),
  ('surveys',                 'Sprint 16'),
  ('survey_responses',        'Sprint 16'),
  -- Sprint 17 (Growth)
  ('referral_programs',       'Sprint 17'),
  ('referral_links',          'Sprint 17'),
  ('referral_conversions',    'Sprint 17'),
  ('utm_events',              'Sprint 17'),
  ('promotions',              'Sprint 17'),
  ('promotion_redemptions',   'Sprint 17'),
  -- Sprint 18 (Finanzas)
  ('order_cost_entries',      'Sprint 18'),
  ('saas_invoices',           'Sprint 18')
) AS t(expected_table, sprint)
ORDER BY t.sprint, t.expected_table;

-- ─── 2. COLUMNAS CRÍTICAS AÑADIDAS VÍA ALTER TABLE ───────────────────────────

SELECT
  c.tbl || '.' || c.col              AS "columna",
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = c.tbl
      AND column_name  = c.col
  ) THEN '✅ OK' ELSE '❌ FALTA' END  AS "estado",
  c.sprint                           AS "sprint"
FROM (VALUES
  ('subscriptions',     'billing_cycle',        'Sprint 1.x'),
  ('workspaces',        'storage_used_bytes',   'Sprint 7'),
  ('plan_features',     'orders_enabled',       'Sprint 6'),
  ('plan_features',     'gps_enabled',          'Sprint 8'),
  ('plan_features',     'portal_enabled',       'Sprint 10'),
  ('plan_features',     'automation_enabled',   'Sprint 13'),
  ('plan_features',     'loyalty_enabled',      'Sprint 16'),
  ('company_settings',  'portal_show_loyalty',  'Sprint 16'),
  ('company_settings',  'portal_show_reviews',  'Sprint 16'),
  ('profiles',          'hourly_rate',          'Sprint 18'),
  ('profiles',          'cost_rate_type',       'Sprint 18'),
  ('integration_invoices','pdf_url',            'Sprint 18 hotfix'),
  ('integration_invoices','xml_url',            'Sprint 18 hotfix'),
  ('order_cost_entries','work_order_id',        'Sprint 18 Ph2')
) AS c(tbl, col, sprint)
ORDER BY c.sprint, c.tbl;

-- ─── 3. FUNCIONES CLAVE ───────────────────────────────────────────────────────

SELECT
  f.fn                                AS "función",
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f.fn
  ) THEN '✅ OK' ELSE '❌ FALTA' END  AS "estado",
  f.sprint                            AS "sprint"
FROM (VALUES
  -- Sprint 5
  ('get_reports_summary',           'Sprint 5'),
  ('get_funnel_report',             'Sprint 5'),
  ('get_executive_dashboard',       'Sprint 5'),
  ('get_smart_alerts',              'Sprint 5'),
  -- Sprint 6
  ('get_operations_dashboard',      'Sprint 6'),
  ('create_order',                  'Sprint 6'),
  -- Sprint 8
  ('get_operational_dashboard',     'Sprint 8'),
  ('get_team_map',                  'Sprint 8'),
  -- Sprint 10
  ('get_client_portal',             'Sprint 10'),
  -- Sprint 11-12
  ('get_integration_status',        'Sprint 11'),
  ('queue_invoice_generation',      'Sprint 12'),
  ('get_invoice_history',           'Sprint 12'),
  -- Sprint 13
  ('create_automation_rule',        'Sprint 13'),
  ('trigger_automations',           'Sprint 13'),
  -- Sprint 15
  ('calculate_customer_health',     'Sprint 15'),
  ('get_customer_success_dashboard','Sprint 15'),
  ('get_clients_at_risk',           'Sprint 15'),
  -- Sprint 16
  ('submit_review',                 'Sprint 16'),
  ('respond_to_review',             'Sprint 16'),
  ('get_reviews',                   'Sprint 16'),
  ('assign_loyalty_points',         'Sprint 16'),
  ('get_client_loyalty',            'Sprint 16'),
  ('get_nps_summary',               'Sprint 16'),
  -- Sprint 17
  ('create_referral_link',          'Sprint 17'),
  ('track_referral_visit',          'Sprint 17'),
  ('get_growth_dashboard',          'Sprint 17'),
  ('get_utm_analytics',             'Sprint 17'),
  ('get_portal_referral_info',      'Sprint 17'),
  -- Sprint 18
  ('get_order_profit',              'Sprint 18'),
  ('get_client_profit',             'Sprint 18'),
  ('get_service_profit',            'Sprint 18'),
  ('get_workspace_profitability',   'Sprint 18'),
  ('get_finance_dashboard',         'Sprint 18'),
  ('get_admin_finance_summary',     'Sprint 18'),
  ('add_order_cost_entry',          'Sprint 18'),
  ('void_invoice',                  'Sprint 18'),
  ('update_invoice_status',         'Sprint 18'),
  ('register_saas_invoice',         'Sprint 18'),
  -- Sprint 19
  ('get_sales_by_rep',              'Sprint 19'),
  ('get_ops_productivity',          'Sprint 19'),
  ('get_bi_executive_kpis',         'Sprint 19'),
  ('get_bi_sales_kpis',             'Sprint 19'),
  ('get_bi_operations_kpis',        'Sprint 19'),
  ('get_bi_marketing_kpis',         'Sprint 19'),
  ('get_bi_customer_kpis',          'Sprint 19'),
  ('get_client_cohorts',            'Sprint 19'),
  ('get_full_funnel',               'Sprint 19'),
  -- Sprint 21 Hardening
  ('toggle_review_visibility',      'Sprint 21'),
  -- CX CMS
  ('upsert_loyalty_program',        'CX CMS'),
  ('upsert_loyalty_reward',         'CX CMS'),
  ('delete_loyalty_reward',         'CX CMS'),
  ('adjust_loyalty_points',         'CX CMS'),
  ('get_loyalty_dashboard',         'CX CMS'),
  ('upsert_survey',                 'CX CMS'),
  ('delete_survey',                 'CX CMS'),
  ('get_cx_dashboard',              'CX CMS')
) AS f(fn, sprint)
ORDER BY f.sprint, f.fn;

-- ─── 4. VISTAS DW (Sprint 19) ─────────────────────────────────────────────────

SELECT
  v.vw                                AS "vista",
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = v.vw
  ) THEN '✅ OK' ELSE '❌ FALTA' END  AS "estado",
  'Sprint 19'                         AS "sprint"
FROM (VALUES
  ('dw_sales'),
  ('dw_operations'),
  ('dw_finance'),
  ('dw_marketing'),
  ('v_ai_credits_summary'),
  ('v_subscription_effective_price')
) AS v(vw)
ORDER BY v.vw;
