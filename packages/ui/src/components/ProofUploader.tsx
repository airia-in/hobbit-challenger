import { useEffect, useRef, useState } from 'react';
import { cn } from '../utils/cn';

export type ProofUploaderProps = {
  uploadUrl: string;
  apiBaseUrl?: string;
  authToken: string | null;
  value?: string | null;
  accept?: string;
  capture?: 'environment' | 'user';
  onUploaded: (url: string) => void;
  onError?: (message: string) => void;
  className?: string;
  previewClassName?: string;
  buttonClassName?: string;
  disabled?: boolean;
};

export function ProofUploader({
  uploadUrl,
  apiBaseUrl,
  authToken,
  value,
  accept = 'image/jpeg,image/png,image/webp',
  capture,
  onUploaded,
  onError,
  className,
  previewClassName,
  buttonClassName,
  disabled = false,
}: ProofUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(value ?? null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const buttonLabel = capture
    ? preview
      ? 'Retake proof'
      : 'Capture proof'
    : preview
      ? 'Replace photo'
      : 'Upload photo proof';

  const base = apiBaseUrl ?? uploadUrl.replace(/\/api\/uploads$/, '');

  // Keep the preview in sync when the controlled value changes externally
  // (e.g. parent clears it after a Remove, or sets a new one), so a stale
  // image and "Replace photo" label don't linger.
  useEffect(() => {
    setPreview(value ?? null);
  }, [value]);

  useEffect(() => {
    if (!preview) {
      setPreviewSrc(null);
      return;
    }

    if (preview.startsWith('http') && !preview.startsWith(`${base}/uploads/`)) {
      setPreviewSrc(preview);
      return;
    }

    if (!authToken) {
      setPreviewSrc(null);
      return;
    }

    const absolutePreview = preview.startsWith('http')
      ? preview
      : `${base}${preview}`;
    let objectUrl: string | null = null;
    const controller = new AbortController();

    void Promise.resolve(
      fetch(absolutePreview, {
        headers: { Authorization: `Bearer ${authToken}` },
        signal: controller.signal,
      }),
    )
      .then(async (response) => {
        if (!response?.ok) {
          throw new Error('Preview unavailable');
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        setPreviewSrc(objectUrl);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        setPreviewSrc(null);
      });

    return () => {
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [authToken, base, preview]);

  async function handleFile(file: File) {
    if (!authToken) {
      const message = 'Not authenticated';
      setError(message);
      onError?.(message);
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? 'Upload failed');
      }

      const data = (await response.json()) as { url: string };
      setPreview(data.url);
      onUploaded(data.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      onError?.(message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      {previewSrc && (
        <img
          src={previewSrc}
          alt="Proof preview"
          className={cn(
            'max-h-48 w-full rounded-lg border border-[var(--border)] object-cover',
            previewClassName,
          )}
        />
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture={capture}
        className="hidden"
        disabled={disabled || uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'w-full rounded border border-dashed border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3 text-sm text-[var(--text-muted)] transition hover:border-[var(--accent-red)] hover:text-[var(--text-primary)] disabled:opacity-50',
          buttonClassName,
        )}
      >
        {uploading ? 'Uploading...' : buttonLabel}
      </button>

      {error && (
        <p role="alert" className="text-sm text-[var(--accent-red)]">
          {error}
        </p>
      )}
    </div>
  );
}
