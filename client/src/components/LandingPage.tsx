import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

const LandingPage: React.FC = () => {
  useEffect(() => {
    document.title = 'USC Ledger | Intelligent Expense Tracker for Students';
    const desc = document.querySelector('meta[name="description"]');
    if (desc) {
      desc.setAttribute('content', 'USC Ledger helps students track expenses, budgets, tax-ready exports, and net-worth snapshots with secure cookie sessions.');
    }
  }, []);

  return (
    <main className="min-h-screen bg-bone text-ink font-mono p-6 md:p-10">
      <section className="max-w-5xl mx-auto border-4 border-ink bg-white shadow-neo p-6 md:p-10">
        <p className="font-loud text-[10px] uppercase tracking-widest text-usc-cardinal">Search-Optimized Landing</p>
        <h1 className="font-loud text-4xl md:text-6xl uppercase leading-[0.9] mt-2">USC Ledger</h1>
        <p className="mt-4 text-sm md:text-base max-w-3xl">
          A secure student-first finance hub for budgets, recurring tracking, split payments, tax-ready exports, and planning insights.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/login" className="px-4 py-3 border-4 border-ink bg-usc-gold font-loud text-xs uppercase shadow-neo">Launch App</Link>
          <Link to="/knowledge" className="px-4 py-3 border-4 border-ink bg-white font-loud text-xs uppercase shadow-neo">Knowledge Base</Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto mt-8 grid md:grid-cols-3 gap-4">
        {[
          ['Budget alerts and templates', 'Set up structured monthly categories in one click.'],
          ['Tax and accounting exports', 'Generate tax CSV, QuickBooks adapter, and Xero adapter outputs.'],
          ['Mobile companion support', 'Installable PWA with fast load and offline shell.'],
        ].map(([title, body]) => (
          <article key={title} className="border-4 border-ink bg-white p-4 shadow-neo">
            <h2 className="font-loud text-sm uppercase">{title}</h2>
            <p className="mt-2 text-xs">{body}</p>
          </article>
        ))}
      </section>
    </main>
  );
};

export default LandingPage;
