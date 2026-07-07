import React from 'react';
import { useTheme } from '../hooks/useTheme';
import { SunIcon, MoonIcon } from './Icons';

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="grid place-items-center w-9 h-9 rounded-full bg-surface-2 border border-app-border text-app-muted hover:text-app-text transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
      aria-label="Toggle theme"
    >
      {theme === 'light' ? (
        <MoonIcon className="h-5 w-5" />
      ) : (
        <SunIcon className="h-5 w-5" />
      )}
    </button>
  );
};

export default ThemeToggle;