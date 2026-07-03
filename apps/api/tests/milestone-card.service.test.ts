import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  MILESTONE_CARD_HEIGHT,
  MILESTONE_CARD_WIDTH,
  buildMilestoneCardSvg,
} from '../src/services/milestone-card-art';
import {
  MAX_MILESTONE_CARD_FIRST_NAME_LENGTH,
  extractFirstName,
  isMilestoneKey,
  isValidMilestoneCardFilename,
  milestoneCardContentHash,
  milestoneCardFilename,
  pngContentDigest,
  renderMilestoneCardPng,
  sanitizeFirstNameForCard,
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

    const metadata = await sharp(buffer).metadata();
    expect(metadata.width).toBe(MILESTONE_CARD_WIDTH);
    expect(metadata.height).toBe(MILESTONE_CARD_HEIGHT);

    const digest = pngContentDigest(buffer);
    const again = await renderMilestoneCardPng({
      firstName: 'Sam',
      milestoneKey: 'streak_66',
    });
    expect(pngContentDigest(again)).toBe(digest);
  });

  it('validates milestone keys and filenames', () => {
    const hash = milestoneCardContentHash('Sam', 'streak_7');
    expect(isMilestoneKey('streak_7')).toBe(true);
    expect(isMilestoneKey('not_real')).toBe(false);
    expect(milestoneCardFilename('user-1', 'streak_7', hash)).toBe(
      `user-1_streak_7_${hash}.png`,
    );
    expect(isValidMilestoneCardFilename(`user-1_streak_7_${hash}.png`)).toBe(
      true,
    );
    expect(isValidMilestoneCardFilename('../evil.png')).toBe(false);
    expect(isValidMilestoneCardFilename('user-1_streak_7.png')).toBe(false);
  });

  it('extracts first name only', () => {
    expect(extractFirstName('Sam Gamgee')).toBe('Sam');
    expect(extractFirstName('')).toBe('Traveler');
  });

  it('sanitizes control characters and caps length', () => {
    const longName = 'A'.repeat(MAX_MILESTONE_CARD_FIRST_NAME_LENGTH + 20);
    expect(sanitizeFirstNameForCard(longName).length).toBe(
      MAX_MILESTONE_CARD_FIRST_NAME_LENGTH,
    );
    expect(sanitizeFirstNameForCard('Sam\u0007\u001f')).toBe('Sam');
    expect(sanitizeFirstNameForCard('')).toBe('Traveler');
  });

  it('changes content hash when first name changes', () => {
    const sam = milestoneCardContentHash('Sam', 'streak_7');
    const frodo = milestoneCardContentHash('Frodo', 'streak_7');
    expect(sam).not.toBe(frodo);
  });

  it('renders emoji and bidi names without xml breakout', async () => {
    const emojiName = 'Sam🎉';
    const bidiName = 'Sam\u202Emalicious';

    for (const name of [emojiName, bidiName]) {
      const svg = buildMilestoneCardSvg({
        firstName: sanitizeFirstNameForCard(name),
        milestoneKey: 'streak_7',
        statLabel: 'Challenge streak',
        statValue: '7 days',
      });
      expect(svg).not.toContain('<script>');
      expect(svg).toContain('Congratulations,');
      await expect(
        renderMilestoneCardPng({
          firstName: name,
          milestoneKey: 'streak_7',
        }),
      ).resolves.toBeInstanceOf(Buffer);
    }
  });
});
