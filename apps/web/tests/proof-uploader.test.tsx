import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProofUploader } from '@workspace-starter/ui';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProofUploader', () => {
  it('keeps the default upload label and file picker behavior', () => {
    render(
      <ProofUploader
        uploadUrl="http://localhost:3001/api/uploads"
        authToken="test-token"
        onUploaded={vi.fn()}
      />,
    );

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).not.toHaveAttribute('capture');
    expect(
      screen.getByRole('button', { name: 'Upload photo proof' }),
    ).toBeInTheDocument();
  });

  it('uses camera capture labels when capture mode is enabled', () => {
    const { rerender } = render(
      <ProofUploader
        uploadUrl="http://localhost:3001/api/uploads"
        authToken="test-token"
        capture="environment"
        onUploaded={vi.fn()}
      />,
    );

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).toHaveAttribute('capture', 'environment');
    expect(
      screen.getByRole('button', { name: 'Capture proof' }),
    ).toBeInTheDocument();

    rerender(
      <ProofUploader
        uploadUrl="http://localhost:3001/api/uploads"
        authToken="test-token"
        capture="environment"
        value="https://cdn.example.com/proof.jpg"
        onUploaded={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Retake proof' }),
    ).toBeInTheDocument();
  });

  it('shows inline error when upload fails', async () => {
    const onError = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'File too large' }),
      }),
    );

    render(
      <ProofUploader
        uploadUrl="http://localhost:3001/api/uploads"
        authToken="test-token"
        onUploaded={vi.fn()}
        onError={onError}
      />,
    );

    const file = new File(['image'], 'proof.jpg', { type: 'image/jpeg' });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText('File too large')).toBeInTheDocument();
    });
    expect(onError).toHaveBeenCalledWith('File too large');
  });

  it('clears a prior inline error on a successful retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: 'File too large' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ url: '/uploads/ok.jpg' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          blob: async () => new Blob(['image'], { type: 'image/jpeg' }),
        }),
    );
    const onUploaded = vi.fn();

    render(
      <ProofUploader
        uploadUrl="http://localhost:3001/api/uploads"
        authToken="test-token"
        onUploaded={onUploaded}
      />,
    );

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    // First (failing) attempt.
    await userEvent.upload(
      input,
      new File(['image'], 'proof.jpg', { type: 'image/jpeg' }),
    );
    await waitFor(() => {
      expect(screen.getByText('File too large')).toBeInTheDocument();
    });

    // Second attempt with a different file so the input fires onChange again.
    await userEvent.upload(
      input,
      new File(['image2'], 'proof2.jpg', { type: 'image/jpeg' }),
    );
    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledWith('/uploads/ok.jpg');
    });
    expect(screen.queryByText('File too large')).not.toBeInTheDocument();
  });

  it('shows inline error when not authenticated', async () => {
    const onError = vi.fn();

    render(
      <ProofUploader
        uploadUrl="http://localhost:3001/api/uploads"
        authToken={null}
        onUploaded={vi.fn()}
        onError={onError}
      />,
    );

    const file = new File(['image'], 'proof.jpg', { type: 'image/jpeg' });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await userEvent.upload(input, file);

    expect(screen.getByText('Not authenticated')).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith('Not authenticated');
  });
});
