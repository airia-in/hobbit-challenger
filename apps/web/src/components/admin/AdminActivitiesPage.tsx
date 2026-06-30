import { useState } from 'react';
import type {
  ActivityEditorRow,
  CreateCustomActivityInput,
  UpdateActivityInput,
} from '@workspace-starter/types';
import { AuthGateInner } from '../auth/AuthGate';
import { AppShell } from '../layout/AppNav';
import { TrpcProvider } from '../TrpcProvider';
import { trpc } from '../../lib/trpc';
import { ActivityForm } from '../activities/ActivityForm';
import {
  BuiltinActivityEditor,
  CustomActivityEditForm,
} from '../activities/ActivityEditForms';
import { ActivityListItem } from '../activities/ActivityListItem';
import { sectionClass } from '../activities/form-styles';

function renderEditForm(
  activity: ActivityEditorRow,
  onSave: (data: UpdateActivityInput) => void,
  onCancel: () => void,
  isSubmitting: boolean,
) {
  if (activity.kind === 'SUBPOINTS' || activity.kind === 'TIERED') {
    return (
      <BuiltinActivityEditor
        activity={activity}
        onSave={onSave}
        onCancel={onCancel}
        isSubmitting={isSubmitting}
      />
    );
  }
  return (
    <CustomActivityEditForm
      activity={activity}
      onSave={onSave}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
    />
  );
}

function AdminActivitiesContent() {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const group = trpc.groups.getMine.useQuery();
  const activities = trpc.activities.listGroupActivities.useQuery(undefined, {
    enabled: Boolean(group.data?.isAdmin),
    retry: false,
  });

  const createActivity = trpc.activities.createGroupActivity.useMutation({
    onSuccess: () => {
      void utils.activities.listGroupActivities.invalidate();
      setShowCreate(false);
    },
  });

  const updateActivity = trpc.activities.updateGroupActivity.useMutation({
    onSuccess: () => {
      void utils.activities.listGroupActivities.invalidate();
      setEditingId(null);
    },
  });

  const setActive = trpc.activities.setActive.useMutation({
    onSuccess: () => {
      void utils.activities.listGroupActivities.invalidate();
      setTogglingId(null);
    },
    onError: () => setTogglingId(null),
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
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Only group admins can edit the scored activity set.
        </p>
        <a
          href="/dashboard"
          className="mt-4 inline-block text-sm text-[var(--text-muted)]"
        >
          Back to dashboard →
        </a>
      </div>
    );
  }

  function handleCreate(data: CreateCustomActivityInput) {
    createActivity.mutate(data);
  }

  function handleUpdate(data: UpdateActivityInput) {
    updateActivity.mutate(data);
  }

  function handleToggleActive(activity: ActivityEditorRow) {
    setTogglingId(activity.id);
    setActive.mutate({ activityId: activity.id, active: !activity.active });
  }

  const list = activities.data ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className="text-4xl text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Group Activities
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Scored activity set for {group.data.name}
          </p>
        </div>
        <div className="flex gap-3 text-xs uppercase tracking-wider">
          <a
            href="/admin/group"
            className="text-[var(--text-muted)] hover:text-[var(--accent-red)]"
          >
            Group admin →
          </a>
        </div>
      </header>

      <div
        className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-sm text-[var(--text-muted)]"
        role="note"
      >
        Changes apply going forward only — past day scores are not recalculated.
      </div>

      {activities.isError && (
        <p className="text-sm text-[var(--accent-red)]">
          {activities.error.message}
        </p>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2
            className="text-lg uppercase tracking-wider text-[var(--text-muted)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Activities ({list.length})
          </h2>
          {!showCreate && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="rounded bg-[var(--accent-red)] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white"
            >
              Add activity
            </button>
          )}
        </div>

        {showCreate && (
          <div className={`${sectionClass} mb-6`}>
            <h3 className="mb-4 text-sm uppercase tracking-wider text-[var(--text-muted)]">
              New activity
            </h3>
            <ActivityForm
              showSortOrder
              showDeductMultiplier
              submitLabel="Create activity"
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
          <p className="text-sm text-[var(--text-muted)]">
            Loading activities…
          </p>
        ) : (
          <ul className="space-y-4">
            {list.map((activity) => (
              <ActivityListItem
                key={activity.id}
                activity={activity}
                showBuiltinBadge
                isEditing={editingId === activity.id}
                onEdit={() => setEditingId(activity.id)}
                onCancelEdit={() => setEditingId(null)}
                onToggleActive={() => handleToggleActive(activity)}
                isToggling={togglingId === activity.id}
                editForm={renderEditForm(
                  activity,
                  handleUpdate,
                  () => setEditingId(null),
                  updateActivity.isPending,
                )}
              />
            ))}
          </ul>
        )}

        {updateActivity.error && editingId && (
          <p className="mt-2 text-sm text-[var(--accent-red)]">
            {updateActivity.error.message}
          </p>
        )}
      </section>
    </div>
  );
}

type AdminActivitiesPageProps = {
  currentPath?: string;
};

export function AdminActivitiesPage({ currentPath }: AdminActivitiesPageProps) {
  return (
    <TrpcProvider>
      <AuthGateInner>
        <AppShell currentPath={currentPath}>
          <AdminActivitiesContent />
        </AppShell>
      </AuthGateInner>
    </TrpcProvider>
  );
}
