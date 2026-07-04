import { initTRPC, TRPCError } from '@trpc/server';
import { ZodError } from 'zod';
import type { Context } from './context';
import {
  extractAdminToken,
  isAnalyticsAdminToken,
} from '../utils/admin-analytics-auth';

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Surface Zod validation errors to the client
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

// Auth middleware — swap this out with your real auth logic
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(isAuthed);

// Env-gated admin guard for read-only product analytics surfaces. Auth is a
// shared token (ADMIN_ANALYTICS_TOKEN) sent via the `x-admin-token` header,
// independent of per-group admin roles because cohort metrics are cross-user.
// Fails closed when the token env var is unset.
const isAnalyticsAdmin = t.middleware(({ ctx, next }) => {
  const token = extractAdminToken(ctx.req?.headers);
  if (!isAnalyticsAdminToken(token)) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Admin token required',
    });
  }
  return next({ ctx });
});

export const adminProcedure = t.procedure.use(isAnalyticsAdmin);
