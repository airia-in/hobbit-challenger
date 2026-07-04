import { router } from './trpc';
import { authRouter } from './routers/auth.router';
import { groupsRouter } from './routers/groups.router';
import { heatmapRouter } from './routers/heatmap.router';
import { historyRouter } from './routers/history.router';
import { leaderboardRouter } from './routers/leaderboard.router';
import { profileRouter } from './routers/profile.router';
import { statsRouter } from './routers/stats.router';
import { activitiesRouter } from './routers/activities.router';
import { guidanceRouter } from './routers/guidance.router';
import { galleryRouter } from './routers/gallery.router';
import { analyticsRouter } from './routers/analytics.router';
import { buddyRouter } from './routers/buddy.router';

export const appRouter = router({
  auth: authRouter,
  analytics: analyticsRouter,
  groups: groupsRouter,
  activities: activitiesRouter,
  guidance: guidanceRouter,
  stats: statsRouter,
  heatmap: heatmapRouter,
  leaderboard: leaderboardRouter,
  history: historyRouter,
  gallery: galleryRouter,
  profile: profileRouter,
  buddy: buddyRouter,
});

export type AppRouter = typeof appRouter;
