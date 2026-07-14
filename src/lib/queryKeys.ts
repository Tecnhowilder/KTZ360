/**
 * queryKeys — Factory centralizado para todas las query keys de React Query.
 *
 * Convención:
 *   queryKeys.domain.list(params?)  → para queries de lista
 *   queryKeys.domain.detail(id)     → para queries de detalle
 *   queryKeys.domain.root()         → para invalidación completa del dominio
 *
 * Uso correcto de invalidación:
 *   queryClient.invalidateQueries({ queryKey: queryKeys.quotes.root() })
 *   → invalida todas las queries de cotizaciones (list, detail, etc.)
 *
 * Por qué: 66 usos de staleTime y queryKeys como strings literales dispersos
 * sin patrón centralizado hacen que invalidaciones sean frágiles
 * (un typo en la key deja datos obsoletos en caché silenciosamente).
 */

export const queryKeys = {
  // ── Auth / Workspace ──────────────────────────────────────────────────────
  profile: {
    root: () => ['profile'] as const,
    detail: (userId: string) => ['profile', userId] as const,
  },
  workspace: {
    root: () => ['workspace'] as const,
    detail: (workspaceId: string) => ['workspace', workspaceId] as const,
  },
  company: {
    root: () => ['company'] as const,
    detail: (workspaceId: string) => ['company', workspaceId] as const,
  },
  plan: {
    root: () => ['plan'] as const,
    current: (workspaceId: string) => ['plan', workspaceId] as const,
  },

  // ── Cotizaciones ─────────────────────────────────────────────────────────
  quotes: {
    root: () => ['quotes'] as const,
    list: (workspaceId: string, filters?: Record<string, unknown>) =>
      filters ? ['quotes', workspaceId, filters] : ['quotes', workspaceId],
    detail: (quoteId: string) => ['quotes', 'detail', quoteId] as const,
    items: (quoteId: string) => ['quotes', 'items', quoteId] as const,
    views: (quoteId: string) => ['quotes', 'views', quoteId] as const,
  },

  // ── Pedidos / Órdenes ─────────────────────────────────────────────────────
  orders: {
    root: () => ['orders'] as const,
    list: (workspaceId: string, filters?: Record<string, unknown>) =>
      filters ? ['orders', workspaceId, filters] : ['orders', workspaceId],
    detail: (orderId: string) => ['orders', 'detail', orderId] as const,
  },
  workOrders: {
    root: () => ['work-orders'] as const,
    list: (workspaceId: string, filters?: Record<string, unknown>) =>
      filters ? ['work-orders', workspaceId, filters] : ['work-orders', workspaceId],
    detail: (orderId: string) => ['work-orders', 'detail', orderId] as const,
  },

  // ── Clientes ─────────────────────────────────────────────────────────────
  clients: {
    root: () => ['clients'] as const,
    list: (workspaceId: string) => ['clients', workspaceId] as const,
    detail: (clientId: string) => ['clients', 'detail', clientId] as const,
    timeline: (clientId: string) => ['clients', 'timeline', clientId] as const,
  },

  // ── Equipo ───────────────────────────────────────────────────────────────
  team: {
    root: () => ['team'] as const,
    list: (workspaceId: string) => ['team', workspaceId] as const,
    member: (userId: string) => ['team', 'member', userId] as const,
    presence: (workspaceId: string) => ['team', 'presence', workspaceId] as const,
  },

  // ── Catálogo / Materiales ─────────────────────────────────────────────────
  catalog: {
    root: () => ['catalog'] as const,
    items: (workspaceId: string, search?: string) =>
      search ? ['catalog', workspaceId, search] : ['catalog', workspaceId],
  },
  materials: {
    root: () => ['materials'] as const,
    list: (workspaceId: string) => ['materials', workspaceId] as const,
  },

  // ── IA / Créditos ─────────────────────────────────────────────────────────
  aiCredits: {
    root: () => ['ai-credits'] as const,
    status: (workspaceId: string) => ['ai-credits', workspaceId] as const,
    history: (workspaceId: string) => ['ai-credits', 'history', workspaceId] as const,
  },

  // ── Notificaciones ────────────────────────────────────────────────────────
  notifications: {
    root: () => ['notifications'] as const,
    list: (workspaceId: string) => ['notifications', workspaceId] as const,
    unread: (workspaceId: string) => ['notifications', 'unread', workspaceId] as const,
  },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: {
    root: () => ['dashboard'] as const,
    stats: (workspaceId: string, period?: string) =>
      period ? ['dashboard', workspaceId, period] : ['dashboard', workspaceId],
    operario: (userId: string) => ['dashboard', 'operario', userId] as const,
  },

  // ── GPS / Presencia ───────────────────────────────────────────────────────
  gps: {
    root: () => ['gps'] as const,
    locations: (workspaceId: string) => ['gps', 'locations', workspaceId] as const,
    attendance: (workspaceId: string, date?: string) =>
      date ? ['gps', 'attendance', workspaceId, date] : ['gps', 'attendance', workspaceId],
  },

  // ── Finanzas / BI ─────────────────────────────────────────────────────────
  finance: {
    root: () => ['finance'] as const,
    dashboard: (workspaceId: string, period: string) =>
      ['finance', 'dashboard', workspaceId, period] as const,
    profit: (workspaceId: string, period: string) =>
      ['finance', 'profit', workspaceId, period] as const,
  },
  bi: {
    root: () => ['bi'] as const,
    kpis: (workspaceId: string, period: string) =>
      ['bi', 'kpis', workspaceId, period] as const,
    cohorts: (workspaceId: string) => ['bi', 'cohorts', workspaceId] as const,
  },

  // ── Empresa / Config ──────────────────────────────────────────────────────
  companySettings: {
    root: () => ['company-settings'] as const,
    detail: (workspaceId: string) => ['company-settings', workspaceId] as const,
  },
  features: {
    root: () => ['features'] as const,
    flags: (workspaceId: string) => ['features', workspaceId] as const,
  },
  permissions: {
    root: () => ['permissions'] as const,
    user: (userId: string, workspaceId: string) =>
      ['permissions', userId, workspaceId] as const,
  },

  // ── Storage ───────────────────────────────────────────────────────────────
  storage: {
    root: () => ['storage'] as const,
    usage: (workspaceId: string) => ['storage', 'usage', workspaceId] as const,
    evidences: (entityId: string) => ['storage', 'evidences', entityId] as const,
  },

  // ── Automatizaciones ──────────────────────────────────────────────────────
  automations: {
    root: () => ['automations'] as const,
    list: (workspaceId: string) => ['automations', workspaceId] as const,
  },

  // ── CRM ───────────────────────────────────────────────────────────────────
  crm: {
    root: () => ['crm'] as const,
    pipeline: (workspaceId: string) => ['crm', 'pipeline', workspaceId] as const,
    followups: (workspaceId: string) => ['crm', 'followups', workspaceId] as const,
  },

  // ── Reportes ──────────────────────────────────────────────────────────────
  reports: {
    root: () => ['reports'] as const,
    summary: (workspaceId: string, period: string) =>
      ['reports', workspaceId, period] as const,
  },

  // ── Webhooks ──────────────────────────────────────────────────────────────
  webhooks: {
    root: () => ['webhooks'] as const,
    list: (workspaceId: string) => ['webhooks', workspaceId] as const,
  },
} as const;
