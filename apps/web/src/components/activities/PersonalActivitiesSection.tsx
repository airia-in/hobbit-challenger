import { useState } from 'react';
import type {
  ActivityEditorRow,
  CreateCustomActivityInput,
  UpdateActivityInput,
} from '@workspace-starter/types';
import { trpc } from '../../lib/trpc';
import { ActivityForm } from './ActivityForm';
import { CustomActivityEditForm } from './ActivityEditForms';
import { sectionClass } from './form-styles';

export function PersonalActivitiesSection() {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const activities = trpc.activities.listMyPersonalActivities.useQuery();

  const createActivity = trpc.activities.createPersonalActivity.useMutation({
    onSuccess: () => {
      void utils.activities.listMyPersonalActivities.invalidate();
      setShowCreate(false);
    },
  });

  const updateActivity = trpc.activities.updatePersonalActivity.useMutation({
    onSuccess: () => {
      void utils.activities.listMyPersonalActivities.invalidate();
      setEditingId(null);
    },
  });

  const archiveActivity = trpc.activities.archivePersonalActivity.useMutation({
    onSuccess: () => {
      void utils.activities.listMyPersonalActivities.invalidate();
      setArchivingId(null);
    },
    onError: () => setArchivingId(null),
  });

  function handleCreate(data: CreateCustomActivityInput) {
    createActivity.mutate(data);
  }

  function handleUpdate(data: UpdateActivityInput) {
    updateActivity.mutate(data);
  }

  function handleArchive(activity: ActivityEditorRow) {
    if (
      !window.confirm(
        `Archive "${activity.title}"? It will be hidden from Today but history is kept.`,
      )
    ) {
      return;
    }
    setArchivingId(activity.id);
    archiveActivity.mutate({ activityId: activity.id });
  }

  const list = (activities.data ?? []).filter((a) => a.active);

  return (
    <section className={sectionClass}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm uppercase tracking-wider text-[var(--text-muted)]">
            My Activities
          </h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Personal tracking — off the group leaderboard, counts toward your
            personal XP only.
          </p>
        </div>
        {!showCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="shrink-0 rounded border border-[var(--border)] px-3 py-1 text-xs uppercase tracking-wider text-[var(--text-primary)] hover:border-[var(--accent-red)]"
          >
            Add
          </button>
        )}
      </div>

      {showCreate && (
        <div className="mb-6 rounded border border-[var(--border)] bg-[var(--surface-raised)] p-4">
          <h3 className="mb-4 text-xs uppercase tracking-wider text-[var(--text-muted)]">
            New personal activity
          </h3>
          <ActivityForm
            showSortOrder={false}
            showDeductMultiplier={false}
            submitLabel="Create"
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
            isSubmitting={createActivity.isPending}
          />
          {createActivity.error && (
            <p className="mt-2 text-sm text-[var(--accent-red)]">
              {createActivity.error.message}
            </p>
          )}
        </div>
      )}

      {activities.isLoading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          No personal activities yet. Add one to track habits just for yourself.
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((activity) => (
            <li
              key={activity.id}
              className="rounded border border-[var(--border)] bg-[var(--surface-raised)] p-4"
              data-testid={`personal-activity-${activity.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span aria-hidden>{activity.emoji ?? '•'}</span>
                  <span className="text-[var(--text-primary)]">
                    {activity.title}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {activity.kind === 'CHECKBOX' ? 'Checkbox' : 'Number'}
                  </span>
                </div>
                <div className="flex gap-2">
                  {editingId !== activity.id && (
                    <button
                      type="button"
                      onClick={() => setEditingId(activity.id)}
                      className="text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent-red)]"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleArchive(activity)}
                    disabled={archivingId === activity.id}
                    className="text-xs uppercase tracking-wider text-[var(--accent-red)] disabled:opacity-50"
                  >
                    {archivingId === activity.id ? '…' : 'Archive'}
                  </button>
                </div>
              </div>
              {editingId === activity.id && (
                <div className="mt-4 border-t border-[var(--border)] pt-4">
                  <CustomActivityEditForm
                    activity={activity}
                    onSave={handleUpdate}
                    onCancel={() => setEditingId(null)}
                    isSubmitting={updateActivity.isPending}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {updateActivity.error && editingId && (
        <p className="mt-2 text-sm text-[var(--accent-red)]">
          {updateActivity.error.message}
        </p>
      )}
    </section>
  );
}
