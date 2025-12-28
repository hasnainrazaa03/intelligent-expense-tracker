/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'usc-cardinal': '#990000',
        'usc-gold': '#FFCC00',
        'ink': '#111111',
        'bone': '#F5F5F0',
      },
      boxShadow: {
        'neo': '4px 4px 0px 0px #111111',
        'neo-hover': '2px 2px 0px 0px #111111',
      },
      fontFamily: {
        'loud': ['Archivo Black', 'sans-serif'],
      }
    },
  },
  plugins: [],
}