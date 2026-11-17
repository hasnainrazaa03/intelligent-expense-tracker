import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ExpenseTrackerLogo } from '../Branding';
import { LEGAL } from '../../config';

// Shared layout for the Privacy Policy and Terms of Use: readable line length,
// real headings (for screen readers and the table of contents), and links
// between the two.

export const Contact: React.FC = () => (
  <a href={`mailto:${LEGAL.contactEmail}`} className="text-primary font-semibold hover:brightness-125 break-all">{LEGAL.contactEmail}</a>
);

export const H2: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => (
  <h2 id={id} className="font-display text-xl md:text-2xl font-bold text-app-text mt-10 mb-3 scroll-mt-6">{children}</h2>
);

export const P: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="mb-3">{children}</p>;

export const UL: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ul className="mb-3 list-disc pl-5 space-y-1.5 marker:text-app-faint">{children}</ul>
);

interface LegalPageProps {
  title: string;
  /** Page <title> and the description for search results. */
  metaDescription: string;
  /** In-page links: [id, label]. */
  contents: [string, string][];
  children: React.ReactNode;
}

const LegalPage: React.FC<LegalPageProps> = ({ title, metaDescription, contents, children }) => {
  useEffect(() => {
    document.title = `${title} | Orbit`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', metaDescription);
  }, [title, metaDescription]);

  return (
    <main className="relative min-h-screen text-app-text px-4 md:px-8 py-8 md:py-14 overflow-x-hidden">
      <div className="starfield" />
      <article className="relative z-10 max-w-3xl mx-auto glass rounded-3xl p-6 md:p-10">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-8">
          <Link to="/" aria-label="Orbit home"><ExpenseTrackerLogo className="h-8 w-auto text-app-text" /></Link>
          <nav aria-label="Legal" className="flex gap-2 text-xs font-semibold">
            <Link to="/privacy" className="px-3 py-2 rounded-lg bg-surface-2 border border-app-border hover:border-app-border-strong">Privacy</Link>
            <Link to="/terms" className="px-3 py-2 rounded-lg bg-surface-2 border border-app-border hover:border-app-border-strong">Terms</Link>
          </nav>
        </div>

        <h1 className="font-display text-3xl md:text-4xl font-bold leading-tight">{title}</h1>
        <p className="mt-2 text-sm text-app-muted">Last updated {LEGAL.lastUpdated}</p>

        <nav aria-label="On this page" className="mt-6 rounded-2xl border border-app-border bg-surface-2 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-app-muted mb-2">On this page</p>
          <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm list-decimal pl-5 marker:text-app-faint">
            {contents.map(([id, label]) => (
              <li key={id}><a href={`#${id}`} className="text-app-text hover:text-primary">{label}</a></li>
            ))}
          </ol>
        </nav>

        <div className="mt-2 text-[15px] leading-relaxed text-app-muted [&_strong]:text-app-text">{children}</div>
      </article>
    </main>
  );
};

export default LegalPage;
