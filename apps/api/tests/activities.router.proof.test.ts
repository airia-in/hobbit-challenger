import { describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { activitiesRouter } from '../src/trpc/routers/activities.router';
import type { Context } from '../src/trpc/context';

const USER_ID = 'user-1';
const ACTIVITY_ID = 'activity-1';

function createProofContext(
  attachProof: Context['activitiesService']['attachProof'] = vi.fn(
    async () => ({ proofUrl: '/uploads/abc-123.jpg' }),
  ),
): Context {
  return {
    req: { headers: {} } as Context['req'],
    res: {} as Context['res'],
    user: {
      id: USER_ID,
      email: null,
      phone: null,
      name: 'Test',
    },
    prisma: {} as Context['prisma'],
    authService: {} as Context['authService'],
    activitiesService: { attachProof } as Context['activitiesService'],
    guidanceService: {} as Context['guidanceService'],
  };
}

describe('activitiesRouter attachProof proofUrl validation', () => {
  it.each([
    'https://evil.com/x.jpg',
    '/uploads/../../etc/passwd',
    'data:image/png;base64,AAAA',
  ])('rejects invalid proofUrl %s with BAD_REQUEST', async (proofUrl) => {
    const caller = activitiesRouter.createCaller(createProofContext());

    await expect(
      caller.attachProof({ activityId: ACTIVITY_ID, proofUrl }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    } satisfies Partial<TRPCError>);
  });

  it('accepts a valid /uploads/ path at the Zod layer', async () => {
    const attachProof = vi.fn(async () => ({
      proofUrl: '/uploads/abc-123.jpg',
    }));
    const caller = activitiesRouter.createCaller(
      createProofContext(attachProof),
    );

    await expect(
      caller.attachProof({
        activityId: ACTIVITY_ID,
        proofUrl: '/uploads/abc-123.jpg',
      }),
    ).resolves.toBeDefined();

    expect(attachProof).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      ACTIVITY_ID,
      '/uploads/abc-123.jpg',
      undefined,
    );
  });
});
