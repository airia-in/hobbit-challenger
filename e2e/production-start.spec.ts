import { afterAll, beforeAll, expect, test } from '@playwright/test';
import {
  closeQuietly,
  createBrowserUser,
  expandTask,
  markSubPointDone,
  register,
  taskCard,
  tinyPng,
  uniquePhone,
} from './helpers';

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
      admin.page.getByRole('heading', { name: /Choose your path/i }),
    ).toBeVisible();
    await admin.page.getByPlaceholder('e.g. Iron Will Crew').fill(groupName);
    await admin.page.getByRole('button', { name: 'Create Fellowship' }).click();
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
    await expect(
      admin.page.getByTestId('leaderboard-desktop-table'),
    ).toBeVisible();
    await expect(
      admin.page.getByTestId('leaderboard-desktop-table').getByText(adminName),
    ).toBeVisible();
    await expect(
      admin.page.getByTestId('leaderboard-desktop-table').getByText(memberName),
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
