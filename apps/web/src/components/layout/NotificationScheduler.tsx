import { useEffect } from 'react';
import type { TaskStatus } from '@workspace-starter/ui';
import { getToken } from '../../lib/auth';
import {
  hasNotificationPermission,
  markFiredToday,
  shouldFireReminder,
  shouldFireTenPmWarning,
  showNotification,
  wasFiredToday,
} from '../../lib/notifications';
import { trpc } from '../../lib/trpc';

const INCOMPLETE_STATUSES = new Set<TaskStatus>([
  'PENDING',
  'OVERDUE',
  'REJECTED',
]);

const POLL_INTERVAL_MS = 60_000;

export function NotificationScheduler() {
  const hasToken = Boolean(getToken());

  const profileQuery = trpc.profile.get.useQuery(undefined, {
    enabled: hasToken,
  });
  const tasksQuery = trpc.tasks.getToday.useQuery(undefined, {
    enabled: hasToken,
  });

  useEffect(() => {
    if (!hasToken) return;

    async function tick() {
      if (!hasNotificationPermission()) return;

      const now = new Date();
      const [profileResult, tasksResult] = await Promise.all([
        profileQuery.refetch(),
        tasksQuery.refetch(),
      ]);

      const reminderTime = profileResult.data?.reminderTime;
      if (
        reminderTime &&
        shouldFireReminder(reminderTime, now) &&
        !wasFiredToday('reminder')
      ) {
        showNotification(
          'DRCODE 75 Hard',
          'Time for your daily check-in. Log your tasks before midnight.',
        );
        markFiredToday('reminder');
      }

      const tasks = tasksResult.data?.tasks ?? [];
      const hasIncomplete = tasks.some((task) =>
        INCOMPLETE_STATUSES.has(task.status),
      );

      if (
        shouldFireTenPmWarning(now) &&
        hasIncomplete &&
        !wasFiredToday('warning')
      ) {
        showNotification(
          'DRCODE 75 Hard',
          'Incomplete tasks remain for today. Submit proof before midnight.',
        );
        markFiredToday('warning');
      }
    }

    void tick();
    const intervalId = window.setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [hasToken, profileQuery, tasksQuery]);

  return null;
}
