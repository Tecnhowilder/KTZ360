/**
 * roleNavigation.ts — Matriz oficial de navegación y visibilidad por Rol + Plan
 *
 * CAPAS:
 *   1. PLAN  → qué módulos existen en el workspace
 *   2. ROL   → qué módulos ve el usuario dentro del plan
 *   3. FLAGS → feature flags del backend (gps_enabled, orders_enabled, etc.)
 *   4. PERMISOS PERSONALIZADOS → excepciones granulares por usuario (tabla workspace_user_permissions)
 *
 * SEGURIDAD: ocultar UI ≠ autorización.
 * Toda acción sigue validándose: JWT → RLS → RPC → feature_flags.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Home, FileText, Package, Users, BarChart2, Sparkles, Building2,
  UserCog, Settings, Wrench, MapPin, TrendingUp, Globe,
  Zap, CreditCard, Brain, ShieldCheck, Webhook,
  ClipboardList, Star, Target, DollarSign, Clock,
} from 'lucide-react';
import type { UserRole } from './database.types';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface NavItem {
  path:    string;
  icon:    LucideIcon;
  label:   string;
  badge?:  string;
  /** Si está presente, solo visible cuando el feature flag es true */
  feature?: string;
  /** Si está presente, solo visible para estos roles */
  roles?:  UserRole[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface RoleNavConfig {
  /** 4 tabs fijos del bottom nav mobile */
  bottomTabs: NavItem[];
  /** Grupos del sheet "Más" y sidebar desktop */
  moreGroups: NavGroup[];
  /** Label del FAB principal */
  fabLabel:   string;
  /** Acciones del FAB */
  fabActions: Array<{ label: string; icon: LucideIcon; path?: string; action?: string }>;
  /** Título del centro de trabajo en el dashboard */
  workCenterTitle: string;
  /** Subtítulo del centro de trabajo */
  workCenterSubtitle: string;
}

// ─── OWNER — acceso casi completo ────────────────────────────────────────────

const ownerNav: RoleNavConfig = {
  bottomTabs: [
    { path: '/app/dashboard',    icon: Home,     label: 'Inicio'   },
    { path: '/app/cotizaciones', icon: FileText, label: 'Cotizar'  },
    { path: '/app/pedidos',      icon: Package,  label: 'Pedidos'  },
    { path: '/app/clientes',     icon: Users,    label: 'Clientes' },
  ],
  moreGroups: [
    {
      label: 'VENTAS',
      items: [
        { path: '/app/cotizaciones', icon: FileText,     label: 'Cotizaciones' },
        { path: '/app/clientes',     icon: Users,        label: 'Clientes' },
        { path: '/app/pipeline',     icon: TrendingUp,   label: 'Pipeline CRM', feature: 'pipeline_enabled' },
        { path: '/app/catalogo',     icon: Package,      label: 'Catálogo' },
        { path: '/app/plantillas',   icon: ClipboardList,label: 'Plantillas' },
      ],
    },
    {
      label: 'OPERACIÓN',
      items: [
        { path: '/app/pedidos',         icon: Package, label: 'Pedidos',            feature: 'orders_enabled' },
        { path: '/app/ordenes-trabajo', icon: Wrench,  label: 'Órdenes de Trabajo', feature: 'work_orders_enabled' },
        { path: '/app/mapa-operativo',  icon: MapPin,  label: 'Mapa GPS',           feature: 'gps_enabled' },
      ],
    },
    {
      label: 'INTELIGENCIA',
      items: [
        { path: '/app/reportes',         icon: BarChart2, label: 'Reportes',          feature: 'advanced_reports_enabled' },
        { path: '/app/bi',               icon: Brain,     label: 'Business Intel.',   feature: 'advanced_reports_enabled' },
        { path: '/app/finanzas',         icon: DollarSign,label: 'Finanzas',          feature: 'advanced_reports_enabled' },
        { path: '/app/customer-success', icon: Star,      label: 'Customer Success',  feature: 'advanced_reports_enabled' },
        { path: '/app/growth',           icon: Target,    label: 'Growth',            feature: 'advanced_reports_enabled' },
        { path: '/app/ia',               icon: Sparkles,  label: 'Shelwi IA',         feature: 'ai_enabled' },
      ],
    },
    {
      label: 'ADMINISTRACIÓN',
      items: [
        { path: '/app/automatizaciones', icon: Zap,      label: 'Automatizaciones', feature: 'automation_enabled' },
        { path: '/app/config/integraciones', icon: Globe, label: 'Integraciones' },
        { path: '/app/config/webhooks',  icon: Webhook,  label: 'Webhooks',         feature: 'webhook_enabled' },
        { path: '/app/team',             icon: UserCog,  label: 'Equipo' },
        { path: '/app/empresa',          icon: Building2,label: 'Mi Empresa' },
        { path: '/app/planes',           icon: CreditCard,label: 'Mi Plan' },
        { path: '/app/config',           icon: Settings, label: 'Configuración' },
      ],
    },
  ],
  fabLabel: 'Crear',
  fabActions: [
    { label: 'Crear con IA',      icon: Sparkles, action: 'ia_quote'    },
    { label: 'Nueva cotización',  icon: FileText, path: '/app/cotizaciones/nueva' },
    { label: 'Nuevo pedido',      icon: Package,  action: 'new_order'   },
    { label: 'Desde imagen',      icon: Sparkles, action: 'photo_quote' },
    { label: 'Desde plantilla',   icon: ClipboardList, action: 'from_template' },
  ],
  workCenterTitle: 'Resumen del negocio',
  workCenterSubtitle: 'Visión ejecutiva de tu empresa',
};

// ─── ADMIN — gestión operativa diaria ────────────────────────────────────────

const adminNav: RoleNavConfig = {
  bottomTabs: [
    { path: '/app/dashboard',    icon: Home,     label: 'Inicio'   },
    { path: '/app/cotizaciones', icon: FileText, label: 'Cotizar'  },
    { path: '/app/pedidos',      icon: Package,  label: 'Pedidos'  },
    { path: '/app/clientes',     icon: Users,    label: 'Clientes' },
  ],
  moreGroups: [
    {
      label: 'VENTAS',
      items: [
        { path: '/app/cotizaciones', icon: FileText,    label: 'Cotizaciones' },
        { path: '/app/clientes',     icon: Users,       label: 'Clientes' },
        { path: '/app/pipeline',     icon: TrendingUp,  label: 'Pipeline CRM', feature: 'pipeline_enabled' },
        { path: '/app/catalogo',     icon: Package,     label: 'Catálogo' },
      ],
    },
    {
      label: 'OPERACIÓN',
      items: [
        { path: '/app/pedidos',         icon: Package, label: 'Pedidos',            feature: 'orders_enabled' },
        { path: '/app/ordenes-trabajo', icon: Wrench,  label: 'Órdenes de Trabajo', feature: 'work_orders_enabled' },
        { path: '/app/mapa-operativo',  icon: MapPin,  label: 'Mapa GPS',           feature: 'gps_enabled' },
      ],
    },
    {
      label: 'REPORTES',
      items: [
        { path: '/app/reportes',         icon: BarChart2, label: 'Reportes',         feature: 'advanced_reports_enabled' },
        { path: '/app/customer-success', icon: Star,      label: 'Customer Success', feature: 'advanced_reports_enabled' },
        { path: '/app/ia',               icon: Sparkles,  label: 'Shelwi IA',        feature: 'ai_enabled' },
      ],
    },
    {
      label: 'EQUIPO',
      items: [
        { path: '/app/team',   icon: UserCog,  label: 'Equipo' },
        { path: '/app/config', icon: Settings, label: 'Configuración' },
      ],
    },
  ],
  fabLabel: 'Crear',
  fabActions: [
    { label: 'Crear con IA',     icon: Sparkles, action: 'ia_quote'   },
    { label: 'Nueva cotización', icon: FileText, path: '/app/cotizaciones/nueva' },
    { label: 'Nuevo pedido',     icon: Package,  action: 'new_order'  },
  ],
  workCenterTitle: 'Gestión operativa',
  workCenterSubtitle: 'Seguimiento diario del equipo y cotizaciones',
};

// ─── SUPERVISOR — operación de campo ────────────────────────────────────────

const supervisorNav: RoleNavConfig = {
  bottomTabs: [
    { path: '/app/dashboard',       icon: Home,    label: 'Inicio'  },
    { path: '/app/pedidos',         icon: Package, label: 'Pedidos' },
    { path: '/app/mapa-operativo',  icon: MapPin,  label: 'Mapa'    },
    { path: '/app/team',            icon: UserCog, label: 'Equipo'  },
  ],
  moreGroups: [
    {
      label: 'OPERACIÓN',
      items: [
        { path: '/app/pedidos',         icon: Package, label: 'Pedidos',            feature: 'orders_enabled' },
        { path: '/app/ordenes-trabajo', icon: Wrench,  label: 'Órdenes de Trabajo', feature: 'work_orders_enabled' },
        { path: '/app/mapa-operativo',  icon: MapPin,  label: 'Mapa GPS',           feature: 'gps_enabled' },
      ],
    },
    {
      label: 'CONSULTA',
      items: [
        { path: '/app/clientes', icon: Users,    label: 'Clientes (solo lectura)' },
        { path: '/app/reportes', icon: BarChart2,label: 'Reportes Operativos',     feature: 'advanced_reports_enabled' },
        { path: '/app/ia',       icon: Sparkles, label: 'Shelwi IA Operativa',     feature: 'ai_enabled' },
      ],
    },
    {
      label: 'EQUIPO',
      items: [
        { path: '/app/team',       icon: UserCog, label: 'Equipo' },
        { path: '/app/asistencia', icon: Clock,   label: 'Asistencia' },
      ],
    },
  ],
  fabLabel: 'Nuevo',
  fabActions: [
    { label: 'Nuevo pedido',   icon: Package, action: 'new_order'     },
    { label: 'Nueva OT',       icon: Wrench,  action: 'new_work_order'},
    { label: 'Asignar técnico',icon: UserCog, action: 'assign_tech'   },
  ],
  workCenterTitle: 'Estado del equipo',
  workCenterSubtitle: 'Operarios en campo y OTs activas',
};

// ─── COMERCIAL — pipeline y cotizaciones ────────────────────────────────────

const comercialNav: RoleNavConfig = {
  bottomTabs: [
    { path: '/app/dashboard',    icon: Home,       label: 'Inicio'    },
    { path: '/app/cotizaciones', icon: FileText,   label: 'Cotizar'   },
    { path: '/app/clientes',     icon: Users,      label: 'Clientes'  },
    { path: '/app/pipeline',     icon: TrendingUp, label: 'Pipeline'  },
  ],
  moreGroups: [
    {
      label: 'VENTAS',
      items: [
        { path: '/app/cotizaciones', icon: FileText,     label: 'Cotizaciones' },
        { path: '/app/clientes',     icon: Users,        label: 'Clientes' },
        { path: '/app/pipeline',     icon: TrendingUp,   label: 'Pipeline CRM',  feature: 'pipeline_enabled' },
        { path: '/app/catalogo',     icon: Package,      label: 'Catálogo' },
        { path: '/app/plantillas',   icon: ClipboardList,label: 'Plantillas' },
      ],
    },
    {
      label: 'ANÁLISIS',
      items: [
        { path: '/app/reportes', icon: BarChart2, label: 'Reportes Comerciales', feature: 'advanced_reports_enabled' },
        { path: '/app/ia',       icon: Sparkles,  label: 'Shelwi IA Comercial',  feature: 'ai_enabled' },
      ],
    },
  ],
  fabLabel: 'Nuevo',
  fabActions: [
    { label: 'Crear con IA',     icon: Sparkles,      action: 'ia_quote'      },
    { label: 'Nueva cotización', icon: FileText,      path: '/app/cotizaciones/nueva' },
    { label: 'Nuevo cliente',    icon: Users,         action: 'new_client'    },
    { label: 'Desde imagen',     icon: Sparkles,      action: 'photo_quote'   },
  ],
  workCenterTitle: 'Seguimientos y cotizaciones',
  workCenterSubtitle: 'Oportunidades pendientes de respuesta',
};

// ─── OPERARIO — vista ultra-simple ──────────────────────────────────────────

const operarioNav: RoleNavConfig = {
  bottomTabs: [
    { path: '/app/dashboard',       icon: Home,     label: 'Inicio'      },
    { path: '/app/ordenes-trabajo', icon: Wrench,   label: 'Mis OT'      },
    { path: '/app/asistencia',      icon: Clock,    label: 'Asistencia'  },
    { path: '/app/mapa-operativo',  icon: MapPin,   label: 'GPS'         },
  ],
  moreGroups: [
    {
      label: 'MI TRABAJO',
      items: [
        { path: '/app/pedidos',         icon: Package,    label: 'Mis Pedidos',          feature: 'orders_enabled' },
        { path: '/app/ordenes-trabajo', icon: Wrench,     label: 'Mis OTs',              feature: 'work_orders_enabled' },
        { path: '/app/asistencia',      icon: Clock,      label: 'Mi Asistencia' },
        { path: '/app/mapa-operativo',  icon: MapPin,     label: 'Check In / Mapa',      feature: 'gps_enabled' },
      ],
    },
    {
      label: 'MI CUENTA',
      items: [
        { path: '/app/config',          icon: Settings,   label: 'Perfil y configuración' },
      ],
    },
  ],
  fabLabel: 'Acción',
  fabActions: [
    { label: 'Agregar evidencia', icon: Package,    action: 'add_evidence'  },
    { label: 'Check In',          icon: MapPin,     action: 'check_in'      },
    { label: 'Check Out',         icon: MapPin,     action: 'check_out'     },
    { label: 'Reportar novedad',  icon: ShieldCheck,action: 'report_issue'  },
  ],
  workCenterTitle: '¿Qué trabajo debo hacer hoy?',
  workCenterSubtitle: 'Tus órdenes de trabajo del día',
};

// ─── Roles sin nav de usuario normal ─────────────────────────────────────────

const superAdminNav: RoleNavConfig = {
  bottomTabs: [],
  moreGroups: [],
  fabLabel: 'Admin',
  fabActions: [],
  workCenterTitle: 'Panel de Administración',
  workCenterSubtitle: 'CMS Shelwi',
};

// ─── Mapa de roles → configuración ───────────────────────────────────────────

export const ROLE_NAV_MAP: Record<UserRole, RoleNavConfig> = {
  owner:         ownerNav,
  admin:         adminNav,
  supervisor:    supervisorNav,
  comercial:     comercialNav,
  operario:      operarioNav,
  super_admin:   superAdminNav,
  support_admin: superAdminNav,
};

/**
 * Retorna la configuración de navegación para un rol dado.
 * Fallback a owner si el rol no está registrado.
 */
export function getNavForRole(role: string): RoleNavConfig {
  return ROLE_NAV_MAP[role as UserRole] ?? ownerNav;
}

/**
 * Filtra los ítems de un grupo según los feature flags disponibles.
 * Se llama con los feature flags del backend — nunca confiar en el frontend.
 */
export function filterNavByFeatures(
  items: NavItem[],
  features: Partial<Record<string, boolean>>,
): NavItem[] {
  return items.filter(item => !item.feature || features[item.feature]);
}
