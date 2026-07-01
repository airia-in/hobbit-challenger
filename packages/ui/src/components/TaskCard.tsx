import { useState, type FormEvent, type ReactNode } from 'react';
import { cn } from '../utils/cn';
import { NumberStepper } from './NumberStepper';
import { TierChips, type TierOption } from './TierChips';

export type TaskStatus = 'PENDING' | 'COMPLETED' | 'OVERDUE' | 'REJECTED';
export type ActivityKind = 'CHECKBOX' | 'NUMBER' | 'TIERED' | 'SUBPOINTS';
export type SubPointState = 'DONE' | 'FAILED' | 'UNLOGGED';

export type SubPointConfig = {
  key: string;
  label: string;
  xp: number;
};

export type TaskGuidanceLink = {
  label: string;
  url: string;
};

export type TaskGuidanceTips = {
  title: string;
  bullets: string[];
  links?: TaskGuidanceLink[];
};

export type TaskGuidanceSubPoint = {
  ruleBlock: string;
  tips: TaskGuidanceTips;
};

export type TaskGuidance = {
  ruleBlock: string;
  tips: TaskGuidanceTips;
  subPoints?: Record<string, TaskGuidanceSubPoint>;
};

export type GuidanceChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type GuidanceAskResult = {
  available: boolean;
  answer: string | null;
};

export type ActivityLogView = {
  state: SubPointState | null;
  value: number | null;
  tier: string | null;
  subPoints: Record<string, SubPointState> | null;
  xpAwarded: number;
  proofUrl?: string | null;
  aiVerdict?: string | null;
};

export type TaskCardProps = {
  icon: string;
  title: string;
  kind: ActivityKind;
  log: ActivityLogView | null;
  canEdit: boolean;
  xpComplete?: number;
  unitLabel?: string;
  xpPerUnit?: number;
  xpCap?: number;
  subPoints?: SubPointConfig[];
  tiers?: TierOption[];
  onMarkDone?: () => void;
  onUndo?: () => void;
  onNumberCommit?: (value: number) => void;
  onTierSelect?: (tierKey: string) => void;
  onSubPointChange?: (states: Record<string, SubPointState>) => void;
  expandedContent?: ReactNode;
  defaultExpanded?: boolean;
  guidance?: TaskGuidance;
  onAskGuidance?: (params: {
    question: string;
    history: GuidanceChatMessage[];
  }) => Promise<GuidanceAskResult>;
  disabled?: boolean;
  className?: string;
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  PENDING:
    'border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-muted)]',
  COMPLETED:
    'border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]',
  OVERDUE:
    'border-[var(--accent-red)]/30 bg-[var(--accent-red)]/10 text-[var(--accent-red)]',
  REJECTED:
    'border-[var(--accent-red)]/30 bg-[var(--accent-red)]/10 text-[var(--accent-red)]',
};

function deriveStatus(
  kind: ActivityKind,
  log: ActivityLogView | null,
  canEdit: boolean,
): TaskStatus {
  if (!log) {
    return canEdit ? 'PENDING' : 'OVERDUE';
  }

  if (kind === 'CHECKBOX') {
    if (log.state === 'DONE') return 'COMPLETED';
    if (log.state === 'FAILED') return 'REJECTED';
    return canEdit ? 'PENDING' : 'OVERDUE';
  }

  if (kind === 'NUMBER') {
    if (log.value != null && log.value > 0) return 'COMPLETED';
    if (log.state === 'FAILED') return 'REJECTED';
    return canEdit ? 'PENDING' : 'OVERDUE';
  }

  if (kind === 'TIERED') {
    if (log.tier != null) return 'COMPLETED';
    return canEdit ? 'PENDING' : 'OVERDUE';
  }

  if (kind === 'SUBPOINTS') {
    const states = log.subPoints ?? {};
    const keys = Object.keys(states);
    if (keys.length > 0) {
      const allDone = keys.every((key) => states[key] === 'DONE');
      const anyFailed = keys.some((key) => states[key] === 'FAILED');
      if (allDone) return 'COMPLETED';
      if (anyFailed && !keys.some((key) => states[key] === 'UNLOGGED')) {
        return 'REJECTED';
      }
    }
    if (log.state === 'DONE') return 'COMPLETED';
    if (log.state === 'FAILED') return 'REJECTED';
    return canEdit ? 'PENDING' : 'OVERDUE';
  }

  return canEdit ? 'PENDING' : 'OVERDUE';
}

function statusLabel(status: TaskStatus, xpAwarded: number): string {
  if (status === 'COMPLETED') {
    if (xpAwarded > 0) return `Done ✓ +${xpAwarded} XP`;
    if (xpAwarded < 0) return `Done ✓ ${xpAwarded} XP`;
    return 'Done ✓';
  }
  if (status === 'REJECTED') return 'Failed';
  if (status === 'OVERDUE') return 'Missed';
  return 'Tap to complete';
}

function hasExpandableContent(
  kind: ActivityKind,
  expandedContent?: ReactNode,
): boolean {
  return (
    kind === 'NUMBER' ||
    kind === 'TIERED' ||
    kind === 'SUBPOINTS' ||
    Boolean(expandedContent)
  );
}

function bodyTapEnabled(kind: ActivityKind): boolean {
  return kind === 'CHECKBOX' || kind === 'SUBPOINTS';
}

function GuidancePanel({
  guidance,
  subPointLabels,
  onAskGuidance,
}: {
  guidance?: TaskGuidance;
  subPointLabels?: Record<string, string>;
  onAskGuidance?: (params: {
    question: string;
    history: GuidanceChatMessage[];
  }) => Promise<GuidanceAskResult>;
}) {
  const [askOpen, setAskOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<GuidanceChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const subPointEntries = guidance?.subPoints
    ? Object.entries(guidance.subPoints)
    : [];

  async function handleAskSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || !onAskGuidance || pending) return;

    setPending(true);
    setUnavailable(false);

    try {
      const result = await onAskGuidance({ question: trimmed, history });
      if (!result.available || !result.answer) {
        setUnavailable(true);
        return;
      }

      setHistory((prev) => [
        ...prev,
        { role: 'user', content: trimmed },
        { role: 'assistant', content: result.answer as string },
      ]);
      setQuestion('');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4 text-sm text-[var(--text-muted)]">
      {guidance && (
        <>
          <div>
            <p
              className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-primary)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              Rules
            </p>
            <p className="leading-relaxed text-[var(--text-primary)]">
              {guidance.ruleBlock}
            </p>
          </div>

          {subPointEntries.length > 0 && (
            <div className="space-y-3">
              {subPointEntries.map(([key, sub]) => (
                <div
                  key={key}
                  className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2"
                >
                  <p
                    className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-primary)]"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {subPointLabels?.[key] ?? key}
                  </p>
                  <p className="leading-relaxed">{sub.ruleBlock}</p>
                </div>
              ))}
            </div>
          )}

          <div>
            <p
              className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-primary)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {guidance.tips.title}
            </p>
            <ul className="list-disc space-y-1 pl-4 leading-relaxed">
              {guidance.tips.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            {guidance.tips.links && guidance.tips.links.length > 0 && (
              <ul className="mt-2 space-y-1">
                {guidance.tips.links.map((link) => (
                  <li key={link.url}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent-red)] underline-offset-2 hover:underline"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {onAskGuidance && (
        <div className="border-t border-[var(--border)] pt-4">
          {!askOpen ? (
            <button
              type="button"
              onClick={() => setAskOpen(true)}
              className="rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-primary)] transition hover:border-[var(--accent-red)] hover:text-[var(--accent-red)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              Ask AI
            </button>
          ) : (
            <div className="space-y-3">
              <p
                className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-primary)]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                Ask AI
              </p>

              {history.length > 0 && (
                <div className="max-h-48 space-y-2 overflow-y-auto rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2">
                  {history.map((message, index) => (
                    <p
                      key={`${message.role}-${index}`}
                      className={cn(
                        'leading-relaxed',
                        message.role === 'user'
                          ? 'text-[var(--text-primary)]'
                          : 'text-[var(--text-muted)]',
                      )}
                    >
                      <span
                        className="mr-1 text-[10px] font-semibold uppercase tracking-wider"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        {message.role === 'user' ? 'You' : 'AI'}
                      </span>
                      {message.content}
                    </p>
                  ))}
                </div>
              )}

              {unavailable && (
                <p className="text-xs text-[var(--accent-red)]">
                  AI help unavailable
                </p>
              )}

              <form onSubmit={handleAskSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Ask about this activity…"
                  disabled={pending}
                  className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={pending || !question.trim()}
                  className="shrink-0 rounded border border-[var(--accent-red)] bg-[var(--accent-red)]/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-red)] transition hover:bg-[var(--accent-red)]/20 disabled:opacity-50"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {pending ? '…' : 'Send'}
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TaskCard({
  icon,
  title,
  kind,
  log,
  canEdit,
  xpComplete: _xpComplete,
  unitLabel = '',
  xpPerUnit = 0,
  xpCap = 0,
  subPoints = [],
  tiers = [],
  onMarkDone,
  onUndo,
  onNumberCommit,
  onTierSelect,
  onSubPointChange,
  expandedContent,
  defaultExpanded = false,
  guidance,
  onAskGuidance,
  disabled = false,
  className,
}: TaskCardProps) {
  const showExpand = hasExpandableContent(kind, expandedContent);
  const [expanded, setExpanded] = useState(() => defaultExpanded && showExpand);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const status = deriveStatus(kind, log, canEdit);
  const xpAwarded = log?.xpAwarded ?? 0;
  const isComplete = status === 'COMPLETED';
  const canBodyTap = bodyTapEnabled(kind) && canEdit && !disabled;

  function handleBodyTap() {
    if (!canEdit || disabled) return;
    if (isComplete) {
      onUndo?.();
      return;
    }
    if (canBodyTap) {
      onMarkDone?.();
    }
  }

  function handleSubPointToggle(key: string, next: 'DONE' | 'FAILED') {
    const current = log?.subPoints ?? {};
    const initial: Record<string, SubPointState> = {};
    for (const sp of subPoints) {
      initial[sp.key] = current[sp.key] ?? 'UNLOGGED';
    }
    const updated = { ...initial, [key]: next };
    onSubPointChange?.(updated);
  }

  const numberValue = log?.value ?? 0;
  const subPointLabels = Object.fromEntries(
    subPoints.map((sp) => [sp.key, sp.label]),
  );

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]',
        isComplete && 'border-[var(--success)]/20',
        className,
      )}
    >
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={handleBodyTap}
          disabled={!canEdit || disabled || (!isComplete && !canBodyTap)}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-3 px-4 py-4 text-left transition',
            (canBodyTap || isComplete) && canEdit && !disabled
              ? 'cursor-pointer hover:bg-[var(--surface-raised)]'
              : 'cursor-default',
            disabled && 'opacity-50',
          )}
        >
          <span className="text-2xl" aria-hidden>
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-[var(--text-primary)]">
              {title}
            </span>
            {xpAwarded !== 0 && status !== 'COMPLETED' && (
              <span className="mt-0.5 block text-xs text-[var(--success)]">
                {xpAwarded > 0 ? '+' : ''}
                {xpAwarded} XP
              </span>
            )}
          </span>
          <span
            className={cn(
              'inline-flex shrink-0 items-center whitespace-nowrap rounded-md border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide',
              STATUS_STYLES[status],
            )}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {statusLabel(status, xpAwarded)}
          </span>
        </button>

        {(guidance || onAskGuidance) && (
          <button
            type="button"
            aria-expanded={guidanceOpen}
            aria-label={guidanceOpen ? 'Hide guidance' : 'Show guidance'}
            onClick={() => setGuidanceOpen((open) => !open)}
            className={cn(
              'flex w-12 shrink-0 items-center justify-center border-l border-[var(--border)] text-base transition hover:bg-[var(--surface-raised)]',
              guidanceOpen
                ? 'text-[var(--accent-red)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
            )}
          >
            ⓘ
          </button>
        )}

        {showExpand && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            onClick={() => setExpanded((open) => !open)}
            className="flex w-12 shrink-0 items-center justify-center border-l border-[var(--border)] text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
          >
            {expanded ? '−' : '+'}
          </button>
        )}
      </div>

      {guidanceOpen && (guidance || onAskGuidance) && (
        <div className="border-t border-[var(--border)] px-4 py-4">
          <GuidancePanel
            guidance={guidance}
            subPointLabels={subPointLabels}
            onAskGuidance={onAskGuidance}
          />
        </div>
      )}

      {expanded && showExpand && (
        <div className="border-t border-[var(--border)] px-4 py-4">
          {kind === 'NUMBER' && onNumberCommit && (
            <NumberStepper
              value={numberValue}
              unitLabel={unitLabel}
              quickSteps={[0.5, 1, 2]}
              xpPerUnit={xpPerUnit}
              xpCap={xpCap}
              onChange={() => {}}
              onCommit={onNumberCommit}
              disabled={!canEdit || disabled}
            />
          )}

          {kind === 'TIERED' && onTierSelect && (
            <TierChips
              tiers={tiers}
              selectedTier={log?.tier ?? null}
              onSelect={onTierSelect}
              disabled={!canEdit || disabled}
            />
          )}

          {kind === 'SUBPOINTS' && onSubPointChange && (
            <div className="space-y-2">
              {subPoints.map((sp) => {
                const state = log?.subPoints?.[sp.key] ?? 'UNLOGGED';
                return (
                  <div
                    key={sp.key}
                    className="flex items-center justify-between gap-3 rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2"
                  >
                    <span className="text-sm text-[var(--text-primary)]">
                      {sp.label}
                      <span className="ml-2 text-xs text-[var(--success)]">
                        +{sp.xp}
                      </span>
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={!canEdit || disabled}
                        onClick={() => handleSubPointToggle(sp.key, 'DONE')}
                        className={cn(
                          'rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition disabled:opacity-50',
                          state === 'DONE'
                            ? 'bg-[var(--success)]/20 text-[var(--success)]'
                            : 'text-[var(--text-muted)] hover:text-[var(--success)]',
                        )}
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        Done
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit || disabled}
                        onClick={() => handleSubPointToggle(sp.key, 'FAILED')}
                        className={cn(
                          'rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition disabled:opacity-50',
                          state === 'FAILED'
                            ? 'bg-[var(--accent-red)]/20 text-[var(--accent-red)]'
                            : 'text-[var(--text-muted)] hover:text-[var(--accent-red)]',
                        )}
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        Failed
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {expandedContent}
        </div>
      )}

      {!showExpand && expandedContent && (
        <div className="border-t border-[var(--border)] px-4 py-4">
          {expandedContent}
        </div>
      )}
    </div>
  );
}
