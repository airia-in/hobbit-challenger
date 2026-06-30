import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompletionHeatmap, LineChart } from '@workspace-starter/ui';

describe('LineChart', () => {
  it('renders empty state without crashing', () => {
    render(<LineChart series={[{ label: 'Test', points: [] }]} />);
    expect(screen.getByText('Not enough data yet')).toBeInTheDocument();
  });

  it('renders chart with data', () => {
    const { container } = render(
      <LineChart
        series={[
          {
            label: 'Water',
            points: [
              { date: '2026-06-01', value: 2 },
              { date: '2026-06-02', value: 3 },
            ],
          },
        ]}
      />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
    expect(screen.getByText('Water')).toBeInTheDocument();
  });
});

describe('CompletionHeatmap', () => {
  it('renders empty state without crashing', () => {
    render(<CompletionHeatmap days={[]} />);
    expect(screen.getByText('Not enough data yet')).toBeInTheDocument();
  });

  it('renders heatmap cells with legend', () => {
    const { container } = render(
      <CompletionHeatmap
        days={[
          { date: '2026-06-01', state: 'completed' },
          { date: '2026-06-02', state: 'missed' },
        ]}
      />,
    );
    expect(container.querySelectorAll('rect')).toHaveLength(2);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Missed')).toBeInTheDocument();
  });
});
