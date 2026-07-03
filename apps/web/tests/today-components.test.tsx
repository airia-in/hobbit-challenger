import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NumberStepper,
  TaskCard,
  TierChips,
  computeXpPreview,
} from '@workspace-starter/ui';

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  vi.clearAllMocks();
  mockMatchMedia(false);
});

describe('TaskCard', () => {
  it('calls onMarkDone when checkbox card body is tapped', async () => {
    const onMarkDone = vi.fn();
    render(
      <TaskCard
        icon="✅"
        title="Progress photo"
        kind="CHECKBOX"
        log={null}
        canEdit
        onMarkDone={onMarkDone}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: /tap to complete/i }),
    );
    expect(onMarkDone).toHaveBeenCalledOnce();
  });

  it('applies completion animation class when marking done via tap', async () => {
    mockMatchMedia(false);
    const onMarkDone = vi.fn();
    render(
      <TaskCard
        icon="✅"
        title="Progress photo"
        kind="CHECKBOX"
        log={null}
        canEdit
        onMarkDone={onMarkDone}
      />,
    );

    const card = screen.getByTestId('task-card');
    expect(card).not.toHaveClass('task-card--completing');

    await userEvent.click(
      screen.getByRole('button', { name: /tap to complete/i }),
    );

    expect(onMarkDone).toHaveBeenCalledOnce();
    expect(card).toHaveClass('task-card--completing');
    expect(screen.getByText(/tap to complete/i)).toHaveClass(
      'task-card-status--completing',
    );
  });

  it('does not apply completion animation when mounted already complete', () => {
    mockMatchMedia(false);
    render(
      <TaskCard
        icon="✅"
        title="Progress photo"
        kind="CHECKBOX"
        log={{
          state: 'DONE',
          value: null,
          tier: null,
          subPoints: null,
          xpAwarded: 200,
        }}
        canEdit
      />,
    );

    expect(screen.getByTestId('task-card')).not.toHaveClass(
      'task-card--completing',
    );
  });

  it('does not apply completion animation on undo', async () => {
    mockMatchMedia(false);
    const onUndo = vi.fn();
    render(
      <TaskCard
        icon="✅"
        title="Progress photo"
        kind="CHECKBOX"
        log={{
          state: 'DONE',
          value: null,
          tier: null,
          subPoints: null,
          xpAwarded: 200,
        }}
        canEdit
        onUndo={onUndo}
      />,
    );

    const card = screen.getByTestId('task-card');
    await userEvent.click(screen.getByRole('button', { name: /done ✓/i }));

    expect(onUndo).toHaveBeenCalledOnce();
    expect(card).not.toHaveClass('task-card--completing');
  });

  it('skips completion animation when prefers-reduced-motion is set', async () => {
    mockMatchMedia(true);
    const onCompleted = vi.fn();
    const onMarkDone = vi.fn();
    render(
      <TaskCard
        icon="✅"
        title="Progress photo"
        kind="CHECKBOX"
        log={null}
        canEdit
        onMarkDone={onMarkDone}
        onCompleted={onCompleted}
      />,
    );

    const card = screen.getByTestId('task-card');
    await userEvent.click(
      screen.getByRole('button', { name: /tap to complete/i }),
    );

    expect(onMarkDone).toHaveBeenCalledOnce();
    expect(onCompleted).toHaveBeenCalledOnce();
    expect(card).not.toHaveClass('task-card--completing');
  });

  it('calls onCompleted when marking done', async () => {
    const onCompleted = vi.fn();
    const onMarkDone = vi.fn();
    render(
      <TaskCard
        icon="✅"
        title="Progress photo"
        kind="CHECKBOX"
        log={null}
        canEdit
        onMarkDone={onMarkDone}
        onCompleted={onCompleted}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: /tap to complete/i }),
    );

    expect(onMarkDone).toHaveBeenCalledOnce();
    expect(onCompleted).toHaveBeenCalledOnce();
  });

  it('renders a compact current streak without blocking card taps', async () => {
    const onMarkDone = vi.fn();
    render(
      <TaskCard
        icon="✅"
        title="Progress photo"
        kind="CHECKBOX"
        log={null}
        canEdit
        currentStreak={5}
        onMarkDone={onMarkDone}
      />,
    );

    expect(screen.getByText(/5 days on the trail/i)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: /tap to complete/i }),
    );
    expect(onMarkDone).toHaveBeenCalledOnce();
  });

  it('does not render a current streak when none is provided', () => {
    render(
      <TaskCard
        icon="✅"
        title="Progress photo"
        kind="CHECKBOX"
        log={null}
        canEdit
      />,
    );

    expect(screen.queryByText(/days on the trail/i)).not.toBeInTheDocument();
  });

  it('calls onUndo when completed checkbox is tapped', async () => {
    const onUndo = vi.fn();
    render(
      <TaskCard
        icon="✅"
        title="Progress photo"
        kind="CHECKBOX"
        log={{
          state: 'DONE',
          value: null,
          tier: null,
          subPoints: null,
          xpAwarded: 200,
        }}
        canEdit
        currentStreak={3}
        onUndo={onUndo}
      />,
    );

    expect(screen.getByText(/3 days on the trail/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /done ✓/i }));
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it('expands sub-points without marking done when chevron is clicked', async () => {
    const onMarkDone = vi.fn();
    render(
      <TaskCard
        icon="🥗"
        title="Diet"
        kind="SUBPOINTS"
        log={null}
        canEdit
        subPoints={[
          { key: 'healthy', label: 'Healthy', xp: 60 },
          { key: 'no_junk', label: 'No junk', xp: 70 },
        ]}
        onMarkDone={onMarkDone}
        onSubPointChange={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Expand' }));
    expect(onMarkDone).not.toHaveBeenCalled();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('No junk')).toBeInTheDocument();
  });

  it('renders celebration line when complete', () => {
    render(
      <TaskCard
        icon="✅"
        title="Water"
        kind="CHECKBOX"
        log={{
          state: 'DONE',
          value: null,
          tier: null,
          subPoints: null,
          xpAwarded: 50,
        }}
        canEdit
        celebrationLine="Hydration secured — onward."
      />,
    );

    expect(screen.getByText('Hydration secured — onward.')).toBeInTheDocument();
  });

  it('can render expandable activity controls open by default', async () => {
    render(
      <TaskCard
        icon="💧"
        title="Water"
        kind="NUMBER"
        log={null}
        canEdit
        unitLabel="L"
        xpPerUnit={25}
        xpCap={100}
        onNumberCommit={vi.fn()}
        defaultExpanded
      />,
    );

    expect(screen.getByRole('button', { name: 'Collapse' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('button', { name: '+1 L' })).toBeInTheDocument();
  });

  it('calls onSubPointChange when sub-point Done is toggled', async () => {
    const onSubPointChange = vi.fn();
    render(
      <TaskCard
        icon="🥗"
        title="Diet"
        kind="SUBPOINTS"
        log={{
          state: null,
          value: null,
          tier: null,
          subPoints: null,
          xpAwarded: 0,
        }}
        canEdit
        subPoints={[{ key: 'healthy', label: 'Healthy', xp: 60 }]}
        onSubPointChange={onSubPointChange}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Expand' }));
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onSubPointChange).toHaveBeenCalledWith({ healthy: 'DONE' });
  });

  it('renders tier chips in expanded tiered card', async () => {
    const onTierSelect = vi.fn();
    render(
      <TaskCard
        icon="📱"
        title="No Reels"
        kind="TIERED"
        log={null}
        canEdit
        tiers={[
          { key: 'NONE', label: 'None', xp: 250 },
          { key: 'UNDER_30', label: '< 30 min', xp: 150 },
        ]}
        onTierSelect={onTierSelect}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Expand' }));
    await userEvent.click(screen.getByRole('button', { name: /none/i }));

    expect(onTierSelect).toHaveBeenCalledWith('NONE');
  });

  it('shows guidance when info button is clicked without marking done', async () => {
    const onMarkDone = vi.fn();
    render(
      <TaskCard
        icon="🥗"
        title="Diet"
        kind="SUBPOINTS"
        log={null}
        canEdit
        subPoints={[{ key: 'NO_JUNK', label: 'No junk', xp: 70 }]}
        onMarkDone={onMarkDone}
        onSubPointChange={vi.fn()}
        guidance={{
          ruleBlock: 'Eat whole foods daily.',
          tips: {
            title: 'Diet tips',
            bullets: ['Prep vegetables ahead.', 'Choose protein first.'],
          },
          subPoints: {
            NO_JUNK: {
              ruleBlock:
                'Salad with mayonnaise counts as junk — use yogurt dressing.',
              tips: {
                title: 'Skip junk',
                bullets: ['Swap chips for nuts.'],
              },
            },
          },
        }}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Show guidance' }),
    );

    expect(onMarkDone).not.toHaveBeenCalled();
    expect(screen.getByText('Rules')).toBeInTheDocument();
    expect(screen.getByText('Eat whole foods daily.')).toBeInTheDocument();
    expect(screen.getByText(/mayonnaise counts as junk/i)).toBeInTheDocument();
    expect(screen.getByText('Diet tips')).toBeInTheDocument();
    expect(screen.getByText('Prep vegetables ahead.')).toBeInTheDocument();
  });

  it('shows Ask AI in guidance panel without marking done', async () => {
    const onMarkDone = vi.fn();
    const onAskGuidance = vi.fn(async () => ({
      available: true,
      answer: 'Use yogurt dressing instead of mayo.',
    }));

    render(
      <TaskCard
        icon="🥗"
        title="Diet"
        kind="CHECKBOX"
        log={null}
        canEdit
        onMarkDone={onMarkDone}
        guidance={{
          ruleBlock: 'Eat whole foods daily.',
          tips: {
            title: 'Diet tips',
            bullets: ['Prep vegetables ahead.'],
          },
        }}
        onAskGuidance={onAskGuidance}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Show guidance' }),
    );
    expect(onMarkDone).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
    expect(onMarkDone).not.toHaveBeenCalled();

    const input = screen.getByPlaceholderText('Ask about this activity…');
    await userEvent.type(input, 'Is mayo ok?');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onAskGuidance).toHaveBeenCalledWith({
      question: 'Is mayo ok?',
      history: [],
    });
    expect(
      await screen.findByText('Use yogurt dressing instead of mayo.'),
    ).toBeInTheDocument();
  });
});

describe('NumberStepper', () => {
  it('shows XP preview capped at xpCap', () => {
    expect(computeXpPreview(4, 26.3, 100)).toBe(100);
    expect(computeXpPreview(1, 26.3, 100)).toBe(26);
  });

  it('commits value on quick-step click', async () => {
    const onCommit = vi.fn();
    render(
      <NumberStepper
        value={0}
        unitLabel="L"
        quickSteps={[1, 2]}
        xpPerUnit={26.3}
        xpCap={100}
        onChange={vi.fn()}
        onCommit={onCommit}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '+1 L' }));
    expect(onCommit).toHaveBeenCalledWith(1);
  });

  it('commits value on Enter in input', () => {
    const onCommit = vi.fn();
    render(
      <NumberStepper
        value={0}
        unitLabel="L"
        quickSteps={[1]}
        xpPerUnit={26.3}
        xpCap={100}
        onChange={vi.fn()}
        onCommit={onCommit}
      />,
    );

    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(2);
  });
});

describe('TierChips', () => {
  it('highlights selected tier and fires onSelect', async () => {
    const onSelect = vi.fn();
    render(
      <TierChips
        tiers={[
          { key: 'NONE', label: 'None', xp: 250 },
          { key: 'OVER', label: 'Over 60', xp: 0 },
        ]}
        selectedTier="NONE"
        onSelect={onSelect}
      />,
    );

    const overButton = screen.getByRole('button', { name: /over 60/i });
    await userEvent.click(overButton);
    expect(onSelect).toHaveBeenCalledWith('OVER');
  });
});
