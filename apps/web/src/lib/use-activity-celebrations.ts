import { useEffect, useRef, useState } from 'react';
import { getTaskCelebrationLine } from './celebrations';
import { deriveActivityStatus } from './today-completion';
import type { GetTodayCache } from './today-optimistic';

type ActivitySnapshot = {
  status: ReturnType<typeof deriveActivityStatus>;
  streak?: number;
};

export function useActivityCelebrations(
  today: GetTodayCache | undefined,
  challengeStreak?: number,
) {
  const [celebrationLines, setCelebrationLines] = useState<
    Record<string, string>
  >({});
  const prevSnapshotRef = useRef<Map<string, ActivitySnapshot>>(new Map());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!today?.isViewingToday) {
      setCelebrationLines({});
      prevSnapshotRef.current = new Map();
      return;
    }

    const allActivities = [
      ...today.scoredActivities,
      ...today.personalActivities,
    ];
    const prev = prevSnapshotRef.current;
    const hadPriorSnapshot = prev.size > 0;
    const newlyCompleted: Record<string, string> = {};
    const clearedIds: string[] = [];

    for (const activity of allActivities) {
      const status = deriveActivityStatus(activity);
      const prevEntry = prev.get(activity.id);

      if (prevEntry?.status === 'COMPLETED' && status !== 'COMPLETED') {
        clearedIds.push(activity.id);
      } else if (
        hadPriorSnapshot &&
        prevEntry?.status !== 'COMPLETED' &&
        status === 'COMPLETED'
      ) {
        newlyCompleted[activity.id] = getTaskCelebrationLine({
          seedKey: activity.seedKey,
          title: activity.title,
          currentStreak: prevEntry?.streak ?? activity.currentStreak,
          challengeStreak,
        });
      }
    }

    const nextSnapshot = new Map<string, ActivitySnapshot>();
    for (const activity of allActivities) {
      nextSnapshot.set(activity.id, {
        status: deriveActivityStatus(activity),
        streak: activity.currentStreak,
      });
    }
    prevSnapshotRef.current = nextSnapshot;

    if (clearedIds.length > 0 || Object.keys(newlyCompleted).length > 0) {
      setCelebrationLines((current) => {
        const updated = { ...current, ...newlyCompleted };
        for (const id of clearedIds) {
          delete updated[id];
        }
        return updated;
      });
    }

    const newIds = Object.keys(newlyCompleted);
    if (newIds.length > 0) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setCelebrationLines((current) => {
          const updated = { ...current };
          for (const id of newIds) {
            delete updated[id];
          }
          return updated;
        });
      }, 10_000);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [today, challengeStreak]);

  return { celebrationLines };
}
