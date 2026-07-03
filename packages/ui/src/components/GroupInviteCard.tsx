import { useEffect, useState } from 'react';
import { cn } from '../utils/cn';

export type GroupInviteCardProps = {
  inviteUrl: string;
  groupName: string;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  className?: string;
};

function readResolvedTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light'
    : 'dark';
}

function getQrColors(theme: 'light' | 'dark'): { dark: string; light: string } {
  if (theme === 'light') {
    return { dark: '#1c1917', light: '#ffffff' };
  }
  return { dark: '#f0f0f0', light: '#111111' };
}

export function GroupInviteCard({
  inviteUrl,
  groupName,
  onRegenerate,
  isRegenerating,
  className,
}: GroupInviteCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(
    readResolvedTheme,
  );

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setResolvedTheme(readResolvedTheme());
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    import('qrcode')
      .then((QRCode) =>
        QRCode.toDataURL(inviteUrl, {
          width: 200,
          margin: 2,
          color: getQrColors(resolvedTheme),
        }),
      )
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        // QR generation is optional
      });

    return () => {
      cancelled = true;
    };
  }, [inviteUrl, resolvedTheme]);

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6',
        className,
      )}
    >
      <h3
        className="mb-1 text-2xl text-[var(--text-primary)]"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Invite to {groupName}
      </h3>
      <p className="mb-6 text-sm text-[var(--text-muted)]">
        Share this link so others can join your squad.
      </p>

      {qrDataUrl && (
        <div className="mb-6 flex justify-center">
          <img
            src={qrDataUrl}
            alt={`QR code for ${groupName} invite`}
            className="rounded border border-[var(--border)]"
            width={200}
            height={200}
          />
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <input
          readOnly
          value={inviteUrl}
          className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-muted)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        />
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)] hover:border-[var(--accent-red)]"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {onRegenerate && (
        <button
          type="button"
          onClick={onRegenerate}
          disabled={isRegenerating}
          className="text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent-red)] disabled:opacity-50"
        >
          {isRegenerating ? 'Regenerating...' : 'Regenerate invite link'}
        </button>
      )}
    </div>
  );
}
