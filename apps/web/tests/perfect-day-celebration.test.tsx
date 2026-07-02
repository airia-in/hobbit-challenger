import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerfectDayCelebration } from '../src/components/dashboard/PerfectDayCelebration';

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('PerfectDayCelebration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips confetti when prefers-reduced-motion is set', async () => {
    const onDone = vi.fn();
    mockMatchMedia(true);

    render(<PerfectDayCelebration active onDone={onDone} />);

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledOnce();
    });
    expect(
      screen.queryByTestId('perfect-day-confetti'),
    ).not.toBeInTheDocument();
  });

  it('renders confetti particles when motion is allowed', () => {
    const onDone = vi.fn();
    mockMatchMedia(false);

    render(<PerfectDayCelebration active onDone={onDone} />);
    expect(screen.getByTestId('perfect-day-confetti')).toBeInTheDocument();
  });
});
