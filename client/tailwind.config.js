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
      // Semantic color/spacing/radius tokens live in index.css via @theme.
      // The neo-brutalist legacy tokens (usc-*, ink, bone, shadow-neo*, the
      // Archivo Black "loud" face) were removed once every surface migrated to
      // the cosmic-glass system.
      boxShadow: {
        'glow': 'var(--glow)',
        'soft': 'var(--shadow)',
        'soft-sm': 'var(--shadow-sm)',
      },
      fontFamily: {
        'display': ['Sora', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        'sans': ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}