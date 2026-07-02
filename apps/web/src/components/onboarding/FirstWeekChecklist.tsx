import { useEffect, useState } from 'react';
import {
  dismissOnboardingChecklist,
  getOnboardingState,
  markInviteStepClicked,
  mergeOnboardingSteps,
  type OnboardingStep,
} from '../../lib/onboarding-storage';

type FirstWeekChecklistProps = {
  currentDay: number;
  hasReminder: boolean;
  hasCompletedHabit: boolean;
  onStateChange?: () => void;
};

const STEPS: {
  id: OnboardingStep;
  label: string;
  description: string;
  href?: string;
  onClick?: () => void;
}[] = [
  {
    id: 'reminder',
    label: 'Set your morning reminder',
    description: 'Pick a time for Hobbit to nudge you onto the trail.',
    href: '/profile?focus=reminder',
  },
  {
    id: 'habit',
    label: 'Complete one habit',
    description: 'Log any habit today — one step is enough to start.',
  },
  {
    id: 'invite',
    label: 'Invite a fellow traveler',
    description: 'Share the trail with someone who keeps you honest.',
    href: '/join',
    onClick: markInviteStepClicked,
  },
];

export function FirstWeekChecklist({
  currentDay,
  hasReminder,
  hasCompletedHabit,
  onStateChange,
}: FirstWeekChecklistProps) {
  const [state, setState] = useState(getOnboardingState);

  useEffect(() => {
    const derived: OnboardingStep[] = [];
    if (hasReminder) derived.push('reminder');
    if (hasCompletedHabit) derived.push('habit');
    const merged = mergeOnboardingSteps(derived);
    setState(merged);
    onStateChange?.();
  }, [hasReminder, hasCompletedHabit, onStateChange]);

  if (currentDay < 1 || currentDay > 7) return null;
  if (state.dismissed) return null;

  const completed = new Set(state.completedSteps);
  const allDone = STEPS.every((step) => completed.has(step.id));
  if (allDone) return null;

  const doneCount = STEPS.filter((step) => completed.has(step.id)).length;

  function handleDismiss() {
    dismissOnboardingChecklist();
    setState(getOnboardingState());
    onStateChange?.();
  }

  function handleStepAction(step: (typeof STEPS)[number]) {
    step.onClick?.();
    if (step.id === 'invite') {
      setState(getOnboardingState());
    }
  }

  return (
    <section
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
      data-testid="first-week-checklist"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2
            className="text-sm uppercase tracking-wider text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            First week on the trail
          </h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {doneCount} of {STEPS.length} steps — day {currentDay} of your
            challenge
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Dismiss
        </button>
      </div>
      <ol className="space-y-2">
        {STEPS.map((step) => {
          const done = completed.has(step.id);
          const content = (
            <>
              <span
                className={
                  done ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'
                }
                aria-hidden
              >
                {done ? '✓' : '○'}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={
                    done
                      ? 'text-sm text-[var(--text-muted)] line-through'
                      : 'text-sm text-[var(--text-primary)]'
                  }
                >
                  {step.label}
                </span>
                {!done && (
                  <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                    {step.description}
                  </span>
                )}
              </span>
            </>
          );

          if (done) {
            return (
              <li key={step.id} className="flex items-start gap-2">
                {content}
              </li>
            );
          }

          if (step.href) {
            return (
              <li key={step.id}>
                <a
                  href={step.href}
                  onClick={() => handleStepAction(step)}
                  className="flex items-start gap-2 rounded-md px-1 py-1 transition hover:bg-[var(--surface-raised)]"
                >
                  {content}
                </a>
              </li>
            );
          }

          return (
            <li key={step.id} className="flex items-start gap-2 px-1 py-1">
              {content}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
