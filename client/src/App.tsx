import React, { Suspense } from 'react';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import SectionSkeleton from './components/SectionSkeleton';
import { lazyWithReload } from './lib/lazyWithReload';
import { Auth, VerifyOTP, KnowledgeBase, PrivacyPolicy, TermsOfUse } from './app/screens';
// The first thing a visitor sees, so it comes with the first download (no
// second round trip before the hero can paint).
import LandingPage from './components/LandingPage';

// The signed-in app is its own chunk: the landing page and sign-in don't
// download it (U7).
const AppDashboard = lazyWithReload(() => import('./app/AppDashboard'));

/** Signed out on an app address (a bookmark, a link in an email): sign in, then
 *  land on that screen rather than on Home. */
const ToLogin: React.FC = () => {
  const location = useLocation();
  return <Navigate to="/login" replace state={{ from: location.pathname }} />;
};
const AfterLogin: React.FC = () => {
  const from = (useLocation().state as { from?: unknown } | null)?.from;
  return <Navigate to={typeof from === 'string' && from.startsWith('/app') ? from : '/app'} replace />;
};

// Routes and toasts. The signed-in app lives in app/AppDashboard.tsx; its
// behaviour is in hooks/ (useAllData, useTransactions, useTuition, …).
const App: React.FC = () => {
  const { isAuthenticated, userEmail, loginSuccess } = useAuth();
  const page = (title: string, element: React.ReactNode, rows = 2) => (
    <Suspense fallback={<SectionSkeleton title={title} rows={rows} />}>{element}</Suspense>
  );

  return (
    <Router>
      {/* Top-center, not top-right: the right corner holds primary actions (the
          importer's Import button, the header's icon buttons), and a toast
          there covered them — hovering it even paused its dismissal. */}
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#111111',
            color: '#FAF9F6',
            border: '3px solid #111111',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            fontSize: '12px',
            textTransform: 'uppercase',
          },
          success: { style: { background: '#166534', border: '3px solid #111111' } },
          error: { style: { background: '#990000', border: '3px solid #111111' } },
        }}
      />
      <Routes>
        <Route path="/login" element={!isAuthenticated ? page('Loading login', <Auth onLoginSuccess={loginSuccess} />) : <AfterLogin />} />
        <Route path="/" element={!isAuthenticated ? page('Loading landing', <LandingPage />) : <Navigate to="/app" />} />
        <Route path="/knowledge" element={page('Loading knowledge base', <KnowledgeBase />)} />
        {/* Public for everyone, signed in or not. */}
        <Route path="/privacy" element={page('Loading privacy policy', <PrivacyPolicy />, 3)} />
        <Route path="/terms" element={page('Loading terms', <TermsOfUse />, 3)} />
        <Route path="/verify" element={page('Loading verification', <VerifyOTP />)} />
        {/* /app and every screen under it (/app/transactions, /app/insights/…). */}
        <Route
          path="/app/*"
          element={isAuthenticated
            // Per-account storage (goals, categories, …) is keyed by the signed-in
            // email, so wait for it: rendering earlier would read an empty store,
            // and a first save could overwrite real data.
            ? (userEmail ? page('Loading your account', <AppDashboard />, 3) : <SectionSkeleton title="Loading your account" rows={3} />)
            : <ToLogin />}
        />
        {/* Unknown paths go home. */}
        <Route path="*" element={<Navigate to={isAuthenticated ? '/app' : '/'} />} />
      </Routes>
    </Router>
  );
};

export default App;
