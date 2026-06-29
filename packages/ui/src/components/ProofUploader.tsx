import { useRef, useState } from 'react';
import { cn } from '../utils/cn';

export type ProofUploaderProps = {
  uploadUrl: string;
  apiBaseUrl?: string;
  authToken: string | null;
  value?: string | null;
  accept?: string;
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
  onUploaded,
  onError,
  className,
  previewClassName,
  buttonClassName,
  disabled = false,
}: ProofUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(value ?? null);

  async function handleFile(file: File) {
    if (!authToken) {
      onError?.('Not authenticated');
      return;
    }

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
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  const base = apiBaseUrl ?? uploadUrl.replace(/\/api\/uploads$/, '');

  return (
    <div className={cn('space-y-3', className)}>
      {preview && (
        <img
          src={preview.startsWith('http') ? preview : `${base}${preview}`}
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
        {uploading ? 'Uploading...' : preview ? 'Replace photo' : 'Upload photo proof'}
      </button>
    </div>
  );
}
