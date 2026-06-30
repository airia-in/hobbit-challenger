import type { ReactNode } from 'react';
import type { ActivityEditorRow } from '@workspace-starter/types';
import { sectionClass } from './form-styles';

const KIND_LABELS: Record<ActivityEditorRow['kind'], string> = {
  CHECKBOX: 'Checkbox',
  NUMBER: 'Number',
  SUBPOINTS: 'Sub-points',
  TIERED: 'Tiered',
};

type ActivityListItemProps = {
  activity: ActivityEditorRow;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onToggleActive: () => void;
  isToggling?: boolean;
  editForm: ReactNode;
  showBuiltinBadge?: boolean;
};

export function ActivityListItem({
  activity,
  isEditing,
  onEdit,
  onCancelEdit,
  onToggleActive,
  isToggling = false,
  editForm,
  showBuiltinBadge = false,
}: ActivityListItemProps) {
  return (
    <li
      className={`${sectionClass} ${!activity.active ? 'opacity-60' : ''}`}
      data-testid={`activity-row-${activity.id}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xl" aria-hidden>
              {activity.emoji ?? '•'}
            </span>
            <h3 className="truncate text-lg text-[var(--text-primary)]">
              {activity.title}
            </h3>
            {!activity.active && (
              <span className="shrink-0 rounded bg-[var(--surface-raised)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                Disabled
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {KIND_LABELS[activity.kind]}
            {showBuiltinBadge && activity.seedKey && (
              <> · Built-in ({activity.seedKey})</>
            )}
            {!showBuiltinBadge && <> · Order {activity.sortOrder}</>}
            {showBuiltinBadge && <> · Order {activity.sortOrder}</>}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {!isEditing && (
            <button
              type="button"
              onClick={onEdit}
              className="rounded border border-[var(--border)] px-3 py-1 text-xs uppercase tracking-wider text-[var(--text-muted)] hover:border-[var(--accent-red)] hover:text-[var(--accent-red)]"
            >
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={onToggleActive}
            disabled={isToggling}
            className={`rounded px-3 py-1 text-xs uppercase tracking-wider disabled:opacity-50 ${
              activity.active
                ? 'border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent-red)]'
                : 'bg-[var(--accent-red)] text-white'
            }`}
          >
            {isToggling ? '…' : activity.active ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>

      {isEditing && (
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          {editForm}
          <button
            type="button"
            onClick={onCancelEdit}
            className="mt-3 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Close editor
          </button>
        </div>
      )}
    </li>
  );
}
