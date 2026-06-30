import { describe, expect, it } from 'vitest';
import {
  extractGalleryFilters,
  groupGalleryPhotos,
  type GalleryLogRow,
} from '../src/services/gallery.service';

function row(
  id: string,
  date: string,
  overrides: Partial<GalleryLogRow> = {},
): GalleryLogRow {
  return {
    id,
    date: new Date(`${date}T00:00:00.000Z`),
    proofUrl: `/uploads/${id}.jpg`,
    aiVerdict: 'PASSED',
    state: 'DONE',
    activity: {
      seedKey: 'PROGRESS_PHOTO',
      title: 'Progress Photo',
      emoji: '📸',
    },
    dayNumber: 1,
    ...overrides,
  };
}

describe('groupGalleryPhotos', () => {
  it('groups proof-bearing logs by calendar day, most recent first', () => {
    const logs = [
      row('log-1', '2026-06-01', { dayNumber: 1 }),
      row('log-2', '2026-06-03', {
        id: 'log-2',
        dayNumber: 3,
        activity: {
          seedKey: 'PROGRESS_PHOTO',
          title: 'Progress Photo',
          emoji: '📸',
        },
      }),
      row('log-3', '2026-06-01', {
        id: 'log-3',
        dayNumber: 1,
        activity: {
          seedKey: 'NO_REELS',
          title: 'No Reels',
          emoji: '📵',
        },
        proofUrl: '/uploads/no-reels.jpg',
      }),
    ];

    const days = groupGalleryPhotos(logs);

    expect(days).toHaveLength(2);
    expect(days[0]?.date.toISOString().slice(0, 10)).toBe('2026-06-03');
    expect(days[0]?.dayNumber).toBe(3);
    expect(days[0]?.photos).toHaveLength(1);
    expect(days[1]?.date.toISOString().slice(0, 10)).toBe('2026-06-01');
    expect(days[1]?.photos).toHaveLength(2);
    expect(days[1]?.photos.map((p) => p.seedKey)).toEqual([
      'NO_REELS',
      'PROGRESS_PHOTO',
    ]);
  });

  it('applies seedKey filter', () => {
    const logs = [
      row('log-1', '2026-06-01'),
      row('log-2', '2026-06-02', {
        activity: {
          seedKey: 'NO_REELS',
          title: 'No Reels',
          emoji: '📵',
        },
      }),
    ];

    const days = groupGalleryPhotos(logs, 'PROGRESS_PHOTO');

    expect(days).toHaveLength(1);
    expect(days[0]?.photos).toHaveLength(1);
    expect(days[0]?.photos[0]?.seedKey).toBe('PROGRESS_PHOTO');
  });

  it('returns empty array when filter excludes all logs', () => {
    const logs = [
      row('log-1', '2026-06-01', {
        activity: {
          seedKey: 'NO_REELS',
          title: 'No Reels',
          emoji: '📵',
        },
      }),
    ];

    expect(groupGalleryPhotos(logs, 'PROGRESS_PHOTO')).toEqual([]);
  });
});

describe('extractGalleryFilters', () => {
  it('returns unique seed keys sorted by title', () => {
    const logs = [
      row('log-1', '2026-06-01'),
      row('log-2', '2026-06-02', {
        activity: {
          seedKey: 'NO_REELS',
          title: 'No Reels',
          emoji: '📵',
        },
      }),
      row('log-3', '2026-06-03', {
        activity: {
          seedKey: 'PROGRESS_PHOTO',
          title: 'Progress Photo',
          emoji: '📸',
        },
      }),
    ];

    expect(extractGalleryFilters(logs)).toEqual([
      { seedKey: 'NO_REELS', title: 'No Reels', emoji: '📵' },
      { seedKey: 'PROGRESS_PHOTO', title: 'Progress Photo', emoji: '📸' },
    ]);
  });
});
