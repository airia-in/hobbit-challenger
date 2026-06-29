import { router } from './trpc';
import { authRouter } from './routers/auth.router';
import { groupsRouter } from './routers/groups.router';
import { heatmapRouter } from './routers/heatmap.router';
import { historyRouter } from './routers/history.router';
import { leaderboardRouter } from './routers/leaderboard.router';
import { profileRouter } from './routers/profile.router';
import { statsRouter } from './routers/stats.router';
import { tasksRouter } from './routers/tasks.router';

export const appRouter = router({
  auth: authRouter,
  groups: groupsRouter,
  tasks: tasksRouter,
  stats: statsRouter,
  heatmap: heatmapRouter,
  leaderboard: leaderboardRouter,
  history: historyRouter,
  profile: profileRouter,
});

export type AppRouter = typeof appRouter;
