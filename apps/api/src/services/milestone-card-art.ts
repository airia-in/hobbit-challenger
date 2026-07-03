import {
  BRAND_NAME,
  type MilestoneKey,
  getMilestoneDefinition,
} from '@workspace-starter/types';

export const MILESTONE_CARD_WIDTH = 900;
export const MILESTONE_CARD_HEIGHT = 1200;

const PALETTE = {
  cream: '#F5E6D3',
  terracotta: '#C45C3E',
  ink: '#2C2416',
  gold: '#C9A227',
  trail: '#6B8F71',
  sky: '#E8D4B8',
};

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function journeyArtForKey(key: MilestoneKey): string {
  if (key.startsWith('streak_')) {
    return `
      <path d="M120 880 C 220 760, 300 820, 400 700 S 560 640, 680 520 S 760 420, 780 300" fill="none" stroke="${PALETTE.trail}" stroke-width="10" stroke-linecap="round"/>
      <circle cx="780" cy="300" r="18" fill="${PALETTE.gold}"/>
      <path d="M760 320 L780 280 L800 320 Z" fill="${PALETTE.terracotta}"/>
    `;
  }
  if (key === 'comeback') {
    return `
      <circle cx="720" cy="320" r="70" fill="${PALETTE.gold}" opacity="0.85"/>
      <path d="M120 900 C 260 780, 420 860, 560 720 S 760 620, 820 480" fill="none" stroke="${PALETTE.trail}" stroke-width="10" stroke-linecap="round"/>
    `;
  }
  if (key === 'first_freeze_consumed') {
    return `
      <path d="M640 260 C 700 220, 760 260, 760 340 C 760 420, 700 460, 640 420 C 580 380, 580 300, 640 260 Z" fill="${PALETTE.sky}" stroke="${PALETTE.trail}" stroke-width="6"/>
      <path d="M120 900 C 300 760, 480 860, 660 720" fill="none" stroke="${PALETTE.trail}" stroke-width="10" stroke-linecap="round"/>
    `;
  }
  return `
    <rect x="180" y="640" width="540" height="220" rx="24" fill="${PALETTE.sky}" stroke="${PALETTE.trail}" stroke-width="6"/>
    <path d="M220 820 L320 700 L420 760 L520 660 L620 720 L700 640" fill="none" stroke="${PALETTE.terracotta}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  `;
}

export type MilestoneCardArtInput = {
  firstName: string;
  milestoneKey: MilestoneKey;
  statLabel: string;
  statValue: string;
};

export function buildMilestoneCardSvg(input: MilestoneCardArtInput): string {
  const definition = getMilestoneDefinition(input.milestoneKey);
  const name = escapeXml(input.firstName);
  const title = escapeXml(definition.title);
  const unlockCopy = escapeXml(definition.unlockCopy);
  const statLabel = escapeXml(input.statLabel);
  const statValue = escapeXml(input.statValue);
  const brand = escapeXml(BRAND_NAME);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${MILESTONE_CARD_WIDTH}" height="${MILESTONE_CARD_HEIGHT}" viewBox="0 0 ${MILESTONE_CARD_WIDTH} ${MILESTONE_CARD_HEIGHT}">
  <rect width="100%" height="100%" fill="${PALETTE.cream}"/>
  <rect x="48" y="48" width="804" height="1104" rx="32" fill="#FFF8EE" stroke="${PALETTE.terracotta}" stroke-width="4"/>
  ${journeyArtForKey(input.milestoneKey)}
  <text x="72" y="140" fill="${PALETTE.terracotta}" font-family="Georgia, serif" font-size="28" font-weight="700" letter-spacing="6">${brand}</text>
  <text x="72" y="220" fill="${PALETTE.ink}" font-family="Georgia, serif" font-size="52" font-weight="700">${title}</text>
  <text x="72" y="300" fill="${PALETTE.ink}" font-family="Helvetica, Arial, sans-serif" font-size="30" opacity="0.9">${unlockCopy}</text>
  <rect x="72" y="360" width="320" height="120" rx="20" fill="${PALETTE.terracotta}" opacity="0.12"/>
  <text x="92" y="410" fill="${PALETTE.ink}" font-family="Helvetica, Arial, sans-serif" font-size="22" opacity="0.75">${statLabel}</text>
  <text x="92" y="455" fill="${PALETTE.terracotta}" font-family="Georgia, serif" font-size="40" font-weight="700">${statValue}</text>
  <text x="72" y="1040" fill="${PALETTE.ink}" font-family="Helvetica, Arial, sans-serif" font-size="26" opacity="0.85">Congratulations, ${name}!</text>
  <text x="72" y="1088" fill="${PALETTE.trail}" font-family="Helvetica, Arial, sans-serif" font-size="22">Keep marching — the trail remembers.</text>
</svg>`;
}
