import { describe, expect, it } from 'vitest';
import {
  jidToE164,
  parseEvolutionInbound,
} from '../src/whatsapp/evolution-inbound.parser';
import {
  CHECKIN_BUTTON_DONE,
  CHECKIN_BUTTON_SNOOZE,
} from '../src/whatsapp/interactive-checkin.constants';

describe('jidToE164', () => {
  it('normalizes WhatsApp JID to E.164', () => {
    expect(jidToE164('919876543210@s.whatsapp.net')).toBe('+919876543210');
  });

  it('returns null for group JIDs', () => {
    expect(jidToE164('120363123456789012@g.us')).toBeNull();
  });
});

describe('parseEvolutionInbound', () => {
  it('extracts button reply', () => {
    const parsed = parseEvolutionInbound({
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
      },
    });

    expect(parsed).toEqual({
      messageId: 'msg-1',
      phoneE164: '+919876543210',
      replyKind: 'done',
      rawText: 'Done ✓',
      buttonId: CHECKIN_BUTTON_DONE,
    });
  });

  it('maps emoji quick-log text to done', () => {
    const parsed = parseEvolutionInbound({
      event: 'messages.upsert',
      data: {
        key: {
          remoteJid: '919876543210@s.whatsapp.net',
          fromMe: false,
          id: 'msg-2',
        },
        message: { conversation: '✅' },
      },
    });

    expect(parsed?.replyKind).toBe('done');
  });

  it('maps snooze text alias', () => {
    const parsed = parseEvolutionInbound({
      event: 'messages.upsert',
      data: {
        key: {
          remoteJid: '919876543210@s.whatsapp.net',
          fromMe: false,
          id: 'msg-3',
        },
        message: { conversation: 'LATER' },
      },
    });

    expect(parsed?.replyKind).toBe('snooze');
  });

  it('ignores fromMe messages', () => {
    const parsed = parseEvolutionInbound({
      event: 'messages.upsert',
      data: {
        key: {
          remoteJid: '919876543210@s.whatsapp.net',
          fromMe: true,
          id: 'msg-4',
        },
        message: { conversation: 'done' },
      },
    });

    expect(parsed).toBeNull();
  });

  it('ignores non-upsert events', () => {
    const parsed = parseEvolutionInbound({
      event: 'connection.update',
      data: {
        key: {
          remoteJid: '919876543210@s.whatsapp.net',
          fromMe: false,
          id: 'msg-5',
        },
      },
    });

    expect(parsed).toBeNull();
  });

  it('parses snooze button id', () => {
    const parsed = parseEvolutionInbound({
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
      },
    });

    expect(parsed?.replyKind).toBe('snooze');
  });
});
