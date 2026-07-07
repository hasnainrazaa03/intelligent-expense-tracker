import React from 'react';

interface SectionSkeletonProps {
  rows?: number;
  title?: string;
}

const SectionSkeleton: React.FC<SectionSkeletonProps> = ({ rows = 3, title = 'Loading section' }) => {
  return (
    <div className="glass rounded-2xl p-5 md:p-7 space-y-4" role="status" aria-label={title} aria-busy="true">
      <div className="h-10 w-64 bg-surface-2 rounded-xl animate-pulse" />
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-28 w-full bg-surface-2 rounded-xl animate-pulse" />
      ))}
    </div>
  );
};

export default SectionSkeleton;
