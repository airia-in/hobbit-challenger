import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryContent } from '../src/components/history/HistoryPage';

const mockListQuery = vi.fn();
const mockExportQuery = vi.fn();

vi.mock('../src/lib/trpc', () => ({
  trpc: {
    history: {
      list: {
        useQuery: (...args: unknown[]) => mockListQuery(...args),
      },
      exportCsv: {
        useQuery: (...args: unknown[]) => mockExportQuery(...args),
      },
    },
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  mockListQuery.mockReset();
  mockExportQuery.mockReset();
});

beforeEach(() => {
  mockExportQuery.mockReturnValue({
    refetch: vi.fn(),
    isFetching: false,
  });
});

const sampleData = {
  entries: [
    {
      type: 'task' as const,
      id: 'log-1',
      date: new Date('2026-06-01T00:00:00.000Z'),
      dayNumber: 1,
      activityId: 'act-custom',
      title: 'Morning Stretch',
      emoji: '🧘',
      seedKey: 'CUSTOM_STRETCH',
      completedAt: new Date('2026-06-01T00:00:00.000Z'),
      proofUrl: null,
      aiVerdict: 'PASSED',
      isValid: true,
      attemptNumber: 1,
    },
    {
      type: 'day' as const,
      id: 'day-1',
      date: new Date('2026-06-01T00:00:00.000Z'),
      dayNumber: 1,
      completed: true,
      failReason: null,
      attemptNumber: 1,
    },
  ],
  availableFilters: [
    {
      activityId: 'act-custom',
      title: 'Morning Stretch',
      emoji: '🧘',
      seedKey: 'CUSTOM_STRETCH',
    },
    {
      activityId: 'act-personal',
      title: 'My Journal',
      emoji: '📓',
      seedKey: null,
    },
  ],
};

describe('HistoryContent', () => {
  it('renders real activity title and verdict label', () => {
    mockListQuery.mockReturnValue({
      data: sampleData,
      isLoading: false,
    });

    render(<HistoryContent />);

    expect(screen.getAllByText(/🧘 Morning Stretch/).length).toBeGreaterThan(0);
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.queryByText('PASSED')).not.toBeInTheDocument();
    expect(screen.queryByText('DIET')).not.toBeInTheDocument();
  });

  it('builds filter options from availableFilters', () => {
    mockListQuery.mockReturnValue({
      data: sampleData,
      isLoading: false,
    });

    render(<HistoryContent />);

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'All activities' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: '🧘 Morning Stretch' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: '📓 My Journal' }),
    ).toBeInTheDocument();
  });

  it('shows Valid fallback when aiVerdict is null', () => {
    mockListQuery.mockReturnValue({
      data: {
        entries: [
          {
            type: 'task' as const,
            id: 'log-2',
            date: new Date('2026-06-02T00:00:00.000Z'),
            dayNumber: 2,
            activityId: 'act-personal',
            title: 'My Journal',
            emoji: '📓',
            seedKey: null,
            completedAt: new Date('2026-06-02T00:00:00.000Z'),
            proofUrl: null,
            aiVerdict: null,
            isValid: true,
            attemptNumber: 1,
          },
        ],
        availableFilters: sampleData.availableFilters,
      },
      isLoading: false,
    });

    render(<HistoryContent />);

    expect(screen.getByText('Valid')).toBeInTheDocument();
  });

  it('does not render failed day chrome in history cards', () => {
    mockListQuery.mockReturnValue({
      data: {
        entries: [
          {
            type: 'day' as const,
            id: 'day-6',
            date: new Date('2026-06-06T00:00:00.000Z'),
            dayNumber: 6,
            completed: false,
            failReason: 'Not all scored activities were logged',
            attemptNumber: 1,
          },
        ],
        availableFilters: sampleData.availableFilters,
      },
      isLoading: false,
    });

    render(<HistoryContent />);

    expect(screen.getByText('Day 6')).toBeInTheDocument();
    expect(screen.queryByText(/Failed/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText('Not all scored activities were logged'),
    ).not.toBeInTheDocument();
  });

  it('shows error state with retry when query fails', async () => {
    const refetch = vi.fn();
    mockListQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: 'Failed to load history' },
      refetch,
    });

    render(<HistoryContent />);

    expect(screen.getByText('Failed to load history')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
