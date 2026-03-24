import React from 'react';
import { ErrorBoundary as ReactErrorBoundary, FallbackProps } from 'react-error-boundary';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

const ErrorFallback: React.FC<FallbackProps & { title?: string }> = ({ error, title, resetErrorBoundary }) => {
  return (
    <div className="min-h-screen bg-bone flex items-center justify-center p-6">
      <div className="max-w-2xl w-full border-4 border-ink bg-white shadow-neo p-8">
        <p className="font-mono text-xs uppercase tracking-wider text-ink/70">System Recovery</p>
        <h1 className="font-loud text-3xl mt-2 uppercase text-usc-cardinal">
          {title || 'Something went wrong'}
        </h1>
        <p className="font-bold mt-4 text-ink/80">
          The interface hit an unexpected error. Your data is safe. Reload to continue.
        </p>
        {error?.message && (
          <p className="mt-4 font-mono text-xs text-ink/70 border-2 border-ink p-3 bg-bone">
            {error.message}
          </p>
        )}
        <button
          onClick={resetErrorBoundary}
          className="mt-6 font-loud text-sm uppercase px-5 py-3 border-4 border-ink bg-usc-gold text-ink shadow-neo hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
        >
          Retry View
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
