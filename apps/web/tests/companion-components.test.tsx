import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPANION_MOODS,
  COMPANION_MOOD_CATALOG,
} from '@workspace-starter/types';
import { CompanionSvg } from '@workspace-starter/ui';

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

describe('CompanionSvg', () => {
  it.each(COMPANION_MOODS)('renders mood variant %s', (mood) => {
    render(
      <CompanionSvg
        mood={mood}
        ariaLabel={COMPANION_MOOD_CATALOG[mood].visualDescription}
      />,
    );
    const svg = screen.getByTestId('companion-svg');
    expect(svg).toHaveAttribute('data-mood', mood);
    expect(svg).toHaveAttribute(
      'aria-label',
      COMPANION_MOOD_CATALOG[mood].visualDescription,
    );
  });

  it('uses theme CSS variables in SVG fills', () => {
    render(
      <CompanionSvg
        mood="thriving"
        ariaLabel={COMPANION_MOOD_CATALOG.thriving.visualDescription}
      />,
    );
    const svg = screen.getByTestId('companion-svg');
    expect(svg.innerHTML).toContain('var(--surface-raised)');
    expect(svg.innerHTML).toContain('var(--gold-fill)');
    expect(svg.innerHTML).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it('omits idle animation classes when reduced motion is preferred', () => {
    mockMatchMedia(true);
    render(
      <CompanionSvg
        mood="rainy"
        ariaLabel={COMPANION_MOOD_CATALOG.rainy.visualDescription}
      />,
    );
    const svg = screen.getByTestId('companion-svg');
    expect(svg.getAttribute('class') ?? '').not.toContain(
      'companion-rain-fall',
    );
    const rain = screen.getByTestId('companion-rain');
    expect(rain.getAttribute('class') ?? '').not.toContain(
      'companion-rain-fall',
    );
  });

  it('applies idle animation classes when motion is allowed', () => {
    mockMatchMedia(false);
    render(
      <CompanionSvg
        mood="content"
        ariaLabel={COMPANION_MOOD_CATALOG.content.visualDescription}
      />,
    );
    const smoke = screen.getByTestId('companion-smoke');
    expect(smoke.getAttribute('class') ?? '').toContain('companion-smoke-rise');
  });
});
