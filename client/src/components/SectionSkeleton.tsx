import React from 'react';

interface SectionSkeletonProps {
  rows?: number;
  title?: string;
}

const SectionSkeleton: React.FC<SectionSkeletonProps> = ({ rows = 3, title = 'Loading section' }) => {
  return (
    <div className="space-y-4" role="status" aria-label={title} aria-busy="true">
      <div className="h-10 w-64 bg-ink/10 border-2 border-ink/10 animate-pulse" />
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-28 w-full bg-white border-4 border-ink/20 animate-pulse" />
      ))}
    </div>
  );
};

export default SectionSkeleton;
