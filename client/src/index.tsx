import React from 'react';
import ReactDOM from 'react-dom/client';
import toast from 'react-hot-toast';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import ErrorBoundary from './components/ErrorBoundary';
import { queryClient } from './lib/queryClient';
import { CurrencyProvider } from './contexts/CurrencyContext';
import { AuthProvider } from './contexts/AuthContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="Interface crash recovered">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CurrencyProvider>
            <App />
          </CurrencyProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Surface an "update available" toast when a new build has installed
        // behind an existing controller (i.e. a real update, not first install).
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              toast(
                (t) => (
                  <span className="flex items-center gap-3 text-sm">
                    A new version of Orbit is available.
                    <button
                      onClick={() => { toast.dismiss(t.id); window.location.reload(); }}
                      className="rounded-lg bg-primary text-on-primary font-semibold px-3 py-1 text-xs"
                    >
                      Reload
                    </button>
                  </span>
                ),
                { duration: Infinity, id: 'sw-update' }
              );
            }
          });
        });
      })
      .catch(() => undefined);
  });
}
