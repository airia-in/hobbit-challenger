import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import {
  ProofVerifierService,
  resolveUploadFilePath,
} from '../src/services/proof-verifier.service';

const uploadDir = path.resolve('/var/app/data/uploads');

describe('resolveUploadFilePath', () => {
  it('resolves /uploads/abc.jpg inside uploadDir', () => {
    expect(resolveUploadFilePath(uploadDir, '/uploads/abc.jpg')).toBe(
      path.join(uploadDir, 'abc.jpg'),
    );
  });

  it('resolves bare abc.jpg inside uploadDir', () => {
    expect(resolveUploadFilePath(uploadDir, 'abc.jpg')).toBe(
      path.join(uploadDir, 'abc.jpg'),
    );
  });

  it('throws for path traversal via /uploads/../../../etc/passwd', () => {
    expect(() =>
      resolveUploadFilePath(uploadDir, '/uploads/../../../etc/passwd'),
    ).toThrow(/escapes upload directory/);
  });

  it('throws for http URLs', () => {
    expect(() =>
      resolveUploadFilePath(uploadDir, 'http://evil.example/x.jpg'),
    ).toThrow(/not allowed/);
  });

  it('throws for data URIs', () => {
    expect(() =>
      resolveUploadFilePath(uploadDir, 'data:image/png;base64,xx'),
    ).toThrow(/not allowed/);
  });

  it('throws when resolved path lands in a sibling directory (prefix collision)', () => {
    const siblingUploadDir = path.resolve('/tmp/uploads');
    expect(() =>
      resolveUploadFilePath(siblingUploadDir, '../uploads-evil/secret.jpg'),
    ).toThrow(/escapes upload directory/);
  });
});

describe('ProofVerifierService verifyProof fallback behavior', () => {
  function createConfig(values: Record<string, string | undefined>) {
    return {
      get: (key: string) => values[key],
    } as ConfigService;
  }

  it('keeps honor-system SKIPPED behavior when OpenAI is unconfigured', async () => {
    const service = new ProofVerifierService(createConfig({}));

    await expect(
      service.verifyProof('PROGRESS_PHOTO', '/uploads/missing.jpg'),
    ).resolves.toEqual({
      passed: true,
      confidence: 0,
      reason: 'SKIPPED',
    });
  });

  it('returns non-passing ERROR when OpenAI is configured but verification fails', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const service = new ProofVerifierService(
      createConfig({
        OPENAI_API_KEY: 'test-key',
        UPLOAD_DIR: uploadDir,
      }),
    );

    try {
      await expect(
        service.verifyProof('PROGRESS_PHOTO', '/uploads/missing.jpg'),
      ).resolves.toEqual({
        passed: false,
        confidence: 0,
        reason: 'ERROR',
      });
      expect(consoleError).toHaveBeenCalledWith(
        'Proof verification failed:',
        expect.any(Error),
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
