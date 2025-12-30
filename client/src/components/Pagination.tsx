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
    <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 border-t-4 border-ink pt-6">
      <div className="font-mono text-[10px] md:text-xs text-ink/40 uppercase font-bold tracking-widest">
        Showing <span className="text-ink">{startItem}-{endItem}</span> of <span className="text-ink">{totalItems}</span> Entries
      </div>
      
      <div className="flex items-center space-x-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={`p-2 border-4 border-ink shadow-neo active:translate-x-0.5 active:translate-y-0.5 transition-all ${
            currentPage === 1 ? 'bg-ink/5 text-ink/20 cursor-not-allowed shadow-none' : 'bg-white text-ink hover:bg-usc-gold'
          }`}
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>

        <div className="flex items-center bg-ink p-1 border-2 border-ink">
          <span className="px-4 font-loud text-bone text-sm md:text-base">
            PAGE_{currentPage}_OF_{totalPages}
          </span>
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={`p-2 border-4 border-ink shadow-neo active:translate-x-0.5 active:translate-y-0.5 transition-all ${
            currentPage === totalPages ? 'bg-ink/5 text-ink/20 cursor-not-allowed shadow-none' : 'bg-white text-ink hover:bg-usc-gold'
          }`}
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};

export default Pagination;