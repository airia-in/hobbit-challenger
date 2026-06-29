import { useEffect, useState } from 'react';
import { AuthGateInner } from '../auth/AuthGate';
import { AppShell } from '../layout/AppNav';
import { TrpcProvider } from '../TrpcProvider';
import { trpc } from '../../lib/trpc';

function ProfileContent() {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const profile = trpc.profile.get.useQuery();
  const updateProfile = trpc.profile.update.useMutation({
    onSuccess: () => {
      void utils.profile.get.invalidate();
      setMessage('Profile updated');
      setPassword('');
    },
  });
  const leaveGroup = trpc.profile.leaveGroup.useMutation({
    onSuccess: () => {
      void utils.profile.get.invalidate();
      setShowLeaveModal(false);
      setMessage('You have left the group');
    },
  });
  const exportCsv = trpc.history.exportCsv.useQuery(undefined, { enabled: false });

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.name);
      setReminderTime(profile.data.reminderTime ?? '');
    }
  }, [profile.data]);

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  async function requestNotifications() {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === 'granted');
  }

  function handleExport() {
    void exportCsv.refetch().then((result) => {
      const csv = result.data?.csv;
      if (!csv) return;
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'drcode-export.csv';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  if (profile.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm uppercase tracking-[0.3em] text-[var(--text-muted)]">
          Loading profile...
        </p>
      </div>
    );
  }

  const data = profile.data!;

  return (
    <div className="mx-auto max-w-lg space-y-8 px-4 py-8">
      <header>
        <h1
          className="text-4xl text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Profile
        </h1>
      </header>

      {message && (
        <p className="rounded border border-[var(--success)] bg-[var(--success)]/10 px-4 py-2 text-sm text-[var(--success)]">
          {message}
        </p>
      )}

      <div className="flex items-center gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--border)] text-2xl font-bold text-[var(--text-muted)]">
          {data.avatarUrl ? (
            <img src={data.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
          ) : (
            data.name.charAt(0).toUpperCase()
          )}
        </div>
        <div>
          <p className="text-lg font-medium text-[var(--text-primary)]">{data.name}</p>
          <p className="text-sm text-[var(--text-muted)]">{data.email}</p>
          {data.groupName && (
            <p className="text-xs text-[var(--text-muted)]">Group: {data.groupName}</p>
          )}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          updateProfile.mutate({
            name: name !== data.name ? name : undefined,
            password: password || undefined,
            reminderTime: reminderTime || null,
          });
        }}
        className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6"
      >
        <h2 className="text-sm uppercase tracking-wider text-[var(--text-muted)]">
          Account Settings
        </h2>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--text-muted)]">
            Display name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--text-muted)]">
            New password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank to keep current"
            className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--text-muted)]">
            Daily reminder time
          </label>
          <input
            type="time"
            value={reminderTime}
            onChange={(e) => setReminderTime(e.target.value)}
            className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)]"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--text-muted)]">Browser notifications</span>
          {notificationsEnabled ? (
            <span className="text-xs text-[var(--success)]">Enabled</span>
          ) : (
            <button
              type="button"
              onClick={() => void requestNotifications()}
              className="text-xs uppercase tracking-wider text-[var(--accent-red)]"
            >
              Enable
            </button>
          )}
        </div>

        {updateProfile.error && (
          <p className="text-sm text-[var(--accent-red)]">{updateProfile.error.message}</p>
        )}

        <button
          type="submit"
          disabled={updateProfile.isPending}
          className="w-full rounded bg-[var(--accent-red)] py-3 text-sm font-bold uppercase tracking-widest text-white disabled:opacity-50"
        >
          {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </form>

      <div className="space-y-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={exportCsv.isFetching}
          className="w-full rounded border border-[var(--border)] py-3 text-sm uppercase tracking-wider text-[var(--text-primary)] hover:border-[var(--accent-red)] disabled:opacity-50"
        >
          {exportCsv.isFetching ? 'Exporting...' : 'Export Data CSV'}
        </button>

        {data.groupId && !data.isGroupAdmin && (
          <button
            type="button"
            onClick={() => setShowLeaveModal(true)}
            className="w-full rounded border border-[var(--accent-red)] py-3 text-sm uppercase tracking-wider text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10"
          >
            Leave Group
          </button>
        )}
      </div>

      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
            <h3 className="text-lg text-[var(--text-primary)]">Leave group?</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Your current attempt will be archived and you will be removed from{' '}
              {data.groupName}.
            </p>
            {leaveGroup.error && (
              <p className="mt-2 text-sm text-[var(--accent-red)]">{leaveGroup.error.message}</p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowLeaveModal(false)}
                className="flex-1 rounded border border-[var(--border)] py-2 text-sm text-[var(--text-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => leaveGroup.mutate()}
                disabled={leaveGroup.isPending}
                className="flex-1 rounded bg-[var(--accent-red)] py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {leaveGroup.isPending ? 'Leaving...' : 'Leave'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type ProfilePageProps = {
  currentPath?: string;
};

export function ProfilePage({ currentPath }: ProfilePageProps) {
  return (
    <TrpcProvider>
      <AuthGateInner>
        <AppShell currentPath={currentPath}>
          <ProfileContent />
        </AppShell>
      </AuthGateInner>
    </TrpcProvider>
  );
}
