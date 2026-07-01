import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JoinGroupPage } from '../src/components/groups/JoinGroupPage';

const mockGetToken = vi.fn<() => string | null>(() => null);
const mockPreviewUseQuery = vi.fn();
const mockMeUseQuery = vi.fn();
const mockJoinUseMutation = vi.fn();

vi.mock('../src/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/auth')>();
  return {
    ...actual,
    getToken: () => mockGetToken(),
  };
});

vi.mock('../src/components/TrpcProvider', () => ({
  TrpcProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('../src/lib/trpc', () => ({
  trpc: {
    groups: {
      previewByToken: {
        useQuery: (...args: unknown[]) => mockPreviewUseQuery(...args),
      },
      join: {
        useMutation: (...args: unknown[]) => mockJoinUseMutation(...args),
      },
    },
    auth: {
      me: {
        useQuery: (...args: unknown[]) => mockMeUseQuery(...args),
      },
    },
  },
}));

const previewData = {
  name: 'Test Group',
  memberCount: 3,
};

describe('JoinGroupPage', () => {
  beforeEach(() => {
    mockGetToken.mockReturnValue('existing-token');
    mockPreviewUseQuery.mockReturnValue({
      data: previewData,
      isLoading: false,
      isError: false,
    });
    mockJoinUseMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockGetToken.mockReset();
    mockPreviewUseQuery.mockReset();
    mockMeUseQuery.mockReset();
    mockJoinUseMutation.mockReset();
  });

  it('shows already-in-group message and dashboard link when user has a group', () => {
    mockMeUseQuery.mockReturnValue({
      data: { user: { groupId: 'group-123' }, attempt: null },
      isLoading: false,
      isError: false,
    });

    render(<JoinGroupPage token="invite-token" />);

    expect(screen.getByText("You're already in a group")).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /go to dashboard/i }),
    ).toHaveAttribute('href', '/dashboard');
    expect(
      screen.queryByRole('button', { name: 'Join Group' }),
    ).not.toBeInTheDocument();
    expect(mockMeUseQuery).toHaveBeenCalledWith(undefined, {
      enabled: true,
    });
  });

  it('shows Join button when logged-in user has no group', () => {
    mockMeUseQuery.mockReturnValue({
      data: { user: { groupId: null }, attempt: null },
      isLoading: false,
      isError: false,
    });

    render(<JoinGroupPage token="invite-token" />);

    expect(
      screen.getByRole('button', { name: 'Join Group' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("You're already in a group"),
    ).not.toBeInTheDocument();
    expect(mockMeUseQuery).toHaveBeenCalledWith(undefined, {
      enabled: true,
    });
  });

  it('shows a disabled checking state while membership is loading', () => {
    mockMeUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(<JoinGroupPage token="invite-token" />);

    const checking = screen.getByRole('button', { name: 'Checking...' });
    expect(checking).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Join Group' }),
    ).not.toBeInTheDocument();
  });
});
