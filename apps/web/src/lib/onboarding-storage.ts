import { readStorageItem, writeStorageItem } from './browser-storage';

const STORAGE_KEY = 'hobbit:onboarding-checklist';

export type OnboardingStep = 'reminder' | 'anchor' | 'habit' | 'invite';

export type OnboardingChecklistState = {
  dismissed: boolean;
  completedSteps: OnboardingStep[];
  inviteClicked?: boolean;
};

const DEFAULT_STATE: OnboardingChecklistState = {
  dismissed: false,
  completedSteps: [],
};

function readRaw(): OnboardingChecklistState {
  if (typeof window === 'undefined') return { ...DEFAULT_STATE };
  try {
    const raw = readStorageItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<OnboardingChecklistState>;
    return {
      dismissed: parsed.dismissed ?? false,
      completedSteps: Array.isArray(parsed.completedSteps)
        ? parsed.completedSteps.filter(
            (step): step is OnboardingStep =>
              step === 'reminder' ||
              step === 'anchor' ||
              step === 'habit' ||
              step === 'invite',
          )
        : [],
      inviteClicked: parsed.inviteClicked ?? false,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function getOnboardingState(): OnboardingChecklistState {
  return readRaw();
}

export function saveOnboardingState(state: OnboardingChecklistState): void {
  writeStorageItem(STORAGE_KEY, JSON.stringify(state));
}

export function dismissOnboardingChecklist(): void {
  const current = readRaw();
  saveOnboardingState({ ...current, dismissed: true });
}

export function markInviteStepClicked(): void {
  const current = readRaw();
  const completedSteps: OnboardingStep[] = current.completedSteps.includes(
    'invite',
  )
    ? current.completedSteps
    : [...current.completedSteps, 'invite'];
  saveOnboardingState({
    ...current,
    inviteClicked: true,
    completedSteps,
  });
}

export function mergeOnboardingSteps(
  derived: OnboardingStep[],
): OnboardingChecklistState {
  const current = readRaw();
  const merged = new Set<OnboardingStep>([
    ...current.completedSteps,
    ...derived,
  ]);
  const next = {
    ...current,
    completedSteps: [...merged],
  };
  saveOnboardingState(next);
  return next;
}
