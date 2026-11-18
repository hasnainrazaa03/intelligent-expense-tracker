import React, { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { useSetting } from '../hooks/useSetting';
import { updateSettings } from '../utils/settingsStore';
import { ApiError, getPushKey, sendTestPush, changePassword } from '../services/api';
import { isStrongPassword, PASSWORD_RULES_TEXT } from '../utils/password';
import { currentPushState, enablePush, disablePush, needsHomeScreenInstall, type PushState } from '../utils/push';
import { notify } from '../utils/notifications';
import { analyticsOptedOut, browserAsksNotToTrack, setAnalyticsOptOut } from '../utils/analytics';
import CurrencyPicker from './CurrencyPicker';
import ConfirmationDialog from './ConfirmationDialog';
import { Button, Card, Input, Label, cn } from './ui';

interface SettingsPageProps {
  /** Opens the export / import / backup dialog. */
  onOpenData: () => void;
  onManageCategories: () => void;
  onManageBudgets: () => void;
}

// One place for the account's settings (improvement 7). They used to be spread
// over header icons, and the gear icon silently turned on two-factor sign-in.

const Section: React.FC<{ title: string; description?: string; danger?: boolean; children: React.ReactNode }> = ({ title, description, danger, children }) => {
  const id = useId();
  return (
    <Card padding="p-5 md:p-6" className={cn(danger && 'border border-danger/40')} role="region" aria-labelledby={id}>
      <h2 id={id} className={cn('font-display text-lg font-bold', danger ? 'text-danger' : 'text-app-text')}>{title}</h2>
      {description && <p className="text-sm text-app-muted mt-1">{description}</p>}
      <div className="mt-4 divide-y divide-app-border">{children}</div>
    </Card>
  );
};

/** A setting: what it is on the left, its control on the right (stacked on phones). */
const Row: React.FC<{ title: string; hint?: React.ReactNode; children: React.ReactNode }> = ({ title, hint, children }) => (
  <div className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold text-app-text">{title}</p>
      {hint && <div className="text-xs text-app-muted mt-0.5 leading-relaxed">{hint}</div>}
    </div>
    <div className="flex flex-wrap items-center gap-2 sm:justify-end">{children}</div>
  </div>
);

const Switch: React.FC<{ checked: boolean; label: string; onChange: (next: boolean) => void; disabled?: boolean }> = ({ checked, label, onChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn('relative inline-flex h-7 w-12 items-center rounded-full border transition-colors disabled:opacity-50', checked ? 'bg-primary border-primary' : 'bg-surface-2 border-app-border')}
  >
    <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
  </button>
);

const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Push notifications (5e-2): this browser on or off, and which kinds (account-wide). */
const NotificationsSection: React.FC = () => {
  const [device, setDevice] = useState<PushState | 'loading'>('loading');
  // Push needs keys on the server; until they're set, say so instead of failing later.
  const [serverReady, setServerReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const budgetsOn = useSetting('notifyBudgets') === true;
  const billsOn = useSetting('notifyBills') === true;
  const summaryOn = useSetting('notifyMonthlySummary') === true;

  useEffect(() => {
    let alive = true;
    currentPushState().then((s) => { if (alive) setDevice(s); }).catch(() => { if (alive) setDevice('off'); });
    getPushKey().then(() => { if (alive) setServerReady(true); }).catch((e) => { if (alive) setServerReady(!(e instanceof ApiError && e.status === 503)); });
    return () => { alive = false; };
  }, []);

  const turnOn = async () => {
    setBusy(true);
    try {
      const state = await enablePush();
      setDevice(state);
      if (state === 'on') {
        // First time: every kind on. Always: this device's time zone.
        updateSettings({
          timeZone: deviceTimeZone(),
          ...(budgetsOn || billsOn || summaryOn ? {} : { notifyBudgets: true, notifyBills: true, notifyMonthlySummary: true }),
        });
        notify.success('Notifications are on for this device.');
      } else if (state === 'denied') {
        notify.error("Notifications are blocked for Orbit. Allow them in this browser's site settings, then try again.");
      }
    } catch (error) {
      notify.error(errorText(error, "Couldn't turn notifications on."));
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    try { setDevice(await disablePush()); notify.success('Notifications are off for this device.'); }
    catch (error) { notify.error(errorText(error, "Couldn't turn notifications off.")); }
    finally { setBusy(false); }
  };
  const test = async () => {
    try {
      const { sent } = await sendTestPush();
      notify.success(sent > 0 ? 'Test sent. It should appear in a moment.' : 'No device has notifications on.');
    } catch (error) { notify.error(errorText(error, "Couldn't send a test.")); }
  };

  const deviceHint =
    serverReady === false ? "Notifications aren't set up on the server yet."
    : device === 'unsupported' ? (needsHomeScreenInstall()
        ? 'On iPhone and iPad, add Orbit to your Home Screen first (Share → Add to Home Screen), then turn notifications on from there.'
        : "This browser doesn't support notifications.")
    : device === 'denied' ? "Notifications are blocked for Orbit. Allow them in this browser's site settings."
    : device === 'on' ? 'On. The alerts you choose below arrive here, between 9 am and 9 pm your time.'
    : 'Off on this device.';
  const canUse = serverReady !== false && device !== 'unsupported' && device !== 'loading';

  return (
    <Section title="Notifications" description="Email alerts will come once Orbit sends from its own domain.">
      <Row title="This device" hint={deviceHint}>
        {device === 'on' ? (
          <>
            <Button variant="secondary" size="sm" onClick={test} disabled={busy} aria-label="Send a test notification">Send a test</Button>
            <Button variant="secondary" size="sm" onClick={turnOff} disabled={busy} aria-label="Turn off notifications on this device">Turn off</Button>
          </>
        ) : (
          <Button size="sm" onClick={turnOn} disabled={busy || !canUse || device === 'denied'} aria-label="Turn on notifications on this device">{busy ? 'Turning on…' : 'Turn on'}</Button>
        )}
      </Row>
      <Row title="Budget alerts" hint="When a monthly budget reaches 80%, and again at 100%.">
        <Switch checked={budgetsOn} label="Budget alerts" onChange={(v) => updateSettings({ notifyBudgets: v, timeZone: deviceTimeZone() })} />
      </Row>
      <Row title="Bill reminders" hint="Two days before a recurring charge is due (paused ones are skipped).">
        <Switch checked={billsOn} label="Bill reminders" onChange={(v) => updateSettings({ notifyBills: v, timeZone: deviceTimeZone() })} />
      </Row>
      <Row title="Monthly summary" hint="Last month in one line, on the 1st.">
        <Switch checked={summaryOn} label="Monthly summary" onChange={(v) => updateSettings({ notifyMonthlySummary: v, timeZone: deviceTimeZone() })} />
      </Row>
    </Section>
  );
};

const errorText = (error: unknown, fallback: string): string => {
  if (error instanceof ApiError) {
    if (error.status === 401 && /incorrect password/i.test(error.message)) return "That password isn't right.";
    return error.message || fallback;
  }
  return "Couldn't reach the server. Check your connection and try again.";
};

const SettingsPage: React.FC<SettingsPageProps> = ({ onOpenData, onManageCategories, onManageBudgets }) => {
  const navigate = useNavigate();
  const { userEmail, twoFactorEnabled, setTwoFactor, logout, logoutEverywhere, deleteAccount } = useAuth();
  const { theme, setTheme } = useTheme();
  const hideTuition = useSetting('hideTuition') ?? false;
  const notTracked = browserAsksNotToTrack();
  const [countVisits, setCountVisits] = useState(() => !notTracked && !analyticsOptedOut());

  // Sign out everywhere
  const [confirmEverywhere, setConfirmEverywhere] = useState(false);
  const [signingOutEverywhere, setSigningOutEverywhere] = useState(false);
  const signOutEverywhere = async () => {
    setSigningOutEverywhere(true);
    try {
      await logoutEverywhere();
      notify.success('Signed out on every device.');
      navigate('/login', { replace: true });
    } catch (error) {
      notify.error(errorText(error, "Couldn't sign out everywhere."));
      setSigningOutEverywhere(false);
      setConfirmEverywhere(false);
    }
  };

  // Two-factor
  const [confirm2fa, setConfirm2fa] = useState(false);
  const [disabling2fa, setDisabling2fa] = useState(false);
  const [twoFaPassword, setTwoFaPassword] = useState('');
  const [twoFaBusy, setTwoFaBusy] = useState(false);
  const [twoFaError, setTwoFaError] = useState<string | null>(null);
  const turnOn2fa = async () => {
    setTwoFaBusy(true);
    try {
      await setTwoFactor(true);
      notify.success('Two-factor sign-in is on.');
    } catch (error) {
      notify.error(errorText(error, "Couldn't turn on two-factor sign-in."));
    } finally {
      setTwoFaBusy(false);
      setConfirm2fa(false);
    }
  };
  const turnOff2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFaPassword) return;
    setTwoFaBusy(true);
    setTwoFaError(null);
    try {
      await setTwoFactor(false, twoFaPassword);
      notify.success('Two-factor sign-in is off.');
      setDisabling2fa(false);
      setTwoFaPassword('');
    } catch (error) {
      setTwoFaError(errorText(error, "Couldn't turn off two-factor sign-in."));
    } finally {
      setTwoFaBusy(false);
    }
  };

  // Change password
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const closePasswordForm = () => {
    setChangingPassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setRepeatPassword('');
    setPasswordError(null);
  };
  const submitPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordBusy) return;
    if (!isStrongPassword(newPassword)) return setPasswordError(`The new password is too weak. ${PASSWORD_RULES_TEXT}`);
    if (newPassword !== repeatPassword) return setPasswordError("The new passwords don't match.");
    setPasswordBusy(true);
    setPasswordError(null);
    try {
      const { message } = await changePassword(currentPassword, newPassword);
      notify.success(message || 'Password changed.');
      closePasswordForm();
    } catch (error) {
      setPasswordError(errorText(error, "Couldn't change the password."));
    } finally {
      setPasswordBusy(false);
    }
  };

  // Delete account
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const removeAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteConfirm !== 'DELETE') return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount(deletePassword);
      // Signed out now, so the app routes to the sign-in page (like any sign-out).
      notify.success('Your account and all its data have been deleted.');
      navigate('/login', { replace: true });
    } catch (error) {
      setDeleteError(errorText(error, "Couldn't delete the account. Nothing was removed."));
      setDeleting(false);
    }
  };

  const pill = (active: boolean) =>
    cn(
      'px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors',
      active ? 'bg-primary text-on-primary shadow-glow' : 'text-app-muted hover:text-app-text'
    );

  return (
    <div className="space-y-5 md:space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-bold text-app-text">Settings</h1>
        <p className="text-sm text-app-muted mt-1">Saved to your account, so they follow you to every device, except where it says otherwise.</p>
      </div>

      <Section title="Account">
        <Row title="Signed in as" hint={<span className="break-all">{userEmail}</span>}>
          <Button variant="secondary" size="sm" onClick={logout}>Sign out</Button>
        </Row>
        <Row title="Sign out everywhere" hint="Ends every session on every device and browser, this one included. Use it if you signed in on a shared or lost device.">
          <Button variant="secondary" size="sm" onClick={() => setConfirmEverywhere(true)}>Sign out everywhere</Button>
        </Row>
      </Section>

      <Section title="Preferences">
        <Row title="Display currency" hint="Amounts are stored in US dollars and shown in this currency.">
          <CurrencyPicker />
        </Row>
        <Row title="Theme" hint="This device only.">
          <div role="group" aria-label="Theme" className="inline-flex rounded-xl border border-app-border bg-surface-2 p-1">
            <button type="button" aria-pressed={theme === 'light'} className={pill(theme === 'light')} onClick={() => setTheme('light')}>Light</button>
            <button type="button" aria-pressed={theme === 'dark'} className={pill(theme === 'dark')} onClick={() => setTheme('dark')}>Dark</button>
          </div>
        </Row>
        <Row title="Hide tuition from overviews" hint="Leaves tuition out of the overview charts, summaries and reports. The Tuition tab still shows it.">
          <Switch checked={hideTuition} label="Hide tuition from overviews" onChange={(v) => updateSettings({ hideTuition: v })} />
        </Row>
        <Row
          title="Anonymous visit counts"
          hint={notTracked
            ? 'Off: your browser asks sites not to track it.'
            : 'Counts page visits with Vercel Web Analytics: no cookies, nothing that identifies you, and only the page, never what you enter. This device only.'}
        >
          <Switch
            checked={countVisits}
            disabled={notTracked}
            label="Anonymous visit counts"
            onChange={(v) => { setAnalyticsOptOut(!v); setCountVisits(v); }}
          />
        </Row>
      </Section>

      <NotificationsSection />

      <Section title="Security">
        <Row
          title="Password"
          hint="Changing it signs you out on every other device. Signed up with Google? Set a password with “Forgot password” on the sign-in page."
        >
          {!changingPassword && <Button variant="secondary" size="sm" onClick={() => setChangingPassword(true)}>Change</Button>}
        </Row>
        {changingPassword && (
          <form onSubmit={submitPasswordChange} aria-label="Change password" className="py-3.5 space-y-3">
            <div>
              <Label htmlFor="current-password">Current password</Label>
              <Input id="current-password" type="password" autoComplete="current-password" autoFocus value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} aria-describedby="new-password-hint" />
              </div>
              <div>
                <Label htmlFor="repeat-password">Repeat new password</Label>
                <Input id="repeat-password" type="password" autoComplete="new-password" value={repeatPassword} onChange={(e) => setRepeatPassword(e.target.value)} aria-describedby="new-password-hint" />
              </div>
            </div>
            <p id="new-password-hint" className="text-xs text-app-muted">{PASSWORD_RULES_TEXT}</p>
            {passwordError && <p role="alert" className="text-xs text-danger">{passwordError}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={!currentPassword || !newPassword || !repeatPassword} aria-busy={passwordBusy}>
                {passwordBusy ? 'Changing…' : 'Change password'}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={closePasswordForm}>Cancel</Button>
            </div>
          </form>
        )}
        <Row
          title={`Two-factor sign-in: ${twoFactorEnabled ? 'on' : 'off'}`}
          hint={
            twoFactorEnabled
              ? <>When you sign in with your password, you also enter a 6-digit code emailed to <span className="break-all">{userEmail}</span>.</>
              : 'Adds a 6-digit code, sent by email, to each sign-in with your password.'
          }
        >
          {twoFactorEnabled ? (
            !disabling2fa && <Button variant="secondary" size="sm" onClick={() => { setDisabling2fa(true); setTwoFaError(null); }}>Turn off</Button>
          ) : (
            <Button size="sm" onClick={() => setConfirm2fa(true)}>Turn on</Button>
          )}
        </Row>
        {twoFactorEnabled && disabling2fa && (
          <form onSubmit={turnOff2fa} className="py-3.5 space-y-3">
            <div>
              <Label htmlFor="twofa-password">Your password, to turn two-factor sign-in off</Label>
              <Input
                id="twofa-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={twoFaPassword}
                onChange={(e) => setTwoFaPassword(e.target.value)}
                aria-invalid={twoFaError ? true : undefined}
                aria-describedby={twoFaError ? 'twofa-error' : undefined}
              />
              {twoFaError && <p id="twofa-error" role="alert" className="text-xs text-danger mt-1.5">{twoFaError}</p>}
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={!twoFaPassword || twoFaBusy}>{twoFaBusy ? 'Turning off…' : 'Turn off'}</Button>
              <Button variant="ghost" size="sm" onClick={() => { setDisabling2fa(false); setTwoFaPassword(''); setTwoFaError(null); }}>Cancel</Button>
            </div>
          </form>
        )}
      </Section>

      <Section title="Your data">
        <Row title="Export, import and back up" hint="Download a full backup or a report, import a CSV or bank statement, or delete all your transactions.">
          <Button variant="secondary" size="sm" onClick={onOpenData}>Open</Button>
        </Row>
        <Row title="Privacy and terms" hint="What Orbit stores, who else handles it (including Google Gemini for AI features), and the terms of use.">
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary hover:brightness-125">Privacy Policy</a>
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary hover:brightness-125">Terms of Use</a>
        </Row>
        <Row title="Categories and budgets">
          <Button variant="secondary" size="sm" onClick={onManageCategories}>Categories</Button>
          <Button variant="secondary" size="sm" onClick={onManageBudgets}>Budgets</Button>
        </Row>
      </Section>

      <Section
        title="Delete account"
        danger
        description="Permanently deletes your account and everything in it: expenses, income, budgets, tuition, receipts, goals, accounts and settings. Households you own are deleted for everyone in them (each member keeps their own expenses); you leave any others. This can't be undone."
      >
        <form onSubmit={removeAccount} className="space-y-4">
          <Button variant="secondary" size="sm" onClick={onOpenData}>Download a backup first</Button>
          <div>
            <Label htmlFor="delete-password">Password</Label>
            <Input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              aria-describedby="delete-password-hint"
            />
            <p id="delete-password-hint" className="text-xs text-app-muted mt-1.5">
              Only ever signed in with Google? Leave this empty: it works within 10 minutes of signing in. If it's been longer, sign out and sign in with Google again first.
            </p>
          </div>
          <div>
            <Label htmlFor="delete-confirm">Type DELETE to confirm</Label>
            <Input
              id="delete-confirm"
              autoComplete="off"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              aria-invalid={deleteError ? true : undefined}
              aria-describedby={deleteError ? 'delete-error' : undefined}
            />
          </div>
          {deleteError && <p id="delete-error" role="alert" className="text-sm text-danger">{deleteError}</p>}
          <Button type="submit" variant="danger" disabled={deleteConfirm !== 'DELETE' || deleting}>
            {deleting ? 'Deleting…' : 'Delete my account'}
          </Button>
        </form>
      </Section>

      <ConfirmationDialog
        isOpen={confirmEverywhere}
        onClose={() => setConfirmEverywhere(false)}
        onConfirm={signOutEverywhere}
        loading={signingOutEverywhere}
        title="Sign out everywhere?"
        confirmLabel="Sign out everywhere"
        tone="primary"
      >
        You'll be signed out on every device and browser, including this one, and will need to sign in again on each.
      </ConfirmationDialog>
      <ConfirmationDialog
        isOpen={confirm2fa}
        onClose={() => setConfirm2fa(false)}
        onConfirm={turnOn2fa}
        loading={twoFaBusy}
        title="Turn on two-factor sign-in?"
        confirmLabel="Turn on"
        tone="primary"
      >
        Each time you sign in with your password, Orbit will email a 6-digit code to <span className="break-all text-app-text">{userEmail}</span>, and you'll need it to finish signing in. Make sure emails from Orbit reach you (check your spam folder) before turning it on.
      </ConfirmationDialog>
    </div>
  );
};

export default SettingsPage;
