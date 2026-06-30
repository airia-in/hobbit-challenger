import { useState } from 'react';
import { GroupInviteCard, HeatmapGrid } from '@workspace-starter/ui';
import { AuthGateInner } from '../auth/AuthGate';
import { AppShell } from '../layout/AppNav';
import { TrpcProvider } from '../TrpcProvider';
import { trpc } from '../../lib/trpc';

function AdminGroupContent() {
  const [adminMode, setAdminMode] = useState(false);
  const utils = trpc.useUtils();

  const group = trpc.groups.getMine.useQuery();
  const heatmap = trpc.heatmap.get.useQuery();
  const setDayLabel = trpc.heatmap.setDayLabel.useMutation({
    onSuccess: () => void utils.heatmap.get.invalidate(),
  });
  const regenerateInvite = trpc.groups.regenerateInvite.useMutation({
    onSuccess: () => void utils.groups.getMine.invalidate(),
  });

  if (group.isLoading || heatmap.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm uppercase tracking-[0.3em] text-[var(--text-muted)]">
          Loading...
        </p>
      </div>
    );
  }

  if (!group.data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <p className="text-[var(--text-muted)]">You are not in a group.</p>
        <a
          href="/join"
          className="mt-4 inline-block text-sm text-[var(--accent-red)]"
        >
          Create or join a group →
        </a>
      </div>
    );
  }

  if (!group.data.isAdmin) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <p className="text-[var(--accent-red)]">Admin access only</p>
        <a
          href="/dashboard"
          className="mt-4 inline-block text-sm text-[var(--text-muted)]"
        >
          Back to dashboard →
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1
            className="text-4xl text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {group.data.name}
          </h1>
          <p className="text-sm text-[var(--text-muted)]">Group admin</p>
        </div>
        <div className="flex flex-col items-end gap-2 text-xs uppercase tracking-wider">
          <a
            href="/admin/activities"
            className="text-[var(--accent-red)] hover:underline"
          >
            Edit activities →
          </a>
          <a
            href="/join"
            className="text-[var(--text-muted)] hover:text-[var(--accent-red)]"
          >
            Manage members →
          </a>
        </div>
      </header>

      <GroupInviteCard
        inviteUrl={group.data.inviteUrl}
        groupName={group.data.name}
        onRegenerate={() => regenerateInvite.mutate()}
        isRegenerating={regenerateInvite.isPending}
      />

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2
            className="text-lg uppercase tracking-wider text-[var(--text-muted)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            75-Day Heatmap
          </h2>
          <button
            type="button"
            onClick={() => setAdminMode((m) => !m)}
            className={`rounded px-3 py-1 text-xs uppercase tracking-wider ${
              adminMode
                ? 'bg-[var(--accent-red)] text-white'
                : 'border border-[var(--border)] text-[var(--text-muted)]'
            }`}
          >
            {adminMode ? 'Editing labels' : 'Edit labels'}
          </button>
        </div>

        {heatmap.data && (
          <HeatmapGrid
            cells={heatmap.data.cells}
            adminMode={adminMode}
            onDayLabelEdit={(dayNumber, labelText) =>
              setDayLabel.mutate({ dayNumber, labelText })
            }
          />
        )}

        <p className="mt-4 text-xs text-[var(--text-muted)]">
          Hover cells for details. Toggle edit mode to set group-wide day
          labels.
        </p>
      </section>
    </div>
  );
}

type AdminGroupPageProps = {
  currentPath?: string;
};

export function AdminGroupPage({ currentPath }: AdminGroupPageProps) {
  return (
    <TrpcProvider>
      <AuthGateInner>
        <AppShell currentPath={currentPath}>
          <AdminGroupContent />
        </AppShell>
      </AuthGateInner>
    </TrpcProvider>
  );
}
