import { useState, type FormEvent } from 'react';
import {
  updateActivityInputSchema,
  type ActivityEditorRow,
  type SubPointConfigInput,
  type TierConfigInput,
  type UpdateActivityInput,
} from '@workspace-starter/types';
import {
  fieldInputClass,
  fieldLabelClass,
  fieldSelectClass,
  primaryButtonClass,
  secondaryButtonClass,
} from './form-styles';

function formatZodErrors(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.') || 'form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

type BuiltinActivityEditorProps = {
  activity: ActivityEditorRow;
  onSave: (data: UpdateActivityInput) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
};

export function BuiltinActivityEditor({
  activity,
  onSave,
  onCancel,
  isSubmitting = false,
}: BuiltinActivityEditorProps) {
  const [title, setTitle] = useState(activity.title);
  const [emoji, setEmoji] = useState(activity.emoji ?? '');
  const [deductMultiplier, setDeductMultiplier] = useState<'2' | '3'>(
    activity.deductMultiplier === 3 ? '3' : '2',
  );
  const [sortOrder, setSortOrder] = useState(String(activity.sortOrder));
  const [subPoints, setSubPoints] = useState<SubPointConfigInput[]>(
    activity.subPoints ?? [],
  );
  const [tiers, setTiers] = useState<TierConfigInput[]>(activity.tiers ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload: UpdateActivityInput = {
      activityId: activity.id,
      title: title.trim() !== activity.title ? title.trim() : undefined,
      emoji: emoji.trim() || null,
      deductMultiplier: Number(deductMultiplier) as 2 | 3,
      sortOrder: Number.parseInt(sortOrder, 10),
    };

    if (activity.kind === 'SUBPOINTS') {
      payload.subPoints = subPoints;
    }
    if (activity.kind === 'TIERED') {
      payload.tiers = tiers;
    }

    const result = updateActivityInputSchema.safeParse(payload);
    if (!result.success) {
      setErrors(formatZodErrors(result.error.issues));
      return;
    }
    setErrors({});
    onSave(result.data);
  }

  const err = (key: string) => errors[key];

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <label
            className={fieldLabelClass}
            htmlFor={`edit-title-${activity.id}`}
          >
            Title
          </label>
          <input
            id={`edit-title-${activity.id}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={fieldInputClass}
          />
          {err('title') && (
            <p className="mt-1 text-xs text-[var(--accent-red)]">
              {err('title')}
            </p>
          )}
        </div>
        <div className="sm:w-24">
          <label
            className={fieldLabelClass}
            htmlFor={`edit-emoji-${activity.id}`}
          >
            Emoji
          </label>
          <input
            id={`edit-emoji-${activity.id}`}
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            className={fieldInputClass}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            className={fieldLabelClass}
            htmlFor={`edit-deduct-${activity.id}`}
          >
            Deduct multiplier
          </label>
          <select
            id={`edit-deduct-${activity.id}`}
            value={deductMultiplier}
            onChange={(e) => setDeductMultiplier(e.target.value as '2' | '3')}
            className={fieldSelectClass}
          >
            <option value="2">2×</option>
            <option value="3">3×</option>
          </select>
        </div>
        <div>
          <label
            className={fieldLabelClass}
            htmlFor={`edit-sort-${activity.id}`}
          >
            Sort order
          </label>
          <input
            id={`edit-sort-${activity.id}`}
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className={fieldInputClass}
          />
        </div>
      </div>

      {activity.kind === 'SUBPOINTS' && (
        <div className="space-y-3">
          <p className={fieldLabelClass}>Sub-points</p>
          {subPoints.map((sp, idx) => (
            <div
              key={sp.key}
              className="grid gap-2 rounded border border-[var(--border)] p-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <input
                value={sp.label}
                onChange={(e) => {
                  const next = [...subPoints];
                  next[idx] = { ...sp, label: e.target.value };
                  setSubPoints(next);
                }}
                placeholder="Label"
                className={fieldInputClass}
              />
              <input
                type="number"
                min={0}
                value={sp.xp}
                onChange={(e) => {
                  const next = [...subPoints];
                  next[idx] = {
                    ...sp,
                    xp: Number.parseInt(e.target.value, 10) || 0,
                  };
                  setSubPoints(next);
                }}
                placeholder="XP"
                className={fieldInputClass}
              />
              <span className="self-center text-xs text-[var(--text-muted)]">
                {sp.key}
              </span>
            </div>
          ))}
          {err('subPoints') && (
            <p className="text-xs text-[var(--accent-red)]">
              {err('subPoints')}
            </p>
          )}
        </div>
      )}

      {activity.kind === 'TIERED' && (
        <div className="space-y-3">
          <p className={fieldLabelClass}>Tiers</p>
          {tiers.map((tier, idx) => (
            <div
              key={tier.key}
              className="grid gap-2 rounded border border-[var(--border)] p-3 sm:grid-cols-[1fr_1fr_auto_auto]"
            >
              <input
                value={tier.label}
                onChange={(e) => {
                  const next = [...tiers];
                  next[idx] = { ...tier, label: e.target.value };
                  setTiers(next);
                }}
                placeholder="Label"
                className={fieldInputClass}
              />
              <input
                type="number"
                min={0}
                value={tier.xp}
                onChange={(e) => {
                  const next = [...tiers];
                  next[idx] = {
                    ...tier,
                    xp: Number.parseInt(e.target.value, 10) || 0,
                  };
                  setTiers(next);
                }}
                placeholder="XP"
                className={fieldInputClass}
              />
              <input
                type="number"
                min={0}
                value={tier.maxMinutes ?? ''}
                onChange={(e) => {
                  const next = [...tiers];
                  const raw = e.target.value;
                  next[idx] = {
                    ...tier,
                    maxMinutes: raw === '' ? null : Number.parseInt(raw, 10),
                  };
                  setTiers(next);
                }}
                placeholder="Max min"
                className={fieldInputClass}
              />
              <span className="self-center text-xs text-[var(--text-muted)]">
                {tier.key}
              </span>
            </div>
          ))}
          {err('tiers') && (
            <p className="text-xs text-[var(--accent-red)]">{err('tiers')}</p>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className={primaryButtonClass}
        >
          {isSubmitting ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={secondaryButtonClass}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

type CustomActivityEditFormProps = {
  activity: ActivityEditorRow;
  onSave: (data: UpdateActivityInput) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
};

export function CustomActivityEditForm({
  activity,
  onSave,
  onCancel,
  isSubmitting = false,
}: CustomActivityEditFormProps) {
  const [title, setTitle] = useState(activity.title);
  const [emoji, setEmoji] = useState(activity.emoji ?? '');
  const [deductMultiplier, setDeductMultiplier] = useState<'2' | '3'>(
    activity.deductMultiplier === 3 ? '3' : '2',
  );
  const [sortOrder, setSortOrder] = useState(String(activity.sortOrder));
  const [xpComplete, setXpComplete] = useState(
    String(activity.xpComplete ?? 0),
  );
  const [xpMiss, setXpMiss] = useState(String(activity.xpMiss ?? 0));
  const [unitLabel, setUnitLabel] = useState(activity.unitLabel ?? '');
  const [xpPerUnit, setXpPerUnit] = useState(String(activity.xpPerUnit ?? 0));
  const [xpCap, setXpCap] = useState(String(activity.xpCap ?? 0));
  const [missXp, setMissXp] = useState(String(activity.missXp ?? 0));
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload: UpdateActivityInput = {
      activityId: activity.id,
      title: title.trim(),
      emoji: emoji.trim() || null,
      deductMultiplier: Number(deductMultiplier) as 2 | 3,
      sortOrder: Number.parseInt(sortOrder, 10),
    };

    if (activity.kind === 'CHECKBOX') {
      payload.xpComplete = Number.parseInt(xpComplete, 10);
      payload.xpMiss = Number.parseInt(xpMiss, 10);
    } else if (activity.kind === 'NUMBER') {
      payload.unitLabel = unitLabel.trim();
      payload.xpPerUnit = Number.parseFloat(xpPerUnit);
      payload.xpCap = Number.parseInt(xpCap, 10);
      payload.missXp = Number.parseInt(missXp, 10);
    }

    const result = updateActivityInputSchema.safeParse(payload);
    if (!result.success) {
      setErrors(formatZodErrors(result.error.issues));
      return;
    }
    setErrors({});
    onSave(result.data);
  }

  const err = (key: string) => errors[key];

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <label
            className={fieldLabelClass}
            htmlFor={`edit-title-${activity.id}`}
          >
            Title
          </label>
          <input
            id={`edit-title-${activity.id}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={fieldInputClass}
          />
          {err('title') && (
            <p className="mt-1 text-xs text-[var(--accent-red)]">
              {err('title')}
            </p>
          )}
        </div>
        <div className="sm:w-24">
          <label
            className={fieldLabelClass}
            htmlFor={`edit-emoji-${activity.id}`}
          >
            Emoji
          </label>
          <input
            id={`edit-emoji-${activity.id}`}
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            className={fieldInputClass}
          />
        </div>
      </div>

      {activity.kind === 'CHECKBOX' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={fieldLabelClass}>XP on complete</label>
            <input
              type="number"
              min={0}
              value={xpComplete}
              onChange={(e) => setXpComplete(e.target.value)}
              className={fieldInputClass}
            />
            {err('xpComplete') && (
              <p className="mt-1 text-xs text-[var(--accent-red)]">
                {err('xpComplete')}
              </p>
            )}
          </div>
          <div>
            <label className={fieldLabelClass}>XP on miss (≤ 0)</label>
            <input
              type="number"
              max={0}
              value={xpMiss}
              onChange={(e) => setXpMiss(e.target.value)}
              className={fieldInputClass}
            />
            {err('xpMiss') && (
              <p className="mt-1 text-xs text-[var(--accent-red)]">
                {err('xpMiss')}
              </p>
            )}
          </div>
        </div>
      )}

      {activity.kind === 'NUMBER' && (
        <div className="space-y-4">
          <div>
            <label className={fieldLabelClass}>Unit label</label>
            <input
              value={unitLabel}
              onChange={(e) => setUnitLabel(e.target.value)}
              className={fieldInputClass}
            />
            {err('unitLabel') && (
              <p className="mt-1 text-xs text-[var(--accent-red)]">
                {err('unitLabel')}
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={fieldLabelClass}>XP per unit</label>
              <input
                type="number"
                min={0}
                step="any"
                value={xpPerUnit}
                onChange={(e) => setXpPerUnit(e.target.value)}
                className={fieldInputClass}
              />
            </div>
            <div>
              <label className={fieldLabelClass}>XP cap</label>
              <input
                type="number"
                min={1}
                value={xpCap}
                onChange={(e) => setXpCap(e.target.value)}
                className={fieldInputClass}
              />
            </div>
            <div>
              <label className={fieldLabelClass}>Miss XP (≤ 0)</label>
              <input
                type="number"
                max={0}
                value={missXp}
                onChange={(e) => setMissXp(e.target.value)}
                className={fieldInputClass}
              />
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={fieldLabelClass}>Deduct multiplier</label>
          <select
            value={deductMultiplier}
            onChange={(e) => setDeductMultiplier(e.target.value as '2' | '3')}
            className={fieldSelectClass}
          >
            <option value="2">2×</option>
            <option value="3">3×</option>
          </select>
        </div>
        <div>
          <label className={fieldLabelClass}>Sort order</label>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className={fieldInputClass}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className={primaryButtonClass}
        >
          {isSubmitting ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={secondaryButtonClass}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
