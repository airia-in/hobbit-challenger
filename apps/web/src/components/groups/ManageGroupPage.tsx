import { useState } from 'react';
import { GroupInviteCard } from '@workspace-starter/ui';
import { TrpcProvider } from '../TrpcProvider';
import { AuthGateInner } from '../auth/AuthGate';
import { AuthenticatedImage } from '../common/AuthenticatedImage';
import { QueryErrorState } from '../common/QueryErrorState';
import { trpc } from '../../lib/trpc';

const statusColors: Record<string, string> = {
  ACTIVE: 'text-[var(--success)]',
  COMPLETED: 'text-[var(--gold)]',
};

type PendingMemberAction = {
  type: 'remove' | 'promote' | 'demote';
  userId: string;
  memberName: string;
};

export function ManageGroupContent() {
  const [groupName, setGroupName] = useState('');
  const [pendingAction, setPendingAction] =
    useState<PendingMemberAction | null>(null);
  const utils = trpc.useUtils();

  const group = trpc.groups.getMine.useQuery();
  const createGroup = trpc.groups.create.useMutation({
    onSuccess: () => utils.groups.getMine.invalidate(),
  });
  const regenerateInvite = trpc.groups.regenerateInvite.useMutation({
    onSuccess: () => utils.groups.getMine.invalidate(),
  });
  const removeMember = trpc.groups.removeMember.useMutation({
    onSuccess: () => {
      utils.groups.getMine.invalidate();
      setPendingAction(null);
    },
  });
  const promoteAdmin = trpc.groups.promoteAdmin.useMutation({
    onSuccess: () => {
      utils.groups.getMine.invalidate();
      setPendingAction(null);
    },
  });
  const demoteAdmin = trpc.groups.demoteAdmin.useMutation({
    onSuccess: () => {
      utils.groups.getMine.invalidate();
      setPendingAction(null);
    },
  });

  const activeMutation =
    pendingAction?.type === 'remove'
      ? removeMember
      : pendingAction?.type === 'demote'
        ? demoteAdmin
        : promoteAdmin;

  if (group.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm uppercase tracking-[0.3em] text-[var(--text-muted)]">
          Loading...
        </p>
      </div>
    );
  }

  if (group.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <QueryErrorState
          message={group.error?.message}
          onRetry={() => void group.refetch()}
        />
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
            {group.data.isAdmin ? 'You are an admin' : 'Group member'}
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
        onRegenerate={
          group.data.isAdmin ? () => regenerateInvite.mutate() : undefined
        }
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
                  {member.avatarUrl ? (
                    <AuthenticatedImage
                      src={member.avatarUrl}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    member.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-[var(--text-primary)]">
                      {member.name}
                    </p>
                    {member.isAdmin && (
                      <span className="rounded border border-[var(--gold)]/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--gold)]">
                        Admin
                      </span>
                    )}
                  </div>
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

              {group.data?.isAdmin && !member.isSelf && (
                <div className="flex gap-2">
                  {member.isAdmin ? (
                    group.data.adminCount > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          // Clear any prior failure so a fresh modal opens clean.
                          removeMember.reset();
                          promoteAdmin.reset();
                          demoteAdmin.reset();
                          setPendingAction({
                            type: 'demote',
                            userId: member.id,
                            memberName: member.name,
                          });
                        }}
                        disabled={demoteAdmin.isPending}
                        className="text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--gold)]"
                      >
                        Remove admin
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        // Clear any prior failure so a fresh modal opens clean.
                        removeMember.reset();
                        promoteAdmin.reset();
                        demoteAdmin.reset();
                        setPendingAction({
                          type: 'promote',
                          userId: member.id,
                          memberName: member.name,
                        });
                      }}
                      disabled={promoteAdmin.isPending}
                      className="text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--gold)]"
                    >
                      Make admin
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      removeMember.reset();
                      promoteAdmin.reset();
                      demoteAdmin.reset();
                      setPendingAction({
                        type: 'remove',
                        userId: member.id,
                        memberName: member.name,
                      });
                    }}
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

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
            <h3 className="text-lg text-[var(--text-primary)]">
              {pendingAction.type === 'remove'
                ? `Remove ${pendingAction.memberName} from the group?`
                : pendingAction.type === 'demote'
                  ? `Remove ${pendingAction.memberName}'s admin access?`
                  : `Make ${pendingAction.memberName} an admin?`}
            </h3>
            {activeMutation.error && (
              <p className="mt-2 text-sm text-[var(--accent-red)]">
                {activeMutation.error.message}
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="flex-1 rounded border border-[var(--border)] py-2 text-sm text-[var(--text-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pendingAction.type === 'remove') {
                    removeMember.mutate({ userId: pendingAction.userId });
                  } else if (pendingAction.type === 'demote') {
                    demoteAdmin.mutate({ userId: pendingAction.userId });
                  } else {
                    promoteAdmin.mutate({ userId: pendingAction.userId });
                  }
                }}
                disabled={activeMutation.isPending}
                className="flex-1 rounded bg-[var(--accent-red)] py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {activeMutation.isPending
                  ? 'Working...'
                  : pendingAction.type === 'remove'
                    ? 'Remove'
                    : pendingAction.type === 'demote'
                      ? 'Remove admin'
                      : 'Make admin'}
              </button>
            </div>
          </div>
        </div>
      )}
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
