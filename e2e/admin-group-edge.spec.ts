import {
  afterAll,
  beforeAll,
  expect,
  test,
  type Locator,
} from '@playwright/test';
import {
  closeQuietly,
  createBrowserUser,
  createGroup,
  joinViaInvite,
  register,
  uniquePhone,
  type BrowserUser,
} from './helpers';

/**
 * Edge-flow coverage for the high-churn admin/group paths that the happy-path
 * sweep in `production-start.spec.ts` does not exercise: regenerating an invite,
 * transferring/removing admin, editing a scored activity, removing a member,
 * leaving a group, and the admin/groupless guard states.
 */
test.describe('admin and group edge flows', () => {
  test.describe.configure({ mode: 'serial' });

  let adminName: string;
  let memberOneName: string;
  let memberTwoName: string;
  let groupName: string;

  let admin: BrowserUser;
  let memberOne: BrowserUser;
  let memberTwo: BrowserUser;
  let solo: BrowserUser;

  // Scopes to the open confirmation modal so its action button is not confused
  // with the same-named button in the member row that opened it.
  function modal(user: BrowserUser): Locator {
    return user.page.locator('.fixed.inset-0');
  }

  function memberRow(user: BrowserUser, name: string): Locator {
    return user.page.locator('li').filter({ hasText: name });
  }

  beforeAll(async ({ browser }) => {
    const runId = Date.now();
    adminName = `Admin ${runId}`;
    memberOneName = `MemberOne ${runId}`;
    memberTwoName = `MemberTwo ${runId}`;
    groupName = `Edge Squad ${runId}`;

    admin = await createBrowserUser(browser);
    memberOne = await createBrowserUser(browser);
    memberTwo = await createBrowserUser(browser);
    solo = await createBrowserUser(browser);

    await register(admin.page, adminName, uniquePhone(11));
    const inviteUrl = await createGroup(admin.page, groupName);

    await register(memberOne.page, memberOneName, uniquePhone(12));
    await joinViaInvite(memberOne.page, inviteUrl, groupName);

    await register(memberTwo.page, memberTwoName, uniquePhone(13));
    await joinViaInvite(memberTwo.page, inviteUrl, groupName);

    // A groupless user for the onboarding + guard checks below.
    await register(solo.page, `Solo ${runId}`, uniquePhone(14));
  });

  afterAll(async () => {
    expect([
      ...admin.unexpected,
      ...memberOne.unexpected,
      ...memberTwo.unexpected,
      ...solo.unexpected,
    ]).toEqual([]);
    await closeQuietly(admin.context);
    await closeQuietly(memberOne.context);
    await closeQuietly(memberTwo.context);
    await closeQuietly(solo.context);
  });

  test('admin regenerates the invite link and the URL rotates', async () => {
    await admin.page.goto('/join');
    const inviteInput = admin.page.locator('input[readonly]');
    const previousUrl = await inviteInput.inputValue();

    await admin.page
      .getByRole('button', { name: 'Regenerate invite link' })
      .click();

    await expect(inviteInput).not.toHaveValue(previousUrl);
    const rotatedUrl = await inviteInput.inputValue();
    expect(rotatedUrl).toContain('/join?token=');
    expect(rotatedUrl).not.toEqual(previousUrl);
  });

  test('admin promotes then demotes a co-admin', async () => {
    await admin.page.goto('/join');
    const row = memberRow(admin, memberTwoName);
    await expect(row.getByText('Admin', { exact: true })).toHaveCount(0);

    await row.getByRole('button', { name: 'Make admin' }).click();
    await expect(
      modal(admin).getByRole('heading', {
        name: new RegExp(`Make ${memberTwoName} an admin`),
      }),
    ).toBeVisible();
    await modal(admin).getByRole('button', { name: 'Make admin' }).click();
    await expect(row.getByText('Admin', { exact: true })).toBeVisible();

    await row.getByRole('button', { name: 'Remove admin' }).click();
    await expect(
      modal(admin).getByRole('heading', {
        name: new RegExp(`Remove ${memberTwoName}'s admin access`),
      }),
    ).toBeVisible();
    await modal(admin).getByRole('button', { name: 'Remove admin' }).click();
    await expect(row.getByText('Admin', { exact: true })).toHaveCount(0);
  });

  test('admin edits a scored activity title', async () => {
    await admin.page.goto('/admin/activities');
    await expect(
      admin.page.getByRole('heading', { name: 'Group Activities' }),
    ).toBeVisible();

    const firstRow = admin.page
      .locator('[data-testid^="activity-row-"]')
      .first();
    const originalTitle = (
      await firstRow.getByRole('heading').first().textContent()
    )?.trim();
    expect(originalTitle).toBeTruthy();
    const renamed = `${originalTitle} E2E`;

    await firstRow.getByRole('button', { name: 'Edit' }).click();
    const titleField = firstRow.getByLabel('Title', { exact: true });
    await titleField.fill(renamed);
    await firstRow.getByRole('button', { name: 'Save changes' }).click();

    // Editor closes on success and the list re-renders with the new title.
    await expect(
      admin.page.getByRole('heading', { name: renamed }),
    ).toBeVisible();
    await expect(
      admin.page.getByRole('button', { name: 'Save changes' }),
    ).toHaveCount(0);
  });

  test('non-admin member is blocked from admin pages', async () => {
    await memberOne.page.goto('/admin/group');
    await expect(memberOne.page.getByText('Admin access only')).toBeVisible();

    await memberOne.page.goto('/admin/activities');
    await expect(memberOne.page.getByText('Admin access only')).toBeVisible();
  });

  test('member leaves the group from the profile confirm modal', async () => {
    await memberOne.page.goto('/profile');
    await memberOne.page.getByRole('button', { name: 'Leave Group' }).click();

    await expect(
      modal(memberOne).getByRole('heading', { name: 'Leave group?' }),
    ).toBeVisible();
    await modal(memberOne).getByRole('button', { name: 'Leave' }).click();

    await expect(
      memberOne.page.getByText('You have left the group'),
    ).toBeVisible();
  });

  test('admin removes a member and they drop back to groupless', async () => {
    await admin.page.goto('/join');
    const row = memberRow(admin, memberTwoName);
    await row.getByRole('button', { name: 'Remove' }).click();

    await expect(
      modal(admin).getByRole('heading', {
        name: new RegExp(`Remove ${memberTwoName} from the group`),
      }),
    ).toBeVisible();
    await modal(admin).getByRole('button', { name: 'Remove' }).click();

    await expect(memberRow(admin, memberTwoName)).toHaveCount(0);

    // The removed member now lands on the group-onboarding choice.
    await memberTwo.page.goto('/join');
    await expect(
      memberTwo.page.getByRole('heading', { name: /Choose your path/i }),
    ).toBeVisible();
  });

  test('groupless user gets onboarding and is blocked from admin pages', async () => {
    await solo.page.goto('/join');
    await expect(
      solo.page.getByRole('heading', { name: /Choose your path/i }),
    ).toBeVisible();

    await solo.page.goto('/admin/group');
    await expect(solo.page.getByText('You are not in a group.')).toBeVisible();

    await solo.page.goto('/admin/activities');
    await expect(solo.page.getByText('You are not in a group.')).toBeVisible();
  });
});
