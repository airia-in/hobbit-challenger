import { useState } from 'react';
import { GroupInviteCard } from '@workspace-starter/ui';
import { TrpcProvider } from '../TrpcProvider';
import { AuthGateInner } from '../auth/AuthGate';
import { trpc } from '../../lib/trpc';

const statusColors: Record<string, string> = {
  ACTIVE: 'text-[var(--success)]',
  ELIMINATED: 'text-[var(--accent-red)]',
  COMPLETED: 'text-[var(--gold)]',
};

function ManageGroupContent() {
  const [groupName, setGroupName] = useState('');
  const utils = trpc.useUtils();

  const group = trpc.groups.getMine.useQuery();
  const createGroup = trpc.groups.create.useMutation({
    onSuccess: () => utils.groups.getMine.invalidate(),
  });
  const regenerateInvite = trpc.groups.regenerateInvite.useMutation({
    onSuccess: () => utils.groups.getMine.invalidate(),
  });
  const removeMember = trpc.groups.removeMember.useMutation({
    onSuccess: () => utils.groups.getMine.invalidate(),
  });
  const transferAdmin = trpc.groups.transferAdmin.useMutation({
    onSuccess: () => utils.groups.getMine.invalidate(),
  });

  if (group.isLoading) {
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
      <div className="mx-auto max-w-lg px-4 py-12">
        <div className="mb-8 text-center">
          <h1
            className="text-4xl text-[var(--accent-red)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Create Your Squad
          </h1>
          <p className="mt-2 text-[var(--text-muted)]">
            Start a group and invite others to hold each other accountable.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createGroup.mutate({ name: groupName });
          }}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6"
        >
          <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Group name
          </label>
          <input
            required
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="mb-4 w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent-red)]"
            placeholder="e.g. Iron Will Crew"
          />

          {createGroup.error && (
            <p className="mb-4 text-sm text-[var(--accent-red)]">
              {createGroup.error.message}
            </p>
          )}

          <button
            type="submit"
            disabled={createGroup.isPending}
            className="w-full rounded bg-[var(--accent-red)] py-3 text-sm font-bold uppercase tracking-widest text-white hover:bg-[#c42a22] disabled:opacity-50"
          >
            {createGroup.isPending ? 'Creating...' : 'Create Group'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-4xl text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {group.data.name}
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            {group.data.isAdmin ? 'You are the admin' : 'Group member'}
          </p>
        </div>
        <a
          href="/dashboard"
          className="text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent-red)]"
        >
          Dashboard →
        </a>
      </div>

      <GroupInviteCard
        inviteUrl={group.data.inviteUrl}
        groupName={group.data.name}
        onRegenerate={group.data.isAdmin ? () => regenerateInvite.mutate() : undefined}
        isRegenerating={regenerateInvite.isPending}
      />

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <h3
          className="mb-4 text-xl text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Members ({group.data.members.length})
        </h3>
        <ul className="space-y-3">
          {group.data.members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--border)] text-sm font-bold text-[var(--text-muted)]">
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-[var(--text-primary)]">{member.name}</p>
                  <p
                    className={`text-xs uppercase tracking-wider ${statusColors[member.status] ?? ''}`}
                  >
                    {member.status}
                    {member.currentDay > 0 && (
                      <span className="ml-2 text-[var(--text-muted)]">
                        Day {member.currentDay}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {group.data?.isAdmin && member.id !== group.data.adminUserId && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => transferAdmin.mutate({ userId: member.id })}
                    disabled={transferAdmin.isPending}
                    className="text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--gold)]"
                  >
                    Make admin
                  </button>
                  <button
                    type="button"
                    onClick={() => removeMember.mutate({ userId: member.id })}
                    disabled={removeMember.isPending}
                    className="text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent-red)]"
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ManageGroupPage() {
  return (
    <TrpcProvider>
      <AuthGateInner>
        <ManageGroupContent />
      </AuthGateInner>
    </TrpcProvider>
  );
}
