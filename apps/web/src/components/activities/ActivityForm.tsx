import { useState, type FormEvent } from 'react';
import {
  createCustomActivityInputSchema,
  type CreateCustomActivityInput,
} from '@workspace-starter/types';
import {
  fieldInputClass,
  fieldLabelClass,
  fieldSelectClass,
  primaryButtonClass,
  secondaryButtonClass,
} from './form-styles';

export type ActivityFormValues = {
  title: string;
  emoji: string;
  kind: CreateCustomActivityInput['kind'];
  xpComplete: string;
  xpMiss: string;
  unitLabel: string;
  xpPerUnit: string;
  xpCap: string;
  missXp: string;
  deductMultiplier: '2' | '3';
  sortOrder: string;
};

export const defaultActivityFormValues = (
  overrides?: Partial<ActivityFormValues>,
): ActivityFormValues => ({
  title: '',
  emoji: '',
  kind: 'CHECKBOX',
  xpComplete: '100',
  xpMiss: '-50',
  unitLabel: '',
  xpPerUnit: '10',
  xpCap: '100',
  missXp: '-50',
  deductMultiplier: '2',
  sortOrder: '',
  ...overrides,
});

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

function buildCreatePayload(
  values: ActivityFormValues,
): CreateCustomActivityInput {
  const sortOrder = values.sortOrder.trim()
    ? Number.parseInt(values.sortOrder, 10)
    : undefined;

  const base = {
    title: values.title.trim(),
    emoji: values.emoji.trim() || null,
    deductMultiplier: Number(values.deductMultiplier) as 2 | 3,
    ...(sortOrder !== undefined && !Number.isNaN(sortOrder)
      ? { sortOrder }
      : {}),
  };

  if (values.kind === 'CHECKBOX') {
    return {
      ...base,
      kind: 'CHECKBOX',
      xpComplete: Number.parseInt(values.xpComplete, 10),
      xpMiss: Number.parseInt(values.xpMiss, 10),
    };
  }

  return {
    ...base,
    kind: 'NUMBER',
    unitLabel: values.unitLabel.trim(),
    xpPerUnit: Number.parseFloat(values.xpPerUnit),
    xpCap: Number.parseInt(values.xpCap, 10),
    missXp: Number.parseInt(values.missXp, 10),
  };
}

type ActivityFormProps = {
  initialValues?: Partial<ActivityFormValues>;
  lockedKind?: boolean;
  showSortOrder?: boolean;
  showDeductMultiplier?: boolean;
  submitLabel?: string;
  onSubmit: (data: CreateCustomActivityInput) => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
};

export function ActivityForm({
  initialValues,
  lockedKind = false,
  showSortOrder = true,
  showDeductMultiplier = true,
  submitLabel = 'Create activity',
  onSubmit,
  onCancel,
  isSubmitting = false,
}: ActivityFormProps) {
  const [values, setValues] = useState<ActivityFormValues>(() =>
    defaultActivityFormValues(initialValues),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  function setField<K extends keyof ActivityFormValues>(
    key: K,
    value: ActivityFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      delete next.form;
      return next;
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const result = createCustomActivityInputSchema.safeParse(
      buildCreatePayload(values),
    );
    if (!result.success) {
      setErrors(formatZodErrors(result.error.issues));
      return;
    }
    setErrors({});
    onSubmit(result.data);
  }

  const err = (key: string) => errors[key];

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <label className={fieldLabelClass} htmlFor="activity-title">
            Title
          </label>
          <input
            id="activity-title"
            value={values.title}
            onChange={(e) => setField('title', e.target.value)}
            className={fieldInputClass}
            maxLength={100}
          />
          {err('title') && (
            <p className="mt-1 text-xs text-[var(--accent-red)]">
              {err('title')}
            </p>
          )}
        </div>
        <div className="sm:w-24">
          <label className={fieldLabelClass} htmlFor="activity-emoji">
            Emoji
          </label>
          <input
            id="activity-emoji"
            value={values.emoji}
            onChange={(e) => setField('emoji', e.target.value)}
            className={fieldInputClass}
            maxLength={10}
            placeholder="✅"
          />
        </div>
      </div>

      <div>
        <label className={fieldLabelClass} htmlFor="activity-kind">
          Input type
        </label>
        <select
          id="activity-kind"
          value={values.kind}
          disabled={lockedKind}
          onChange={(e) =>
            setField(
              'kind',
              e.target.value as CreateCustomActivityInput['kind'],
            )
          }
          className={fieldSelectClass}
        >
          <option value="CHECKBOX">Checkbox (done / missed)</option>
          <option value="NUMBER">Number (per-unit XP)</option>
        </select>
      </div>

      {values.kind === 'CHECKBOX' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={fieldLabelClass} htmlFor="activity-xp-complete">
              XP on complete
            </label>
            <input
              id="activity-xp-complete"
              type="number"
              min={0}
              step={1}
              value={values.xpComplete}
              onChange={(e) => setField('xpComplete', e.target.value)}
              className={fieldInputClass}
            />
            {err('xpComplete') && (
              <p className="mt-1 text-xs text-[var(--accent-red)]">
                {err('xpComplete')}
              </p>
            )}
          </div>
          <div>
            <label className={fieldLabelClass} htmlFor="activity-xp-miss">
              XP on miss (≤ 0)
            </label>
            <input
              id="activity-xp-miss"
              type="number"
              max={0}
              step={1}
              value={values.xpMiss}
              onChange={(e) => setField('xpMiss', e.target.value)}
              className={fieldInputClass}
            />
            {err('xpMiss') && (
              <p className="mt-1 text-xs text-[var(--accent-red)]">
                {err('xpMiss')}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className={fieldLabelClass} htmlFor="activity-unit-label">
              Unit label
            </label>
            <input
              id="activity-unit-label"
              value={values.unitLabel}
              onChange={(e) => setField('unitLabel', e.target.value)}
              className={fieldInputClass}
              placeholder="L, pages, min…"
            />
            {err('unitLabel') && (
              <p className="mt-1 text-xs text-[var(--accent-red)]">
                {err('unitLabel')}
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={fieldLabelClass} htmlFor="activity-xp-per-unit">
                XP per unit
              </label>
              <input
                id="activity-xp-per-unit"
                type="number"
                min={0}
                step="any"
                value={values.xpPerUnit}
                onChange={(e) => setField('xpPerUnit', e.target.value)}
                className={fieldInputClass}
              />
              {err('xpPerUnit') && (
                <p className="mt-1 text-xs text-[var(--accent-red)]">
                  {err('xpPerUnit')}
                </p>
              )}
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="activity-xp-cap">
                XP cap
              </label>
              <input
                id="activity-xp-cap"
                type="number"
                min={1}
                step={1}
                value={values.xpCap}
                onChange={(e) => setField('xpCap', e.target.value)}
                className={fieldInputClass}
              />
              {err('xpCap') && (
                <p className="mt-1 text-xs text-[var(--accent-red)]">
                  {err('xpCap')}
                </p>
              )}
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="activity-miss-xp">
                Miss XP (≤ 0)
              </label>
              <input
                id="activity-miss-xp"
                type="number"
                max={0}
                step={1}
                value={values.missXp}
                onChange={(e) => setField('missXp', e.target.value)}
                className={fieldInputClass}
              />
              {err('missXp') && (
                <p className="mt-1 text-xs text-[var(--accent-red)]">
                  {err('missXp')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {showDeductMultiplier && (
          <div>
            <label className={fieldLabelClass} htmlFor="activity-deduct">
              Deduct multiplier
            </label>
            <select
              id="activity-deduct"
              value={values.deductMultiplier}
              onChange={(e) =>
                setField('deductMultiplier', e.target.value as '2' | '3')
              }
              className={fieldSelectClass}
            >
              <option value="2">2×</option>
              <option value="3">3×</option>
            </select>
          </div>
        )}
        {showSortOrder && (
          <div>
            <label className={fieldLabelClass} htmlFor="activity-sort">
              Sort order
            </label>
            <input
              id="activity-sort"
              type="number"
              step={1}
              value={values.sortOrder}
              onChange={(e) => setField('sortOrder', e.target.value)}
              className={fieldInputClass}
              placeholder="Auto"
            />
            {err('sortOrder') && (
              <p className="mt-1 text-xs text-[var(--accent-red)]">
                {err('sortOrder')}
              </p>
            )}
          </div>
        )}
      </div>

      {errors.form && (
        <p className="text-sm text-[var(--accent-red)]">{errors.form}</p>
      )}

      {Object.keys(errors).length > 0 && (
        <div
          data-testid="form-validation-errors"
          className="sr-only"
          aria-live="polite"
        >
          {Object.entries(errors).map(([key, message]) => (
            <span key={key}>{message}</span>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className={primaryButtonClass}
        >
          {isSubmitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className={secondaryButtonClass}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
