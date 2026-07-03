import { z } from 'zod';

const evolutionMessageKeySchema = z.object({
  remoteJid: z.string().optional(),
  remoteJidAlt: z.string().optional(),
  senderPn: z.string().optional(),
  fromMe: z.boolean().optional(),
  id: z.string().optional(),
});

const evolutionMessageBodySchema = z
  .object({
    conversation: z.string().optional(),
    extendedTextMessage: z
      .object({
        text: z.string().optional(),
      })
      .optional(),
    buttonsResponseMessage: z
      .object({
        selectedButtonId: z.string().optional(),
        selectedDisplayText: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

const evolutionInboundDataSchema = z.object({
  key: evolutionMessageKeySchema.optional(),
  message: evolutionMessageBodySchema.optional(),
  messageType: z.string().optional(),
  messageTimestamp: z.number().optional(),
});

export const evolutionWebhookEnvelopeSchema = z.object({
  event: z.string().optional(),
  instance: z.string().optional(),
  apikey: z.string().optional(),
  data: evolutionInboundDataSchema.optional(),
});

export type EvolutionWebhookEnvelope = z.infer<
  typeof evolutionWebhookEnvelopeSchema
>;

export type ParsedEvolutionInbound = {
  messageId: string;
  phoneE164: string;
  senderPhoneE164: string | null;
  messageTimestamp: number;
  replyKind: import('./interactive-checkin.constants').CheckinReplyKind | null;
  recapFocusIndex: 1 | 2 | 3 | null;
  rawText: string | null;
  buttonId: string | null;
};
