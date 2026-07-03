import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileContent } from '../src/components/profile/ProfilePage';
import { THEME_STORAGE_KEY } from '../src/lib/theme';

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

const profileFixture = {
  id: 'user-1',
  name: 'Frodo',
  email: 'frodo@shire.test',
  phone: '+919876543210',
  avatarUrl: null,
  timezone: 'UTC',
  reminderTime: '08:00',
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

function setupProfileMocks() {
  mockProfileUseQuery.mockReturnValue({
    isLoading: false,
    data: profileFixture,
    error: null,
  });
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
  });
}

describe('Profile appearance theme control', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    setupProfileMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders light, dark, and system theme options', () => {
    render(<ProfileContent />);

    expect(
      screen.getByRole('radiogroup', { name: 'Theme' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'System' })).toBeInTheDocument();
  });

  it('selects light theme and persists preference', async () => {
    const user = userEvent.setup();
    render(<ProfileContent />);

    await user.click(screen.getByRole('radio', { name: 'Light' }));

    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('selects dark theme and applies data-theme', async () => {
    const user = userEvent.setup();
    render(<ProfileContent />);

    await user.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('selects system theme and applies color-scheme from OS preference', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const user = userEvent.setup();
    render(<ProfileContent />);

    await user.click(screen.getByRole('radio', { name: 'System' }));

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});
