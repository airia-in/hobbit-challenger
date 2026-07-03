import { describe, expect, it } from 'vitest';
import { ActivityKind } from '@workspace-starter/db';
import type { TodayActivity } from '../src/services/activities.service';
import { pickFocusHabit } from '../src/whatsapp/interactive-checkin-focus';

function activity(
  overrides: Partial<TodayActivity> & { id: string },
): TodayActivity {
  return {
    id: overrides.id,
    seedKey: overrides.seedKey ?? null,
    title: overrides.title ?? 'Habit',
    emoji: overrides.emoji ?? null,
    kind: overrides.kind ?? ActivityKind.CHECKBOX,
    scored: overrides.scored ?? true,
    isPersonal: overrides.isPersonal ?? false,
    deductMultiplier: overrides.deductMultiplier ?? 2,
    allowsProof: overrides.allowsProof ?? false,
    autoCompleteOnProof: overrides.autoCompleteOnProof ?? false,
    log: overrides.log ?? null,
    canAttachProof: overrides.canAttachProof ?? false,
    canEdit: overrides.canEdit ?? true,
    xpComplete: overrides.xpComplete ?? 100,
    xpMiss: overrides.xpMiss ?? -100,
    ...overrides,
  };
}

describe('pickFocusHabit', () => {
  it('returns first unlogged scored habit in sort order', () => {
    const first = activity({
      id: 'a1',
      title: 'Water',
      log: {
        id: 'l1',
        state: 'DONE',
        value: null,
        tier: null,
        subPoints: null,
        xpAwarded: 10,
        proofUrl: null,
        aiVerdict: null,
      },
    });
    const second = activity({ id: 'a2', title: 'Diet' });

    expect(pickFocusHabit([first, second])?.id).toBe('a2');
  });

  it('skips personal habits', () => {
    const personal = activity({ id: 'p1', isPersonal: true });
    const scored = activity({ id: 's1' });

    expect(pickFocusHabit([personal, scored])?.id).toBe('s1');
  });

  it('returns null when all scored habits are logged', () => {
    const logged = activity({
      id: 'a1',
      log: {
        id: 'l1',
        state: 'DONE',
        value: null,
        tier: null,
        subPoints: null,
        xpAwarded: 10,
        proofUrl: null,
        aiVerdict: null,
      },
    });

    expect(pickFocusHabit([logged])).toBeNull();
  });
});
