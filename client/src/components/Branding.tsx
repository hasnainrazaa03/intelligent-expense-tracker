import React from 'react';

export const ExpenseTrackerLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg 
    // Widened the viewBox width to 900 to prevent clipping
    viewBox="0 0 900 150" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    preserveAspectRatio="xMidYMid meet"
  >
    <defs>
      <style>
        {`
          .usc-text {
            fill: #990000;
            stroke: #FFC72C;
            stroke-width: 4px;
            stroke-linejoin: round;
            font-family: 'Arial Black', 'Impact', sans-serif;
            font-weight: 900;
            font-size: 80px; /* Reduced slightly from 85 to fit the new stage */
            letter-spacing: 2px;
            text-transform: uppercase;
          }
        `}
      </style>
    </defs>
    {/* Centered at 450 (middle of the new 900 width) */}
    <text x="450" y="80" dominantBaseline="middle" textAnchor="middle" className="usc-text">
      EXPENSE TRACKER
    </text>
  </svg>
);