import React from 'react';

// Orbit wordmark: a planet + tilted ring glyph beside the name. The mark uses the
// indigo brand gradient; the wordmark inherits currentColor so it works on any
// surface / theme.
export const ExpenseTrackerLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 340 96"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    preserveAspectRatio="xMidYMid meet"
    role="img"
    aria-label="Orbit"
  >
    <defs>
      <linearGradient id="orbit-mark" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#8b7ff6" />
        <stop offset="1" stop-color="#6d5cf0" />
      </linearGradient>
    </defs>
    {/* planet */}
    <circle cx="46" cy="48" r="22" fill="url(#orbit-mark)" />
    <circle cx="38" cy="40" r="7" fill="#ffffff" opacity="0.35" />
    {/* orbit ring */}
    <ellipse cx="46" cy="48" rx="40" ry="15" fill="none" stroke="url(#orbit-mark)"
      stroke-width="5" transform="rotate(-22 46 48)" />
    {/* wordmark */}
    <text x="96" y="49" dominantBaseline="central"
      fill="currentColor"
      style={{ font: '700 52px "Sora", ui-sans-serif, system-ui, sans-serif', letterSpacing: '-1.5px' }}>
      Orbit
    </text>
  </svg>
);
