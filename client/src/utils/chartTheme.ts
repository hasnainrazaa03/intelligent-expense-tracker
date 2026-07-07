// Theme-aware colors for Recharts. Recharts needs concrete color strings (not
// CSS-variable utility classes), so we resolve them per theme here. Components
// read `theme` from useTheme() so charts recolor when the theme toggles.

type Theme = 'light' | 'dark';

export interface ChartColors {
  grid: string;
  axisLine: string;
  tick: string;
  cursor: string;
  primary: string;     // bars / primary series
  primarySoft: string; // faint fill under lines
  good: string;        // income / positive
  danger: string;      // expense / over budget
  surface: string;     // tooltip surface
}

export const getChartColors = (theme: Theme): ChartColors =>
  theme === 'dark'
    ? {
        grid: 'rgba(255,255,255,0.07)',
        axisLine: 'rgba(255,255,255,0.12)',
        tick: 'rgba(161,159,192,0.9)',
        cursor: 'rgba(255,255,255,0.06)',
        primary: '#8b7ff6',
        primarySoft: 'rgba(139,127,246,0.18)',
        good: '#34d399',
        danger: '#fb7185',
        surface: '#171433',
      }
    : {
        grid: 'rgba(20,20,45,0.08)',
        axisLine: 'rgba(20,20,45,0.14)',
        tick: 'rgba(90,88,120,0.9)',
        cursor: 'rgba(20,20,45,0.05)',
        primary: '#6d5cf0',
        primarySoft: 'rgba(109,92,240,0.14)',
        good: '#16a34a',
        danger: '#e11d48',
        surface: '#ffffff',
      };
