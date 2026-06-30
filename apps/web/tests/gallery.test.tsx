import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GalleryContent } from '../src/components/gallery/GalleryPage';

const mockUseQuery = vi.fn();

vi.mock('../src/lib/trpc', () => ({
  trpc: {
    gallery: {
      list: {
        useQuery: (...args: unknown[]) => mockUseQuery(...args),
      },
    },
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  mockUseQuery.mockReset();
});

const sampleData = {
  days: [
    {
      date: new Date('2026-06-02T00:00:00.000Z'),
      dayNumber: 2,
      photos: [
        {
          activityLogId: 'log-1',
          seedKey: 'PROGRESS_PHOTO',
          title: 'Progress Photo',
          emoji: '📸',
          proofUrl: '/uploads/day2.jpg',
          aiVerdict: 'PASSED',
          completedAt: new Date('2026-06-02T00:00:00.000Z'),
        },
      ],
    },
    {
      date: new Date('2026-06-01T00:00:00.000Z'),
      dayNumber: 1,
      photos: [
        {
          activityLogId: 'log-2',
          seedKey: 'PROGRESS_PHOTO',
          title: 'Progress Photo',
          emoji: '📸',
          proofUrl: '/uploads/day1.jpg',
          aiVerdict: 'BONUS',
          completedAt: new Date('2026-06-01T00:00:00.000Z'),
        },
      ],
    },
  ],
  availableFilters: [
    {
      seedKey: 'PROGRESS_PHOTO',
      title: 'Progress Photo',
      emoji: '📸',
    },
  ],
};

describe('GalleryContent', () => {
  it('renders day groups with thumbnails for gallery data', () => {
    mockUseQuery.mockReturnValue({
      data: sampleData,
      isLoading: false,
    });

    render(<GalleryContent />);

    expect(screen.getByText(/Day 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Day 1/i)).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(screen.getAllByText('PASSED').length).toBeGreaterThan(0);
    expect(screen.getByText('BONUS')).toBeInTheDocument();
  });

  it('shows empty state when no photos exist', () => {
    mockUseQuery.mockReturnValue({
      data: { days: [], availableFilters: [] },
      isLoading: false,
    });

    render(<GalleryContent />);

    expect(screen.getByText(/No proof photos yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /go to today's tasks/i }),
    ).toHaveAttribute('href', '/dashboard');
  });

  it('opens lightbox when a thumbnail is clicked', async () => {
    mockUseQuery.mockReturnValue({
      data: sampleData,
      isLoading: false,
    });

    render(<GalleryContent />);

    const thumbnail = screen.getAllByAltText('Progress Photo')[0]!;
    await userEvent.click(thumbnail.closest('button')!);

    expect(
      screen.getByRole('dialog', { name: /photo preview/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByAltText('Progress Photo')).toHaveLength(3);

    await userEvent.click(
      screen.getByRole('button', { name: /close preview/i }),
    );
    expect(
      screen.queryByRole('dialog', { name: /photo preview/i }),
    ).not.toBeInTheDocument();
  });

  it('shows error state with retry when query fails', async () => {
    const refetch = vi.fn();
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: 'Failed to load gallery' },
      refetch,
    });

    render(<GalleryContent />);

    expect(screen.getByText('Failed to load gallery')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
