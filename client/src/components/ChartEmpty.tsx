import React from 'react';

/** Consistent empty-state filler for chart / card bodies that have no data,
 *  so every panel reads "No data available" the same way instead of rendering
 *  a blank box or vanishing entirely. */
const ChartEmpty: React.FC<{ message?: string; className?: string }> = ({
  message = 'No data available',
  className = '',
}) => (
  <div className={`flex h-full min-h-[8rem] items-center justify-center text-sm text-app-faint ${className}`}>
    {message}
  </div>
);

export default ChartEmpty;
