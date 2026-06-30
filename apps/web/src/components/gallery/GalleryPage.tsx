import { useMemo, useState } from 'react';
import { AuthGateInner } from '../auth/AuthGate';
import { QueryErrorState } from '../common/QueryErrorState';
import { AppShell } from '../layout/AppNav';
import { TrpcProvider } from '../TrpcProvider';
import { verdictClass } from '../../lib/ai-verdict';
import { trpc } from '../../lib/trpc';

const apiUrl = import.meta.env.PUBLIC_API_URL ?? 'http://localhost:3001';

const PROGRESS_PHOTO_SEED = 'PROGRESS_PHOTO';

type SeedKeyFilter = '' | typeof PROGRESS_PHOTO_SEED | string;

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

type LightboxPhoto = {
  src: string;
  alt: string;
  title: string;
  emoji: string | null;
  aiVerdict: string | null;
};

function Lightbox({
  photo,
  onClose,
}: {
  photo: LightboxPhoto;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Photo preview"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-10 right-0 text-sm uppercase tracking-wider text-[var(--text-primary)]"
          aria-label="Close preview"
        >
          Close
        </button>
        <img
          src={photo.src}
          alt={photo.alt}
          className="max-h-[80vh] w-full rounded-lg object-contain"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--text-primary)]">
            {photo.emoji ? `${photo.emoji} ` : ''}
            {photo.title}
          </span>
          {photo.aiVerdict && (
            <span
              className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider ${verdictClass(photo.aiVerdict)}`}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {photo.aiVerdict}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function GalleryContent() {
  const [seedKey, setSeedKey] = useState<SeedKeyFilter>(PROGRESS_PHOTO_SEED);
  const [lightbox, setLightbox] = useState<LightboxPhoto | null>(null);

  const queryInput = useMemo(() => {
    if (!seedKey) return undefined;
    return { seedKey };
  }, [seedKey]);

  const gallery = trpc.gallery.list.useQuery(queryInput);

  const days = gallery.data?.days ?? [];
  const availableFilters = gallery.data?.availableFilters ?? [];

  const otherFilters = availableFilters.filter(
    (filter) => filter.seedKey !== PROGRESS_PHOTO_SEED,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header>
        <h1
          className="text-3xl text-[var(--text-primary)] sm:text-4xl"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Photo Gallery
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Proof photos from your challenge, grouped by day
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSeedKey('')}
          className={`rounded border px-3 py-1.5 text-xs uppercase tracking-wider ${
            seedKey === ''
              ? 'border-[var(--accent-red)] bg-[var(--accent-red)]/10 text-[var(--accent-red)]'
              : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'
          }`}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          All photos
        </button>
        <button
          type="button"
          onClick={() => setSeedKey(PROGRESS_PHOTO_SEED)}
          className={`rounded border px-3 py-1.5 text-xs uppercase tracking-wider ${
            seedKey === PROGRESS_PHOTO_SEED
              ? 'border-[var(--accent-red)] bg-[var(--accent-red)]/10 text-[var(--accent-red)]'
              : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'
          }`}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Progress Photo
        </button>
        {otherFilters.map((filter) => (
          <button
            key={filter.seedKey}
            type="button"
            onClick={() => setSeedKey(filter.seedKey)}
            className={`rounded border px-3 py-1.5 text-xs uppercase tracking-wider ${
              seedKey === filter.seedKey
                ? 'border-[var(--accent-red)] bg-[var(--accent-red)]/10 text-[var(--accent-red)]'
                : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'
            }`}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {filter.emoji ? `${filter.emoji} ` : ''}
            {filter.title}
          </button>
        ))}
      </div>

      {gallery.isLoading && (
        <p className="text-center text-sm text-[var(--text-muted)]">
          Loading gallery...
        </p>
      )}

      {gallery.isError && (
        <QueryErrorState
          message={gallery.error?.message}
          onRetry={() => gallery.refetch()}
        />
      )}

      <div className="space-y-4">
        {days.map((day) => {
          const dateLabel = formatDate(day.date);
          const dayKey = String(day.date);
          const header =
            day.dayNumber != null
              ? `Day ${day.dayNumber} · ${dateLabel}`
              : dateLabel;

          return (
            <section
              key={dayKey}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <h2 className="mb-4 text-sm font-medium text-[var(--text-primary)]">
                {header}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {day.photos.map((photo) => {
                  const src = `${apiUrl}${photo.proofUrl}`;
                  return (
                    <button
                      key={photo.activityLogId}
                      type="button"
                      className="group overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] text-left"
                      onClick={() =>
                        setLightbox({
                          src,
                          alt: photo.title,
                          title: photo.title,
                          emoji: photo.emoji,
                          aiVerdict: photo.aiVerdict,
                        })
                      }
                    >
                      <img
                        src={src}
                        alt={photo.title}
                        loading="lazy"
                        className="aspect-square w-full object-cover transition group-hover:opacity-90"
                      />
                      <div className="space-y-1 p-2">
                        <p className="truncate text-xs text-[var(--text-primary)]">
                          {photo.emoji ? `${photo.emoji} ` : ''}
                          {photo.title}
                        </p>
                        {photo.aiVerdict && (
                          <span
                            className={`inline-block rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${verdictClass(photo.aiVerdict)}`}
                            style={{ fontFamily: 'var(--font-mono)' }}
                          >
                            {photo.aiVerdict}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        {!gallery.isLoading && !gallery.isError && days.length === 0 && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
            <p className="text-sm text-[var(--text-muted)]">
              No proof photos yet. Complete today&apos;s tasks and attach proof
              to see them here.
            </p>
            <a
              href="/dashboard"
              className="mt-4 inline-block text-xs uppercase tracking-wider text-[var(--accent-red)] hover:underline"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              Go to today&apos;s tasks
            </a>
          </div>
        )}
      </div>

      {lightbox && (
        <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}

type GalleryPageProps = {
  currentPath?: string;
};

export function GalleryPage({ currentPath }: GalleryPageProps) {
  return (
    <TrpcProvider>
      <AuthGateInner>
        <AppShell currentPath={currentPath}>
          <GalleryContent />
        </AppShell>
      </AuthGateInner>
    </TrpcProvider>
  );
}
