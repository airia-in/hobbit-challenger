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

export const appRouter = router({
  auth: authRouter,
  groups: groupsRouter,
  activities: activitiesRouter,
  guidance: guidanceRouter,
  stats: statsRouter,
  heatmap: heatmapRouter,
  leaderboard: leaderboardRouter,
  history: historyRouter,
  gallery: galleryRouter,
  profile: profileRouter,
});

export type AppRouter = typeof appRouter;
