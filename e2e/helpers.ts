import { expect, type Browser, type Page } from '@playwright/test';

export const password = 'CorrectHorse123';

export const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

/**
 * Phone numbers must be unique per run so parallel-friendly registrations never
 * collide. Each caller passes a distinct offset so multiple users created in the
 * same millisecond still differ.
 */
export function uniquePhone(offset: number): string {
  const suffix = String((Date.now() + offset) % 1_000_000_000).padStart(9, '0');
  return `9${suffix}`;
}

export async function register(page: Page, name: string, phone: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Register' }).click();
  await page.getByPlaceholder('Your name').fill(name);
  await page.getByPlaceholder('9876543210').fill(phone);
  await page.getByPlaceholder('Min 8 characters').fill(password);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page).toHaveURL(/\/join/);
}

/**
 * Drives the group onboarding form (the no-group state of `/join`) and returns
 * the freshly minted invite URL. Assumes the page is already on `/join`.
 */
export async function createGroup(page: Page, groupName: string) {
  await expect(
    page.getByRole('heading', { name: /Choose your path/i }),
  ).toBeVisible();
  await page.getByPlaceholder('e.g. Iron Will Crew').fill(groupName);
  await page.getByRole('button', { name: 'Create Fellowship' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: groupName }),
  ).toBeVisible();
  return readInviteUrl(page);
}

/** Reads the invite URL from the group invite card's readonly input. */
export async function readInviteUrl(page: Page) {
  const inviteUrl = await page.locator('input[readonly]').inputValue();
  expect(inviteUrl).toContain('/join?token=');
  return inviteUrl;
}

/**
 * Accepts an invite for an already-registered user and waits for the dashboard.
 */
export async function joinViaInvite(
  page: Page,
  inviteUrl: string,
  groupName: string,
) {
  await page.goto(inviteUrl);
  await expect(page.getByRole('heading', { name: groupName })).toBeVisible();
  await page.getByRole('button', { name: 'Join Group' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText(/Today['’]s Activities/)).toBeVisible();
}

export function taskCard(page: Page, title: string) {
  return page.locator('.overflow-hidden').filter({ hasText: title }).first();
}

export async function expandTask(page: Page, title: string) {
  const card = taskCard(page, title);
  const expandButton = card.getByRole('button', { name: 'Expand' });
  if (await expandButton.isVisible().catch(() => false)) {
    await expandButton.click();
  }
  return card;
}

export async function markSubPointDone(
  page: Page,
  activity: string,
  label: string,
) {
  const card = taskCard(page, activity);
  const row = card.locator('div').filter({ hasText: label }).last();
  await row.getByRole('button', { name: 'Done' }).click();
}

export type BrowserUser = {
  context: Awaited<ReturnType<Browser['newContext']>>;
  page: Page;
  unexpected: string[];
};

/**
 * Opens an isolated browser context that records unexpected console/page errors
 * so specs can assert a clean browser at teardown.
 */
export async function createBrowserUser(
  browser: Browser,
): Promise<BrowserUser> {
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

export async function closeQuietly(
  context: Awaited<ReturnType<Browser['newContext']>>,
) {
  await context.close().catch(() => {});
}
