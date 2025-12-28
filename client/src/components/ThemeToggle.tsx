import React from 'react';
import { useTheme } from '../hooks/useTheme';
import { SunIcon, MoonIcon } from './Icons';

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 border-4 border-ink bg-bone shadow-neo hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all focus:outline-none focus:ring-4 focus:ring-usc-gold"
      aria-label="Toggle theme"
    >
      {theme === 'light' ? (
        <div className="flex items-center gap-2">
           <MoonIcon className="h-5 w-5 text-ink" />
           <span className="font-loud text-[10px]">GO_DARK</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
           <SunIcon className="h-5 w-5 text-usc-gold" />
           <span className="font-loud text-[10px]">GO_LIGHT</span>
        </div>
      )}
    </button>
  );
};

export default ThemeToggle;