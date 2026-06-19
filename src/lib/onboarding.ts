const ONBOARDING_KEY = 'shelwi_onboarding_completed';

export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'true';
  } catch {
    return false;
  }
}

export function completeOnboarding(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, 'true');
  } catch {
    // modo privado o cuota llena — continuar sin persistir
  }
}
