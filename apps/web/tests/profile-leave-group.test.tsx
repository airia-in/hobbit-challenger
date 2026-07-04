import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileContent } from '../src/components/profile/ProfilePage';

const mockProfileUseQuery = vi.fn();
const mockUpdateUseMutation = vi.fn();
const mockLeaveUseMutation = vi.fn();
const mockLogoutUseMutation = vi.fn();
const mockExportCsvUseQuery = vi.fn();
const mockLeaveMutate = vi.fn();
const mockInvalidateProfile = vi.fn();
const mockInvalidateAuthMe = vi.fn();
const mockInvalidateGroupsMine = vi.fn();

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
      profile: { get: { invalidate: mockInvalidateProfile } },
      auth: { me: { invalidate: mockInvalidateAuthMe } },
      groups: { getMine: { invalidate: mockInvalidateGroupsMine } },
      buddy: { state: { invalidate: vi.fn() } },
    }),
    profile: {
      get: {
        useQuery: (...args: unknown[]) => mockProfileUseQuery(...args),
      },
      update: {
        useMutation: (...args: unknown[]) => mockUpdateUseMutation(...args),
      },
      leaveGroup: {
        useMutation: (...args: unknown[]) => mockLeaveUseMutation(...args),
      },
    },
    auth: {
      logout: {
        useMutation: (...args: unknown[]) => mockLogoutUseMutation(...args),
      },
    },
    history: {
      exportCsv: {
        useQuery: (...args: unknown[]) => mockExportCsvUseQuery(...args),
      },
    },
    buddy: {
      state: {
        useQuery: () => ({
          data: undefined,
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        }),
      },
      request: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      respond: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      cancel: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

const baseProfile = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  phone: '+919876543210',
  avatarUrl: null,
  timezone: 'UTC',
  reminderTime: null,
  whatsappOptIn: true,
  needsPhoneMigration: false,
  groupId: 'group-1',
  groupName: 'Solo Group',
  isGroupAdmin: true,
  groupMemberCount: 1,
  groupAdminCount: 1,
};

describe('ProfileContent group leave flow', () => {
  beforeEach(() => {
    mockProfileUseQuery.mockReturnValue({
      data: baseProfile,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUpdateUseMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      error: null,
    });
    mockLeaveUseMutation.mockReturnValue({
      mutate: mockLeaveMutate,
      isPending: false,
      error: null,
    });
    mockLogoutUseMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
    mockExportCsvUseQuery.mockReturnValue({
      refetch: vi.fn(),
      isFetching: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockProfileUseQuery.mockReset();
    mockUpdateUseMutation.mockReset();
    mockLeaveUseMutation.mockReset();
    mockLogoutUseMutation.mockReset();
    mockExportCsvUseQuery.mockReset();
    mockLeaveMutate.mockReset();
    mockInvalidateProfile.mockReset();
    mockInvalidateAuthMe.mockReset();
    mockInvalidateGroupsMine.mockReset();
  });

  it('confirms dissolve for a solo group admin', async () => {
    const user = userEvent.setup();

    render(<ProfileContent />);

    await user.click(screen.getByRole('button', { name: 'Dissolve Group' }));

    expect(
      screen.getByRole('heading', { name: 'Dissolve Solo Group?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/permanently remove Solo Group/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dissolve' }));

    expect(mockLeaveMutate).toHaveBeenCalledOnce();
  });

  it('blocks last admin leave while other members remain', async () => {
    const user = userEvent.setup();
    mockProfileUseQuery.mockReturnValue({
      data: {
        ...baseProfile,
        groupName: 'Team Group',
        groupMemberCount: 2,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<ProfileContent />);

    await user.click(screen.getByRole('button', { name: 'Leave Group' }));

    expect(
      screen.getByRole('heading', { name: 'Transfer admin access first' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/promote another member to admin/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage admins' })).toHaveAttribute(
      'href',
      '/join',
    );
    expect(mockLeaveMutate).not.toHaveBeenCalled();
  });
});
