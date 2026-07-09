import { useEffect, useMemo, useState } from 'react';
import { GroupInviteCard, HeatmapGrid } from '@workspace-starter/ui';
import { AuthGateInner } from '../auth/AuthGate';
import { QueryErrorState } from '../common/QueryErrorState';
import { AppShell } from '../layout/AppNav';
import { TrpcProvider } from '../TrpcProvider';
import { trpc } from '../../lib/trpc';

const MAX_CHALLENGE_RANGE_DAYS = 366;

function getLocalTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function toDateInputValue(value: Date | string | null | undefined): string {
  if (!value) return '';

  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatShortDate(value: Date | string | null | undefined): string {
  if (!value) return 'Not set';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 'Not set';

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function inclusiveDayCount(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);
  const startUtc = Date.UTC(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.floor((endUtc - startUtc) / 86_400_000) + 1;
}

function getCurrentMonthRange(now = new Date()) {
  return {
    startDate: new Date(now.getFullYear(), now.getMonth(), 1),
    endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  };
}

export function AdminGroupContent() {
  const [adminMode, setAdminMode] = useState(false);
  const [rangeStartDate, setRangeStartDate] = useState('');
  const [rangeEndDate, setRangeEndDate] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [whatsappJidInput, setWhatsappJidInput] = useState('');
  const [leaderboardTimeInput, setLeaderboardTimeInput] = useState('09:00');
  const [whatsappJidError, setWhatsappJidError] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const group = trpc.groups.getMine.useQuery();
  const heatmap = trpc.heatmap.get.useQuery();
  const setDayLabel = trpc.heatmap.setDayLabel.useMutation({
    onSuccess: () => void utils.heatmap.get.invalidate(),
  });
  const regenerateInvite = trpc.groups.regenerateInvite.useMutation({
    onSuccess: () => void utils.groups.getMine.invalidate(),
  });
  const invalidateChallengeRange = () => {
    void utils.groups.getMine.invalidate();
    void utils.groups.getChallengeRange.invalidate();
    void utils.heatmap.get.invalidate();
    void utils.stats.getDashboard.invalidate();
  };
  const setChallengeRange = trpc.groups.setChallengeRange.useMutation({
    onSuccess: (range) => {
      setRangeError(null);
      setRangeStartDate(toDateInputValue(range.startDate));
      setRangeEndDate(toDateInputValue(range.endDate));
      invalidateChallengeRange();
    },
  });
  const setChallengeThisWeek = trpc.groups.setChallengeThisWeek.useMutation({
    onSuccess: (range) => {
      setRangeError(null);
      setRangeStartDate(toDateInputValue(range.startDate));
      setRangeEndDate(toDateInputValue(range.endDate));
      invalidateChallengeRange();
    },
  });
  const setWhatsAppGroupJid = trpc.groups.setWhatsAppGroupJid.useMutation({
    onSuccess: (result) => {
      setWhatsappJidError(null);
      if (result.whatsappGroupJid !== undefined) {
        setWhatsappJidInput(result.whatsappGroupJid ?? '');
      }
      if (result.leaderboardTime !== undefined) {
        setLeaderboardTimeInput(result.leaderboardTime ?? '09:00');
      }
    },
    onError: (error) => {
      setWhatsappJidError(error.message);
    },
  });

  const challengeRange = group.data?.challengeRange ?? null;
  const rangeLength = inclusiveDayCount(rangeStartDate, rangeEndDate);
  const rangeMutationPending =
    setChallengeRange.isPending || setChallengeThisWeek.isPending;
  const heatmapLength =
    challengeRange?.lengthDays ?? heatmap.data?.cells.length ?? 0;
  const heatmapHeading =
    heatmapLength > 0 ? `${heatmapLength}-Day Heatmap` : 'Challenge Heatmap';
  const rangeSummary = useMemo(() => {
    if (!challengeRange) return 'Not set';
    return `${formatShortDate(challengeRange.startDate)} – ${formatShortDate(
      challengeRange.endDate,
    )}`;
  }, [challengeRange]);

  useEffect(() => {
    if (!challengeRange) return;
    setRangeStartDate(toDateInputValue(challengeRange.startDate));
    setRangeEndDate(toDateInputValue(challengeRange.endDate));
  }, [challengeRange]);

  useEffect(() => {
    if (group.data?.whatsappGroupJid) {
      setWhatsappJidInput(group.data.whatsappGroupJid);
    }
    if (group.data?.leaderboardTime) {
      setLeaderboardTimeInput(group.data.leaderboardTime);
    }
  }, [group.data]);

  function submitRange(startDate: string, endDate: string) {
    const lengthDays = inclusiveDayCount(startDate, endDate);

    if (!startDate || !endDate) {
      setRangeError('Choose a start and end date.');
      return;
    }

    if (lengthDays < 1) {
      setRangeError('Start date must be before or equal to end date.');
      return;
    }

    if (lengthDays > MAX_CHALLENGE_RANGE_DAYS) {
      setRangeError(
        `Challenge range cannot exceed ${MAX_CHALLENGE_RANGE_DAYS} days.`,
      );
      return;
    }

    setRangeError(null);
    setChallengeRange.mutate({
      startDate: parseDateInput(startDate),
      endDate: parseDateInput(endDate),
      timezone: getLocalTimezone(),
    });
  }

  function setCurrentMonth() {
    const monthRange = getCurrentMonthRange();
    const startDate = toDateInputValue(monthRange.startDate);
    const endDate = toDateInputValue(monthRange.endDate);
    setRangeStartDate(startDate);
    setRangeEndDate(endDate);
    submitRange(startDate, endDate);
  }

  if (group.isLoading || heatmap.isLoading) {
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

      {regenerateInvite.error && (
        <p className="text-sm text-[var(--accent-red)]">
          {regenerateInvite.error.message}
        </p>
      )}

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2
              className="text-lg uppercase tracking-wider text-[var(--text-muted)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              Challenge Range
            </h2>
            <p className="mt-1 text-sm text-[var(--text-primary)]">
              {rangeSummary}
            </p>
          </div>
          {challengeRange ? (
            <span
              className="rounded border border-[var(--border)] px-2 py-1 text-xs uppercase tracking-wider text-[var(--text-muted)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {challengeRange.lengthDays} days
            </span>
          ) : null}
        </div>

        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            submitRange(rangeStartDate, rangeEndDate);
          }}
        >
          <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] [font-family:var(--font-mono)]">
            <span>Start date</span>
            <input
              type="date"
              value={rangeStartDate}
              onChange={(event) => setRangeStartDate(event.target.value)}
              className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </label>
          <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] [font-family:var(--font-mono)]">
            <span>End date</span>
            <input
              type="date"
              value={rangeEndDate}
              onChange={(event) => setRangeEndDate(event.target.value)}
              className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </label>
          <button
            type="submit"
            disabled={rangeMutationPending}
            className="self-end rounded bg-[var(--accent-red)] px-4 py-2 text-sm font-medium text-[var(--text-on-accent)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save range
          </button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={rangeMutationPending}
            onClick={() => setChallengeThisWeek.mutate()}
            className="rounded border border-[var(--border)] px-3 py-1.5 text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent-red)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            This week
          </button>
          <button
            type="button"
            disabled={rangeMutationPending}
            onClick={setCurrentMonth}
            className="rounded border border-[var(--border)] px-3 py-1.5 text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent-red)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            This month
          </button>
          {rangeLength > 0 ? (
            <span className="text-xs text-[var(--text-muted)]">
              {rangeLength} selected days
            </span>
          ) : null}
        </div>

        {(rangeError ||
          setChallengeRange.error ||
          setChallengeThisWeek.error) && (
          <p className="mt-3 text-sm text-[var(--accent-red)]">
            {rangeError ??
              setChallengeRange.error?.message ??
              setChallengeThisWeek.error?.message}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2
            className="text-lg uppercase tracking-wider text-[var(--text-muted)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {heatmapHeading}
          </h2>
          <button
            type="button"
            onClick={() => setAdminMode((m) => !m)}
            className={`rounded px-3 py-1 text-xs uppercase tracking-wider ${
              adminMode
                ? 'bg-[var(--accent-red)] text-[var(--text-on-accent)]'
                : 'border border-[var(--border)] text-[var(--text-muted)]'
            }`}
          >
            {adminMode ? 'Editing labels' : 'Edit labels'}
          </button>
        </div>

        {heatmap.isError ? (
          <QueryErrorState
            message={heatmap.error?.message}
            onRetry={() => void heatmap.refetch()}
          />
        ) : heatmap.data ? (
          <HeatmapGrid
            cells={heatmap.data.cells}
            adminMode={adminMode}
            onDayLabelEdit={(dayNumber, labelText) =>
              setDayLabel.mutate({ dayNumber, labelText })
            }
          />
        ) : null}

        {setDayLabel.error && (
          <p className="mt-2 text-sm text-[var(--accent-red)]">
            {setDayLabel.error.message}
          </p>
        )}

        <p className="mt-4 text-xs text-[var(--text-muted)]">
          Hover cells for details. Toggle edit mode to set group-wide day
          labels.
        </p>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2
          className="text-lg uppercase tracking-wider text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          WhatsApp Leaderboard
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Send a daily leaderboard to your WhatsApp group. Add the group's
          remote JID and set a send time.
        </p>

        <form
          className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            const jid = whatsappJidInput.trim() || null;
            if (jid && !jid.includes('@g.us')) {
              setWhatsappJidError(
                'Group JID should end with @g.us (e.g. 123456789-123456@g.us)',
              );
              return;
            }
            setWhatsAppGroupJid.mutate({
              whatsappGroupJid: jid,
              leaderboardTime: leaderboardTimeInput,
            });
          }}
        >
          <label className="space-y-1 text-xs uppercase tracking-wider text-[var(--text-muted)]">
            <span>WhatsApp Group JID</span>
            <input
              type="text"
              value={whatsappJidInput}
              onChange={(event) => setWhatsappJidInput(event.target.value)}
              placeholder="123456789-123456@g.us"
              className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </label>
          <label className="space-y-1 text-xs uppercase tracking-wider text-[var(--text-muted)]">
            <span>Send time</span>
            <input
              type="time"
              value={leaderboardTimeInput}
              onChange={(event) => setLeaderboardTimeInput(event.target.value)}
              className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </label>
          <button
            type="submit"
            disabled={setWhatsAppGroupJid.isPending}
            className="self-end rounded bg-[var(--accent-red)] px-4 py-2 text-sm font-medium text-[var(--text-on-accent)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>
        </form>

        {whatsappJidError && (
          <p className="mt-2 text-sm text-[var(--accent-red)]">
            {whatsappJidError}
          </p>
        )}

        {setWhatsAppGroupJid.error && !whatsappJidError && (
          <p className="mt-2 text-sm text-[var(--accent-red)]">
            {setWhatsAppGroupJid.error.message}
          </p>
        )}

        {setWhatsAppGroupJid.isSuccess && !whatsappJidInput && (
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Leaderboard is disabled for this group. Set a JID to enable daily
            updates.
          </p>
        )}

        {whatsappJidInput && (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Leaderboard will send daily at {leaderboardTimeInput} to{' '}
            {whatsappJidInput}
          </p>
        )}
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
