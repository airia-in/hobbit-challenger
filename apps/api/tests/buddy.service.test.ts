import { describe, expect, it } from 'vitest';
import { Prisma } from '@workspace-starter/db';
import { TRPCError } from '@trpc/server';
import {
  cancelBuddy,
  getBuddyState,
  requestBuddy,
  respondToBuddy,
} from '../src/services/buddy.service';

type StoredUser = {
  id: string;
  name: string;
  avatarUrl: string | null;
  groupId: string | null;
  phone: string | null;
  whatsappOptIn: boolean;
};

type StoredPair = {
  id: string;
  groupId: string;
  requesterId: string;
  addresseeId: string;
  status: string;
};

function createFakePrisma(seed: { users: StoredUser[]; pairs?: StoredPair[] }) {
  const users = new Map(seed.users.map((u) => [u.id, { ...u }]));
  const pairs = new Map((seed.pairs ?? []).map((p) => [p.id, { ...p }]));
  let nextId = pairs.size + 1;
  let txChain = Promise.resolve();

  const matchWhere = (
    p: StoredPair,
    where: Record<string, unknown>,
  ): boolean => {
    for (const [key, val] of Object.entries(where)) {
      if (key === 'OR') {
        const ors = val as Array<Record<string, unknown>>;
        if (!ors.some((clause) => matchWhere(p, clause))) return false;
      } else if (key === 'status') {
        if (typeof val === 'object' && val && 'in' in val) {
          if (!(val as { in: string[] }).in.includes(p.status)) return false;
        } else if (p.status !== val) {
          return false;
        }
      } else if (typeof val === 'object' && val !== null) {
        if ('not' in val) {
          if (
            (p as Record<string, unknown>)[key] === (val as { not: string }).not
          ) {
            return false;
          }
        } else if ('in' in val) {
          if (
            !(val as { in: string[] }).in.includes(
              (p as Record<string, unknown>)[key] as string,
            )
          ) {
            return false;
          }
        } else if ((p as Record<string, unknown>)[key] !== val) {
          return false;
        }
      } else if ((p as Record<string, unknown>)[key] !== val) {
        return false;
      }
    }
    return true;
  };

  const assertActiveInvariant = (pair: StoredPair): void => {
    for (const other of pairs.values()) {
      if (other.id === pair.id || other.status !== 'ACTIVE') {
        continue;
      }
      const usersInPair = new Set([pair.requesterId, pair.addresseeId]);
      const usersInOther = new Set([other.requesterId, other.addresseeId]);
      for (const userId of usersInPair) {
        if (usersInOther.has(userId)) {
          throw new Prisma.PrismaClientKnownRequestError(
            'Unique constraint failed',
            { code: 'P2002', clientVersion: 'test' },
          );
        }
      }
    }
  };

  const pairApi = {
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      [...pairs.values()].find((p) => matchWhere(p, where)) ?? null,
    findUnique: async ({
      where,
    }: {
      where: {
        id?: string;
        requesterId_addresseeId?: {
          requesterId: string;
          addresseeId: string;
        };
      };
    }) => {
      if (where.id) return pairs.get(where.id) ?? null;
      const key = where.requesterId_addresseeId!;
      return (
        [...pairs.values()].find(
          (p) =>
            p.requesterId === key.requesterId &&
            p.addresseeId === key.addresseeId,
        ) ?? null
      );
    },
    findMany: async ({
      where,
    }: {
      where: { groupId: string; status: { in: string[] } };
    }) =>
      [...pairs.values()]
        .filter(
          (p) =>
            p.groupId === where.groupId && where.status.in.includes(p.status),
        )
        .map((p) => ({
          id: p.id,
          status: p.status,
          requester: toPerson(users.get(p.requesterId)!),
          addressee: toPerson(users.get(p.addresseeId)!),
        })),
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { status: string };
    }) => {
      const pair = pairs.get(where.id)!;
      if (data.status === 'ACTIVE') {
        assertActiveInvariant({ ...pair, status: 'ACTIVE' });
      }
      pair.status = data.status;
      return pair;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: { status: string };
    }) => {
      let count = 0;
      for (const pair of pairs.values()) {
        if (!matchWhere(pair, where)) {
          continue;
        }
        if (data.status === 'ACTIVE') {
          assertActiveInvariant({ ...pair, status: 'ACTIVE' });
        }
        pair.status = data.status;
        count += 1;
      }
      return { count };
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: {
        requesterId_addresseeId: {
          requesterId: string;
          addresseeId: string;
        };
      };
      create: StoredPair;
      update: { status: string };
    }) => {
      const key = where.requesterId_addresseeId;
      const existing = [...pairs.values()].find(
        (p) =>
          p.requesterId === key.requesterId &&
          p.addresseeId === key.addresseeId,
      );
      if (existing) {
        existing.status = update.status;
        return existing;
      }
      const id = `p${nextId++}`;
      const pair = { ...create, id };
      pairs.set(id, pair);
      return pair;
    },
  };

  const prisma = {
    _pairs: pairs,
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        users.get(where.id) ?? null,
      findMany: async ({
        where,
      }: {
        where: { groupId: string; id?: { not: string } };
      }) =>
        [...users.values()]
          .filter(
            (u) =>
              u.groupId === where.groupId &&
              (!where.id?.not || u.id !== where.id.not),
          )
          .map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl }))
          .sort((a, b) => a.name.localeCompare(b.name)),
    },
    accountabilityPair: pairApi,
    $transaction: async <T>(fn: (tx: typeof prisma) => Promise<T>) => {
      const run = txChain.then(() => fn(prisma));
      txChain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };

  return prisma;
}

function toPerson(u: StoredUser) {
  return { id: u.id, name: u.name, avatarUrl: u.avatarUrl };
}

const alex: StoredUser = {
  id: 'u1',
  name: 'Alex',
  avatarUrl: null,
  groupId: 'g1',
  phone: '+15550000001',
  whatsappOptIn: true,
};
const bo: StoredUser = {
  id: 'u2',
  name: 'Bo',
  avatarUrl: null,
  groupId: 'g1',
  phone: '+15550000002',
  whatsappOptIn: true,
};

describe('buddy.service pairing', () => {
  it('creates a pending request between group members', async () => {
    const prisma = createFakePrisma({ users: [alex, bo] });
    const result = await requestBuddy(prisma as never, 'u1', 'u2');
    expect(result.status).toBe('PENDING');
    expect([...prisma._pairs.values()][0]).toMatchObject({
      requesterId: 'u1',
      addresseeId: 'u2',
      status: 'PENDING',
    });
  });

  it('rejects requests without phone + WhatsApp opt-in (gating)', async () => {
    const prisma = createFakePrisma({
      users: [{ ...alex, whatsappOptIn: false }, bo],
    });
    await expect(requestBuddy(prisma as never, 'u1', 'u2')).rejects.toThrow(
      TRPCError,
    );
  });

  it('rejects pairing with a non-group member', async () => {
    const prisma = createFakePrisma({
      users: [alex, { ...bo, groupId: 'g2' }],
    });
    await expect(requestBuddy(prisma as never, 'u1', 'u2')).rejects.toThrow(
      /member of your group/,
    );
  });

  it('activates immediately on a reciprocal request (mutual opt-in)', async () => {
    const prisma = createFakePrisma({
      users: [alex, bo],
      pairs: [
        {
          id: 'p1',
          groupId: 'g1',
          requesterId: 'u2',
          addresseeId: 'u1',
          status: 'PENDING',
        },
      ],
    });
    const result = await requestBuddy(prisma as never, 'u1', 'u2');
    expect(result.status).toBe('ACTIVE');
    expect(prisma._pairs.get('p1')!.status).toBe('ACTIVE');
  });

  it('blocks a second buddy while one is active', async () => {
    const cat: StoredUser = { ...bo, id: 'u3', name: 'Cat' };
    const prisma = createFakePrisma({
      users: [alex, bo, cat],
      pairs: [
        {
          id: 'p1',
          groupId: 'g1',
          requesterId: 'u1',
          addresseeId: 'u2',
          status: 'ACTIVE',
        },
      ],
    });
    await expect(requestBuddy(prisma as never, 'u1', 'u3')).rejects.toThrow(
      /already have an accountability buddy/,
    );
  });

  it('blocks a second outgoing pending request', async () => {
    const cat: StoredUser = { ...bo, id: 'u3', name: 'Cat' };
    const prisma = createFakePrisma({
      users: [alex, bo, cat],
      pairs: [
        {
          id: 'p1',
          groupId: 'g1',
          requesterId: 'u1',
          addresseeId: 'u2',
          status: 'PENDING',
        },
      ],
    });
    await expect(requestBuddy(prisma as never, 'u1', 'u3')).rejects.toThrow(
      /pending buddy request/,
    );
  });

  it('accepts a pending request into an active pair', async () => {
    const prisma = createFakePrisma({
      users: [alex, bo],
      pairs: [
        {
          id: 'p1',
          groupId: 'g1',
          requesterId: 'u1',
          addresseeId: 'u2',
          status: 'PENDING',
        },
      ],
    });
    const result = await respondToBuddy(prisma as never, 'u2', 'p1', true);
    expect(result.status).toBe('ACTIVE');
  });

  it('cancels other pending requests when a pair becomes active', async () => {
    const cat: StoredUser = { ...bo, id: 'u3', name: 'Cat' };
    const prisma = createFakePrisma({
      users: [alex, bo, cat],
      pairs: [
        {
          id: 'p1',
          groupId: 'g1',
          requesterId: 'u1',
          addresseeId: 'u2',
          status: 'PENDING',
        },
        {
          id: 'p2',
          groupId: 'g1',
          requesterId: 'u1',
          addresseeId: 'u3',
          status: 'PENDING',
        },
        {
          id: 'p3',
          groupId: 'g1',
          requesterId: 'u3',
          addresseeId: 'u2',
          status: 'PENDING',
        },
      ],
    });

    await respondToBuddy(prisma as never, 'u2', 'p1', true);

    expect(prisma._pairs.get('p1')!.status).toBe('ACTIVE');
    expect(prisma._pairs.get('p2')!.status).toBe('CANCELLED');
    expect(prisma._pairs.get('p3')!.status).toBe('CANCELLED');
  });

  it('requires WhatsApp opt-in when accepting a request', async () => {
    const prisma = createFakePrisma({
      users: [{ ...bo, whatsappOptIn: false }, alex],
      pairs: [
        {
          id: 'p1',
          groupId: 'g1',
          requesterId: 'u1',
          addresseeId: 'u2',
          status: 'PENDING',
        },
      ],
    });
    await expect(
      respondToBuddy(prisma as never, 'u2', 'p1', true),
    ).rejects.toThrow(/WhatsApp reminders/);
  });

  it('allows only one concurrent accept when two pending requests target the same user', async () => {
    const cat: StoredUser = { ...bo, id: 'u3', name: 'Cat' };
    const prisma = createFakePrisma({
      users: [alex, bo, cat],
      pairs: [
        {
          id: 'p1',
          groupId: 'g1',
          requesterId: 'u2',
          addresseeId: 'u1',
          status: 'PENDING',
        },
        {
          id: 'p2',
          groupId: 'g1',
          requesterId: 'u3',
          addresseeId: 'u1',
          status: 'PENDING',
        },
      ],
    });

    const results = await Promise.allSettled([
      respondToBuddy(prisma as never, 'u1', 'p1', true),
      respondToBuddy(prisma as never, 'u1', 'p2', true),
    ]);

    const activePairs = [...prisma._pairs.values()].filter(
      (pair) => pair.status === 'ACTIVE',
    );
    expect(activePairs).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter(
        (result) =>
          result.status === 'rejected' &&
          result.reason instanceof TRPCError &&
          result.reason.code === 'CONFLICT',
      ),
    ).toHaveLength(1);
  });

  it('declines a pending request', async () => {
    const prisma = createFakePrisma({
      users: [alex, bo],
      pairs: [
        {
          id: 'p1',
          groupId: 'g1',
          requesterId: 'u1',
          addresseeId: 'u2',
          status: 'PENDING',
        },
      ],
    });
    const result = await respondToBuddy(prisma as never, 'u2', 'p1', false);
    expect(result.status).toBe('DECLINED');
  });

  it('only the addressee can respond to a request', async () => {
    const prisma = createFakePrisma({
      users: [alex, bo],
      pairs: [
        {
          id: 'p1',
          groupId: 'g1',
          requesterId: 'u1',
          addresseeId: 'u2',
          status: 'PENDING',
        },
      ],
    });
    await expect(
      respondToBuddy(prisma as never, 'u1', 'p1', true),
    ).rejects.toThrow(/No pending buddy request/);
  });

  it('cancels an active pairing', async () => {
    const prisma = createFakePrisma({
      users: [alex, bo],
      pairs: [
        {
          id: 'p1',
          groupId: 'g1',
          requesterId: 'u1',
          addresseeId: 'u2',
          status: 'ACTIVE',
        },
      ],
    });
    const result = await cancelBuddy(prisma as never, 'u2');
    expect(result.cancelled).toBe(true);
    expect(prisma._pairs.get('p1')!.status).toBe('CANCELLED');
  });

  it('reports state with member relations and eligibility', async () => {
    const cat: StoredUser = { ...bo, id: 'u3', name: 'Cat' };
    const prisma = createFakePrisma({
      users: [alex, bo, cat],
      pairs: [
        {
          id: 'p1',
          groupId: 'g1',
          requesterId: 'u1',
          addresseeId: 'u2',
          status: 'PENDING',
        },
      ],
    });
    const state = await getBuddyState(prisma as never, 'u1');
    expect(state.eligible).toBe(true);
    expect(state.outgoingRequest?.other.id).toBe('u2');
    const relations = Object.fromEntries(
      state.members.map((m) => [m.id, m.relation]),
    );
    expect(relations.u2).toBe('pending_outgoing');
    expect(relations.u3).toBe('available');
  });
});
