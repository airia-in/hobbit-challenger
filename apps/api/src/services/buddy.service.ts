import { TRPCError } from '@trpc/server';
import type { PrismaService } from '../prisma/prisma.service';

export type BuddyPairStatus = 'PENDING' | 'ACTIVE' | 'DECLINED' | 'CANCELLED';

export type BuddyPersonView = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export type BuddyPairView = {
  id: string;
  status: BuddyPairStatus;
  role: 'requester' | 'addressee';
  other: BuddyPersonView;
};

export type BuddyMemberRelation =
  | 'available'
  | 'pending_outgoing'
  | 'pending_incoming'
  | 'active'
  | 'paired_with_other';

export type BuddyMemberView = BuddyPersonView & {
  relation: BuddyMemberRelation;
};

export type BuddyState = {
  /** Requester-side phone/WhatsApp gate — matches weekly-recap opt-in gating. */
  eligible: boolean;
  activePair: BuddyPairView | null;
  outgoingRequest: BuddyPairView | null;
  incomingRequests: BuddyPairView[];
  members: BuddyMemberView[];
};

const ACTIVE_OR_PENDING: BuddyPairStatus[] = ['PENDING', 'ACTIVE'];

type MeRow = {
  id: string;
  groupId: string | null;
  phone: string | null;
  whatsappOptIn: boolean;
};

async function loadMe(prisma: PrismaService, userId: string): Promise<MeRow> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, groupId: true, phone: true, whatsappOptIn: true },
  });
  if (!me) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
  }
  return me;
}

function assertEligible(me: MeRow): void {
  if (!me.groupId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Join a group before pairing with a buddy',
    });
  }
  if (!me.phone || !me.whatsappOptIn) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Add a phone number and enable WhatsApp reminders before pairing with a buddy',
    });
  }
}

async function hasActivePair(
  prisma: PrismaService,
  userId: string,
): Promise<boolean> {
  const active = await prisma.accountabilityPair.findFirst({
    where: {
      status: 'ACTIVE',
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: { id: true },
  });
  return active !== null;
}

export async function getBuddyState(
  prisma: PrismaService,
  userId: string,
): Promise<BuddyState> {
  const me = await loadMe(prisma, userId);
  const eligible = Boolean(me.groupId && me.phone && me.whatsappOptIn);

  if (!me.groupId) {
    return {
      eligible,
      activePair: null,
      outgoingRequest: null,
      incomingRequests: [],
      members: [],
    };
  }

  const [members, pairs] = await Promise.all([
    prisma.user.findMany({
      where: { groupId: me.groupId, id: { not: userId } },
      select: { id: true, name: true, avatarUrl: true },
      orderBy: { name: 'asc' },
    }),
    prisma.accountabilityPair.findMany({
      where: {
        groupId: me.groupId,
        status: { in: ACTIVE_OR_PENDING },
      },
      select: {
        id: true,
        status: true,
        requester: { select: { id: true, name: true, avatarUrl: true } },
        addressee: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
  ]);

  let activePair: BuddyPairView | null = null;
  let outgoingRequest: BuddyPairView | null = null;
  const incomingRequests: BuddyPairView[] = [];
  const relationByMember = new Map<string, BuddyMemberRelation>();
  const involvesOther = new Set<string>();

  for (const pair of pairs) {
    const status = pair.status as BuddyPairStatus;
    const isRequester = pair.requester.id === userId;
    const isAddressee = pair.addressee.id === userId;

    if (isRequester || isAddressee) {
      const other = isRequester ? pair.addressee : pair.requester;
      const view: BuddyPairView = {
        id: pair.id,
        status,
        role: isRequester ? 'requester' : 'addressee',
        other,
      };
      if (status === 'ACTIVE') {
        activePair = view;
        relationByMember.set(other.id, 'active');
      } else if (isRequester) {
        outgoingRequest = view;
        relationByMember.set(other.id, 'pending_outgoing');
      } else {
        incomingRequests.push(view);
        relationByMember.set(other.id, 'pending_incoming');
      }
      continue;
    }

    // Pair between two other members — both are unavailable to me.
    if (status === 'ACTIVE') {
      involvesOther.add(pair.requester.id);
      involvesOther.add(pair.addressee.id);
    }
  }

  const memberViews: BuddyMemberView[] = members.map((member) => {
    const relation =
      relationByMember.get(member.id) ??
      (involvesOther.has(member.id) ? 'paired_with_other' : 'available');
    return { ...member, relation };
  });

  return {
    eligible,
    activePair,
    outgoingRequest,
    incomingRequests,
    members: memberViews,
  };
}

export async function requestBuddy(
  prisma: PrismaService,
  userId: string,
  addresseeId: string,
): Promise<{ status: BuddyPairStatus }> {
  const me = await loadMe(prisma, userId);
  assertEligible(me);

  if (addresseeId === userId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'You cannot pair with yourself',
    });
  }

  const addressee = await prisma.user.findUnique({
    where: { id: addresseeId },
    select: { id: true, groupId: true },
  });
  if (!addressee || addressee.groupId !== me.groupId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Buddy must be a member of your group',
    });
  }

  if (await hasActivePair(prisma, userId)) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'You already have an accountability buddy',
    });
  }
  if (await hasActivePair(prisma, addresseeId)) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'That member already has an accountability buddy',
    });
  }

  // Reciprocal opt-in: if they already asked me, accept it instead.
  const reciprocal = await prisma.accountabilityPair.findUnique({
    where: {
      requesterId_addresseeId: {
        requesterId: addresseeId,
        addresseeId: userId,
      },
    },
    select: { id: true, status: true },
  });
  if (reciprocal && reciprocal.status === 'PENDING') {
    await prisma.accountabilityPair.update({
      where: { id: reciprocal.id },
      data: { status: 'ACTIVE' },
    });
    return { status: 'ACTIVE' };
  }

  // Reuse an existing directed row (revives DECLINED/CANCELLED) or create one.
  const pair = await prisma.accountabilityPair.upsert({
    where: {
      requesterId_addresseeId: { requesterId: userId, addresseeId },
    },
    create: {
      groupId: me.groupId!,
      requesterId: userId,
      addresseeId,
      status: 'PENDING',
    },
    update: { status: 'PENDING', groupId: me.groupId! },
    select: { status: true },
  });

  return { status: pair.status as BuddyPairStatus };
}

export async function respondToBuddy(
  prisma: PrismaService,
  userId: string,
  pairId: string,
  accept: boolean,
): Promise<{ status: BuddyPairStatus }> {
  const pair = await prisma.accountabilityPair.findUnique({
    where: { id: pairId },
    select: {
      id: true,
      status: true,
      requesterId: true,
      addresseeId: true,
    },
  });

  if (!pair || pair.addresseeId !== userId || pair.status !== 'PENDING') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'No pending buddy request to respond to',
    });
  }

  if (!accept) {
    await prisma.accountabilityPair.update({
      where: { id: pair.id },
      data: { status: 'DECLINED' },
    });
    return { status: 'DECLINED' };
  }

  if (await hasActivePair(prisma, userId)) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'You already have an accountability buddy',
    });
  }
  if (await hasActivePair(prisma, pair.requesterId)) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'That member already has an accountability buddy',
    });
  }

  await prisma.accountabilityPair.update({
    where: { id: pair.id },
    data: { status: 'ACTIVE' },
  });
  return { status: 'ACTIVE' };
}

export async function cancelBuddy(
  prisma: PrismaService,
  userId: string,
): Promise<{ cancelled: boolean }> {
  // End an active pairing first; otherwise withdraw an outgoing request.
  const pair = await prisma.accountabilityPair.findFirst({
    where: {
      status: { in: ACTIVE_OR_PENDING },
      OR: [
        { requesterId: userId, status: { in: ACTIVE_OR_PENDING } },
        { addresseeId: userId, status: 'ACTIVE' },
      ],
    },
    orderBy: { status: 'asc' }, // ACTIVE sorts before PENDING
    select: { id: true },
  });

  if (!pair) {
    return { cancelled: false };
  }

  await prisma.accountabilityPair.update({
    where: { id: pair.id },
    data: { status: 'CANCELLED' },
  });
  return { cancelled: true };
}
