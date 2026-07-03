import { describe, expect, it } from 'vitest';
import {
  MILESTONE_CARD_HEIGHT,
  MILESTONE_CARD_WIDTH,
  buildMilestoneCardSvg,
} from '../src/services/milestone-card-art';
import {
  extractFirstName,
  isMilestoneKey,
  isValidMilestoneCardFilename,
  milestoneCardFilename,
  pngContentDigest,
  renderMilestoneCardPng,
} from '../src/services/milestone-card.service';

describe('milestone card art', () => {
  it('renders expected fields in SVG', () => {
    const svg = buildMilestoneCardSvg({
      firstName: 'Sam',
      milestoneKey: 'streak_7',
      statLabel: 'Challenge streak',
      statValue: '7 days',
    });

    expect(svg).toContain('HOBBIT');
    expect(svg).toContain('First week on the trail');
    expect(svg).toContain('Congratulations, Sam!');
    expect(svg).toContain('7 days');
    expect(svg).toContain(`width="${MILESTONE_CARD_WIDTH}"`);
    expect(svg).toContain(`height="${MILESTONE_CARD_HEIGHT}"`);
  });

  it('escapes xml in user-provided first name', () => {
    const svg = buildMilestoneCardSvg({
      firstName: 'Sam & Co <script>',
      milestoneKey: 'streak_30',
      statLabel: 'Challenge streak',
      statValue: '30 days',
    });

    expect(svg).toContain('Sam &amp; Co &lt;script&gt;');
    expect(svg).not.toContain('<script>');
  });
});

describe('milestone card generator', () => {
  it('produces valid png bytes with expected dimensions', async () => {
    const buffer = await renderMilestoneCardPng({
      firstName: 'Sam',
      milestoneKey: 'streak_66',
    });

    expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(buffer.length).toBeGreaterThan(1_000);

    const digest = pngContentDigest(buffer);
    const again = await renderMilestoneCardPng({
      firstName: 'Sam',
      milestoneKey: 'streak_66',
    });
    expect(pngContentDigest(again)).toBe(digest);
  });

  it('validates milestone keys and filenames', () => {
    expect(isMilestoneKey('streak_7')).toBe(true);
    expect(isMilestoneKey('not_real')).toBe(false);
    expect(milestoneCardFilename('user-1', 'streak_7')).toBe(
      'user-1_streak_7.png',
    );
    expect(isValidMilestoneCardFilename('user-1_streak_7.png')).toBe(true);
    expect(isValidMilestoneCardFilename('../evil.png')).toBe(false);
  });

  it('extracts first name only', () => {
    expect(extractFirstName('Sam Gamgee')).toBe('Sam');
    expect(extractFirstName('')).toBe('Traveler');
  });
});
