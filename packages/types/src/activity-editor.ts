import { z } from 'zod';

export const customActivityKindSchema = z.enum(['CHECKBOX', 'NUMBER']);

export const activityKindSchema = z.enum([
  'CHECKBOX',
  'NUMBER',
  'TIERED',
  'SUBPOINTS',
]);

export const deductMultiplierSchema = z.union([z.literal(2), z.literal(3)]);

const nonNegativeInt = z.number().int().min(0).finite();

/** Miss / penalty XP: input must be <= 0; stored as a negative number. */
export const negativeXpInputSchema = z.number().int().max(0).finite();

export const subPointConfigSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  xp: nonNegativeInt,
});

export const tierConfigSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  maxMinutes: z.number().finite().nullable(),
  xp: nonNegativeInt,
});

export type SubPointConfigInput = z.infer<typeof subPointConfigSchema>;
export type TierConfigInput = z.infer<typeof tierConfigSchema>;

const activityTitleSchema = z.string().min(1).max(100);
const activityEmojiSchema = z.string().max(10).nullable().optional();
const sortOrderSchema = z.number().int().finite();

const checkboxXpFieldsSchema = z.object({
  xpComplete: nonNegativeInt,
  xpMiss: negativeXpInputSchema,
});

const numberXpFieldsSchema = z.object({
  unitLabel: z.string().min(1),
  xpPerUnit: z.number().finite().positive(),
  xpCap: z.number().int().positive(),
  missXp: negativeXpInputSchema,
});

const createActivityBaseSchema = z.object({
  title: activityTitleSchema,
  emoji: activityEmojiSchema,
  deductMultiplier: deductMultiplierSchema.default(2),
  sortOrder: sortOrderSchema.optional(),
});

export const createCustomActivityInputSchema = z.discriminatedUnion('kind', [
  createActivityBaseSchema.extend({
    kind: z.literal('CHECKBOX'),
    ...checkboxXpFieldsSchema.shape,
  }),
  createActivityBaseSchema.extend({
    kind: z.literal('NUMBER'),
    ...numberXpFieldsSchema.shape,
  }),
]);

export type CreateCustomActivityInput = z.infer<
  typeof createCustomActivityInputSchema
>;

export const updateActivityInputSchema = z
  .object({
    activityId: z.string().min(1),
    title: activityTitleSchema.optional(),
    emoji: activityEmojiSchema,
    deductMultiplier: deductMultiplierSchema.optional(),
    sortOrder: sortOrderSchema.optional(),
    xpComplete: nonNegativeInt.optional(),
    xpMiss: negativeXpInputSchema.optional(),
    unitLabel: z.string().min(1).optional(),
    xpPerUnit: z.number().finite().positive().optional(),
    xpCap: z.number().int().positive().optional(),
    missXp: negativeXpInputSchema.optional(),
    subPoints: z.array(subPointConfigSchema).min(1).optional(),
    tiers: z.array(tierConfigSchema).min(1).optional(),
  })
  .refine(
    (data) => Object.keys(data).filter((k) => k !== 'activityId').length > 0,
    { message: 'At least one field must be provided to update' },
  );

export type UpdateActivityInput = z.infer<typeof updateActivityInputSchema>;

export const setActivityActiveInputSchema = z.object({
  activityId: z.string().min(1),
  active: z.boolean(),
});

export type SetActivityActiveInput = z.infer<
  typeof setActivityActiveInputSchema
>;

export const archivePersonalActivityInputSchema = z.object({
  activityId: z.string().min(1),
});

export type ArchivePersonalActivityInput = z.infer<
  typeof archivePersonalActivityInputSchema
>;

export type ActivityEditorRow = {
  id: string;
  groupId: string | null;
  ownerUserId: string | null;
  seedKey: string | null;
  title: string;
  emoji: string | null;
  kind: z.infer<typeof activityKindSchema>;
  scored: boolean;
  isPersonal: boolean;
  xpComplete: number | null;
  xpMiss: number | null;
  unitLabel: string | null;
  xpPerUnit: number | null;
  xpCap: number | null;
  missXp: number | null;
  subPoints: SubPointConfigInput[] | null;
  tiers: TierConfigInput[] | null;
  deductMultiplier: number;
  sortOrder: number;
  active: boolean;
};
