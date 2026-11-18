import React, { Suspense } from 'react';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import SectionSkeleton from './components/SectionSkeleton';
import AppDashboard from './app/AppDashboard';
import { Auth, VerifyOTP, LandingPage, KnowledgeBase, PrivacyPolicy, TermsOfUse } from './app/screens';

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
        <Route path="/login" element={!isAuthenticated ? page('Loading login', <Auth onLoginSuccess={loginSuccess} />) : <Navigate to="/app" />} />
        <Route path="/" element={!isAuthenticated ? page('Loading landing', <LandingPage />) : <Navigate to="/app" />} />
        <Route path="/knowledge" element={page('Loading knowledge base', <KnowledgeBase />)} />
        {/* Public for everyone, signed in or not. */}
        <Route path="/privacy" element={page('Loading privacy policy', <PrivacyPolicy />, 3)} />
        <Route path="/terms" element={page('Loading terms', <TermsOfUse />, 3)} />
        <Route path="/verify" element={page('Loading verification', <VerifyOTP />)} />
        <Route
          path="/app"
          element={isAuthenticated
            // Per-account storage (goals, categories, …) is keyed by the signed-in
            // email, so wait for it: rendering earlier would read an empty store,
            // and a first save could overwrite real data.
            ? (userEmail ? <AppDashboard /> : <SectionSkeleton title="Loading your account" rows={3} />)
            : <Navigate to="/login" />}
        />
        {/* Unknown paths go home. */}
        <Route path="*" element={<Navigate to={isAuthenticated ? '/app' : '/'} />} />
      </Routes>
    </Router>
  );
};

export default App;
