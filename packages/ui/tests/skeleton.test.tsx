import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Skeleton, TaskCardSkeleton } from '../src/index';

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

afterEach(() => {
  vi.clearAllMocks();
  mockMatchMedia(false);
});

describe('Skeleton', () => {
  it('renders with default pulse class', () => {
    const { container } = render(<Skeleton className="h-8 w-24" />);
    expect(container.firstChild).toHaveClass('motion-safe:animate-pulse');
  });

  it('merges custom className', () => {
    const { container } = render(<Skeleton className="h-8 w-24" />);
    expect(container.firstChild).toHaveClass('h-8', 'w-24');
  });

  it('omits shimmer class when reduced motion is preferred', () => {
    mockMatchMedia(true);
    const { container } = render(<Skeleton shimmer className="h-8 w-24" />);
    expect(container.firstChild).not.toHaveClass('skeleton-shimmer');
  });
});

describe('TaskCardSkeleton', () => {
  it('renders content-shaped task row structure', () => {
    render(<TaskCardSkeleton />);
    const skeleton = screen.getByTestId('task-card-skeleton');
    expect(skeleton).toHaveClass('border', 'bg-[var(--surface)]');
  });
});
