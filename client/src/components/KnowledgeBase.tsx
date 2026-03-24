import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const articles = [
  { id: 'budget-basics', title: 'Budget Setup Basics', body: 'Create category budgets first, then use template presets for faster monthly planning.' },
  { id: 'tax-mode', title: 'Tax Report Mode', body: 'Mark deductible expenses, assign tax categories, and export TAX_CSV from Data Transfer Hub.' },
  { id: 'split-payments', title: 'Split Payments', body: 'Add split participants in Expense modal to track shared costs and equal-share estimates.' },
  { id: 'security', title: 'Session Security', body: 'USC Ledger now uses secure cookie sessions, CSRF headers, and optional login 2FA.' },
];

const KnowledgeBase: React.FC = () => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter((article) => article.title.toLowerCase().includes(q) || article.body.toLowerCase().includes(q));
  }, [query]);

  return (
    <main className="min-h-screen bg-bone text-ink font-mono p-6 md:p-10">
      <section className="max-w-4xl mx-auto border-4 border-ink bg-white shadow-neo p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="font-loud text-3xl uppercase">Public Knowledge Base</h1>
          <Link to="/" className="px-3 py-2 border-2 border-ink bg-usc-gold font-loud text-[10px] uppercase">Back to Home</Link>
        </div>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search guides"
          className="mt-4 w-full border-4 border-ink p-3 font-loud text-sm"
        />

        <div className="mt-4 space-y-3">
          {filtered.map((article) => (
            <article key={article.id} className="border-2 border-ink p-3 bg-bone">
              <h2 className="font-loud text-sm uppercase">{article.title}</h2>
              <p className="mt-1 text-xs">{article.body}</p>
            </article>
          ))}
          {filtered.length === 0 && <p className="text-xs font-loud uppercase">No articles found.</p>}
        </div>
      </section>
    </main>
  );
};

export default KnowledgeBase;
