import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { FirstWeekChecklist } from '../src/components/onboarding/FirstWeekChecklist';
import {
  dismissOnboardingChecklist,
  getOnboardingState,
  markInviteStepClicked,
} from '../src/lib/onboarding-storage';

afterEach(() => {
  window.localStorage.clear();
});

describe('FirstWeekChecklist', () => {
  it('is hidden when currentDay is greater than 7', () => {
    const { container } = render(
      <FirstWeekChecklist
        currentDay={8}
        hasReminder={false}
        hasAnchor={false}
        hasCompletedHabit={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders during the first week', () => {
    render(
      <FirstWeekChecklist
        currentDay={3}
        hasReminder={false}
        hasAnchor={false}
        hasCompletedHabit={false}
      />,
    );
    expect(screen.getByTestId('first-week-checklist')).toBeInTheDocument();
    expect(screen.getByText(/0 of 4 steps/i)).toBeInTheDocument();
    expect(screen.getByText(/first week on the trail/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /set your morning reminder/i }),
    ).toHaveAttribute('href', '/profile?focus=reminder');
    expect(
      screen.getByRole('link', { name: /link a daily habit/i }),
    ).toHaveAttribute('href', '/profile?focus=anchor');
  });

  it('persists dismissal in localStorage', async () => {
    render(
      <FirstWeekChecklist
        currentDay={2}
        hasReminder={false}
        hasAnchor={false}
        hasCompletedHabit={false}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(getOnboardingState().dismissed).toBe(true);
    expect(
      screen.queryByTestId('first-week-checklist'),
    ).not.toBeInTheDocument();
  });

  it('marks reminder, anchor, and habit steps from props', () => {
    render(
      <FirstWeekChecklist
        currentDay={5}
        hasReminder
        hasAnchor
        hasCompletedHabit
      />,
    );

    const state = getOnboardingState();
    expect(state.completedSteps).toContain('reminder');
    expect(state.completedSteps).toContain('anchor');
    expect(state.completedSteps).toContain('habit');
    expect(screen.getByText(/set your morning reminder/i)).toHaveClass(
      'line-through',
    );
  });

  it('marks anchor step when only anchor time is set', () => {
    render(
      <FirstWeekChecklist
        currentDay={5}
        hasReminder
        hasAnchor
        hasCompletedHabit={false}
      />,
    );

    const state = getOnboardingState();
    expect(state.completedSteps).toContain('anchor');
  });

  it('marks invite step when invite link is used', async () => {
    render(
      <FirstWeekChecklist
        currentDay={4}
        hasReminder
        hasAnchor
        hasCompletedHabit
      />,
    );

    markInviteStepClicked();
    dismissOnboardingChecklist();
    window.localStorage.clear();
    window.localStorage.setItem(
      'hobbit:onboarding-checklist',
      JSON.stringify({
        dismissed: false,
        completedSteps: ['reminder', 'habit', 'invite'],
      }),
    );

    const { container } = render(
      <FirstWeekChecklist
        currentDay={4}
        hasReminder
        hasAnchor
        hasCompletedHabit
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
