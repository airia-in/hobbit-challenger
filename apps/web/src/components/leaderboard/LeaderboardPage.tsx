import { useState } from 'react';
import {
  LeaderboardTable,
  PodiumBlock,
  type LeaderboardSortBy,
} from '@workspace-starter/ui';
import { AuthGateInner } from '../auth/AuthGate';
import { AppShell } from '../layout/AppNav';
import { TrpcProvider } from '../TrpcProvider';
import { trpc } from '../../lib/trpc';

function LeaderboardContent() {
  const [sortBy, setSortBy] = useState<LeaderboardSortBy>('day');
  const me = trpc.auth.me.useQuery();

  const leaderboard = trpc.leaderboard.get.useQuery(
    { sortBy },
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
        <p className="text-[var(--accent-red)]">{leaderboard.error.message}</p>
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

      {data.podium.length > 0 && <PodiumBlock podium={data.podium} />}

      <LeaderboardTable
        members={data.members}
        sortBy={sortBy}
        onSortChange={setSortBy}
        highlightUserId={me.data?.user.id}
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
