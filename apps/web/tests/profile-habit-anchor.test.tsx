import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileContent } from '../src/components/profile/ProfilePage';

const mockProfileUseQuery = vi.fn();
const mockUpdateMutate = vi.fn();
const mockUpdateUseMutation = vi.fn();

vi.mock('@workspace-starter/ui', () => ({
  ProofUploader: () => null,
}));

vi.mock('../src/components/activities/PersonalActivitiesSection', () => ({
  PersonalActivitiesSection: () => null,
}));

vi.mock('../src/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/auth')>();
  return {
    ...actual,
    getToken: () => null,
    performClientLogout: vi.fn(),
  };
});

vi.mock('../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      profile: { get: { invalidate: vi.fn() } },
      auth: { me: { invalidate: vi.fn() } },
      groups: { getMine: { invalidate: vi.fn() } },
    }),
    profile: {
      get: {
        useQuery: (...args: unknown[]) => mockProfileUseQuery(...args),
      },
      update: {
        useMutation: (...args: unknown[]) => mockUpdateUseMutation(...args),
      },
      leaveGroup: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
          error: null,
        }),
      },
    },
    auth: {
      logout: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
    },
    history: {
      exportCsv: {
        useQuery: () => ({
          refetch: vi.fn(),
          isFetching: false,
        }),
      },
    },
  },
}));

const baseProfile = {
  id: 'user-1',
  name: 'Sam',
  email: 'sam@example.com',
  phone: '+919876543210',
  avatarUrl: null,
  timezone: 'Asia/Kolkata',
  reminderTime: '09:00',
  habitAnchorText: null,
  habitAnchorTime: '07:30',
  whatsappOptIn: true,
  weeklyRecapOptIn: true,
  reminderAdaptive: true,
  needsPhoneMigration: false,
  groupId: null,
  groupName: null,
  isGroupAdmin: false,
  groupMemberCount: 0,
  groupAdminCount: 0,
};

describe('ProfileContent habit anchor', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    HTMLInputElement.prototype.focus = vi.fn();
    mockProfileUseQuery.mockReturnValue({
      data: baseProfile,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUpdateUseMutation.mockReturnValue({
      mutate: mockUpdateMutate,
      isPending: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders anchor chips and align-reminder action when times differ', () => {
    render(<ProfileContent />);

    expect(screen.getByText('morning coffee')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /align morning reminder to 07:30/i }),
    ).toBeInTheDocument();
  });

  it('aligns reminder time via update mutation', async () => {
    render(<ProfileContent />);

    await userEvent.click(
      screen.getByRole('button', { name: /align morning reminder to 07:30/i }),
    );

    expect(mockUpdateMutate).toHaveBeenCalledWith({ reminderTime: '07:30' });
  });

  it('suggests anchor time for reminder when reminder is unset', () => {
    mockProfileUseQuery.mockReturnValue({
      data: { ...baseProfile, reminderTime: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<ProfileContent />);

    expect(
      screen.getByRole('button', { name: /use this time for reminders/i }),
    ).toBeInTheDocument();
  });
});
