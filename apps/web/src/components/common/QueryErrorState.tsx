const DEFAULT_MESSAGE = 'Something went wrong. Please try again.';

type QueryErrorStateProps = {
  message?: string;
  onRetry?: () => void;
  className?: string;
};

export function QueryErrorState({
  message,
  onRetry,
  className,
}: QueryErrorStateProps) {
  return (
    <div className={className ?? 'text-center'}>
      <p className="text-sm text-[var(--accent-red)]">
        {message ?? DEFAULT_MESSAGE}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded border border-[var(--border)] px-4 py-2 text-sm uppercase tracking-wider text-[var(--text-primary)] hover:border-[var(--accent-red)]"
        >
          Retry
        </button>
      )}
    </div>
  );
}
