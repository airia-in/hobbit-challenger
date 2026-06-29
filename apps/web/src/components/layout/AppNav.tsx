import type { ReactNode } from 'react';
import { NotificationScheduler } from './NotificationScheduler';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/leaderboard', label: 'Leaderboard', icon: '🏆' },
  { href: '/history', label: 'History', icon: '📜' },
  { href: '/profile', label: 'Profile', icon: '👤' },
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

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="fixed left-0 top-0 z-40 hidden h-full w-56 flex-col border-r border-[var(--border)] bg-[var(--surface)] p-4 md:flex">
        <div className="mb-8 px-2">
          <p
            className="text-2xl text-[var(--accent-red)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            DRCODE
          </p>
          <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
            75 Hard
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
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-[var(--border)] bg-[var(--surface)] md:hidden">
        {NAV_ITEMS.map((item) => {
          const active = path === item.href || path.startsWith(`${item.href}/`);
          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] uppercase tracking-wider ${
                active ? 'text-[var(--accent-red)]' : 'text-[var(--text-muted)]'
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
  return (
    <div className="min-h-screen bg-[var(--bg-black)] pb-16 md:pb-0 md:pl-56">
      <AppNav currentPath={currentPath} />
      <NotificationScheduler />
      {children}
    </div>
  );
}
