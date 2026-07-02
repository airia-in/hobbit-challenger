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
        hasCompletedHabit={false}
      />,
    );
    expect(screen.getByTestId('first-week-checklist')).toBeInTheDocument();
    expect(screen.getByText(/first week on the trail/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /set your morning reminder/i }),
    ).toHaveAttribute('href', '/profile?focus=reminder');
  });

  it('persists dismissal in localStorage', async () => {
    render(
      <FirstWeekChecklist
        currentDay={2}
        hasReminder={false}
        hasCompletedHabit={false}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(getOnboardingState().dismissed).toBe(true);
    expect(
      screen.queryByTestId('first-week-checklist'),
    ).not.toBeInTheDocument();
  });

  it('marks reminder and habit steps from props', () => {
    render(<FirstWeekChecklist currentDay={5} hasReminder hasCompletedHabit />);

    const state = getOnboardingState();
    expect(state.completedSteps).toContain('reminder');
    expect(state.completedSteps).toContain('habit');
    expect(screen.getByText(/set your morning reminder/i)).toHaveClass(
      'line-through',
    );
  });

  it('marks invite step when invite link is used', async () => {
    render(<FirstWeekChecklist currentDay={4} hasReminder hasCompletedHabit />);

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
      <FirstWeekChecklist currentDay={4} hasReminder hasCompletedHabit />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
