import React from 'react';
import { Link } from 'react-router-dom';
import LegalPage, { Contact, H2, P, UL } from './LegalPage';
import { LEGAL } from '../../config';

const CONTENTS: [string, string][] = [
  ['agreement', 'Agreement'],
  ['who-can-use', 'Who can use Orbit'],
  ['your-account', 'Your account'],
  ['your-data', 'Your data'],
  ['acceptable-use', 'Acceptable use'],
  ['not-advice', 'Not financial advice'],
  ['the-service', 'The service'],
  ['ending', 'Ending your use'],
  ['disclaimers', 'Disclaimers'],
  ['liability', 'Limitation of liability'],
  ['changes', 'Changes to these terms'],
  ['law', 'Governing law'],
  ['contact', 'Contact'],
];

const link = 'text-primary font-semibold';

const TermsOfUse: React.FC = () => (
  <LegalPage
    title="Terms of Use"
    metaDescription="The terms for using Orbit, a free personal finance tracker for students."
    contents={CONTENTS}
  >
    <H2 id="agreement">Agreement</H2>
    <P>
      Orbit is a free personal finance tracker run by {LEGAL.operator} ("we"). By creating an account or using Orbit, you agree
      to these terms and to the <Link to="/privacy" className={link}>Privacy Policy</Link>. If you don't agree, please don't use Orbit.
    </P>

    <H2 id="who-can-use">Who can use Orbit</H2>
    <P>
      You must be at least 13. If you're under the age of majority where you live, you need a parent's or guardian's
      permission. Each account is for one person.
    </P>

    <H2 id="your-account">Your account</H2>
    <UL>
      <li>Use an email address you control, and keep your password to yourself.</li>
      <li>You're responsible for what happens under your account. Two-factor sign-in (Settings → Security) adds protection.</li>
      <li>If you think someone else has got in, use Settings → Sign out everywhere, reset your password ("Forgot password" on the sign-in page), and tell us.</li>
    </UL>

    <H2 id="your-data">Your data</H2>
    <P>
      What you put in Orbit stays yours. You allow us to store, process and show it, and to send it to the services listed in
      the <Link to="/privacy#who-else" className={link}>Privacy Policy</Link>, only to run Orbit for you. You can export or
      delete it at any time from Settings.
    </P>

    <H2 id="acceptable-use">Acceptable use</H2>
    <P>Please don't:</P>
    <UL>
      <li>use Orbit for anything illegal;</li>
      <li>try to get into other people's accounts or data;</li>
      <li>attack, overload or probe the service, or try to get around its security or its limits on AI and email use;</li>
      <li>scrape it automatically or create accounts in bulk;</li>
      <li>upload malware, or receipts and statements you have no right to share;</li>
      <li>use the AI features to produce content that Google's policies for Gemini prohibit.</li>
    </UL>

    <H2 id="not-advice">Not financial advice</H2>
    <P>
      Orbit is a tool for tracking money. AI Analyst answers, forecasts, category suggestions, and details read from receipts
      and statements can be wrong, so check them. Exchange rates are approximate. Tuition figures are what you enter; confirm
      amounts and due dates with your school. Nothing in Orbit is financial, tax, investment or legal advice; for that, talk to
      a qualified professional.
    </P>

    <H2 id="the-service">The service</H2>
    <P>
      Orbit is a personal project, offered free of charge. We may change, pause or stop it. If we decide to shut it down, we'll
      give notice in the app, normally at least 30 days ahead, so you can export your data. Keep your own backups too: you can
      download one at any time from Settings.
    </P>

    <H2 id="ending">Ending your use</H2>
    <P>
      You can stop using Orbit and delete your account at any time (Settings → Delete account). We may suspend or close an
      account that breaks these terms or puts the service or other people at risk. Where it's reasonable, we'll tell you why
      and let you export your data first.
    </P>

    <H2 id="disclaimers">Disclaimers</H2>
    <P>
      Orbit is provided "as is" and "as available", without warranties of any kind, to the fullest extent the law allows. We
      don't promise that it will be free of errors or interruptions, or that data will never be lost.
    </P>

    <H2 id="liability">Limitation of liability</H2>
    <P>
      To the fullest extent the law allows, we aren't liable for indirect, incidental, special or consequential damages, or
      for lost profits or lost data, and our total liability for any claim about Orbit is limited to US$50. Nothing in these
      terms limits liability that the law doesn't allow to be limited.
    </P>

    <H2 id="changes">Changes to these terms</H2>
    <P>
      If these terms change, the date at the top changes. For a significant change, the app will tell you before it takes
      effect. Using Orbit after that means you accept the new terms.
    </P>

    <H2 id="law">Governing law</H2>
    <P>
      These terms are governed by the laws of the State of California, United States, and disputes go to the courts of Los
      Angeles County, California, except where the consumer law of the place you live gives you the right to bring a claim there.
    </P>

    <H2 id="contact">Contact</H2>
    <P>{LEGAL.operator} · <Contact /></P>
  </LegalPage>
);

export default TermsOfUse;
