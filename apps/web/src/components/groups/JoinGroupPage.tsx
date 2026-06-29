import { useEffect } from 'react';
import { TrpcProvider } from '../TrpcProvider';
import { trpc } from '../../lib/trpc';
import { getToken } from '../../lib/auth';

type JoinGroupPageProps = {
  token?: string;
};

function resolveToken(propToken?: string): string | undefined {
  if (propToken) return propToken;

  if (typeof window !== 'undefined') {
    const fromQuery = new URLSearchParams(window.location.search).get('token');
    if (fromQuery) return fromQuery;

    // Legacy path-based invite links: /join/{token}
    const match = window.location.pathname.match(/\/join\/([^/]+)/);
    const slug = match?.[1];
    if (slug && slug !== '_') return slug;
  }

  return undefined;
}

function JoinGroupPageInner({ token: propToken }: JoinGroupPageProps) {
  const token = resolveToken(propToken);

  const preview = trpc.groups.previewByToken.useQuery(
    { token: token ?? '' },
    { enabled: Boolean(token) },
  );

  const join = trpc.groups.join.useMutation({
    onSuccess: () => {
      window.location.href = '/dashboard';
    },
  });

  useEffect(() => {
    if (!token) return;
    if (!getToken()) {
      const returnTo = `/join?token=${encodeURIComponent(token)}`;
      window.location.href = `/?returnTo=${encodeURIComponent(returnTo)}`;
    }
  }, [token]);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[var(--text-muted)]">Invalid invite link.</p>
      </div>
    );
  }

  if (preview.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm uppercase tracking-[0.3em] text-[var(--text-muted)]">
          Loading invite...
        </p>
      </div>
    );
  }

  if (preview.isError || !preview.data) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
          <p className="text-[var(--accent-red)]">
            This invite link is invalid or expired.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <h1
          className="text-3xl text-[var(--accent-red)] sm:text-4xl"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          DRCODE
        </h1>
        <p className="text-xs tracking-[0.25em] text-[var(--text-muted)] sm:text-sm sm:tracking-[0.3em]">
          75 HARD CHALLENGE
        </p>
      </div>

      <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-center sm:p-8">
        <p className="mb-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
          You&apos;re invited to join
        </p>
        <h2
          className="mb-2 text-2xl text-[var(--text-primary)] sm:text-3xl"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {preview.data.name}
        </h2>
        <p
          className="mb-8 text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {preview.data.memberCount} member
          {preview.data.memberCount === 1 ? '' : 's'}
        </p>

        {join.error && (
          <p className="mb-4 rounded border border-[var(--accent-red)]/40 bg-[var(--accent-red)]/10 px-3 py-2 text-sm text-[var(--accent-red)]">
            {join.error.message}
          </p>
        )}

        <button
          type="button"
          onClick={() => join.mutate({ token })}
          disabled={join.isPending}
          className="w-full rounded bg-[var(--accent-red)] py-3 text-sm font-bold uppercase tracking-widest text-white hover:bg-[#c42a22] disabled:opacity-50"
        >
          {join.isPending ? 'Joining...' : 'Join Group'}
        </button>
      </div>

      <p className="mt-10 text-sm text-[var(--text-muted)]">
        75 days. 5 tasks. No exceptions.
      </p>
    </div>
  );
}

export function JoinGroupPage(props: JoinGroupPageProps) {
  return (
    <TrpcProvider>
      <JoinGroupPageInner {...props} />
    </TrpcProvider>
  );
}
