import { useState, type FormEvent } from 'react';
import {
  DayCounter,
  HeatmapGrid,
  ProofUploader,
  StatsRow,
  StreakBadge,
  TaskCard,
  type TaskStatus,
} from '@workspace-starter/ui';
import { AuthGateInner } from '../auth/AuthGate';
import { AppShell } from '../layout/AppNav';
import { TrpcProvider } from '../TrpcProvider';
import { trpc } from '../../lib/trpc';
import { getToken } from '../../lib/auth';

const apiUrl = import.meta.env.PUBLIC_API_URL ?? 'http://localhost:3001';
const uploadUrl = `${apiUrl}/api/uploads`;

const RULES = [
  'Follow a diet — no cheat meals, no alcohol.',
  'Two 45-minute workouts per day — one must be outdoors.',
  'Drink 1 gallon (3.8L) of water daily.',
  'Read 10 pages of a non-fiction book.',
  'Take a progress photo every day.',
];

type TaskType =
  | 'DIET'
  | 'OUTDOOR_WORKOUT'
  | 'INDOOR_WORKOUT'
  | 'WATER'
  | 'READING'
  | 'PROGRESS_PHOTO';

const PHOTO_TASKS = new Set<TaskType>([
  'OUTDOOR_WORKOUT',
  'INDOOR_WORKOUT',
  'WATER',
  'PROGRESS_PHOTO',
]);

function TaskProofForm({
  task,
  canSubmit,
  onSubmit,
  isSubmitting,
}: {
  task: {
    taskType: TaskType;
    taskLogId: string | null;
    status: TaskStatus;
    proofUrl: string | null;
    proofNotes: string | null;
    bookTitle: string | null;
    pageFrom: number | null;
    pageTo: number | null;
    dietConfirmed: boolean;
    aiReason: string | null;
    canEdit: boolean;
  };
  canSubmit: boolean;
  onSubmit: (data: Record<string, unknown>) => void;
  isSubmitting: boolean;
}) {
  const [proofUrl, setProofUrl] = useState(task.proofUrl ?? '');
  const [proofNotes, setProofNotes] = useState(task.proofNotes ?? '');
  const [bookTitle, setBookTitle] = useState(task.bookTitle ?? '');
  const [pageFrom, setPageFrom] = useState(task.pageFrom?.toString() ?? '');
  const [pageTo, setPageTo] = useState(task.pageTo?.toString() ?? '');
  const [dietConfirmed, setDietConfirmed] = useState(task.dietConfirmed);
  const [error, setError] = useState<string | null>(null);

  const isLocked = !canSubmit && task.status !== 'COMPLETED';
  const isUpdate = Boolean(task.taskLogId) && task.canEdit;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const payload: Record<string, unknown> = {
      taskType: task.taskType,
    };

    if (PHOTO_TASKS.has(task.taskType)) {
      payload.proofUrl = proofUrl || undefined;
    }

    if (task.taskType === 'READING') {
      payload.bookTitle = bookTitle;
      payload.pageFrom = pageFrom ? Number(pageFrom) : undefined;
      payload.pageTo = pageTo ? Number(pageTo) : undefined;
    }

    if (task.taskType === 'DIET') {
      payload.dietConfirmed = dietConfirmed;
      if (proofUrl) payload.proofUrl = proofUrl;
    }

    if (proofNotes) payload.proofNotes = proofNotes;

    if (isUpdate) {
      payload.taskLogId = task.taskLogId;
    }

    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {task.status === 'REJECTED' && task.aiReason && (
        <p className="rounded border border-[var(--accent-red)] bg-[var(--accent-red)]/10 px-3 py-2 text-sm text-[var(--accent-red)]">
          Rejected: {task.aiReason}
          {canSubmit && (
            <span className="mt-1 block text-xs text-[var(--text-muted)]">
              Update your proof and re-submit before midnight.
            </span>
          )}
        </p>
      )}

      {task.taskType === 'READING' && (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--text-muted)]">
              Book title
            </label>
            <input
              required
              disabled={isLocked}
              value={bookTitle}
              onChange={(e) => setBookTitle(e.target.value)}
              className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--accent-red)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--text-muted)]">
                Page from
              </label>
              <input
                required
                type="number"
                min={0}
                disabled={isLocked}
                value={pageFrom}
                onChange={(e) => setPageFrom(e.target.value)}
                className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--accent-red)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--text-muted)]">
                Page to
              </label>
              <input
                required
                type="number"
                min={0}
                disabled={isLocked}
                value={pageTo}
                onChange={(e) => setPageTo(e.target.value)}
                className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] outline-none focus:border-[var(--accent-red)]"
              />
            </div>
          </div>
        </div>
      )}

      {task.taskType === 'DIET' && (
        <label className="flex items-center gap-3 text-sm text-[var(--text-primary)]">
          <input
            type="checkbox"
            disabled={isLocked}
            checked={dietConfirmed}
            onChange={(e) => setDietConfirmed(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent-red)]"
          />
          I followed my diet today — no cheat meals, no alcohol
        </label>
      )}

      {PHOTO_TASKS.has(task.taskType) && (
        <ProofUploader
          uploadUrl={uploadUrl}
          authToken={getToken()}
          value={proofUrl}
          disabled={isLocked}
          onUploaded={setProofUrl}
          onError={setError}
        />
      )}

      {task.taskType === 'DIET' && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
            Optional meal photo
          </p>
          <ProofUploader
            uploadUrl={uploadUrl}
            authToken={getToken()}
            value={proofUrl}
            disabled={isLocked}
            onUploaded={setProofUrl}
            onError={setError}
            buttonClassName="text-xs"
          />
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--text-muted)]">
          Notes (optional)
        </label>
        <textarea
          disabled={isLocked}
          value={proofNotes}
          onChange={(e) => setProofNotes(e.target.value)}
          rows={2}
          className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-red)]"
        />
      </div>

      {error && <p className="text-sm text-[var(--accent-red)]">{error}</p>}

      {!isLocked && (
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded bg-[var(--accent-red)] px-4 py-3 text-sm font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {isSubmitting
            ? 'Saving...'
            : isUpdate
              ? task.status === 'REJECTED'
                ? 'Re-submit proof'
                : 'Update proof'
              : 'Submit task'}
        </button>
      )}

      {isLocked && task.status === 'COMPLETED' && (
        <p className="text-center text-xs text-[var(--success)]">
          Task completed for today
        </p>
      )}

      {isLocked && task.status === 'OVERDUE' && (
        <p className="text-center text-xs text-[var(--accent-red)]">
          Midnight passed — this task is overdue
        </p>
      )}
    </form>
  );
}

function DashboardContent() {
  const [rulesOpen, setRulesOpen] = useState(false);
  const utils = trpc.useUtils();

  const tasksQuery = trpc.tasks.getToday.useQuery();
  const statsQuery = trpc.stats.getDashboard.useQuery();
  const heatmapQuery = trpc.heatmap.get.useQuery();

  const submitTask = trpc.tasks.submit.useMutation({
    onSuccess: () => {
      void utils.tasks.getToday.invalidate();
      void utils.stats.getDashboard.invalidate();
    },
  });

  const updateProof = trpc.tasks.updateProof.useMutation({
    onSuccess: () => {
      void utils.tasks.getToday.invalidate();
      void utils.stats.getDashboard.invalidate();
    },
  });

  if (tasksQuery.isLoading || statsQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-black)]">
        <p
          className="text-sm uppercase tracking-[0.3em] text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Loading dashboard...
        </p>
      </div>
    );
  }

  const stats = statsQuery.data;
  const tasks = tasksQuery.data;

  return (
    <div className="min-h-screen bg-[var(--bg-black)] px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <p
              className="text-2xl text-[var(--accent-red)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              DRCODE
            </p>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
              75 Hard Challenge
            </p>
          </div>
          {stats && <StreakBadge streak={stats.currentStreak} />}
        </header>

        {stats?.yesterdayFailed && (
          <div className="rounded-lg border border-[var(--accent-red)] bg-[var(--accent-red)]/10 px-4 py-3 text-center text-sm text-[var(--accent-red)]">
            You missed a task yesterday. Your streak has reset to Day 1.
          </div>
        )}

        {stats && (
          <DayCounter
            currentDay={stats.currentDay}
            startDate={stats.startDate}
            estimatedFinishDate={stats.estimatedFinishDate}
          />
        )}

        {tasks && (
          <section className="space-y-3">
            <h2
              className="text-lg uppercase tracking-wider text-[var(--text-muted)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              Today&apos;s Tasks
            </h2>
            {tasks.tasks.map((task) => (
              <TaskCard
                key={task.taskType}
                icon={task.icon}
                title={task.title}
                status={task.status as TaskStatus}
                defaultExpanded={task.status === 'REJECTED'}
              >
                <TaskProofForm
                  task={task as Parameters<typeof TaskProofForm>[0]['task']}
                  canSubmit={tasks.canSubmit}
                  isSubmitting={submitTask.isPending || updateProof.isPending}
                  onSubmit={(data) => {
                    if (data.taskLogId) {
                      updateProof.mutate({
                        taskLogId: data.taskLogId as string,
                        proofUrl: data.proofUrl as string | undefined,
                        proofNotes: data.proofNotes as string | undefined,
                        bookTitle: data.bookTitle as string | undefined,
                        pageFrom: data.pageFrom as number | undefined,
                        pageTo: data.pageTo as number | undefined,
                        dietConfirmed: data.dietConfirmed as
                          | boolean
                          | undefined,
                      });
                    } else {
                      submitTask.mutate({
                        taskType: data.taskType as TaskType,
                        proofUrl: data.proofUrl as string | undefined,
                        proofNotes: data.proofNotes as string | undefined,
                        bookTitle: data.bookTitle as string | undefined,
                        pageFrom: data.pageFrom as number | undefined,
                        pageTo: data.pageTo as number | undefined,
                        dietConfirmed: data.dietConfirmed as
                          | boolean
                          | undefined,
                      });
                    }
                  }}
                />
              </TaskCard>
            ))}
          </section>
        )}

        {stats && (
          <section>
            <h2
              className="mb-4 text-lg uppercase tracking-wider text-[var(--text-muted)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              Consistency
            </h2>
            <StatsRow
              currentStreak={stats.currentStreak}
              longestStreak={stats.longestStreak}
              totalDaysCompleted={stats.totalDaysCompleted}
              successRate={stats.successRate}
              timesRestarted={stats.timesRestarted}
            />
          </section>
        )}

        {heatmapQuery.data && (
          <section>
            <h2
              className="mb-4 text-lg uppercase tracking-wider text-[var(--text-muted)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              75-Day Progress
            </h2>
            <HeatmapGrid cells={heatmapQuery.data.cells} />
          </section>
        )}

        <section>
          <button
            type="button"
            onClick={() => setRulesOpen((open) => !open)}
            className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left text-sm uppercase tracking-wider text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            The 5 Rules
            <span className="text-[var(--text-muted)]">
              {rulesOpen ? '−' : '+'}
            </span>
          </button>
          {rulesOpen && (
            <ol className="mt-3 space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-4 text-sm text-[var(--text-muted)]">
              {RULES.map((rule) => (
                <li key={rule} className="list-decimal">
                  <span className="text-[var(--text-primary)]">{rule}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <footer className="text-center">
          <a
            href="/join"
            className="text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent-red)]"
          >
            Manage group →
          </a>
        </footer>
      </div>
    </div>
  );
}

export function DashboardPage({ currentPath }: { currentPath?: string }) {
  return (
    <TrpcProvider>
      <AuthGateInner>
        <AppShell currentPath={currentPath}>
          <DashboardContent />
        </AppShell>
      </AuthGateInner>
    </TrpcProvider>
  );
}
