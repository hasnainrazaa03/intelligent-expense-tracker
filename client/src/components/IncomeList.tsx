import React, { useState } from 'react';
import { Income } from '../types';
import { 
  PencilIcon, TrashIcon, CalendarDaysIcon, TagIcon, 
  ChatBubbleBottomCenterTextIcon, ExclamationTriangleIcon, BanknotesIcon 
} from './Icons';
import { formatCurrency } from '../utils/currencyUtils';

interface IncomeListProps {
  incomes: Income[];
  onEdit: (income: Income) => void;
  onDelete: (id: string) => void;
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: React.ReactNode;
}

interface IncomeItemProps {
  income: Income;
  onEdit: (i: Income) => void;
  onDelete: (id: string) => void;
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

// --- NEO-BRUTALIST CONFIRMATION DIALOG ---
const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({ isOpen, onClose, onConfirm, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-[110] flex justify-center items-center p-4" onClick={onClose}>
      <div className="bg-bone border-4 border-ink shadow-neo-cardinal w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="p-4 md:p-6 border-b-4 border-ink bg-usc-cardinal text-bone flex items-center">
              <ExclamationTriangleIcon className="h-6 w-6 md:h-8 md:w-8 mr-3 flex-shrink-0" />
              <h3 className="font-loud text-lg md:text-2xl uppercase leading-none">{title}</h3>
          </div>
          <div className="p-6 md:p-8 font-bold text-ink uppercase text-xs md:text-sm leading-tight">
              {children}
          </div>
          <div className="flex p-3 md:p-4 border-t-4 border-ink gap-3 md:gap-4 bg-bone">
              <button onClick={onClose} className="flex-1 py-3 font-loud text-xs md:text-base border-4 border-ink bg-white text-ink shadow-neo active:translate-x-1 transition-all">
              CANCEL
              </button>
              <button onClick={onConfirm} className="flex-1 py-3 font-loud text-xs md:text-base border-4 border-ink bg-usc-cardinal text-bone shadow-neo active:translate-x-1 transition-all">
              PURGE_DATA
              </button>
          </div>
      </div>
    </div>
  );
};

// --- NEO-BRUTALIST INCOME ITEM ---
const IncomeItem: React.FC<IncomeItemProps> = ({ income, onEdit, onDelete, displayCurrency, conversionRate }) => {
  return (
    <li className="relative group">
      <div className="bg-white border-4 border-ink p-4 md:p-6 shadow-neo-gold hover:shadow-neo-hover active:translate-y-0.5 md:hover:-translate-y-1 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 overflow-hidden">
        
        <div className="flex items-center space-x-3 md:space-x-4 flex-1 min-w-0">
          <div className="p-2 md:p-3 border-2 md:border-4 border-ink bg-usc-gold text-ink shadow-[2px_2px_0px_0px_#111111] md:shadow-[4px_4px_0px_0px_#111111] flex-shrink-0">
            <BanknotesIcon className="h-4 w-4 md:h-6 md:w-6" />
          </div>
          <div className="min-w-0">
            <h4 className="font-loud text-base md:text-xl leading-none text-ink uppercase truncate">{income.title}</h4>
            <div className="flex flex-wrap gap-1.5 md:gap-2 mt-2">
              <span className="bg-ink text-usc-gold px-1.5 py-0.5 text-[8px] md:text-[10px] font-bold border border-ink uppercase">
                {income.category.toUpperCase()}
              </span>
              <span className="flex items-center text-[8px] md:text-[10px] font-bold text-ink/40 uppercase">
                <CalendarDaysIcon className="h-2.5 w-2.5 md:h-3 md:w-3 mr-1" /> {income.date}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-4 md:gap-6 border-t-2 md:border-t-0 border-ink/10 pt-3 md:pt-0">
          <div className="text-left md:text-right">
            <p className="font-loud text-xl md:text-2xl text-green-600 leading-none">
              +{formatCurrency(income.amount, displayCurrency, conversionRate)}
            </p>
            <p className="text-[8px] md:text-[9px] font-mono opacity-50 uppercase tracking-tighter text-ink mt-1">Verified_Inflow</p>
          </div>

          <div className="flex space-x-2 flex-shrink-0">
            <button onClick={() => onEdit(income)} className="p-2 border-2 border-ink bg-usc-gold text-ink shadow-[2px_2px_0px_0px_#111111] active:translate-x-0.5 active:translate-y-0.5 transition-all">
              <PencilIcon className="h-4 w-4 md:h-5 md:w-5" />
            </button>
            <button onClick={() => onDelete(income.id)} className="p-2 border-2 border-ink bg-usc-cardinal text-bone shadow-[2px_2px_0px_0px_#111111] active:translate-x-0.5 active:translate-y-0.5 transition-all">
              <TrashIcon className="h-4 w-4 md:h-5 md:w-5" />
            </button>
          </div>
        </div>
      </div>
      
      {income.notes && (
        <div className="hidden md:group-hover:block absolute -top-12 left-1/2 -translate-x-1/2 bg-ink text-bone p-2 text-xs font-mono border-2 border-usc-gold z-20 whitespace-nowrap shadow-neo uppercase">
           <ChatBubbleBottomCenterTextIcon className="h-3 w-3 inline mr-1" />
           {income.notes}
        </div>
      )}
    </li>
  );
};

const IncomeList: React.FC<IncomeListProps> = ({ incomes, onEdit, onDelete, displayCurrency, conversionRate }) => {
  const [incomeToDeleteId, setIncomeToDeleteId] = useState<string | null>(null);

  const handleConfirmDelete = () => {
    if (incomeToDeleteId) {
      onDelete(incomeToDeleteId);
      setIncomeToDeleteId(null);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b-4 border-ink pb-2 gap-2">
        <h2 className="font-loud text-2xl md:text-4xl text-ink uppercase truncate">INCOME_STREAM</h2>
        <span className="bg-usc-gold text-ink px-2 md:px-3 py-1 font-loud text-[10px] md:text-xs border-2 border-ink w-fit">
          TOTAL_SOURCES: {incomes.length}
        </span>
      </div>

      {incomes.length > 0 ? (
        <ul className="space-y-4 md:space-y-6">
          {incomes.map(income => (
            <IncomeItem 
              key={income.id} 
              income={income} 
              onEdit={onEdit} 
              onDelete={(id) => setIncomeToDeleteId(id)}
              displayCurrency={displayCurrency}
              conversionRate={conversionRate}
            />
          ))}
        </ul>
      ) : (
        <div className="border-4 border-ink border-dashed p-8 md:p-16 text-center bg-bone/50">
          <p className="font-loud text-lg md:text-2xl text-ink/20 uppercase">AWAITING_REVENUE_DATA</p>
          <p className="text-[9px] md:text-xs font-mono text-ink/40 mt-2 italic uppercase">STATUS: ZERO_INFLOW_DETECTED</p>
        </div>
      )}
      
      <ConfirmationDialog
        isOpen={!!incomeToDeleteId}
        onClose={() => setIncomeToDeleteId(null)}
        onConfirm={handleConfirmDelete}
        title="SYSTEM_ALERT"
      >
        IDENTIFIED RECORD WILL BE DELETED FROM THE CENTRAL DATABASE. PROCEED WITH PERMANENT ERASURE?
      </ConfirmationDialog>
    </div>
  );
};

export default IncomeList;