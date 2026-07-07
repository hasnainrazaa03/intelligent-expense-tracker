import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const articles = [
  { id: 'budget-basics', title: 'Budget Setup Basics', body: 'Create category budgets first, then use template presets for faster monthly planning.' },
  { id: 'tax-mode', title: 'Tax Report Mode', body: 'Mark deductible expenses, assign tax categories, and export TAX_CSV from Data Transfer Hub.' },
  { id: 'split-payments', title: 'Split Payments', body: 'Add split participants in Expense modal to track shared costs and equal-share estimates.' },
  { id: 'security', title: 'Session Security', body: 'Orbit now uses secure cookie sessions, CSRF headers, and optional login 2FA.' },
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
