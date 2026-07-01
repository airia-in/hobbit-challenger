import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from '../src/components/auth/LoginForm';

const mockGetToken = vi.fn<() => string | null>(() => null);
const mockMeUseQuery = vi.fn();
const mockUseMutation = vi.fn(() => ({
  mutate: vi.fn(),
  isPending: false,
}));

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
    auth: {
      me: {
        useQuery: (...args: unknown[]) => mockMeUseQuery(...args),
      },
      login: {
        useMutation: () => mockUseMutation(),
      },
      register: {
        useMutation: () => mockUseMutation(),
      },
    },
  },
}));

describe('LoginForm', () => {
  let locationHref = '';

  beforeEach(() => {
    locationHref = '';
    mockGetToken.mockReturnValue(null);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        get href() {
          return locationHref;
        },
        set href(value: string) {
          locationHref = value;
        },
        search: '',
      },
    });
    mockMeUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });
    mockUseMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockGetToken.mockReset();
    mockMeUseQuery.mockReset();
    mockUseMutation.mockReset();
  });

  it('renders the Sign In form when there is no token', () => {
    render(<LoginForm />);

    expect(
      screen.getByPlaceholderText('9876543210 or you@example.com'),
    ).toBeInTheDocument();
    expect(screen.getByText('+91')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'DRCODE' })).toBeInTheDocument();
    expect(screen.queryByText('Checking session…')).not.toBeInTheDocument();
    expect(mockMeUseQuery).toHaveBeenCalledWith(undefined, {
      enabled: false,
      retry: false,
    });
  });

  it('hides the phone prefix for legacy email sign-in', () => {
    render(<LoginForm />);

    const identifier = screen.getByPlaceholderText(
      '9876543210 or you@example.com',
    );
    fireEvent.change(identifier, { target: { value: 'you@example.com' } });

    expect(screen.queryByText('+91')).not.toBeInTheDocument();
  });

  it('hides the phone prefix for E.164 sign-in', () => {
    render(<LoginForm />);

    const identifier = screen.getByPlaceholderText(
      '9876543210 or you@example.com',
    );
    fireEvent.change(identifier, { target: { value: '+919876543210' } });

    expect(screen.queryByText('+91')).not.toBeInTheDocument();
  });

  it('keeps the phone prefix and preview on registration', () => {
    render(<LoginForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    fireEvent.change(screen.getByPlaceholderText('9876543210'), {
      target: { value: '9876543210' },
    });

    expect(screen.getByText('+91')).toBeInTheDocument();
    expect(
      screen.getByText('Will register as +91 98765 43210'),
    ).toBeInTheDocument();
  });

  it('shows a session check state while auth.me is loading', () => {
    mockGetToken.mockReturnValue('existing-token');
    mockMeUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(<LoginForm />);

    expect(screen.getByText('Checking session…')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign In' }),
    ).not.toBeInTheDocument();
    expect(mockMeUseQuery).toHaveBeenCalledWith(undefined, {
      enabled: true,
      retry: false,
    });
  });

  it('redirects to the dashboard when a valid session is found', async () => {
    mockGetToken.mockReturnValue('existing-token');
    mockMeUseQuery.mockReturnValue({
      data: { user: { groupId: 'group-123' }, attempt: null },
      isLoading: false,
      isError: false,
    });

    render(<LoginForm />);

    await waitFor(() => {
      expect(locationHref).toBe('/dashboard');
    });
  });

  it('honors returnTo on the mount redirect (invite deep-link)', async () => {
    mockGetToken.mockReturnValue('existing-token');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        get href() {
          return locationHref;
        },
        set href(value: string) {
          locationHref = value;
        },
        search: '?returnTo=/join?token=abc123',
      },
    });
    mockMeUseQuery.mockReturnValue({
      data: { user: { groupId: 'group-123' }, attempt: null },
      isLoading: false,
      isError: false,
    });

    render(<LoginForm />);

    await waitFor(() => {
      expect(locationHref).toBe('/join?token=abc123');
    });
  });

  it('renders the form when the token is invalid or expired', () => {
    mockGetToken.mockReturnValue('expired-token');
    mockMeUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<LoginForm />);

    expect(
      screen.getByPlaceholderText('9876543210 or you@example.com'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Checking session…')).not.toBeInTheDocument();
  });
});
