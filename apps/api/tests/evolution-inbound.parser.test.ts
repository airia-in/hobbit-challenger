import { describe, expect, it } from 'vitest';
import {
  isMessageTimestampFresh,
  jidToE164,
  parseEvolutionInbound,
  WEBHOOK_MESSAGE_MAX_AGE_MS,
} from '../src/whatsapp/evolution-inbound.parser';
import {
  CHECKIN_BUTTON_DONE,
  CHECKIN_BUTTON_SNOOZE,
} from '../src/whatsapp/interactive-checkin.constants';

const NOW_MS = Date.UTC(2026, 6, 3, 12, 0, 0);
const NOW_SEC = Math.floor(NOW_MS / 1000);

function upsertPayload(overrides: Record<string, unknown> = {}) {
  return {
    event: 'messages.upsert',
    data: {
      key: {
        remoteJid: '919876543210@s.whatsapp.net',
        fromMe: false,
        id: 'msg-1',
      },
      message: {
        buttonsResponseMessage: {
          selectedButtonId: CHECKIN_BUTTON_DONE,
          selectedDisplayText: 'Done ✓',
        },
      },
      messageTimestamp: NOW_SEC,
      ...overrides,
    },
    ...overrides,
  };
}

describe('jidToE164', () => {
  it('normalizes WhatsApp JID to E.164', () => {
    expect(jidToE164('919876543210@s.whatsapp.net')).toBe('+919876543210');
  });

  it('returns null for group JIDs', () => {
    expect(jidToE164('120363123456789012@g.us')).toBeNull();
  });

  it('rejects @lid without senderPn or remoteJidAlt', () => {
    expect(jidToE164('69385314111689@lid')).toBeNull();
  });

  it('resolves @lid via senderPn', () => {
    expect(jidToE164('69385314111689@lid', { senderPn: '919876543210' })).toBe(
      '+919876543210',
    );
  });

  it('rejects ambiguous national numbers without default region', () => {
    expect(jidToE164('9876543210@s.whatsapp.net')).toBeNull();
  });

  it('parses ambiguous numbers with explicit default region', () => {
    expect(
      jidToE164('9876543210@s.whatsapp.net', { defaultRegion: 'IN' }),
    ).toBe('+919876543210');
  });
});

describe('isMessageTimestampFresh', () => {
  it('accepts timestamps within freshness window', () => {
    expect(isMessageTimestampFresh(NOW_SEC, NOW_MS)).toBe(true);
  });

  it('rejects stale timestamps', () => {
    const staleSec = NOW_SEC - Math.ceil(WEBHOOK_MESSAGE_MAX_AGE_MS / 1000) - 1;
    expect(isMessageTimestampFresh(staleSec, NOW_MS)).toBe(false);
  });
});

describe('parseEvolutionInbound', () => {
  it('extracts button reply', () => {
    const parsed = parseEvolutionInbound(upsertPayload(), { nowMs: NOW_MS });

    expect(parsed).toEqual({
      messageId: 'msg-1',
      phoneE164: '+919876543210',
      senderPhoneE164: null,
      messageTimestamp: NOW_SEC,
      replyKind: 'done',
      recapFocusIndex: null,
      rawText: 'Done ✓',
      buttonId: CHECKIN_BUTTON_DONE,
    });
  });

  it('maps emoji quick-log text to done', () => {
    const parsed = parseEvolutionInbound(
      {
        event: 'messages.upsert',
        data: {
          key: {
            remoteJid: '919876543210@s.whatsapp.net',
            fromMe: false,
            id: 'msg-2',
          },
          message: { conversation: '✅' },
          messageTimestamp: NOW_SEC,
        },
      },
      { nowMs: NOW_MS },
    );

    expect(parsed?.replyKind).toBe('done');
  });

  it('maps snooze text alias', () => {
    const parsed = parseEvolutionInbound(
      {
        event: 'messages.upsert',
        data: {
          key: {
            remoteJid: '919876543210@s.whatsapp.net',
            fromMe: false,
            id: 'msg-3',
          },
          message: { conversation: 'LATER' },
          messageTimestamp: NOW_SEC,
        },
      },
      { nowMs: NOW_MS },
    );

    expect(parsed?.replyKind).toBe('snooze');
  });

  it('ignores fromMe messages', () => {
    const parsed = parseEvolutionInbound(
      {
        event: 'messages.upsert',
        data: {
          key: {
            remoteJid: '919876543210@s.whatsapp.net',
            fromMe: true,
            id: 'msg-4',
          },
          message: { conversation: 'done' },
          messageTimestamp: NOW_SEC,
        },
      },
      { nowMs: NOW_MS },
    );

    expect(parsed).toBeNull();
  });

  it('ignores non-upsert events', () => {
    const parsed = parseEvolutionInbound(
      {
        event: 'connection.update',
        data: {
          key: {
            remoteJid: '919876543210@s.whatsapp.net',
            fromMe: false,
            id: 'msg-5',
          },
          messageTimestamp: NOW_SEC,
        },
      },
      { nowMs: NOW_MS },
    );

    expect(parsed).toBeNull();
  });

  it('parses snooze button id', () => {
    const parsed = parseEvolutionInbound(
      {
        event: 'messages.upsert',
        data: {
          key: {
            remoteJid: '919876543210@s.whatsapp.net',
            fromMe: false,
            id: 'msg-6',
          },
          message: {
            buttonsResponseMessage: {
              selectedButtonId: CHECKIN_BUTTON_SNOOZE,
            },
          },
          messageTimestamp: NOW_SEC,
        },
      },
      { nowMs: NOW_MS },
    );

    expect(parsed?.replyKind).toBe('snooze');
  });

  it('rejects stale messageTimestamp replays', () => {
    const parsed = parseEvolutionInbound(
      {
        event: 'messages.upsert',
        data: {
          key: {
            remoteJid: '919876543210@s.whatsapp.net',
            fromMe: false,
            id: 'msg-stale',
          },
          messageTimestamp:
            NOW_SEC - Math.ceil(WEBHOOK_MESSAGE_MAX_AGE_MS / 1000) - 30,
        },
      },
      { nowMs: NOW_MS },
    );

    expect(parsed).toBeNull();
  });

  it('rejects cross-user senderPn vs remoteJid mismatch', () => {
    const parsed = parseEvolutionInbound(
      {
        event: 'messages.upsert',
        data: {
          key: {
            remoteJid: '919876543210@s.whatsapp.net',
            senderPn: '911111111111',
            fromMe: false,
            id: 'msg-cross',
          },
          messageTimestamp: NOW_SEC,
        },
      },
      { nowMs: NOW_MS },
    );

    expect(parsed).toBeNull();
  });

  it('maps numeric recap focus replies without check-in kind', () => {
    for (const [text, index] of [
      ['1', 1],
      ['2', 2],
      ['3', 3],
    ] as const) {
      const parsed = parseEvolutionInbound(
        {
          event: 'messages.upsert',
          data: {
            key: {
              remoteJid: '919876543210@s.whatsapp.net',
              fromMe: false,
              id: `msg-focus-${index}`,
            },
            message: { conversation: text },
            messageTimestamp: NOW_SEC,
          },
        },
        { nowMs: NOW_MS },
      );

      expect(parsed?.replyKind).toBeNull();
      expect(parsed?.recapFocusIndex).toBe(index);
    }
  });

  it('does not map done text to recap focus index', () => {
    const parsed = parseEvolutionInbound(
      {
        event: 'messages.upsert',
        data: {
          key: {
            remoteJid: '919876543210@s.whatsapp.net',
            fromMe: false,
            id: 'msg-done',
          },
          message: { conversation: 'done' },
          messageTimestamp: NOW_SEC,
        },
      },
      { nowMs: NOW_MS },
    );

    expect(parsed?.replyKind).toBe('done');
    expect(parsed?.recapFocusIndex).toBeNull();
  });
});
