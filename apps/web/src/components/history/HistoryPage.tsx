import { useState } from 'react';
import { AuthGateInner } from '../auth/AuthGate';
import { AppShell } from '../layout/AppNav';
import { TrpcProvider } from '../TrpcProvider';
import { trpc } from '../../lib/trpc';

const TASK_TYPES = [
  { value: '', label: 'All tasks' },
  { value: 'DIET', label: 'Diet' },
  { value: 'OUTDOOR_WORKOUT', label: 'Outdoor Workout' },
  { value: 'INDOOR_WORKOUT', label: 'Indoor Workout' },
  { value: 'WATER', label: 'Water' },
  { value: 'READING', label: 'Reading' },
  { value: 'PROGRESS_PHOTO', label: 'Progress Photo' },
] as const;

type TaskType = Exclude<(typeof TASK_TYPES)[number]['value'], ''>;

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function HistoryContent() {
  const [taskType, setTaskType] = useState<TaskType | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filters: {
    taskType?: TaskType;
    dateFrom?: Date;
    dateTo?: Date;
  } = {};

  if (taskType) filters.taskType = taskType;
  if (dateFrom) filters.dateFrom = new Date(dateFrom);
  if (dateTo) filters.dateTo = new Date(dateTo);

  const hasFilters = Object.keys(filters).length > 0;

  const history = trpc.history.list.useQuery(hasFilters ? filters : undefined);

  const exportCsv = trpc.history.exportCsv.useQuery(
    hasFilters ? filters : undefined,
    {
      enabled: false,
    },
  );

  function handleExport() {
    void exportCsv.refetch().then((result) => {
      const csv = result.data?.csv;
      if (!csv) return;
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'drcode-history.csv';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  const entries = history.data?.entries ?? [];

  const groupedByDate = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = formatDate(entry.date);
    const list = groupedByDate.get(key) ?? [];
    list.push(entry);
    groupedByDate.set(key, list);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1
            className="text-3xl text-[var(--text-primary)] sm:text-4xl"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            History
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Your challenge timeline
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exportCsv.isFetching}
          className="w-full rounded border border-[var(--border)] px-4 py-2 text-xs uppercase tracking-wider text-[var(--text-primary)] hover:border-[var(--accent-red)] disabled:opacity-50 sm:w-auto"
        >
          {exportCsv.isFetching ? 'Exporting...' : 'Export CSV'}
        </button>
      </header>

      <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2 lg:flex lg:flex-wrap">
        <select
          value={taskType}
          onChange={(e) => setTaskType(e.target.value as TaskType | '')}
          className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] sm:w-auto"
        >
          {TASK_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] sm:w-auto"
          placeholder="From"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] sm:w-auto"
          placeholder="To"
        />
      </div>

      {history.isLoading && (
        <p className="text-center text-sm text-[var(--text-muted)]">
          Loading history...
        </p>
      )}

      <div className="space-y-4">
        {[...groupedByDate.entries()].map(([dateKey, dayEntries]) => {
          const dayResult = dayEntries.find((e) => e.type === 'day');
          const tasks = dayEntries.filter((e) => e.type === 'task');
          const failed = dayResult?.type === 'day' && !dayResult.completed;

          return (
            <div key={dateKey}>
              <div
                className={`rounded-lg border bg-[var(--surface)] p-4 ${
                  failed
                    ? 'border-l-4 border-l-[var(--accent-red)] border-[var(--border)]'
                    : 'border-[var(--border)]'
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-[var(--text-primary)]">
                    {dateKey}
                  </h3>
                  {dayResult?.type === 'day' && (
                    <span
                      className={`text-xs uppercase tracking-wider ${
                        dayResult.completed
                          ? 'text-[var(--success)]'
                          : 'text-[var(--accent-red)]'
                      }`}
                    >
                      Day {dayResult.dayNumber} ·{' '}
                      {dayResult.completed ? 'Complete' : 'Failed'}
                    </span>
                  )}
                </div>

                {dayResult?.type === 'day' && dayResult.failReason && (
                  <p className="mb-3 text-xs text-[var(--accent-red)]">
                    {dayResult.failReason}
                  </p>
                )}

                {tasks.length > 0 && (
                  <ul className="space-y-2">
                    {tasks.map((task) =>
                      task.type === 'task' ? (
                        <li
                          key={task.id}
                          className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
                        >
                          <span className="text-[var(--text-primary)]">
                            {task.taskType.replace(/_/g, ' ')}
                          </span>
                          <span
                            className={`text-xs ${
                              task.isValid
                                ? 'text-[var(--success)]'
                                : 'text-[var(--accent-red)]'
                            }`}
                          >
                            {task.aiVerdict ??
                              (task.isValid ? 'Valid' : 'Invalid')}
                          </span>
                        </li>
                      ) : null,
                    )}
                  </ul>
                )}
              </div>
            </div>
          );
        })}

        {!history.isLoading && entries.length === 0 && (
          <p className="text-center text-sm text-[var(--text-muted)]">
            No history yet.
          </p>
        )}
      </div>
    </div>
  );
}

type HistoryPageProps = {
  currentPath?: string;
};

export function HistoryPage({ currentPath }: HistoryPageProps) {
  return (
    <TrpcProvider>
      <AuthGateInner>
        <AppShell currentPath={currentPath}>
          <HistoryContent />
        </AppShell>
      </AuthGateInner>
    </TrpcProvider>
  );
}
