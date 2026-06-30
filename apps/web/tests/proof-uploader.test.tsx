import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProofUploader } from '@workspace-starter/ui';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProofUploader', () => {
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
