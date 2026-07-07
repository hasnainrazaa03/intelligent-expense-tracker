/** @type {import('tailwindcss').Config} */
export default {
  // Dark mode is driven by a `.dark` class on <html> (see useTheme + the
  // @custom-variant in index.css).
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Legacy neo-brutalist tokens — kept while components migrate to the
        // semantic tokens in index.css (bg-surface, text-app-muted, …).
        'usc-cardinal': '#990000',
        'usc-gold': '#FFCC00',
        'ink': '#111111',
        'bone': '#F5F5F0',
      },
      boxShadow: {
        'neo': '4px 4px 0px 0px #111111',
        'neo-hover': '2px 2px 0px 0px #111111',
        'neo-gold': '4px 4px 0px 0px #FFCC00',
        'neo-cardinal': '4px 4px 0px 0px #990000',
        // Orbit soft elevation + glow (used by the redesigned surfaces).
        'glow': 'var(--glow)',
        'soft': 'var(--shadow)',
        'soft-sm': 'var(--shadow-sm)',
      },
      fontFamily: {
        'loud': ['Archivo Black', 'sans-serif'],
        'display': ['Sora', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        'sans': ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}