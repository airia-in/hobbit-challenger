import { useEffect, useRef, useState } from 'react';
import { ProofUploader } from '@workspace-starter/ui';
import { AuthGateInner } from '../auth/AuthGate';
import { AuthenticatedImage } from '../common/AuthenticatedImage';
import { QueryErrorState } from '../common/QueryErrorState';
import { AppShell } from '../layout/AppNav';
import { TrpcProvider } from '../TrpcProvider';
import { PersonalActivitiesSection } from '../activities/PersonalActivitiesSection';
import { getToken, performClientLogout } from '../../lib/auth';
import {
  getStoredThemeMode,
  initTheme,
  setThemeMode,
  type ThemeMode,
} from '../../lib/theme';
import { trpc } from '../../lib/trpc';

const apiUrl = import.meta.env.PUBLIC_API_URL ?? 'http://localhost:3001';

const ANCHOR_SUGGESTIONS = [
  'morning coffee',
  'brushing teeth',
  'dinner',
] as const;

const HABIT_ANCHOR_TEXT_MAX_LENGTH = 80;

function phoneToLocalInput(e164: string | null): string {
  if (!e164) return '';
  if (e164.startsWith('+91')) return e164.slice(3);
  return e164.replace(/^\+\d+/, '');
}

function getTimezoneOptions(currentTimezone: string): string[] {
  const supported =
    typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : [currentTimezone];
  if (!supported.includes(currentTimezone)) {
    return [currentTimezone, ...supported];
  }
  return supported;
}

type LeaveGroupProfile = {
  groupId: string | null;
  groupName: string | null;
  isGroupAdmin: boolean;
  groupMemberCount: number;
  groupAdminCount: number;
};

type LeaveGroupMode = 'none' | 'leave' | 'dissolve' | 'blocked';

function getLeaveGroupMode(profile: LeaveGroupProfile): LeaveGroupMode {
  if (!profile.groupId) return 'none';
  if (!profile.isGroupAdmin || profile.groupAdminCount > 1) return 'leave';
  if (profile.groupMemberCount <= 1) return 'dissolve';
  return 'blocked';
}

export function ProfileContent() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [habitAnchorText, setHabitAnchorText] = useState('');
  const [habitAnchorTime, setHabitAnchorTime] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [whatsappOptIn, setWhatsappOptIn] = useState(true);
  const [weeklyRecapOptIn, setWeeklyRecapOptIn] = useState(true);
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const reminderInputRef = useRef<HTMLInputElement>(null);
  const anchorInputRef = useRef<HTMLInputElement>(null);
  const reminderFocusHandledRef = useRef(false);
  const anchorFocusHandledRef = useRef(false);

  const utils = trpc.useUtils();
  const profile = trpc.profile.get.useQuery();
  const updateProfile = trpc.profile.update.useMutation({
    onSuccess: () => {
      void utils.profile.get.invalidate();
      setMessage('Profile updated');
      setPassword('');
    },
  });
  const leaveGroup = trpc.profile.leaveGroup.useMutation({
    onSuccess: (result) => {
      void utils.profile.get.invalidate();
      void utils.auth.me.invalidate();
      void utils.groups.getMine.invalidate();
      setShowLeaveModal(false);
      setMessage(
        'dissolved' in result && result.dissolved
          ? 'Group dissolved'
          : 'You have left the group',
      );
    },
  });
  const logout = trpc.auth.logout.useMutation({
    onSettled: () => {
      performClientLogout();
    },
  });
  const exportCsv = trpc.history.exportCsv.useQuery(undefined, {
    enabled: false,
  });

  useEffect(() => {
    initTheme();
    setThemeModeState(getStoredThemeMode());
  }, []);

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.name);
      setPhone(phoneToLocalInput(profile.data.phone));
      setEmail(profile.data.email ?? '');
      setReminderTime(profile.data.reminderTime ?? '');
      setHabitAnchorText(profile.data.habitAnchorText ?? '');
      setHabitAnchorTime(profile.data.habitAnchorTime ?? '');
      setTimezone(profile.data.timezone);
      setWhatsappOptIn(profile.data.whatsappOptIn);
      setWeeklyRecapOptIn(profile.data.weeklyRecapOptIn);
    }
  }, [profile.data]);

  const needsPhoneMigration = profile.data?.needsPhoneMigration ?? false;
  const hasStoredPhone = Boolean(profile.data?.phone);
  const canUseWhatsappRecaps = hasStoredPhone && whatsappOptIn;

  useEffect(() => {
    if (!needsPhoneMigration || !phoneInputRef.current) return;
    phoneInputRef.current.focus();
    phoneInputRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [needsPhoneMigration]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (reminderFocusHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('focus') !== 'reminder' || !reminderInputRef.current) return;
    reminderFocusHandledRef.current = true;
    reminderInputRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    reminderInputRef.current.focus();
  }, [profile.data]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (anchorFocusHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('focus') !== 'anchor' || !anchorInputRef.current) return;
    anchorFocusHandledRef.current = true;
    anchorInputRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    anchorInputRef.current.focus();
  }, [profile.data]);

  function handleAlignReminderToAnchor() {
    if (!habitAnchorTime) return;
    setMessage(null);
    setReminderTime(habitAnchorTime);
    updateProfile.mutate({ reminderTime: habitAnchorTime });
  }

  const anchorTimeDiffersFromReminder =
    Boolean(habitAnchorTime) && habitAnchorTime !== reminderTime;
  const anchorSuggestsReminderTime =
    Boolean(habitAnchorTime) && !reminderTime && !profile.data?.reminderTime;

  function handleWhatsappOptInChange(enabled: boolean) {
    setWhatsappOptIn(enabled);
    setMessage(null);
    updateProfile.mutate(
      { whatsappOptIn: enabled },
      {
        onError: () => {
          setWhatsappOptIn(!enabled);
        },
      },
    );
  }

  function handleThemeModeChange(mode: ThemeMode) {
    setThemeModeState(mode);
    setThemeMode(mode);
  }

  function handleWeeklyRecapOptInChange(enabled: boolean) {
    setWeeklyRecapOptIn(enabled);
    setMessage(null);
    updateProfile.mutate(
      { weeklyRecapOptIn: enabled },
      {
        onError: () => {
          setWeeklyRecapOptIn(!enabled);
        },
      },
    );
  }

  function handleExport() {
    setExportError(null);
    void exportCsv.refetch().then((result) => {
      const csv = result.data?.csv;
      if (!csv) {
        setExportError('Export failed, please try again.');
        return;
      }
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'hobbit-export.csv';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  if (profile.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm uppercase tracking-[0.3em] text-[var(--text-muted)]">
          Loading profile...
        </p>
      </div>
    );
  }

  if (profile.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <QueryErrorState
          message={profile.error?.message}
          onRetry={() => profile.refetch()}
        />
      </div>
    );
  }

  const data = profile.data!;
  const timezoneOptions = getTimezoneOptions(data.timezone);
  const leaveGroupMode = getLeaveGroupMode(data);
  const leaveGroupName = data.groupName ?? 'this group';
  const leaveModalTitle =
    leaveGroupMode === 'dissolve'
      ? `Dissolve ${leaveGroupName}?`
      : leaveGroupMode === 'blocked'
        ? 'Transfer admin access first'
        : 'Leave group?';
  const leaveModalBody =
    leaveGroupMode === 'dissolve'
      ? `This will permanently remove ${leaveGroupName}, including group admin settings and day labels. Your current attempt will be archived.`
      : leaveGroupMode === 'blocked'
        ? 'Promote another member to admin before leaving so the group still has someone who can manage it.'
        : `Your current attempt will be archived and you will be removed from ${leaveGroupName}.`;

  return (
    <div className="mx-auto max-w-lg space-y-8 px-4 py-8">
      <header>
        <h1
          className="text-4xl text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Profile
        </h1>
      </header>

      {message && (
        <p className="rounded border border-[var(--success)] bg-[var(--success)]/10 px-4 py-2 text-sm text-[var(--success)]">
          {message}
        </p>
      )}

      {needsPhoneMigration && (
        <div
          className="rounded-lg border border-[var(--accent-red)]/50 bg-[var(--accent-red)]/10 px-4 py-4"
          role="status"
        >
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Add your phone number to finish setting up your account
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            We&apos;re moving to phone-based sign-in. Add your number below so
            you can log in with it next time
            {data.whatsappOptIn ? ' and receive WhatsApp reminders' : ''}.
          </p>
        </div>
      )}

      <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--border)] text-2xl font-bold text-[var(--text-muted)]">
            {data.avatarUrl ? (
              <AuthenticatedImage
                src={data.avatarUrl}
                alt=""
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              data.name.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <p className="text-lg font-medium text-[var(--text-primary)]">
              {data.name}
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              {data.phone ?? data.email ?? 'No contact on file'}
            </p>
            {data.email && data.phone && (
              <p className="text-xs text-[var(--text-muted)]">{data.email}</p>
            )}
            {data.groupName && (
              <p className="text-xs text-[var(--text-muted)]">
                Group: {data.groupName}
              </p>
            )}
          </div>
        </div>

        <ProofUploader
          uploadUrl={`${apiUrl}/api/uploads`}
          apiBaseUrl={apiUrl}
          authToken={getToken()}
          accept="image/jpeg,image/png,image/webp"
          value={data.avatarUrl}
          onUploaded={(url) => {
            setMessage(null);
            updateProfile.mutate({ avatarUrl: url });
          }}
          onError={() => setMessage(null)}
          buttonClassName="text-xs"
          previewClassName="max-h-32 rounded-full"
        />

        {data.avatarUrl && (
          <button
            type="button"
            data-testid="remove-avatar-button"
            onClick={() => {
              setMessage(null);
              updateProfile.mutate({ avatarUrl: null });
            }}
            disabled={updateProfile.isPending}
            className="text-xs uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent-red)] disabled:opacity-50"
          >
            Remove photo
          </button>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          updateProfile.mutate({
            name: name !== data.name ? name : undefined,
            phone: phone !== phoneToLocalInput(data.phone) ? phone : undefined,
            email:
              email !== (data.email ?? '')
                ? email
                  ? email
                  : undefined
                : undefined,
            password: password || undefined,
            reminderTime: reminderTime || null,
            habitAnchorText: habitAnchorText.trim()
              ? habitAnchorText.trim()
              : null,
            habitAnchorTime: habitAnchorTime || null,
            timezone: timezone !== data.timezone ? timezone : undefined,
          });
        }}
        className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6"
      >
        <h2 className="text-sm uppercase tracking-wider text-[var(--text-muted)]">
          Account Settings
        </h2>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--text-muted)]">
            Display name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--text-muted)]">
            Phone
          </label>
          <div className="flex">
            <span className="inline-flex items-center rounded-l border border-r-0 border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-muted)]">
              +91
            </span>
            <input
              ref={phoneInputRef}
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9876543210"
              className={`w-full rounded-r border bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)] ${
                needsPhoneMigration
                  ? 'border-[var(--accent-red)] focus:border-[var(--accent-red)]'
                  : 'border-[var(--border)]'
              }`}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--text-muted)]">
            Email <span className="normal-case">(optional)</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--text-muted)]">
            New password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank to keep current"
            className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--text-muted)]">
            Timezone
          </label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)]"
          >
            {timezoneOptions.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Controls when your day resets and when reminders are sent.
          </p>
          <button
            type="button"
            onClick={() =>
              setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
            }
            className="mt-2 text-xs text-[var(--accent-red)] hover:underline"
          >
            Detect from browser
          </button>
        </div>

        <div id="reminder-time">
          <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--text-muted)]">
            Morning reminder time
          </label>
          <input
            id="reminder-time-input"
            ref={reminderInputRef}
            type="time"
            value={reminderTime}
            onChange={(e) => setReminderTime(e.target.value)}
            className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)]"
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Used for WhatsApp morning reminders in your timezone.
          </p>
          {anchorSuggestsReminderTime && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Your habit anchor is around {habitAnchorTime}.{' '}
              <button
                type="button"
                onClick={() => setReminderTime(habitAnchorTime)}
                className="text-[var(--accent-red)] hover:underline"
              >
                Use this time for reminders
              </button>
            </p>
          )}
        </div>

        <div id="habit-anchor">
          <label className="mb-1 block text-xs uppercase tracking-wider text-[var(--text-muted)]">
            After I… I will check in
          </label>
          <input
            id="habit-anchor-input"
            ref={anchorInputRef}
            type="text"
            value={habitAnchorText}
            onChange={(e) =>
              setHabitAnchorText(
                e.target.value.slice(0, HABIT_ANCHOR_TEXT_MAX_LENGTH),
              )
            }
            placeholder="morning coffee, brushing teeth…"
            maxLength={HABIT_ANCHOR_TEXT_MAX_LENGTH}
            className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)]"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {ANCHOR_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setHabitAnchorText(suggestion)}
                className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] hover:border-[var(--accent-red)] hover:text-[var(--text-primary)]"
              >
                {suggestion}
              </button>
            ))}
          </div>
          <label className="mb-1 mt-3 block text-xs uppercase tracking-wider text-[var(--text-muted)]">
            Anchor time <span className="normal-case">(optional)</span>
          </label>
          <input
            type="time"
            value={habitAnchorTime}
            onChange={(e) => setHabitAnchorTime(e.target.value)}
            className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-[var(--text-primary)]"
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            When you usually do this — helps suggest a reminder time.
          </p>
          {anchorTimeDiffersFromReminder && (
            <button
              type="button"
              onClick={handleAlignReminderToAnchor}
              disabled={updateProfile.isPending}
              className="mt-2 text-xs text-[var(--accent-red)] hover:underline disabled:opacity-50"
            >
              Align morning reminder to {habitAnchorTime}
            </button>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-[var(--text-primary)]">
              WhatsApp reminders
            </span>
            <p className="text-xs text-[var(--text-muted)]">
              Morning and evening nudges via WhatsApp
            </p>
            {!hasStoredPhone && (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Add your phone number above to enable WhatsApp reminders.{' '}
                <button
                  type="button"
                  onClick={() => {
                    phoneInputRef.current?.focus();
                    phoneInputRef.current?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'center',
                    });
                  }}
                  className="text-[var(--accent-red)] hover:underline"
                >
                  Add phone
                </button>
              </p>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={whatsappOptIn}
            aria-disabled={!hasStoredPhone}
            onClick={() => handleWhatsappOptInChange(!whatsappOptIn)}
            disabled={!hasStoredPhone || updateProfile.isPending}
            className={`relative h-7 w-12 shrink-0 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${
              whatsappOptIn
                ? 'border-[var(--accent-red)] bg-[var(--accent-red)]'
                : 'border-[var(--border)] bg-[var(--surface-raised)]'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                whatsappOptIn ? 'left-6' : 'left-0.5'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-[var(--text-primary)]">
              Weekly Story So Far recap
            </span>
            <p className="text-xs text-[var(--text-muted)]">
              Sunday WhatsApp summary of your week on the trail
            </p>
            {!canUseWhatsappRecaps && (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Add your phone and enable WhatsApp reminders to receive weekly
                recaps.{' '}
                {!hasStoredPhone ? (
                  <button
                    type="button"
                    onClick={() => {
                      phoneInputRef.current?.focus();
                      phoneInputRef.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                      });
                    }}
                    className="text-[var(--accent-red)] hover:underline"
                  >
                    Add phone
                  </button>
                ) : null}
              </p>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={weeklyRecapOptIn}
            aria-disabled={!canUseWhatsappRecaps}
            onClick={() => handleWeeklyRecapOptInChange(!weeklyRecapOptIn)}
            disabled={!canUseWhatsappRecaps || updateProfile.isPending}
            className={`relative h-7 w-12 shrink-0 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${
              weeklyRecapOptIn
                ? 'border-[var(--accent-red)] bg-[var(--accent-red)]'
                : 'border-[var(--border)] bg-[var(--surface-raised)]'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                weeklyRecapOptIn ? 'left-6' : 'left-0.5'
              }`}
            />
          </button>
        </div>

        {updateProfile.error && (
          <p className="text-sm text-[var(--accent-red)]">
            {updateProfile.error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={updateProfile.isPending}
          className="w-full rounded bg-[var(--accent-red)] py-3 text-sm font-bold uppercase tracking-widest text-[var(--text-on-accent)] disabled:opacity-50"
        >
          {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </form>

      <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="text-sm uppercase tracking-wider text-[var(--text-muted)]">
          Appearance
        </h2>
        <div>
          <span className="text-sm text-[var(--text-primary)]">Theme</span>
          <p className="text-xs text-[var(--text-muted)]">
            Choose light, dark, or match your system settings
          </p>
        </div>
        <div className="flex gap-2" role="radiogroup" aria-label="Theme">
          {(['light', 'dark', 'system'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={themeMode === mode}
              onClick={() => handleThemeModeChange(mode)}
              className={`flex-1 rounded border py-2 text-xs font-semibold uppercase tracking-wider transition ${
                themeMode === mode
                  ? 'border-[var(--accent-red)] bg-[var(--accent-red)] text-[var(--text-on-accent)]'
                  : 'border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--text-muted)]'
              }`}
            >
              {mode === 'system'
                ? 'System'
                : mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <PersonalActivitiesSection />

      {data.isGroupAdmin && (
        <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="text-sm uppercase tracking-wider text-[var(--text-muted)]">
            Admin
          </h2>
          <a
            href="/admin/activities"
            className="block w-full rounded border border-[var(--border)] py-3 text-center text-sm uppercase tracking-wider text-[var(--text-primary)] hover:border-[var(--accent-red)]"
          >
            Edit Activities
          </a>
          <a
            href="/admin/group"
            className="block w-full rounded border border-[var(--border)] py-3 text-center text-sm uppercase tracking-wider text-[var(--text-primary)] hover:border-[var(--accent-red)]"
          >
            Group Settings
          </a>
        </div>
      )}

      <div className="space-y-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={exportCsv.isFetching}
          className="w-full rounded border border-[var(--border)] py-3 text-sm uppercase tracking-wider text-[var(--text-primary)] hover:border-[var(--accent-red)] disabled:opacity-50"
        >
          {exportCsv.isFetching ? 'Exporting...' : 'Export Data CSV'}
        </button>

        {exportError && (
          <p className="text-sm text-[var(--accent-red)]">{exportError}</p>
        )}

        {leaveGroupMode !== 'none' && (
          <button
            type="button"
            onClick={() => setShowLeaveModal(true)}
            className="w-full rounded border border-[var(--accent-red)] py-3 text-sm uppercase tracking-wider text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10"
          >
            {leaveGroupMode === 'dissolve' ? 'Dissolve Group' : 'Leave Group'}
          </button>
        )}

        <button
          type="button"
          data-testid="sign-out-button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className="w-full rounded border border-[var(--border)] py-3 text-sm uppercase tracking-wider text-[var(--text-muted)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          {logout.isPending ? 'Signing out...' : 'Sign Out'}
        </button>
      </div>

      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] px-4">
          <div className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
            <h3 className="text-lg text-[var(--text-primary)]">
              {leaveModalTitle}
            </h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {leaveModalBody}
            </p>
            {leaveGroup.error && (
              <p className="mt-2 text-sm text-[var(--accent-red)]">
                {leaveGroup.error.message}
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowLeaveModal(false)}
                className="flex-1 rounded border border-[var(--border)] py-2 text-sm text-[var(--text-muted)]"
              >
                Cancel
              </button>
              {leaveGroupMode === 'blocked' ? (
                <a
                  href="/join"
                  className="flex-1 rounded bg-[var(--accent-red)] py-2 text-center text-sm font-bold text-[var(--text-on-accent)]"
                >
                  Manage admins
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => leaveGroup.mutate()}
                  disabled={leaveGroup.isPending}
                  className="flex-1 rounded bg-[var(--accent-red)] py-2 text-sm font-bold text-[var(--text-on-accent)] disabled:opacity-50"
                >
                  {leaveGroup.isPending
                    ? leaveGroupMode === 'dissolve'
                      ? 'Dissolving...'
                      : 'Leaving...'
                    : leaveGroupMode === 'dissolve'
                      ? 'Dissolve'
                      : 'Leave'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type ProfilePageProps = {
  currentPath?: string;
};

export function ProfilePage({ currentPath }: ProfilePageProps) {
  return (
    <TrpcProvider>
      <AuthGateInner>
        <AppShell currentPath={currentPath}>
          <ProfileContent />
        </AppShell>
      </AuthGateInner>
    </TrpcProvider>
  );
}
