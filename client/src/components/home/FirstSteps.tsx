import React, { useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { PATHS } from '../../app/routes';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import { CheckIcon } from '../Icons';

export interface FirstStepsProps {
  hasExpense: boolean;
  hasBudget: boolean;
  alertsOn: boolean;
  imported: boolean;
  onAddExpense: () => void;
  onImportStatement: () => void;
  onDismiss: () => void;
}

// Installed (opened from the home screen) is a display mode, and it can change
// while the page is open (Chrome moves the tab into the app window).
const STANDALONE = '(display-mode: standalone)';
const subscribeStandalone = (fn: () => void) => {
  const mq = typeof window !== 'undefined' ? window.matchMedia?.(STANDALONE) : undefined;
  mq?.addEventListener?.('change', fn);
  return () => mq?.removeEventListener?.('change', fn);
};
const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.(STANDALONE).matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

const action = 'inline-flex items-center justify-center min-h-10 px-3 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all';
const primary = `${action} bg-primary text-on-primary hover:brightness-110`;
const secondary = `${action} bg-surface-2 border border-app-border text-app-text hover:border-app-border-strong`;

/**
 * U6b: a short checklist for a new account, on Home. Each step ticks itself
 * off from what the account already has (an expense, a budget, alerts, the
 * installed app, an imported statement), and the card goes away when every
 * step is done or the user hides it.
 */
const FirstSteps: React.FC<FirstStepsProps> = ({ hasExpense, hasBudget, alertsOn, imported, onAddExpense, onImportStatement, onDismiss }) => {
  const { canInstall, promptInstall } = usePwaInstall();
  const installed = useSyncExternalStore(subscribeStandalone, isStandalone, () => false);

  const steps: { key: string; title: string; hint: string; done: boolean; control: React.ReactNode }[] = [
    {
      key: 'expense',
      title: 'Add your first expense',
      hint: 'Just the amount and a name. Everything else is optional.',
      done: hasExpense,
      control: <button type="button" onClick={onAddExpense} className={primary}>Add first expense</button>,
    },
    {
      key: 'budget',
      title: 'Set a monthly budget',
      hint: 'Start from a template, then change the amounts.',
      done: hasBudget,
      control: <Link to={PATHS.budgetsEdit} className={secondary}>Set budgets</Link>,
    },
    {
      key: 'alerts',
      title: 'Turn on alerts',
      hint: 'Hear about a budget at 80% and bills two days before they’re due.',
      done: alertsOn,
      control: <Link to={`${PATHS.settings}#notifications`} className={secondary}>Choose alerts</Link>,
    },
    {
      key: 'install',
      title: 'Put Orbit on your phone',
      hint: canInstall
        ? 'Opens from your home screen like any other app.'
        : 'In your phone’s browser, open the Share or menu button and choose Add to Home Screen.',
      done: installed,
      control: canInstall ? <button type="button" onClick={() => { void promptInstall(); }} className={secondary}>Install the app</button> : null,
    },
    {
      key: 'import',
      title: 'Import a bank statement',
      hint: 'Bring in past spending from a CSV or PDF in one go.',
      done: imported,
      control: <button type="button" onClick={onImportStatement} className={secondary}>Import a statement</button>,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  const next = steps.find((s) => !s.done);

  return (
    <section aria-labelledby="first-steps-title" className="glass rounded-2xl p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="first-steps-title" className="font-display text-lg md:text-xl font-bold text-app-text">Get set up</h2>
          <p className="text-sm text-app-muted mt-0.5">{doneCount} of {steps.length} done</p>
        </div>
        <button type="button" onClick={onDismiss} className="text-sm font-semibold text-app-muted hover:text-app-text px-3 min-h-10 -mr-2 -mt-2 rounded-lg">
          Hide
        </button>
      </div>
      <div
        className="mt-3 h-1.5 rounded-full bg-surface-2 overflow-hidden"
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={doneCount}
        aria-valuetext={`${doneCount} of ${steps.length} steps done`}
      >
        <div className="h-full bg-primary rounded-full transition-[width] motion-reduce:transition-none" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-3 divide-y divide-[color:var(--border)]">
        {steps.map((s) => {
          const isNext = s.key === next?.key;
          return (
            <li key={s.key} className="flex items-center gap-3 py-2.5">
              <span
                className={`flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full border ${s.done ? 'bg-primary border-primary text-on-primary' : isNext ? 'border-primary' : 'border-app-border-strong'}`}
                aria-hidden="true"
              >
                {s.done && <CheckIcon className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${s.done ? 'text-app-muted line-through' : 'text-app-text'}`}>
                  {s.title}
                  <span className="sr-only">{s.done ? ' (done)' : ' (to do)'}</span>
                </p>
                {/* The next step says a little more, and so does one with no button
                    (installing is done from the browser); the rest stay one line. */}
                {(isNext || !s.control) && <p className="text-xs text-app-muted mt-0.5">{s.hint}</p>}
              </div>
              {!s.done && s.control && <div className="flex-shrink-0">{s.control}</div>}
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export default FirstSteps;
