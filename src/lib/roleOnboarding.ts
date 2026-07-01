/**
 * roleOnboarding.ts — Sistema de Onboarding Diferenciado por Rol
 *
 * Fuente única de verdad para el contenido del onboarding.
 * Escalable: agregar un rol nuevo = agregar una clave en ROLE_SLIDES.
 *
 * Roles soportados: owner, admin, employee, supervisor, comercial, operario
 * Roles sin onboarding: super_admin, support_admin (saltan automáticamente)
 *
 * Todas las imágenes reutilizan /images/onboarding/ existentes.
 * Para personalizar: reemplazar los paths de imagen sin cambiar lógica.
 */

export interface OnboardingSlide {
  image:       string;
  title:       string;
  description: string;
}

export type OnboardingRole =
  | 'owner' | 'admin' | 'employee'
  | 'supervisor' | 'comercial' | 'operario'
  | 'super_admin' | 'support_admin';

// Roles que NO necesitan onboarding (van directo a su destino)
export const SKIP_ONBOARDING_ROLES: OnboardingRole[] = ['super_admin', 'support_admin'];

// ─── Slides por rol ───────────────────────────────────────────────────────────

export const ROLE_SLIDES: Record<OnboardingRole, OnboardingSlide[]> = {

  // ─── OWNER: control total del negocio ────────────────────────────────────
  owner: [
    {
      image:       '/images/onboarding/owner-1.png',
      title:       'Controla toda tu empresa desde un solo lugar',
      description: 'Gestiona clientes, cotizaciones y pedidos. Toda la operación de tu negocio en una sola pantalla.',
    },
    {
      image:       '/images/onboarding/owner-2.png',
      title:       'Supervisa tu equipo en tiempo real',
      description: 'Asigna técnicos, automatiza procesos y mantén el control de cada trabajo en campo.',
    },
    {
      image:       '/images/onboarding/owner-3.png',
      title:       'Analiza indicadores y toma mejores decisiones',
      description: 'Accede a reportes, BI y métricas clave para crecer con datos reales de tu negocio.',
    },
  ],

  // ─── ADMIN: organización y coordinación ──────────────────────────────────
  admin: [
    {
      image:       '/images/onboarding/admin-1.png',
      title:       'Coordina el trabajo de tu equipo',
      description: 'Asigna técnicos, gestiona pedidos y mantén toda la operación organizada desde un solo lugar.',
    },
    {
      image:       '/images/onboarding/admin-2.png',
      title:       'Da seguimiento a pedidos en tiempo real',
      description: 'Revisa el avance de cada trabajo, las evidencias y la bitácora de actividades del equipo.',
    },
    {
      image:       '/images/onboarding/admin-3.png',
      title:       'Reportes y control operativo',
      description: 'Visibilidad completa del negocio para tomar decisiones informadas y mantener la calidad.',
    },
  ],

  // ─── EMPLOYEE: operaciones de campo ──────────────────────────────────────
  employee: [
    {
      image:       '/images/onboarding/employee-1.png',
      title:       'Tus tareas asignadas en un solo lugar',
      description: 'Revisa las órdenes de trabajo que te han asignado y mantente al tanto de tus responsabilidades del día.',
    },
    {
      image:       '/images/onboarding/employee-2.png',
      title:       'Registra evidencias y avances',
      description: 'Sube fotos, registra el progreso y actualiza el estado de cada tarea directamente desde tu móvil.',
    },
    {
      image:       '/images/onboarding/employee-3.png',
      title:       'Conectado con tu equipo en todo momento',
      description: 'Recibe actualizaciones instantáneas, comunica avances y nunca pierdas el hilo de tu trabajo.',
    },
  ],

  // ─── SUPERVISOR: control operativo en campo ───────────────────────────────
  supervisor: [
    {
      image:       '/images/onboarding/supervisor-1.png',
      title:       'Visualiza dónde está cada técnico',
      description: 'Mapa operativo en tiempo real con el estado y ubicación de todo tu equipo de campo.',
    },
    {
      image:       '/images/onboarding/supervisor-2.png',
      title:       'Da seguimiento a órdenes de trabajo',
      description: 'Controla tiempos, avances y asignaciones. Recibe alertas cuando una OT se retrasa.',
    },
    {
      image:       '/images/onboarding/supervisor-3.png',
      title:       'Revisa evidencias del campo',
      description: 'Controla la calidad del trabajo con fotos, notas y reportes de cada orden de trabajo.',
    },
  ],

  // ─── COMERCIAL: vender más y mejor ───────────────────────────────────────
  comercial: [
    {
      image:       '/images/onboarding/comercial-1.png',
      title:       'Crea cotizaciones más rápido',
      description: 'Diseña propuestas profesionales y compártelas por WhatsApp o correo en segundos.',
    },
    {
      image:       '/images/onboarding/comercial-2.png',
      title:       'Usa IA para vender mejor',
      description: 'Shelwi IA mejora tus propuestas y te ayuda a convertir más oportunidades de negocio.',
    },
    {
      image:       '/images/onboarding/comercial-3.png',
      title:       'Da seguimiento a tus clientes',
      description: 'Tu pipeline siempre claro. Nunca pierdas una oportunidad de cierre por falta de seguimiento.',
    },
  ],

  // ─── OPERARIO: sencillo, rápido, desde el celular ────────────────────────
  operario: [
    {
      image:       '/images/onboarding/operario-1.png',
      title:       'Recibe tus órdenes de trabajo',
      description: 'Tus tareas asignadas del día, organizadas y listas para ejecutar desde tu celular.',
    },
    {
      image:       '/images/onboarding/operario-2.png',
      title:       'Registra llegada, fotos y novedades',
      description: 'Check in al llegar al sitio, sube fotos del trabajo y reporta novedades con un toque.',
    },
    {
      image:       '/images/onboarding/operario-3.png',
      title:       'Todo desde tu celular',
      description: 'Sin papeles ni llamadas innecesarias. Shelwi te acompaña en campo de principio a fin.',
    },
  ],

  // Roles sin onboarding (array vacío = saltar automáticamente)
  super_admin:   [],
  support_admin: [],
};

/**
 * Obtiene los slides para un rol dado.
 * Si el rol no existe o es admin del sistema, retorna array vacío (skip).
 */
export function getSlidesForRole(role: string): OnboardingSlide[] {
  return ROLE_SLIDES[role as OnboardingRole] ?? ROLE_SLIDES['employee'];
}

/**
 * Determina si un rol debe saltarse el onboarding completamente.
 */
export function shouldSkipOnboarding(role: string): boolean {
  return SKIP_ONBOARDING_ROLES.includes(role as OnboardingRole);
}
