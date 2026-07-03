import { parsePhoneNumberFromString } from 'libphonenumber-js';
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

export function jidToE164(remoteJid: string): string | null {
  const bare = remoteJid.split(':')[0] ?? remoteJid;
  if (
    bare.includes(GROUP_JID_SUFFIX) ||
    bare.includes('@broadcast') ||
    bare.includes('@status')
  ) {
    return null;
  }

  let digits = bare;
  if (digits.endsWith(WHATSAPP_JID_SUFFIX)) {
    digits = digits.slice(0, -WHATSAPP_JID_SUFFIX.length);
  } else if (digits.endsWith(LID_JID_SUFFIX)) {
    digits = digits.slice(0, -LID_JID_SUFFIX.length);
  }

  digits = digits.replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  const withPlus = digits.startsWith('+') ? digits : `+${digits}`;
  const parsed = parsePhoneNumberFromString(withPlus, 'IN');
  if (parsed?.isValid()) {
    return parsed.format('E.164');
  }

  return withPlus;
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
  if (!remoteJid || !messageId) {
    return null;
  }

  const phoneE164 = jidToE164(remoteJid);
  if (!phoneE164) {
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
    replyKind,
    rawText,
    buttonId,
  };
}
