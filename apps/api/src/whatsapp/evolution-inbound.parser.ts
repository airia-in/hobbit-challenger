import {
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';
import {
  replyKindFromButtonId,
  replyKindFromText,
} from './interactive-checkin.constants';
import type { ParsedEvolutionInbound } from './evolution-inbound.types';
import { evolutionWebhookEnvelopeSchema } from './evolution-inbound.types';

const GROUP_JID_SUFFIX = '@g.us';
const WHATSAPP_JID_SUFFIX = '@s.whatsapp.net';
const LID_JID_SUFFIX = '@lid';

export const MAX_WEBHOOK_BODY_BYTES = 65_536;
export const WEBHOOK_MESSAGE_MAX_AGE_MS = 15 * 60 * 1000;
export const WEBHOOK_MESSAGE_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

type JidToE164Options = {
  defaultRegion?: CountryCode;
  senderPn?: string;
  remoteJidAlt?: string;
};

function digitsToE164(
  digits: string,
  defaultRegion?: CountryCode,
): string | null {
  if (!digits) {
    return null;
  }

  const withPlus = digits.startsWith('+') ? digits : `+${digits}`;
  const international = parsePhoneNumberFromString(withPlus);
  if (international?.isValid()) {
    return international.format('E.164');
  }

  if (defaultRegion) {
    const national = parsePhoneNumberFromString(digits, defaultRegion);
    if (national?.isValid()) {
      return national.format('E.164');
    }
  }

  return null;
}

function resolveWhatsAppJid(
  remoteJid: string,
  options?: Pick<JidToE164Options, 'senderPn' | 'remoteJidAlt'>,
): string | null {
  const bare = remoteJid.split(':')[0] ?? remoteJid;
  if (
    bare.includes(GROUP_JID_SUFFIX) ||
    bare.includes('@broadcast') ||
    bare.includes('@status')
  ) {
    return null;
  }

  if (bare.includes(LID_JID_SUFFIX)) {
    const alt = options?.remoteJidAlt?.split(':')[0];
    if (alt && !alt.includes(LID_JID_SUFFIX)) {
      return alt;
    }
    if (options?.senderPn) {
      const senderDigits = options.senderPn.replace(/\D/g, '');
      if (senderDigits) {
        return `${senderDigits}${WHATSAPP_JID_SUFFIX}`;
      }
    }
    return null;
  }

  return bare;
}

export function jidToE164(
  remoteJid: string,
  options?: JidToE164Options,
): string | null {
  const resolvedJid = resolveWhatsAppJid(remoteJid, options);
  if (!resolvedJid) {
    return null;
  }

  let digits = resolvedJid;
  if (digits.endsWith(WHATSAPP_JID_SUFFIX)) {
    digits = digits.slice(0, -WHATSAPP_JID_SUFFIX.length);
  } else if (digits.endsWith(LID_JID_SUFFIX)) {
    digits = digits.slice(0, -LID_JID_SUFFIX.length);
  }

  digits = digits.replace(/\D/g, '');
  return digitsToE164(digits, options?.defaultRegion);
}

export function senderPnToE164(
  senderPn: string,
  defaultRegion?: CountryCode,
): string | null {
  const digits = senderPn.replace(/\D/g, '');
  return digitsToE164(digits, defaultRegion);
}

export function inferDefaultRegionFromE164(
  phoneE164: string | null | undefined,
): CountryCode | undefined {
  if (!phoneE164) {
    return undefined;
  }
  const parsed = parsePhoneNumberFromString(phoneE164);
  return parsed?.country;
}

export function isMessageTimestampFresh(
  messageTimestamp: number,
  nowMs = Date.now(),
): boolean {
  const timestampMs =
    messageTimestamp > 1_000_000_000_000
      ? messageTimestamp
      : messageTimestamp * 1000;
  const ageMs = nowMs - timestampMs;
  return (
    ageMs <= WEBHOOK_MESSAGE_MAX_AGE_MS &&
    ageMs >= -WEBHOOK_MESSAGE_MAX_FUTURE_SKEW_MS
  );
}

type EvolutionMessageBody = {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  buttonsResponseMessage?: {
    selectedButtonId?: string;
    selectedDisplayText?: string;
  };
};

function extractRawText(
  message: EvolutionMessageBody | undefined,
): string | null {
  if (!message) {
    return null;
  }

  if (message.buttonsResponseMessage?.selectedDisplayText) {
    return message.buttonsResponseMessage.selectedDisplayText;
  }
  if (message.conversation) {
    return message.conversation;
  }
  if (message.extendedTextMessage?.text) {
    return message.extendedTextMessage.text;
  }

  return null;
}

function extractButtonId(
  message: EvolutionMessageBody | undefined,
): string | null {
  if (!message) {
    return null;
  }

  return message.buttonsResponseMessage?.selectedButtonId ?? null;
}

export function parseEvolutionInbound(
  payload: unknown,
  options?: { nowMs?: number },
): ParsedEvolutionInbound | null {
  const parsed = evolutionWebhookEnvelopeSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }

  const envelope = parsed.data;
  const event = envelope.event?.toLowerCase();
  if (event && event !== 'messages.upsert') {
    return null;
  }

  const data = envelope.data;
  if (!data?.key || data.key.fromMe === true) {
    return null;
  }

  const remoteJid = data.key.remoteJid;
  const messageId = data.key.id;
  const messageTimestamp = data.messageTimestamp;
  if (!remoteJid || !messageId || messageTimestamp == null) {
    return null;
  }

  if (!isMessageTimestampFresh(messageTimestamp, options?.nowMs)) {
    return null;
  }

  const senderPhoneE164 = data.key.senderPn
    ? senderPnToE164(data.key.senderPn)
    : null;

  const phoneE164 = jidToE164(remoteJid, {
    senderPn: data.key.senderPn,
    remoteJidAlt: data.key.remoteJidAlt,
  });
  if (!phoneE164) {
    return null;
  }

  if (senderPhoneE164 && senderPhoneE164 !== phoneE164) {
    return null;
  }

  const buttonId = extractButtonId(
    data.message as EvolutionMessageBody | undefined,
  );
  const rawText = extractRawText(
    data.message as EvolutionMessageBody | undefined,
  );
  const replyKind =
    replyKindFromButtonId(buttonId ?? undefined) ??
    (rawText ? replyKindFromText(rawText) : null);

  return {
    messageId,
    phoneE164,
    senderPhoneE164,
    messageTimestamp,
    replyKind,
    rawText,
    buttonId,
  };
}
