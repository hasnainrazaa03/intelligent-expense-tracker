import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ExpenseTrackerLogo } from './Branding';
import { useTheme } from '../hooks/useTheme';
import { AcademicCapIcon, ChartPieIcon, CheckIcon, PlusCircleIcon } from './Icons';

// U6b: the landing page says what Orbit does for a student, shows the real app,
// and asks for one thing (an account). Every feature the old page listed is
// still named, under "More features".

const BENEFITS: { title: string; body: string; Icon: React.FC<{ className?: string }> }[] = [
  {
    title: 'See where the month is going',
    body: "One screen shows what you've spent against your budget, how much is left for each day, and which categories are running over.",
    Icon: ChartPieIcon,
  },
  {
    title: 'Made for a student budget',
    body: 'Plan tuition installments (including USC Bursar plans), keep rent, textbooks and subscriptions in view, and split costs with roommates.',
    Icon: AcademicCapIcon,
  },
  {
    title: 'Add an expense in seconds',
    body: 'Type the amount and pick a suggestion. Scan a receipt, or import a bank statement (CSV or PDF) when there are many.',
    Icon: PlusCircleIcon,
  },
];

const MORE_FEATURES: [string, string][] = [
  ['Budget alerts and templates', 'Set up monthly categories in one click, and get a heads-up before a budget runs out.'],
  ['Recurring charges', 'Mark rent or a subscription as repeating once; when it comes due, you choose whether to add it.'],
  ['Reports', 'Spending by category, payment method and account, period summaries and year over year, each as a chart or a table.'],
  ['AI Analyst', 'Ask questions about your spending in plain words.'],
  ['Savings goals and accounts', 'Track goals, balances and net worth, and settle up shared costs.'],
  ['Tax and accounting exports', 'Tax CSV, plus files for QuickBooks and Xero.'],
  ['Install it on your phone', 'Works like an app from your home screen. Entries made offline are saved when you reconnect.'],
  ['Backup and restore', 'Export everything as a file and bring it back any time.'],
  ['Your currency', 'Show amounts in the currency you think in, from a list of common ones.'],
  ['Two-factor sign-in', 'Ask for a code sent to your email as well as your password.'],
];

const FAQ: [string, React.ReactNode][] = [
  ['Is Orbit free?', 'Yes. Orbit is a personal project offered free of charge, with no ads and no paid tier.'],
  [
    'Does it connect to my bank?',
    "No. You add entries yourself, scan a receipt, or import the statement file your bank lets you download. Orbit never asks for your bank login.",
  ],
  [
    'Who can see my data?',
    'Only you. If you join a household, its members see the expenses you tag to it (title, amount, category, date and who paid), not the rest of your data.',
  ],
  [
    'What about the AI features?',
    <>
      Receipt scanning, reading a statement with AI, suggested transaction details and the AI Analyst send what they need to Google
      Gemini, and only when you use them. You can use Orbit without any of them. The{' '}
      <Link to="/privacy#gemini" className="font-semibold text-primary hover:underline">Privacy Policy</Link> lists exactly what is sent.
    </>,
  ],
  ['Can I use it on my phone?', 'Yes. Open Orbit in your phone’s browser and add it to your home screen. It works in any modern browser on a computer too.'],
  ['Can I leave and take my data?', 'Yes. Export everything from Settings, and delete your account there whenever you like.'],
];

const primaryButton = 'inline-flex items-center justify-center px-6 py-3 rounded-xl bg-primary text-on-primary font-semibold text-sm shadow-glow hover:brightness-110 transition-all';
const secondaryButton = 'inline-flex items-center justify-center px-6 py-3 rounded-xl bg-surface-2 border border-app-border text-app-text font-semibold text-sm hover:border-app-border-strong transition-all';

const LandingPage: React.FC = () => {
  const { theme } = useTheme();

  useEffect(() => {
    document.title = 'Orbit | Budgets and expenses for student life';
    const desc = document.querySelector('meta[name="description"]');
    if (desc) {
      desc.setAttribute('content', 'Orbit is a free expense and budget tracker for students: see where the month is going, plan tuition installments, and add an expense in seconds.');
    }
  }, []);

  return (
    <div className="relative min-h-screen text-app-text overflow-x-hidden">
      <div className="starfield" />

      <header className="relative z-10 max-w-6xl mx-auto px-4 md:px-8 pt-[max(1rem,env(safe-area-inset-top))] md:pt-6 flex items-center justify-between gap-3">
        <Link to="/" aria-label="Orbit home" className="inline-flex">
          <ExpenseTrackerLogo className="h-7 md:h-8 w-auto text-app-text" />
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link to="/login" className="px-4 py-2.5 rounded-xl text-sm font-semibold text-app-text hover:bg-surface-2 transition-colors">
            Sign in
          </Link>
          <Link to="/login?mode=signup" className="hidden sm:inline-flex px-4 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:brightness-110 transition-all">
            Create free account
          </Link>
        </nav>
      </header>

      <main id="main-content" className="relative z-10 max-w-6xl mx-auto px-4 md:px-8 pb-12">
        {/* Hero */}
        <section aria-labelledby="hero-title" className="pt-10 md:pt-16 text-center">
          <p className="inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.2em] uppercase text-app-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-glow" aria-hidden="true" />
            Free · No ads · Works on your phone
          </p>
          <h1 id="hero-title" className="font-display text-4xl md:text-6xl font-bold leading-[1.05] tracking-tight mt-4 max-w-3xl mx-auto text-balance">
            The finance hub built for student life.
          </h1>
          <p className="mt-5 text-base md:text-lg text-app-muted max-w-2xl mx-auto leading-relaxed text-pretty">
            Know what you can spend this month, keep tuition and rent on track, and add an expense in seconds.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <Link to="/login?mode=signup" className={primaryButton}>Create free account</Link>
            <Link to="/login" className={secondaryButton}>Sign in</Link>
          </div>
        </section>

        {/* The real app (sample data), in the theme the visitor is using */}
        <figure className="mt-10 md:mt-14">
          <div className="relative mx-auto max-w-[300px] md:max-w-none rounded-[1.75rem] md:rounded-2xl border border-app-border bg-surface shadow-[var(--shadow)] overflow-hidden max-h-[540px] md:max-h-none">
            <picture>
              <source media="(min-width: 768px)" srcSet={`/screens/home-${theme}.webp`} width={1440} height={900} />
              <img
                src={`/screens/phone-${theme}.webp`}
                width={780}
                height={1688}
                alt="Orbit's Home screen: $2,333.70 spent of a $2,900 monthly budget with $566.30 left, income and spending this month, budgets at risk, and charges coming up."
                className="block w-full h-auto"
                fetchPriority="high"
                decoding="async"
              />
            </picture>
            <div className="md:hidden pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--bg)] to-transparent" aria-hidden="true" />
          </div>
          <figcaption className="mt-3 text-center text-xs text-app-muted">The Home screen, with sample data.</figcaption>
        </figure>

        {/* Three benefits */}
        <section aria-labelledby="benefits-title" className="mt-14 md:mt-20">
          <h2 id="benefits-title" className="sr-only">Why students use Orbit</h2>
          <div className="grid md:grid-cols-3 gap-4 md:gap-5">
            {BENEFITS.map(({ title, body, Icon }) => (
              <article key={title} className="glass rounded-2xl p-5 md:p-6">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary-soft text-primary" aria-hidden="true">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold text-app-text">{title}</h3>
                <p className="mt-2 text-sm text-app-muted leading-relaxed">{body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Privacy, in the policy's own words */}
        <section aria-labelledby="privacy-title" className="mt-6 glass rounded-2xl p-5 md:p-7">
          <h2 id="privacy-title" className="font-display text-xl font-semibold">Your data stays yours</h2>
          <p className="mt-2 text-sm md:text-base text-app-muted leading-relaxed max-w-3xl">
            Orbit doesn't sell your data, show ads, or track you across sites. You can export everything, and delete anything,
            including your whole account, from Settings.{' '}
            <Link to="/privacy" className="font-semibold text-primary hover:underline">Read the Privacy Policy</Link>
          </p>
        </section>

        {/* Everything else */}
        <section aria-labelledby="more-title" className="mt-14 md:mt-20">
          <h2 id="more-title" className="font-display text-2xl md:text-3xl font-bold tracking-tight">More features</h2>
          <ul className="mt-6 grid sm:grid-cols-2 gap-x-8 gap-y-5">
            {MORE_FEATURES.map(([title, body]) => (
              <li key={title} className="flex gap-3">
                <CheckIcon className="h-5 w-5 mt-0.5 text-primary flex-shrink-0" aria-hidden="true" />
                <p className="text-sm leading-relaxed">
                  <span className="font-semibold text-app-text">{title}.</span>{' '}
                  <span className="text-app-muted">{body}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ */}
        <section aria-labelledby="faq-title" className="mt-14 md:mt-20">
          <h2 id="faq-title" className="font-display text-2xl md:text-3xl font-bold tracking-tight">Questions</h2>
          <div className="mt-6 glass rounded-2xl divide-y divide-[color:var(--border)]">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-5 md:px-6">
                <summary className="flex items-center justify-between gap-4 py-4 cursor-pointer list-none font-semibold text-app-text [&::-webkit-details-marker]:hidden">
                  {q}
                  <span className="text-app-muted text-lg leading-none transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p className="pb-4 -mt-1 text-sm text-app-muted leading-relaxed max-w-3xl">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Last call */}
        <section aria-labelledby="cta-title" className="mt-14 md:mt-20 text-center">
          <h2 id="cta-title" className="font-display text-2xl md:text-3xl font-bold tracking-tight">Start this month on track</h2>
          <p className="mt-2 text-sm text-app-muted">It takes about a minute. No card needed.</p>
          <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
            <Link to="/login?mode=signup" className={primaryButton}>Create free account</Link>
            <Link to="/knowledge" className={secondaryButton}>Knowledge base</Link>
          </div>
        </section>
      </main>

      <footer className="relative z-10 pb-[max(2rem,env(safe-area-inset-bottom))] flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-app-muted">
        <Link to="/privacy" className="py-2 hover:text-app-text">Privacy Policy</Link>
        <Link to="/terms" className="py-2 hover:text-app-text">Terms of Use</Link>
        <Link to="/knowledge" className="py-2 hover:text-app-text">Knowledge base</Link>
      </footer>
    </div>
  );
};

export default LandingPage;
