import {
  afterAll,
  beforeAll,
  expect,
  test,
  type Browser,
  type Page,
} from '@playwright/test';

const password = 'CorrectHorse123';
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

function uniquePhone(offset: number): string {
  const suffix = String((Date.now() + offset) % 1_000_000_000).padStart(9, '0');
  return `9${suffix}`;
}

async function register(page: Page, name: string, phone: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Register' }).click();
  await page.getByPlaceholder('Your name').fill(name);
  await page.getByPlaceholder('9876543210').fill(phone);
  await page.getByPlaceholder('Min 8 characters').fill(password);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page).toHaveURL(/\/join/);
}

function taskCard(page: Page, title: string) {
  return page.locator('.overflow-hidden').filter({ hasText: title }).first();
}

async function expandTask(page: Page, title: string) {
  const card = taskCard(page, title);
  const expandButton = card.getByRole('button', { name: 'Expand' });
  if (await expandButton.isVisible().catch(() => false)) {
    await expandButton.click();
  }
  return card;
}

async function markSubPointDone(page: Page, activity: string, label: string) {
  const card = taskCard(page, activity);
  const row = card.locator('div').filter({ hasText: label }).last();
  await row.getByRole('button', { name: 'Done' }).click();
}

async function createBrowserUser(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const unexpected: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      unexpected.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    unexpected.push(`pageerror: ${error.message}`);
  });

  return { context, page, unexpected };
}

async function closeQuietly(
  context: Awaited<ReturnType<Browser['newContext']>>,
) {
  await context.close().catch(() => {});
}

test.describe('production start flows', () => {
  test.describe.configure({ mode: 'serial' });

  let adminName: string;
  let memberName: string;
  let soloName: string;
  let groupName: string;
  let personalTitle: string;

  let admin: Awaited<ReturnType<typeof createBrowserUser>>;
  let member: Awaited<ReturnType<typeof createBrowserUser>>;
  let solo: Awaited<ReturnType<typeof createBrowserUser>>;

  beforeAll(async ({ browser }) => {
    const runId = Date.now();
    adminName = `Admin ${runId}`;
    memberName = `Member ${runId}`;
    soloName = `Solo ${runId}`;
    groupName = `E2E Squad ${runId}`;
    personalTitle = `Meditation ${runId}`;

    admin = await createBrowserUser(browser);
    member = await createBrowserUser(browser);
    solo = await createBrowserUser(browser);
  });

  afterAll(async () => {
    expect([
      ...admin.unexpected,
      ...member.unexpected,
      ...solo.unexpected,
    ]).toEqual([]);
    await closeQuietly(admin.context);
    await closeQuietly(member.context);
    await closeQuietly(solo.context);
  });

  test('registration, group create, and member join', async () => {
    await register(admin.page, adminName, uniquePhone(1));
    await expect(
      admin.page.getByRole('heading', { name: /Create Your Squad/i }),
    ).toBeVisible();
    await admin.page.getByPlaceholder('e.g. Iron Will Crew').fill(groupName);
    await admin.page.getByRole('button', { name: 'Create Group' }).click();
    await expect(
      admin.page.getByRole('heading', { level: 1, name: groupName }),
    ).toBeVisible();

    const inviteUrl = await admin.page.locator('input[readonly]').inputValue();
    expect(inviteUrl).toContain('/join?token=');

    await register(member.page, memberName, uniquePhone(2));
    await member.page.goto(inviteUrl);
    await expect(
      member.page.getByRole('heading', { name: groupName }),
    ).toBeVisible();
    await member.page.getByRole('button', { name: 'Join Group' }).click();
    await expect(member.page).toHaveURL(/\/dashboard/);
    await expect(member.page.getByText(/Today['’]s Activities/)).toBeVisible();

    await admin.page.reload();
    await expect(admin.page.getByText(memberName)).toBeVisible();

    await admin.page.goto('/dashboard');
    await expect(admin.page.getByText(/Today['’]s Activities/)).toBeVisible();
  });

  test('admin logs today activities with proof upload', async () => {
    await expandTask(admin.page, 'Diet');
    await markSubPointDone(admin.page, 'Diet', 'Healthy');
    await markSubPointDone(admin.page, 'Diet', 'No junk');
    await markSubPointDone(admin.page, 'Diet', 'No alcohol');

    const water = await expandTask(admin.page, 'Water');
    await water.locator('input[type="number"]').fill('4');
    await water.locator('input[type="number"]').press('Enter');
    await expect(water).toContainText('Done');

    const noReels = await expandTask(admin.page, 'No Reels/Shorts');
    await noReels
      .locator('button')
      .filter({ hasText: /^0 min/ })
      .click();
    await expect(noReels).toContainText('Done');

    const progressPhoto = taskCard(admin.page, 'Progress photo');
    await progressPhoto
      .getByRole('button', { name: /Progress photo/i })
      .click();
    await expect(progressPhoto.locator('input[type="file"]')).toHaveAttribute(
      'capture',
      'environment',
    );
    await expect(
      progressPhoto.getByRole('button', { name: /Capture proof/i }),
    ).toBeVisible();
    await progressPhoto.locator('input[type="file"]').setInputFiles({
      name: 'proof.png',
      mimeType: 'image/png',
      buffer: tinyPng,
    });
    await expect(
      progressPhoto.getByRole('button', { name: /Retake proof/i }),
    ).toBeVisible();
  });

  test('admin navigates leaderboard, progress, history, and gallery', async () => {
    await admin.page.goto('/leaderboard');
    await expect(
      admin.page.getByRole('heading', { name: 'Leaderboard' }),
    ).toBeVisible();
    await expect(admin.page.getByText(adminName).first()).toBeVisible();
    await expect(admin.page.getByText(memberName).first()).toBeVisible();

    for (const width of [320, 375, 390, 430]) {
      await admin.page.setViewportSize({ width, height: 720 });
      await admin.page.goto('/leaderboard');
      await expect(
        admin.page.getByTestId('leaderboard-mobile-list'),
      ).toBeVisible();
      await expect(admin.page.getByText(/\d+%/).first()).toBeVisible();
      await expect(
        admin.page.getByRole('tab', { name: 'This week' }),
      ).toHaveAttribute('aria-selected', 'false');
      await admin.page.getByRole('tab', { name: 'This week' }).click();
      await expect(
        admin.page.getByRole('tab', { name: 'This week' }),
      ).toHaveAttribute('aria-selected', 'true');
      const hasHorizontalOverflow = await admin.page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(hasHorizontalOverflow).toBe(false);
    }

    await admin.page.setViewportSize({ width: 1280, height: 720 });
    await admin.page.goto('/leaderboard');
    await expect(
      admin.page.getByRole('columnheader', { name: 'Success' }),
    ).toBeVisible();

    await admin.page.goto('/progress');
    await expect(
      admin.page.getByRole('heading', { name: 'Progress' }),
    ).toBeVisible();
    await expect(admin.page.getByText('Leaderboard XP')).toBeVisible();

    await admin.page.goto('/history');
    await expect(
      admin.page.getByRole('heading', { name: 'History' }),
    ).toBeVisible();

    await admin.page.goto('/gallery');
    await expect(
      admin.page.getByRole('heading', { name: 'Photo Gallery' }),
    ).toBeVisible();
    await expect(
      admin.page.getByRole('img', { name: 'Progress photo' }),
    ).toBeVisible();
  });

  test('solo personal activity and profile whatsapp opt-in', async () => {
    await register(solo.page, soloName, uniquePhone(3));
    await solo.page.goto('/profile');
    await expect(
      solo.page.getByRole('heading', { name: 'Profile' }),
    ).toBeVisible();
    await solo.page.getByRole('button', { name: 'Add' }).click();
    await solo.page.locator('#activity-title').fill(personalTitle);
    await solo.page.locator('#activity-emoji').fill('🧘');
    await solo.page.getByRole('button', { name: 'Create' }).click();
    await expect(solo.page.getByText(personalTitle)).toBeVisible();

    await solo.page.goto('/dashboard');
    await expect(
      solo.page.getByText('Personal · off leaderboard'),
    ).toBeVisible();
    await taskCard(solo.page, personalTitle)
      .getByRole('button', { name: new RegExp(personalTitle) })
      .click();
    await expect(taskCard(solo.page, personalTitle)).toContainText('Done');

    await solo.page.goto('/profile');
    await solo.page.getByRole('switch').click();
    await expect(solo.page.getByText('Profile updated')).toBeVisible();
  });
});
