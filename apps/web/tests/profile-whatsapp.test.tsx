import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileContent } from '../src/components/profile/ProfilePage';

const mockProfileUseQuery = vi.fn();
const mockUpdateMutate = vi.fn();
const mockUpdateUseMutation = vi.fn();
const mockLeaveUseMutation = vi.fn();
const mockLogoutUseMutation = vi.fn();
const mockExportCsvUseQuery = vi.fn();
const mockInvalidateProfile = vi.fn();

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
  },
}));

type ProfileFixture = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  timezone: string;
  reminderTime: string | null;
  whatsappOptIn: boolean;
  needsPhoneMigration: boolean;
  groupId: string | null;
  groupName: string | null;
  isGroupAdmin: boolean;
  groupMemberCount: number;
  groupAdminCount: number;
};

const legacyProfile: ProfileFixture = {
  id: 'user-legacy',
  name: 'Legacy User',
  email: 'legacy@example.com',
  phone: null,
  avatarUrl: null,
  timezone: 'Asia/Kolkata',
  reminderTime: null,
  whatsappOptIn: true,
  needsPhoneMigration: true,
  groupId: null,
  groupName: null,
  isGroupAdmin: false,
  groupMemberCount: 0,
  groupAdminCount: 0,
};

function mockProfileQuery(data: ProfileFixture) {
  mockProfileUseQuery.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
}

describe('ProfileContent WhatsApp opt-in gating', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    HTMLInputElement.prototype.focus = vi.fn();
    mockProfileQuery(legacyProfile);
    mockUpdateUseMutation.mockReturnValue({
      mutate: mockUpdateMutate,
      isPending: false,
      error: null,
    });
    mockLeaveUseMutation.mockReturnValue({
      mutate: vi.fn(),
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
    mockUpdateMutate.mockReset();
    mockLeaveUseMutation.mockReset();
    mockLogoutUseMutation.mockReset();
    mockExportCsvUseQuery.mockReset();
    mockInvalidateProfile.mockReset();
  });

  it('shows the migration banner for bad-state legacy users', () => {
    render(<ProfileContent />);

    expect(
      screen.getByText(
        /add your phone number to finish setting up your account/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/receive WhatsApp reminders/i)).toBeInTheDocument();
  });

  it('disables WhatsApp opt-in when no phone is stored', () => {
    render(<ProfileContent />);

    const toggle = screen.getByRole('switch', { name: '' });
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect(toggle).toBeDisabled();
    expect(
      screen.getByText(
        /add your phone number above to enable WhatsApp reminders/i,
      ),
    ).toBeInTheDocument();
  });

  it('enables WhatsApp opt-in after a phone is saved', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ProfileContent />);

    expect(screen.getByRole('switch')).toBeDisabled();

    mockProfileQuery({
      ...legacyProfile,
      phone: '+919876543210',
      needsPhoneMigration: false,
    });
    rerender(<ProfileContent />);

    const toggle = screen.getByRole('switch');
    expect(toggle).not.toBeDisabled();
    expect(toggle).toHaveAttribute('aria-disabled', 'false');

    await user.click(toggle);
    expect(mockUpdateMutate).toHaveBeenCalledWith(
      { whatsappOptIn: false },
      expect.any(Object),
    );
  });
});
