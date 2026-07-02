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
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    if (!today?.isViewingToday) {
      setCelebrationLines({});
      prevSnapshotRef.current = new Map();
      for (const t of timeoutsRef.current.values()) clearTimeout(t);
      timeoutsRef.current.clear();
      return;
    }

    const allActivities = [
      ...today.scoredActivities,
      ...today.personalActivities,
    ];
    const prev = prevSnapshotRef.current;
    // Skip first paint so already-complete tasks are not praised on load.
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
          dateKey: today.dateKey,
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

    for (const id of clearedIds) {
      const existing = timeoutsRef.current.get(id);
      if (existing) clearTimeout(existing);
      timeoutsRef.current.delete(id);
    }

    for (const id of Object.keys(newlyCompleted)) {
      const existing = timeoutsRef.current.get(id);
      if (existing) clearTimeout(existing);
      timeoutsRef.current.set(
        id,
        setTimeout(() => {
          setCelebrationLines((current) => {
            const { [id]: _omit, ...rest } = current;
            return rest;
          });
          timeoutsRef.current.delete(id);
        }, 10_000),
      );
    }
  }, [today, challengeStreak]);

  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      for (const t of timeouts.values()) clearTimeout(t);
      timeouts.clear();
    };
  }, []);

  return { celebrationLines };
}
