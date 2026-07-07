import React from 'react';
import { ErrorBoundary as ReactErrorBoundary, FallbackProps } from 'react-error-boundary';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

const ErrorFallback: React.FC<FallbackProps & { title?: string }> = ({ error, title, resetErrorBoundary }) => {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-2xl w-full glass rounded-2xl p-8 text-center">
        <p className="text-xs uppercase tracking-wider text-app-faint">System recovery</p>
        <h1 className="font-display font-bold text-3xl mt-2 text-app-text">
          {title || 'Something went wrong'}
        </h1>
        <p className="mt-4 text-app-muted">
          The interface hit an unexpected error. Your data is safe. Reload to continue.
        </p>
        {error?.message && (
          <p className="mt-4 text-xs text-app-muted bg-surface-2 border border-app-border rounded-xl p-3">
            {error.message}
          </p>
        )}
        <button
          onClick={resetErrorBoundary}
          className="mt-6 font-semibold text-sm px-5 py-3 rounded-xl bg-primary text-on-primary shadow-glow hover:brightness-110 active:scale-[0.99] transition-all"
        >
          Try again
        </button>
      </div>
    </div>
  );
};

const AppErrorBoundary: React.FC<AppErrorBoundaryProps> = ({ children, fallbackTitle }) => {
  return (
    <ReactErrorBoundary
      onError={(error, errorInfo) => {
        console.error('UI error captured by ErrorBoundary:', error, errorInfo);
      }}
      FallbackComponent={(props) => (
        <ErrorFallback {...props} title={fallbackTitle} />
      )}
    >
      {children}
    </ReactErrorBoundary>
  );
};

export default AppErrorBoundary;
