import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppNav } from '../src/components/layout/AppNav';

const mockProfileUseQuery = vi.fn();

vi.mock('../src/lib/trpc', () => ({
  trpc: {
    profile: {
      get: {
        useQuery: (...args: unknown[]) => mockProfileUseQuery(...args),
      },
    },
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  mockProfileUseQuery.mockReset();
});

function renderNav() {
  render(<AppNav currentPath="/dashboard" />);
  const navs = screen.getAllByRole('navigation');
  return {
    desktopNav: navs[0],
    mobileNav: navs[1],
  };
}

function mockProfileAdmin() {
  mockProfileUseQuery.mockReturnValue({
    data: { isGroupAdmin: true },
    isLoading: false,
    isError: false,
  });
}

function mockProfileNotAdmin(groupId: string | null = 'group-1') {
  mockProfileUseQuery.mockReturnValue({
    data: { isGroupAdmin: false, groupId },
    isLoading: false,
    isError: false,
  });
}

function mockProfileLoading() {
  mockProfileUseQuery.mockReturnValue({
    data: undefined,
    isLoading: true,
    isError: false,
  });
}

function mockProfileError() {
  mockProfileUseQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: true,
  });
}

describe('AppNav admin links', () => {
  describe('desktop', () => {
    it('renders admin links when profile.get reports isGroupAdmin', () => {
      mockProfileAdmin();
      const { desktopNav } = renderNav();

      expect(
        within(desktopNav).getByRole('link', { name: /Edit Activities/i }),
      ).toHaveAttribute('href', '/admin/activities');
      expect(
        within(desktopNav).getByRole('link', { name: /Group Settings/i }),
      ).toHaveAttribute('href', '/admin/group');
    });

    it('does not render admin links when isGroupAdmin is false', () => {
      mockProfileNotAdmin();
      const { desktopNav } = renderNav();

      expect(
        within(desktopNav).queryByRole('link', { name: /Edit Activities/i }),
      ).not.toBeInTheDocument();
      expect(
        within(desktopNav).queryByRole('link', { name: /Group Settings/i }),
      ).not.toBeInTheDocument();
    });

    it('does not render admin links while profile is loading', () => {
      mockProfileLoading();
      const { desktopNav } = renderNav();

      expect(
        within(desktopNav).queryByRole('link', { name: /Edit Activities/i }),
      ).not.toBeInTheDocument();
      expect(
        within(desktopNav).queryByRole('link', { name: /Group Settings/i }),
      ).not.toBeInTheDocument();
    });

    it('does not render admin links when profile query errors', () => {
      mockProfileError();
      const { desktopNav } = renderNav();

      expect(
        within(desktopNav).queryByRole('link', { name: /Edit Activities/i }),
      ).not.toBeInTheDocument();
      expect(
        within(desktopNav).queryByRole('link', { name: /Group Settings/i }),
      ).not.toBeInTheDocument();
    });

    it('hides leaderboard when the user has no fellowship', () => {
      mockProfileNotAdmin(null);
      const { desktopNav } = renderNav();

      expect(
        within(desktopNav).queryByRole('link', { name: /Leaderboard/i }),
      ).not.toBeInTheDocument();
      expect(
        within(desktopNav).getByRole('link', { name: /Dashboard/i }),
      ).toBeInTheDocument();
    });
  });

  describe('mobile', () => {
    it('renders admin links when profile.get reports isGroupAdmin', () => {
      mockProfileAdmin();
      const { mobileNav } = renderNav();

      expect(
        within(mobileNav).getByRole('link', { name: /Edit Activities/i }),
      ).toHaveAttribute('href', '/admin/activities');
      expect(
        within(mobileNav).getByRole('link', { name: /Group Settings/i }),
      ).toHaveAttribute('href', '/admin/group');
    });

    it('does not render admin links when isGroupAdmin is false', () => {
      mockProfileNotAdmin();
      const { mobileNav } = renderNav();

      expect(
        within(mobileNav).queryByRole('link', { name: /Edit Activities/i }),
      ).not.toBeInTheDocument();
      expect(
        within(mobileNav).queryByRole('link', { name: /Group Settings/i }),
      ).not.toBeInTheDocument();
    });

    it('does not render admin links while profile is loading', () => {
      mockProfileLoading();
      const { mobileNav } = renderNav();

      expect(
        within(mobileNav).queryByRole('link', { name: /Edit Activities/i }),
      ).not.toBeInTheDocument();
      expect(
        within(mobileNav).queryByRole('link', { name: /Group Settings/i }),
      ).not.toBeInTheDocument();
    });

    it('does not render admin links when profile query errors', () => {
      mockProfileError();
      const { mobileNav } = renderNav();

      expect(
        within(mobileNav).queryByRole('link', { name: /Edit Activities/i }),
      ).not.toBeInTheDocument();
      expect(
        within(mobileNav).queryByRole('link', { name: /Group Settings/i }),
      ).not.toBeInTheDocument();
    });

    it('hides leaderboard on mobile when the user has no fellowship', () => {
      mockProfileNotAdmin(null);
      const { mobileNav } = renderNav();

      expect(
        within(mobileNav).queryByRole('link', { name: /Leaderboard/i }),
      ).not.toBeInTheDocument();
    });
  });
});
