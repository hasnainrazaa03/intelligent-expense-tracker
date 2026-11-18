import React from 'react';
import { Link } from 'react-router-dom';
import LegalPage, { Contact, H2, P, UL } from './LegalPage';
import { LEGAL } from '../../config';

// Keep this in step with the code. It describes what the app actually does
// (checked against server/src/routes/ai.ts, the Prisma schema, the mailer and
// the client's storage) — update it with any change to what is stored or sent.

const CONTENTS: [string, string][] = [
  ['short-version', 'The short version'],
  ['what-we-store', 'What Orbit stores'],
  ['how-we-use-it', 'How Orbit uses it'],
  ['who-else', 'Who else handles it'],
  ['gemini', 'AI features and Google Gemini'],
  ['how-long', 'How long it is kept'],
  ['your-choices', 'Your choices'],
  ['security', 'Security'],
  ['children', 'Children'],
  ['changes', 'Changes to this policy'],
  ['contact', 'Contact'],
];

const PrivacyPolicy: React.FC = () => (
  <LegalPage
    title="Privacy Policy"
    metaDescription="What Orbit stores about you, who else handles it (including Google Gemini for AI features), and how to export or delete it."
    contents={CONTENTS}
  >
    <P>
      Orbit is a personal finance tracker run by {LEGAL.operator}, an individual developer, not a company. This policy
      explains what Orbit stores about you, who else handles it, and how to get it back or delete it. Questions? Email <Contact />.
    </P>

    <H2 id="short-version">The short version</H2>
    <UL>
      <li>Orbit stores your account and the finances you enter, to run the app for you. It doesn't sell your data, show ads, or track you across sites. It counts page visits anonymously, and you can turn that off. <a href="#visit-counts" className="text-primary font-semibold">Details</a></li>
      <li>
        Some features use Google's Gemini AI. When you scan a receipt, read a bank statement with AI, ask for transaction details,
        or use the AI Analyst, that item (or a summary of your figures) is sent to Google to be read. Google doesn't use it to
        improve its products. <a href="#gemini" className="text-primary font-semibold">Details</a>
      </li>
      <li>You can export everything, and delete anything, including your whole account, from Settings.</li>
    </UL>

    <H2 id="what-we-store">What Orbit stores</H2>
    <UL>
      <li>
        <strong>Your account:</strong> your email address, and your password only as a one-way hash, which nobody (including us)
        can turn back into the password. If you sign in with Google, Google tells Orbit your name, email address and profile
        picture; Orbit keeps only the email address.
      </li>
      <li>
        <strong>What you enter:</strong> expenses and income (with their notes, tags, payment methods and accounts), budgets,
        tuition plans, households you create or join, savings goals, account balances, your categories and your preferences.
      </li>
      <li><strong>Receipts:</strong> if you attach a receipt photo to an expense, Orbit stores a copy with it, along with the text read from it.</li>
      <li><strong>Bank statements:</strong> a statement you import is read to create transactions. The file itself isn't stored.</li>
      <li>
        <strong>Security records:</strong> when you sign in or fail to, and for sensitive actions (deleting data, restoring a
        backup, signing out everywhere, deleting your account), Orbit records when it happened, your IP address and your browser type.
      </li>
      <li>
        <strong>Notifications:</strong> if you turn them on, Orbit stores your browser's push address and keys (so it
        can reach that browser), your time zone (so they arrive in the daytime), and which notifications it has sent
        (so none repeats).
      </li>
      <li>
        <strong>In your browser:</strong> two cookies, one that keeps you signed in and one that protects against forged
        requests from other sites. Orbit also keeps some data in your browser's storage (your settings, changes waiting to be
        saved, expenses added while offline) so the app keeps working without a connection. There are no advertising or analytics cookies.
      </li>
    </UL>

    <H2 id="how-we-use-it">How Orbit uses it</H2>
    <UL>
      <li>To run the app for you: show, calculate, sync and back up what you enter.</li>
      <li>To keep accounts safe: limit sign-in and password attempts, lock out repeated failures, and look into abuse.</li>
      <li>To email you sign-in, verification and password-reset codes, and the monthly summary when you ask for one. Orbit sends no marketing email.</li>
    </UL>
    <P>Orbit doesn't sell your data, use it for advertising, or share it except as described below.</P>

    <H2 id="who-else">Who else handles it</H2>
    <P>These services handle data for Orbit, only to provide their part of the app:</P>
    <UL>
      <li><strong>Google Gemini</strong> reads receipts, statements and questions for the AI features. <a href="#gemini" className="text-primary font-semibold">What's sent</a></li>
      <li><strong>MongoDB Atlas</strong> is the database where everything listed above is stored.</li>
      <li><strong>Render</strong> runs Orbit's server.</li>
      <li><strong>Vercel</strong> hosts the website and passes your requests to the server.</li>
      <li id="visit-counts">
        <strong>Vercel Web Analytics</strong> counts page visits, so Orbit knows which pages are used. For each visit it gets
        the page's path (Orbit sends only the path, never the rest of the address), the site you came from, your browser,
        operating system and device type, and an approximate location. It uses no cookies and nothing that identifies you:
        Vercel counts visitors with a code worked out from the request, which resets every day. It never sees your
        finances. When signed in, you can turn it off in Settings → Preferences (for that device); it's also off when your browser sends Global
        Privacy Control or Do Not Track.
      </li>
      <li>
        <strong>Resend</strong> sends Orbit's emails, so it receives your email address and each email's content. The monthly
        summary you can ask for includes that month's totals and top spending categories, and the alerts you choose to get by
        email (Settings → Notifications) include the budget, bill or monthly figures they're about.
      </li>
      <li><strong>Google</strong>, if you choose "Continue with Google", signs you in and tells Orbit your email address.</li>
      <li>
        <strong>Your browser's push service</strong> (run by Google, Mozilla, Apple or Microsoft, depending on the
        browser) delivers notifications if you turn them on. Their content is encrypted so the push service can't read it.
      </li>
    </UL>
    <P>Your browser also contacts these services directly:</P>
    <UL>
      <li><strong>Google Fonts</strong>, for Orbit's fonts. Google sees your IP address when your browser downloads them.</li>
      <li><strong>jsDelivr</strong>, for the text-recognition engine used on receipts. That step reads the receipt on your device.</li>
      <li><strong>Frankfurter</strong>, for exchange rates in the currency display. Nothing about you is sent.</li>
    </UL>
    <P>
      <strong>Households:</strong> members of a household you join see the expenses you tag to it (title, amount, category,
      date and who paid), not the rest of your data.
    </P>
    <P>
      These services run servers in the United States and other countries, so your data may be stored or processed outside
      the country where you live. Orbit may also disclose data when the law requires it.
    </P>

    <H2 id="gemini">AI features and Google Gemini</H2>
    <P>Only these features send anything to Gemini, and only when you use them:</P>
    <UL>
      <li><strong>Receipt scanning</strong> (attaching a receipt to an expense): the receipt photo.</li>
      <li><strong>Bank statement import</strong>, when you choose "Read with AI" or upload a PDF: the statement.</li>
      <li><strong>Transaction details</strong> (suggested notes, tags and categories): the description and amount of those transactions.</li>
      <li>
        <strong>AI Analyst and chat:</strong> your question and the recent conversation, plus a summary of your finances: totals
        by category and by month, income totals, your budgets, recurring charges, and your 12 most recent expenses (title,
        amount, category and date).
      </li>
    </UL>
    <P>
      Orbit uses Gemini's paid service. Under Google's terms for it, Google uses this data to give Orbit an answer and doesn't
      use it to improve its products. Google may keep it for a limited time to detect misuse. You can use Orbit without any AI
      feature: add expenses by hand, map statement columns yourself, and skip the AI Analyst.
    </P>

    <H2 id="how-long">How long it is kept</H2>
    <UL>
      <li>
        Your data stays until you delete it. Deleting an item, using "Delete all my data", or deleting your account removes it
        from Orbit's database straight away.
      </li>
      <li>Security records and server logs are kept by the hosting providers for a limited time, then removed.</li>
      <li>Any backups the hosting providers keep expire on their own schedule.</li>
      <li>
        Before risky maintenance, the operator may copy the database. Copies are encrypted, leave out one-time sign-in codes
        and reset links, are kept privately, and are deleted when no longer needed.
      </li>
    </UL>

    <H2 id="your-choices">Your choices</H2>
    <UL>
      <li><strong>See and export:</strong> Settings → Your data → Export, import and back up downloads everything as one file. You can lock it with a passphrase that only you know.</li>
      <li><strong>Correct:</strong> edit anything in the app.</li>
      <li><strong>Delete:</strong> delete items one by one, delete all your financial data, or delete your account (Settings → Delete account).</li>
      <li><strong>Protect:</strong> turn on two-factor sign-in, or sign out everywhere (Settings → Security and Account).</li>
    </UL>
    <P>
      Depending on where you live (for example California or the European Union), you may have legal rights to access,
      correct, delete or move your data, or to object to how it's used. The tools above cover most of these. For anything
      else, email <Contact /> and you'll get a reply within 30 days.
    </P>

    <H2 id="security">Security</H2>
    <P>
      Orbit uses encrypted connections (HTTPS) throughout, stores passwords only as hashes, keeps sessions in secure cookies
      with protection against forged requests, limits sign-in and password attempts, and offers two-factor sign-in. No system
      is perfectly secure. If a breach affects your data, you'll be told.
    </P>

    <H2 id="children">Children</H2>
    <P>
      Orbit isn't meant for children under 13 and doesn't knowingly collect their data. If you think a child has an account,
      email <Contact /> and it will be deleted.
    </P>

    <H2 id="changes">Changes to this policy</H2>
    <P>
      If this policy changes, the date at the top changes too. If a change matters (for example, a new service that receives
      your data), the app will say so before it takes effect. See also the <Link to="/terms" className="text-primary font-semibold">Terms of Use</Link>.
    </P>

    <H2 id="contact">Contact</H2>
    <P>{LEGAL.operator} · <Contact /></P>
  </LegalPage>
);

export default PrivacyPolicy;
