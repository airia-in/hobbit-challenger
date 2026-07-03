import { z } from 'zod';

export const recapFocusIndexSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

export type RecapFocusIndex = z.infer<typeof recapFocusIndexSchema>;

export const userRecapFocusSchema = z.object({
  targetWeekStartKey: z.string(),
  activityId: z.string(),
  activityName: z.string(),
  sourceRecapWeekStartKey: z.string(),
  chosenAt: z.string(),
});

export type UserRecapFocus = z.infer<typeof userRecapFocusSchema>;

const weeklyRecapFocusOptionSchema = z.object({
  index: recapFocusIndexSchema,
  activityId: z.string(),
  name: z.string(),
});

const weeklyRecapFocusChoiceSchema = z.object({
  index: z.number().int().min(1).max(3),
  activityId: z.string(),
  name: z.string(),
  chosenAt: z.string(),
});

export const weeklyRecapReminderMetadataSchema = z.object({
  focusOptions: z.array(weeklyRecapFocusOptionSchema),
  focusChoice: weeklyRecapFocusChoiceSchema.optional(),
});

export type WeeklyRecapReminderMetadata = z.infer<
  typeof weeklyRecapReminderMetadataSchema
>;

export function parseUserRecapFocus(value: unknown): UserRecapFocus | null {
  const parsed = userRecapFocusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseWeeklyRecapReminderMetadata(
  value: unknown,
): WeeklyRecapReminderMetadata | null {
  const parsed = weeklyRecapReminderMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
