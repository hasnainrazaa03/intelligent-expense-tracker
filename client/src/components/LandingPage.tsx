import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ExpenseTrackerLogo } from './Branding';

const FEATURES: [string, string][] = [
  ['Budget alerts & templates', 'Set up structured monthly categories in one click.'],
  ['Tax & accounting exports', 'Generate tax CSV, QuickBooks, and Xero adapter outputs.'],
  ['Mobile companion', 'Installable PWA with fast load and an offline shell.'],
];

const LandingPage: React.FC = () => {
  useEffect(() => {
    document.title = 'Orbit | Intelligent Expense Tracker for Students';
    const desc = document.querySelector('meta[name="description"]');
    if (desc) {
      desc.setAttribute('content', 'Orbit helps students track expenses, budgets, tax-ready exports, and net-worth snapshots with secure cookie sessions.');
    }
  }, []);

  return (
    <main className="relative min-h-screen text-app-text px-5 md:px-8 py-10 md:py-16 overflow-hidden">
      <div className="starfield" />

      <div className="relative z-10 max-w-5xl mx-auto">
        <section className="glass rounded-3xl p-7 md:p-12">
          <div className="flex items-center gap-3 mb-8">
            <ExpenseTrackerLogo className="h-8 md:h-9 w-auto text-app-text" />
          </div>

          <p className="inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.2em] uppercase text-app-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-glow" />
            Track · Save · Explore
          </p>
          <h1 className="font-display text-3xl md:text-5xl font-bold leading-[1.02] tracking-tight mt-4 max-w-3xl text-balance">
            The finance hub built for student life.
          </h1>
          <p className="mt-5 text-base md:text-lg text-app-muted max-w-2xl leading-relaxed">
            A secure, student-first home for budgets, recurring tracking, split payments,
            tax-ready exports, and planning insights — including USC Bursar installment tuition.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/login"
              className="px-6 py-3 rounded-xl bg-primary text-on-primary font-semibold text-sm shadow-glow hover:brightness-110 transition-all"
            >
              Launch app
            </Link>
            <Link
              to="/knowledge"
              className="px-6 py-3 rounded-xl bg-surface-2 border border-app-border text-app-text font-semibold text-sm hover:border-app-border-strong transition-all"
            >
              Knowledge base
            </Link>
          </div>
        </section>

        <section className="mt-6 grid md:grid-cols-3 gap-4 md:gap-5">
          {FEATURES.map(([title, body]) => (
            <article key={title} className="glass rounded-2xl p-5 md:p-6">
              <h2 className="font-display text-base font-semibold text-app-text">{title}</h2>
              <p className="mt-2 text-sm text-app-muted leading-relaxed">{body}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
};

export default LandingPage;
