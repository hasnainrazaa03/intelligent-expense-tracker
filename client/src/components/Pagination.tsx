import React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
}

const Pagination: React.FC<PaginationProps> = ({ 
  currentPage, 
  totalPages, 
  onPageChange, 
  totalItems, 
  itemsPerPage 
}) => {
  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-app-border pt-5">
      <div className="text-xs text-app-muted tabular-nums">
        Showing <span className="text-app-text font-medium">{startItem}–{endItem}</span> of <span className="text-app-text font-medium">{totalItems}</span> entries
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          aria-label="Previous page"
          className={`grid place-items-center w-9 h-9 rounded-xl border transition-colors ${
            currentPage === 1 ? 'bg-surface-2 border-app-border text-app-faint cursor-not-allowed' : 'bg-surface-2 border-app-border text-app-text hover:border-app-border-strong'
          }`}
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>

        <span className="px-3.5 py-1.5 rounded-xl bg-surface-2 border border-app-border text-sm font-medium text-app-text tabular-nums">
          {currentPage} / {totalPages}
        </span>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          aria-label="Next page"
          className={`grid place-items-center w-9 h-9 rounded-xl border transition-colors ${
            currentPage === totalPages ? 'bg-surface-2 border-app-border text-app-faint cursor-not-allowed' : 'bg-surface-2 border-app-border text-app-text hover:border-app-border-strong'
          }`}
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};

export default Pagination;