import React, { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { useSetting } from '../hooks/useSetting';
import { updateSettings } from '../utils/settingsStore';
import { ApiError } from '../services/api';
import { notify } from '../utils/notifications';
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
          <button
            type="button"
            role="switch"
            aria-checked={hideTuition}
            aria-label="Hide tuition from overviews"
            onClick={() => updateSettings({ hideTuition: !hideTuition })}
            className={cn('relative inline-flex h-7 w-12 items-center rounded-full border transition-colors', hideTuition ? 'bg-primary border-primary' : 'bg-surface-2 border-app-border')}
          >
            <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', hideTuition ? 'translate-x-6' : 'translate-x-1')} />
          </button>
        </Row>
      </Section>

      <Section title="Security">
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
