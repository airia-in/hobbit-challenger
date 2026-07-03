import {
  journeyLandmarksForLength,
  MILESTONE_CATALOG,
  type JourneyLandmark,
  type MilestoneKey,
} from '@workspace-starter/types';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { cn } from '../utils/cn';
import type { HeatmapCellData } from './HeatmapGrid';
import { getHeatmapStateClasses } from './heatmap-state-styles';

export type JourneyPathProps = {
  cells: HeatmapCellData[];
  currentDay: number;
  lengthDays: number;
  earnedMilestoneKeys?: MilestoneKey[];
  className?: string;
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function buildTileAccessibleLabel(
  cell: HeatmapCellData,
  landmark: JourneyLandmark | undefined,
  landmarkEarned: boolean,
  landmarkUpcoming: boolean,
  isCurrentDay: boolean,
): string {
  const parts = [`Day ${cell.dayNumber}`, cell.state.replace('_', ' ')];
  if (isCurrentDay) {
    parts.push('current day');
  }
  if (cell.dayLabel) {
    parts.push(cell.dayLabel);
  }
  if (landmark) {
    const title = MILESTONE_CATALOG[landmark.key].title;
    if (landmarkEarned) {
      parts.push(`landmark earned: ${title}`);
    } else if (landmarkUpcoming) {
      parts.push(`upcoming landmark: ${title}`);
    } else {
      parts.push(`landmark missed: ${title}`);
    }
  }
  return parts.join(', ');
}

function buildTileTitle(
  cell: HeatmapCellData,
  landmark: JourneyLandmark | undefined,
  landmarkEarned: boolean,
): string {
  const parts = [`Day ${cell.dayNumber}`, cell.state.replace('_', ' ')];
  if (cell.dayLabel) {
    parts.push(cell.dayLabel);
  }
  if (landmark) {
    const title = MILESTONE_CATALOG[landmark.key].title;
    parts.push(
      landmarkEarned ? `Landmark earned: ${title}` : `Landmark: ${title}`,
    );
  }
  return parts.join(' · ');
}

type JourneyPathTileProps = {
  cell: HeatmapCellData;
  landmark?: JourneyLandmark;
  isCurrentDay: boolean;
  landmarkEarned: boolean;
  landmarkUpcoming: boolean;
  allowMotion: boolean;
  tileRef?: RefObject<HTMLDivElement | null>;
};

const JourneyPathTile = memo(function JourneyPathTile({
  cell,
  landmark,
  isCurrentDay,
  landmarkEarned,
  landmarkUpcoming,
  allowMotion,
  tileRef,
}: JourneyPathTileProps) {
  const accessibleLabel = buildTileAccessibleLabel(
    cell,
    landmark,
    landmarkEarned,
    landmarkUpcoming,
    isCurrentDay,
  );

  return (
    <div
      ref={tileRef}
      role="listitem"
      aria-label={accessibleLabel}
      data-day={cell.dayNumber}
      data-state={cell.state}
      data-current={isCurrentDay ? 'true' : undefined}
      className="relative flex min-w-[2.5rem] flex-col items-center gap-1"
    >
      {landmark ? (
        <div
          data-testid={`journey-landmark-${landmark.day}`}
          data-earned={landmarkEarned ? 'true' : 'false'}
          data-upcoming={landmarkUpcoming ? 'true' : 'false'}
          title={MILESTONE_CATALOG[landmark.key].title}
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-full text-xs leading-none',
            landmarkEarned &&
              'bg-[var(--gold-fill)] text-[var(--text-primary)] ring-1 ring-[var(--gold)]',
            !landmarkEarned &&
              landmarkUpcoming &&
              'border border-dashed border-[var(--border)] bg-transparent text-[var(--text-muted)]',
            !landmarkEarned &&
              !landmarkUpcoming &&
              'border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-muted)] opacity-60',
          )}
        >
          <span aria-hidden="true">🏮</span>
        </div>
      ) : (
        <div className="h-5" aria-hidden="true" />
      )}
      <div
        title={buildTileTitle(cell, landmark, landmarkEarned)}
        aria-hidden="true"
        className={cn(
          'h-8 w-8 shrink-0 rounded-sm transition hover:opacity-80',
          getHeatmapStateClasses(cell.state),
          cell.state === 'today' && allowMotion && 'journey-today-pulse',
        )}
      />
      {isCurrentDay ? (
        <div
          data-testid="journey-current-cursor"
          aria-hidden="true"
          className="h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-[var(--gold)]"
        />
      ) : (
        <div className="h-2" aria-hidden="true" />
      )}
      <span
        aria-hidden="true"
        className="font-mono text-[10px] text-[var(--text-muted)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {cell.dayNumber}
      </span>
    </div>
  );
});

const SCROLL_STEP_PX = 80;

export function JourneyPath({
  cells,
  currentDay,
  lengthDays,
  earnedMilestoneKeys = [],
  className,
}: JourneyPathProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentTileRef = useRef<HTMLDivElement>(null);
  const [allowMotion, setAllowMotion] = useState(() => !prefersReducedMotion());

  const cursorDay = Math.min(currentDay, lengthDays);
  const displayCells = useMemo(
    () => cells.slice(0, lengthDays),
    [cells, lengthDays],
  );

  const landmarks = useMemo(
    () => journeyLandmarksForLength(lengthDays),
    [lengthDays],
  );
  const landmarkByDay = useMemo(
    () =>
      new Map<number, JourneyLandmark>(
        landmarks.map((landmark) => [landmark.day, landmark]),
      ),
    [landmarks],
  );
  const earnedSet = useMemo(
    () => new Set(earnedMilestoneKeys),
    [earnedMilestoneKeys],
  );

  const completedCount = useMemo(
    () => displayCells.filter((cell) => cell.state === 'completed').length,
    [displayCells],
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotionPreference = () => {
      setAllowMotion(!mediaQuery.matches);
    };
    syncMotionPreference();
    mediaQuery.addEventListener('change', syncMotionPreference);
    return () => {
      mediaQuery.removeEventListener('change', syncMotionPreference);
    };
  }, []);

  useEffect(() => {
    const tile = currentTileRef.current;
    if (!tile || typeof tile.scrollIntoView !== 'function') return;
    tile.scrollIntoView({
      behavior: allowMotion ? 'smooth' : 'auto',
      inline: 'center',
      block: 'nearest',
    });
  }, [cursorDay, allowMotion]);

  const handleScrollerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const scroller = scrollRef.current;
      if (!scroller) return;

      const scrollBehavior = allowMotion ? 'smooth' : 'auto';
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          scroller.scrollBy({
            left: -SCROLL_STEP_PX,
            behavior: scrollBehavior,
          });
          break;
        case 'ArrowRight':
          event.preventDefault();
          scroller.scrollBy({ left: SCROLL_STEP_PX, behavior: scrollBehavior });
          break;
        case 'Home':
          event.preventDefault();
          scroller.scrollTo({ left: 0, behavior: scrollBehavior });
          break;
        case 'End':
          event.preventDefault();
          scroller.scrollTo({
            left: scroller.scrollWidth,
            behavior: scrollBehavior,
          });
          break;
        default:
          break;
      }
    },
    [allowMotion],
  );

  return (
    <div
      ref={scrollRef}
      className={cn('overflow-x-auto pb-2', className)}
      data-testid="journey-path"
      tabIndex={0}
      role="region"
      aria-label="Challenge trail, use arrow keys to scroll horizontally"
      onKeyDown={handleScrollerKeyDown}
    >
      <div
        role="list"
        aria-label={`Challenge trail, day ${currentDay} of ${lengthDays}, ${completedCount} days completed`}
        className="relative flex min-w-full gap-1 px-1 pt-1"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-4 right-4 top-[2.125rem] border-b border-[var(--border)]"
        />
        {displayCells.map((cell) => {
          const landmark = landmarkByDay.get(cell.dayNumber);
          const landmarkEarned = landmark
            ? earnedSet.has(landmark.key) && cell.dayNumber <= currentDay
            : false;
          const landmarkUpcoming = landmark
            ? cell.dayNumber > currentDay
            : false;
          return (
            <JourneyPathTile
              key={cell.dayNumber}
              cell={cell}
              landmark={landmark}
              isCurrentDay={cell.dayNumber === cursorDay}
              landmarkEarned={landmarkEarned}
              landmarkUpcoming={landmarkUpcoming}
              allowMotion={allowMotion}
              tileRef={
                cell.dayNumber === cursorDay ? currentTileRef : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}
