import { useState } from 'react';
import {
  LeaderboardTable,
  PodiumBlock,
  type LeaderboardSortBy,
} from '@workspace-starter/ui';
import { AuthGateInner } from '../auth/AuthGate';
import { AuthenticatedImage } from '../common/AuthenticatedImage';
import { QueryErrorState } from '../common/QueryErrorState';
import { AppShell } from '../layout/AppNav';
import { TrpcProvider } from '../TrpcProvider';
import { trpc } from '../../lib/trpc';

type LeaderboardWindow = 'today' | 'week' | 'total';

const WINDOW_OPTIONS: { value: LeaderboardWindow; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'total', label: 'Total' },
];

export function LeaderboardContent() {
  const [sortBy, setSortBy] = useState<LeaderboardSortBy>('xp');
  const [window, setWindow] = useState<LeaderboardWindow>('today');
  const me = trpc.auth.me.useQuery();

  const leaderboard = trpc.leaderboard.get.useQuery(
    { window, sortBy },
    { refetchInterval: 60_000 },
  );

  if (leaderboard.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm uppercase tracking-[0.3em] text-[var(--text-muted)]">
          Loading leaderboard...
        </p>
      </div>
    );
  }

  if (leaderboard.isError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <QueryErrorState
          message={leaderboard.error.message}
          onRetry={() => void leaderboard.refetch()}
        />
        <a
          href="/join"
          className="mt-4 inline-block text-sm text-[var(--text-muted)] hover:text-[var(--accent-red)]"
        >
          Join a group →
        </a>
      </div>
    );
  }

  const data = leaderboard.data!;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <header>
        <h1
          className="text-3xl text-[var(--text-primary)] sm:text-4xl"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Leaderboard
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Squad rankings · refreshes every 60s
        </p>
      </header>

      <div
        className="grid grid-cols-3 gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 md:flex md:gap-2 md:rounded-none md:border-0 md:bg-transparent md:p-0"
        role="tablist"
        aria-label="Leaderboard time window"
      >
        {WINDOW_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={window === option.value}
            onClick={() => setWindow(option.value)}
            className={
              window === option.value
                ? 'min-w-0 rounded-md border border-[var(--accent-red)] bg-[var(--accent-red)]/10 px-2 py-1.5 text-center text-[10px] font-semibold uppercase leading-tight tracking-wider text-[var(--accent-red)] md:rounded-full md:px-4 md:text-xs'
                : 'min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-center text-[10px] font-semibold uppercase leading-tight tracking-wider text-[var(--text-muted)] transition hover:border-[var(--accent-red)]/50 hover:text-[var(--text-primary)] md:rounded-full md:border-[var(--border)] md:bg-[var(--surface)] md:px-4 md:text-xs'
            }
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {data.podium.length > 0 && <PodiumBlock podium={data.podium} />}

      <LeaderboardTable
        members={data.members}
        sortBy={sortBy}
        onSortChange={setSortBy}
        highlightUserId={me.data?.user.id}
        renderAvatar={(member) =>
          member.avatarUrl ? (
            <AuthenticatedImage
              src={member.avatarUrl}
              alt=""
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            member.name.charAt(0).toUpperCase()
          )
        }
      />
    </div>
  );
}

type LeaderboardPageProps = {
  currentPath?: string;
};

export function LeaderboardPage({ currentPath }: LeaderboardPageProps) {
  return (
    <TrpcProvider>
      <AuthGateInner>
        <AppShell currentPath={currentPath}>
          <LeaderboardContent />
        </AppShell>
      </AuthGateInner>
    </TrpcProvider>
  );
}
