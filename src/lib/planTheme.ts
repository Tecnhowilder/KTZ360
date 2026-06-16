export interface PlanTheme {
  sidebarBg: string;
  sidebarShadow: string;
  activeNavBg: string;
  ctaBg: string;
  ctaShadow: string;
  avatarBg: string;
  accentColor: string;
  badgeBg: string;
  badgeColor: string;
}

const FREE: PlanTheme = {
  sidebarBg: 'linear-gradient(180deg, #04112f 0%, #071b4a 100%)',
  sidebarShadow: 'inset 0 0 40px rgba(255,255,255,.03)',
  activeNavBg: 'rgba(59,130,246,.16)',
  ctaBg: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
  ctaShadow: '0 8px 18px -8px rgba(37,99,235,.7)',
  avatarBg: 'linear-gradient(150deg, #2563EB, #1D4ED8)',
  accentColor: '#2563EB',
  badgeBg: '#22C55E',
  badgeColor: '#fff',
};

const PRO: PlanTheme = {
  sidebarBg: 'linear-gradient(180deg, #003d30 0%, #00503f 40%, #003d30 100%)',
  sidebarShadow: 'inset 0 0 40px rgba(255,255,255,.05)',
  activeNavBg: 'rgba(0,184,148,.18)',
  ctaBg: 'linear-gradient(135deg, #00B894, #00A884)',
  ctaShadow: '0 8px 18px -8px rgba(0,168,132,.65)',
  avatarBg: 'linear-gradient(150deg, #00B894, #007a63)',
  accentColor: '#00B894',
  badgeBg: '#00B894',
  badgeColor: '#fff',
};

const PREMIUM: PlanTheme = {
  sidebarBg: 'linear-gradient(180deg, #1e0a4e 0%, #3b0f8c 50%, #2d0878 100%)',
  sidebarShadow: 'inset 0 0 50px rgba(255,255,255,.08)',
  activeNavBg: 'rgba(124,58,237,.2)',
  ctaBg: 'linear-gradient(135deg, #7C3AED, #A855F7)',
  ctaShadow: '0 8px 18px -8px rgba(124,58,237,.65)',
  avatarBg: 'linear-gradient(150deg, #7C3AED, #A855F7)',
  accentColor: '#A855F7',
  badgeBg: 'linear-gradient(135deg,#7C3AED,#A855F7)',
  badgeColor: '#fff',
};

const THEMES: Record<string, PlanTheme> = { free: FREE, pro: PRO, premium: PREMIUM };

export function getThemeByPlan(planCode?: string | null): PlanTheme {
  return THEMES[planCode?.toLowerCase() ?? 'free'] ?? FREE;
}
