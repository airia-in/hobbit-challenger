import type { ReactNode } from 'react';
import { BRAND_NAME, BRAND_SUBTITLE } from '../../lib/brand';
import { trpc } from '../../lib/trpc';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/progress', label: 'Progress', icon: '📈' },
  { href: '/gallery', label: 'Gallery', icon: '🖼️' },
  { href: '/leaderboard', label: 'Leaderboard', icon: '🏆' },
  { href: '/history', label: 'History', icon: '📜' },
  { href: '/profile', label: 'Profile', icon: '👤' },
] as const;

const ADMIN_NAV_ITEMS = [
  { href: '/admin/activities', label: 'Edit Activities', icon: '⚙️' },
  { href: '/admin/group', label: 'Group Settings', icon: '🛠️' },
] as const;

type AppNavProps = {
  currentPath?: string;
};

function NavLink({
  href,
  label,
  icon,
  active,
  className,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${className ?? ''} ${
        active
          ? 'bg-[var(--accent-red)]/10 text-[var(--accent-red)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]'
      }`}
    >
      <span aria-hidden>{icon}</span>
      <span
        className="uppercase tracking-wider"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {label}
      </span>
    </a>
  );
}

export function AppNav({ currentPath = '' }: AppNavProps) {
  const path = currentPath.replace(/\/$/, '') || '/';
  const profile = trpc.profile.get.useQuery();
  const showAdminNav =
    !profile.isLoading &&
    !profile.isError &&
    profile.data?.isGroupAdmin === true;

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="fixed left-0 top-0 z-40 hidden h-full w-56 flex-col border-r border-[var(--border)] bg-[var(--surface)] p-4 md:flex">
        <div className="mb-8 px-2">
          <p
            className="text-2xl text-[var(--accent-red)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {BRAND_NAME}
          </p>
          <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
            {BRAND_SUBTITLE}
          </p>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              {...item}
              active={path === item.href || path.startsWith(`${item.href}/`)}
            />
          ))}
          {showAdminNav && (
            <div className="mt-auto border-t border-[var(--border)] pt-4">
              <p className="mb-2 px-3 text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                Admin
              </p>
              <div className="flex flex-col gap-1">
                {ADMIN_NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.href}
                    {...item}
                    active={
                      path === item.href || path.startsWith(`${item.href}/`)
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex flex-col border-t border-[var(--border)] bg-[var(--surface)] md:hidden">
        {showAdminNav && (
          <div className="border-b border-[var(--border)]">
            <p className="px-3 pt-2 text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
              Admin
            </p>
            <div className="flex">
              {ADMIN_NAV_ITEMS.map((item) => {
                const active =
                  path === item.href || path.startsWith(`${item.href}/`);
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-[10px] uppercase tracking-wider ${
                      active
                        ? 'text-[var(--accent-red)]'
                        : 'text-[var(--text-muted)]'
                    }`}
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    <span aria-hidden>{item.icon}</span>
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex">
          {NAV_ITEMS.map((item) => {
            const active =
              path === item.href || path.startsWith(`${item.href}/`);
            return (
              <a
                key={item.href}
                href={item.href}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] uppercase tracking-wider ${
                  active
                    ? 'text-[var(--accent-red)]'
                    : 'text-[var(--text-muted)]'
                }`}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <span className="text-lg" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </a>
            );
          })}
        </div>
      </nav>
    </>
  );
}

export function AppShell({
  children,
  currentPath,
}: {
  children: ReactNode;
  currentPath?: string;
}) {
  const profile = trpc.profile.get.useQuery();
  const showAdminNav =
    !profile.isLoading &&
    !profile.isError &&
    profile.data?.isGroupAdmin === true;

  return (
    <div
      className={`min-h-screen bg-[var(--bg-black)] md:pb-0 md:pl-56 ${showAdminNav ? 'pb-28' : 'pb-16'}`}
    >
      <AppNav currentPath={currentPath} />
      {children}
    </div>
  );
}
