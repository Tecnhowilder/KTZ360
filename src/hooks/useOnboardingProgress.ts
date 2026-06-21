import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';

export interface OnboardingProgress {
  progress:          number;
  company_completed: boolean;
  client_completed:  boolean;
  service_completed: boolean;
  quote_completed:   boolean;
  reward_unlocked:   boolean;
  card_collapsed:    boolean;
  card_hidden:       boolean;
}

export function useOnboardingProgress() {
  return useQuery({
    queryKey:  ['onboardingProgress'],
    queryFn:   async (): Promise<OnboardingProgress | null> => {
      const { data, error } = await (supabase as any).rpc('get_onboarding_progress');
      if (error) { console.error('[onboarding]', error); return null; }
      return data as OnboardingProgress;
    },
    staleTime: 30_000,
  });
}

export function useInvalidateOnboarding() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['onboardingProgress'] });
}
