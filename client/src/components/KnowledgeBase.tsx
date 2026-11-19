import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const articles = [
  { id: 'getting-around', title: 'Finding your way around', body: 'Home shows this month: what you have spent against your budget, income, spending and net, budgets close to their limit, charges coming up, and your latest entries. Transactions lists every expense and income. Budgets, Insights (Reports, Breakdown, Income and Ask AI) and Tuition each have their own page, and Settings is at the bottom of the menu. On a phone, the bar at the bottom has Home, Transactions, the + button, Insights and More.' },
  { id: 'quick-add', title: 'Adding an expense quickly', body: 'Press Add (the + button on a phone, or Ctrl+N / Cmd+N on a keyboard) and choose Add expense. Type the amount and a title: picking a title you have used before fills in its category, payment method and account. Today and Yesterday set the date in one tap, and Save & add another keeps the form open for the next one. More details holds notes, tags, splitting and a receipt.' },
  { id: 'transactions', title: 'Finding and fixing entries', body: 'In Transactions, search or filter by type, category and period; entries are grouped by day. Choose Select to tick several entries, then change their category or delete them together. Deleting can be undone for 5 seconds.' },
  { id: 'budget-basics', title: 'Setting budgets', body: 'Open Budgets in the menu and choose Set budgets (Edit budgets once you have some) to give each category a monthly amount. A budget on a main category, like Food, covers its subcategories that have no budget of their own.' },
  { id: 'recurring', title: 'Recurring charges', body: 'Mark rent or a subscription as recurring when you add it. When one comes due, Home says how many are due; choose Review to tick the ones to add. Turn on bill reminders in Settings → Notifications to hear two days before.' },
  { id: 'tax-mode', title: 'Tax-deductible expenses', body: 'Mark an expense as tax-deductible and give it a tax category. Then open the profile menu (top right), choose Import and export, and pick Tax CSV for a file of just those expenses.' },
  { id: 'split-payments', title: 'Splitting a cost', body: 'In an expense, add who you split it with to see each person’s share. Households (Settings → Households) let roommates see shared expenses and who owes what.' },
  { id: 'import-export', title: 'Importing and exporting', body: 'Import a bank statement (CSV or PDF) from Transactions or the Add menu, or a CSV of transactions from Import and export. Export a PDF report, a CSV of expenses and income that you can import back, or a full backup. A backup can be locked with a passphrase; Orbit never sees it, so keep it somewhere safe.' },
  { id: 'phone', title: 'Orbit on your phone', body: 'Open Orbit in your phone’s browser and choose Add to Home Screen from the Share or menu button (or Install the app in the profile menu, when your browser offers it). It opens like any other app, and an expense added while offline is saved when you reconnect.' },
  { id: 'security', title: 'Keeping your account safe', body: 'Turn on two-factor sign-in in Settings for a code by email at each password sign-in. Settings → Sign out everywhere ends every session if you lose a device.' },
];

const KnowledgeBase: React.FC = () => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter((article) => article.title.toLowerCase().includes(q) || article.body.toLowerCase().includes(q));
  }, [query]);

  return (
    <main className="min-h-screen p-6 md:p-10 relative overflow-hidden">
      <div className="starfield" />
      <section className="max-w-4xl mx-auto glass rounded-2xl p-5 md:p-6 relative z-10">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="font-display font-bold text-3xl text-app-text">Public Knowledge Base</h1>
          <Link to="/" className="px-4 py-2 rounded-xl bg-surface-2 border border-app-border text-app-text font-semibold text-xs hover:border-app-border-strong transition-all">Back to Home</Link>
        </div>

        <input
          aria-label="Search guides"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search guides"
          className="mt-4 w-full bg-surface-2 border border-app-border rounded-xl px-4 py-3 text-sm text-app-text placeholder:text-app-faint focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
        />

        <div className="mt-4 space-y-3">
          {filtered.map((article) => (
            <article key={article.id} className="glass rounded-2xl p-5 md:p-6">
              <h2 className="font-display font-bold text-sm text-app-text">{article.title}</h2>
              <p className="mt-1 text-xs text-app-muted">{article.body}</p>
            </article>
          ))}
          {filtered.length === 0 && <p className="text-xs text-app-muted">No articles found.</p>}
        </div>
      </section>
    </main>
  );
};

export default KnowledgeBase;
