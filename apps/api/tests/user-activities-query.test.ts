import { describe, expect, it } from 'vitest';
import { buildUserActivityOrConditions } from '../src/utils/user-activities-query';

describe('buildUserActivityOrConditions', () => {
  it('includes solo builtin scored habits when groupId is null', () => {
    const conditions = buildUserActivityOrConditions('user-1', null);

    expect(conditions).toContainEqual({
      ownerUserId: 'user-1',
      groupId: null,
      scored: true,
      isPersonal: false,
      active: true,
    });
    expect(conditions).toContainEqual({
      ownerUserId: 'user-1',
      isPersonal: true,
      active: true,
    });
  });

  it('includes group scored habits when groupId is set', () => {
    const conditions = buildUserActivityOrConditions('user-1', 'group-1');

    expect(conditions).toContainEqual({
      groupId: 'group-1',
      active: true,
      scored: true,
    });
    expect(conditions).not.toContainEqual(
      expect.objectContaining({
        groupId: null,
        scored: true,
        isPersonal: false,
      }),
    );
  });
});
