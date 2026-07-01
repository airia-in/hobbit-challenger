import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LeaderboardTable, PodiumBlock } from '@workspace-starter/ui';

const longName = 'Christopher Kumar Jain';

const baseMember = {
  rank: 1,
  id: 'user-1',
  name: 'Alex',
  avatarUrl: 'http://localhost:3001/uploads/abc.jpg',
  currentDay: 5,
  status: 'ACTIVE' as const,
  streak: 3,
  xp: 100,
  successRate: 80,
};

describe('LeaderboardTable', () => {
  it('renders member avatar image when avatarUrl is present', () => {
    const { container } = render(
      <LeaderboardTable
        members={[baseMember]}
        sortBy="xp"
        onSortChange={vi.fn()}
      />,
    );

    const images = container.querySelectorAll('img');
    expect(images.length).toBeGreaterThan(0);
    expect(images[0]).toHaveAttribute(
      'src',
      'http://localhost:3001/uploads/abc.jpg',
    );
  });

  it('uses renderAvatar in the mobile list layout', () => {
    const { container } = render(
      <LeaderboardTable
        members={[baseMember]}
        sortBy="xp"
        onSortChange={vi.fn()}
        renderAvatar={() => <span data-testid="custom-avatar">A</span>}
      />,
    );

    const mobileList = screen.getByTestId('leaderboard-mobile-list');
    expect(
      mobileList.querySelector('[data-testid="custom-avatar"]'),
    ).not.toBeNull();
    expect(
      container.querySelectorAll('[data-testid="custom-avatar"]').length,
    ).toBe(2);
  });

  it('shows success percent beside member data for long names in mobile list', () => {
    render(
      <LeaderboardTable
        members={[{ ...baseMember, name: longName, successRate: 92 }]}
        sortBy="xp"
        onSortChange={vi.fn()}
      />,
    );

    const mobileList = screen.getByTestId('leaderboard-mobile-list');
    const nameEl = mobileList.querySelector(`[title="${longName}"]`);
    expect(nameEl).not.toBeNull();
    expect(nameEl).toHaveTextContent(longName);
    expect(mobileList).toHaveTextContent('Success 92%');
  });

  it('marks highlighted users in mobile and desktop layouts', () => {
    const { container } = render(
      <LeaderboardTable
        members={[baseMember]}
        sortBy="xp"
        onSortChange={vi.fn()}
        highlightUserId={baseMember.id}
      />,
    );

    expect(container.querySelectorAll('[aria-current="true"]')).toHaveLength(2);
  });

  it('calls onSortChange when sort select changes', () => {
    const onSortChange = vi.fn();
    render(
      <LeaderboardTable
        members={[baseMember]}
        sortBy="xp"
        onSortChange={onSortChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Sort leaderboard by'), {
      target: { value: 'streak' },
    });

    expect(onSortChange).toHaveBeenCalledWith('streak');
  });
});

describe('PodiumBlock', () => {
  it('exposes full name via title for long podium names', () => {
    render(
      <PodiumBlock
        podium={[
          { ...baseMember, rank: 1, name: longName },
          { ...baseMember, rank: 2, id: 'user-2', name: 'Vansh kumar' },
          { ...baseMember, rank: 3, id: 'user-3', name: 'Sam' },
        ]}
      />,
    );

    expect(screen.getByTitle(longName)).toHaveTextContent(longName);
    expect(screen.getByTitle('Vansh kumar')).toHaveTextContent('Vansh kumar');
  });
});
