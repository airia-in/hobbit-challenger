import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { EvolutionApiClient } from '../src/whatsapp/evolution.client';

function createClient(
  env: Record<string, string | undefined>,
): EvolutionApiClient {
  const config = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  return new EvolutionApiClient(config);
}

describe('EvolutionApiClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('isConfigured returns true when all env vars present', () => {
    const client = createClient({
      EVOLUTION_API_URL: 'https://evo.example.com',
      EVOLUTION_API_KEY: 'key',
      EVOLUTION_INSTANCE: 'inst',
    });
    expect(client.isConfigured()).toBe(true);
  });

  it('isConfigured returns false when any env var missing', () => {
    expect(
      createClient({
        EVOLUTION_API_URL: 'https://evo.example.com',
        EVOLUTION_API_KEY: 'key',
      }).isConfigured(),
    ).toBe(false);
  });

  it('sendText returns ok on success', async () => {
    const client = createClient({
      EVOLUTION_API_URL: 'https://evo.example.com',
      EVOLUTION_API_KEY: 'key',
      EVOLUTION_INSTANCE: 'inst',
    });

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as Response);

    const result = await client.sendText('+15551234567', 'Hello');
    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries once on 5xx then returns failure without throwing', async () => {
    const client = createClient({
      EVOLUTION_API_URL: 'https://evo.example.com',
      EVOLUTION_API_KEY: 'key',
      EVOLUTION_INSTANCE: 'inst',
    });

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => 'unavailable',
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => 'still down',
      } as Response);

    const result = await client.sendText('+15551234567', 'Hello');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('503');
    }
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not throw on network error', async () => {
    const client = createClient({
      EVOLUTION_API_URL: 'https://evo.example.com',
      EVOLUTION_API_KEY: 'key',
      EVOLUTION_INSTANCE: 'inst',
    });

    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network again'));

    const result = await client.sendText('+15551234567', 'Hello');
    expect(result.ok).toBe(false);
  });

  it('sendButtons posts to sendButtons endpoint', async () => {
    const client = createClient({
      EVOLUTION_API_URL: 'https://evo.example.com',
      EVOLUTION_API_KEY: 'key',
      EVOLUTION_INSTANCE: 'inst',
    });

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as Response);

    const result = await client.sendButtons('+15551234567', {
      description: 'Check in',
      footer: 'Reply DONE',
      buttons: [{ id: 'checkin:done', displayText: 'Done ✓' }],
    });

    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      'https://evo.example.com/message/sendButtons/inst',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string);
    expect(body.buttons[0].id).toBe('checkin:done');
  });

  it('sendMedia posts to sendMedia endpoint', async () => {
    const client = createClient({
      EVOLUTION_API_URL: 'https://evo.example.com',
      EVOLUTION_API_KEY: 'key',
      EVOLUTION_INSTANCE: 'inst',
    });

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 201,
    } as Response);

    const result = await client.sendMedia('+15551234567', {
      mediatype: 'image',
      mimetype: 'image/png',
      caption: 'Milestone unlocked',
      media: 'base64data',
      fileName: 'hobbit-streak_7.png',
    });

    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      'https://evo.example.com/message/sendMedia/inst',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string);
    expect(body.mediatype).toBe('image');
    expect(body.fileName).toBe('hobbit-streak_7.png');
  });

  it('sendButtons retries once on 5xx', async () => {
    const client = createClient({
      EVOLUTION_API_URL: 'https://evo.example.com',
      EVOLUTION_API_KEY: 'key',
      EVOLUTION_INSTANCE: 'inst',
    });

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: async () => 'bad',
      } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response);

    const result = await client.sendButtons('+15551234567', {
      description: 'Hi',
      buttons: [{ id: 'checkin:done', displayText: 'Done' }],
    });

    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
