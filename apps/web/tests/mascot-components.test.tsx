import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MascotSvg, type MascotExpression } from '@workspace-starter/ui';

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

const EXPRESSIONS: MascotExpression[] = ['happy', 'wave', 'sleepy', 'cheer'];

describe('MascotSvg', () => {
  it.each(EXPRESSIONS)('renders expression %s', (expression) => {
    mockMatchMedia(false);
    render(<MascotSvg expression={expression} />);
    const svg = screen.getByTestId('mascot-svg');
    expect(svg).toHaveAttribute('data-expression', expression);
    expect(svg).toHaveAttribute('role', 'img');
    expect(svg.getAttribute('aria-label')).toBeTruthy();
  });

  it('bobs when motion is allowed', () => {
    mockMatchMedia(false);
    render(<MascotSvg />);
    expect(screen.getByTestId('mascot-body').getAttribute('class')).toContain(
      'mascot-bob',
    );
  });

  it('does not animate under prefers-reduced-motion', () => {
    mockMatchMedia(true);
    render(<MascotSvg expression="wave" />);
    expect(
      screen.getByTestId('mascot-body').getAttribute('class') ?? '',
    ).not.toContain('mascot-bob');
  });

  it('honors the still prop even when motion is allowed', () => {
    mockMatchMedia(false);
    render(<MascotSvg still />);
    expect(
      screen.getByTestId('mascot-body').getAttribute('class') ?? '',
    ).not.toContain('mascot-bob');
  });

  it('shows a waving arm only for wave/cheer expressions', () => {
    mockMatchMedia(false);
    const { rerender } = render(<MascotSvg expression="happy" />);
    expect(screen.queryByTestId('mascot-arm')).not.toBeInTheDocument();
    rerender(<MascotSvg expression="wave" />);
    expect(screen.getByTestId('mascot-arm')).toBeInTheDocument();
  });
});
