import React, { useState, useEffect } from 'react';
import { Semester } from '../types';
import { formatCurrency } from '../utils/currencyUtils';
import { AcademicCapIcon, TagIcon, CalendarDaysIcon } from './Icons';

interface USCPaymentTrackerProps {
  semesters: Semester[];
  onUpdateTuition: (semesterId: string, totalTuition: number) => void;
  onUpdateInstallmentCount: (semesterId: string, count: number) => void;
  onMarkAsPaid: (semesterId: string, installmentId: number) => void;
  onUpdateDate: (semesterId: string, installmentId: number, newDate: string) => void;
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const [selectedDates, setSelectedDates] = useState<Record<number, string>>({});

// --- INTELLIGENT SEMESTER DETECTOR ---
const detectCurrentSemesterId = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11

  let season = "";
  if (month <= 4) season = "SPRING";      // Jan - May
  else if (month <= 6) season = "SUMMER"; // June - July
  else season = "FALL";                   // Aug - Dec

  return `${season}_${year}`;
};

const USCPaymentTracker: React.FC<USCPaymentTrackerProps> = ({ 
  semesters, onUpdateTuition, onUpdateInstallmentCount, onMarkAsPaid, onUpdateDate, displayCurrency, conversionRate 
}) => {
  // Initialize with the detected current semester
  const [activeSemesterId, setActiveSemesterId] = useState<string>(detectCurrentSemesterId());

  // Ensure we fall back to the first available semester if the detected one isn't in the list
  useEffect(() => {
    const exists = semesters.find(s => s.id === activeSemesterId);
    if (!exists && semesters.length > 0) {
      setActiveSemesterId(semesters[0].id);
    }
  }, [semesters]);

  const activeSemester = semesters.find(s => s.id === activeSemesterId);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      
      {/* 1. HERO HEADER */}
      <div className="relative border-b-4 md:border-b-8 border-ink pb-6 md:pb-8 overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none hidden sm:block">
          <AcademicCapIcon className="h-64 w-64 text-ink" />
        </div>
        <div className="relative z-10">
          <div className="bg-usc-cardinal text-bone px-3 py-1 font-loud text-[10px] w-fit border-2 md:border-4 border-ink shadow-neo mb-4 uppercase">
            OFFICIAL_BURSAR_MANIFEST // 2024-2026
          </div>
          <h2 className="font-loud text-4xl sm:text-6xl md:text-8xl text-ink leading-[0.85] tracking-tighter uppercase">
            TUITION_LEDGER
          </h2>
        </div>
      </div>

      {/* 2. SEMESTER SELECTION TABS (Folder Style) */}
      <div className="flex bg-ink p-1 border-4 border-ink shadow-neo w-full overflow-x-auto no-scrollbar scroll-smooth">
        {semesters.map((s) => {
          const isActive = s.id === activeSemesterId;
          const isCurrentAuto = s.id === detectCurrentSemesterId();
          
          return (
            <button
              key={s.id}
              onClick={() => setActiveSemesterId(s.id)}
              className={`px-4 md:px-6 py-2 font-loud text-[10px] md:text-xs transition-all relative flex-shrink-0 whitespace-nowrap ${
                isActive 
                  ? 'bg-usc-gold text-ink' 
                  : 'text-bone hover:bg-white/10'
              }`}
            >
              {s.name.toUpperCase()}
              {isCurrentAuto && (
                <div className="absolute top-0 right-0 w-2 h-2 bg-usc-cardinal border border-bone" title="CURRENT_TERM" />
              )}
            </button>
          );
        })}
      </div>

      {/* 3. ACTIVE SEMESTER VIEW */}
      {activeSemester ? (
        <div className="bg-bone border-4 border-ink shadow-neo flex flex-col animate-in slide-in-from-right-4 duration-300">
          {/* Header */}
          <div className="bg-ink p-6 border-b-4 border-ink flex justify-between items-center text-bone">
            <div>
              <h3 className="font-loud text-3xl text-usc-gold tracking-tight">
                {activeSemester.name.toUpperCase()}
              </h3>
              <p className="font-mono text-[10px] opacity-50 uppercase">Active_Session_Focused</p>
            </div>
            <div className="text-right">
              <span className="block font-mono text-[10px] text-bone/40 leading-none">SEMESTER_ID</span>
              <span className="font-loud text-bone text-xs">{activeSemester.id}</span>
            </div>
          </div>

          <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* SEMESTER CONFIGURATION PANEL */}
          <div className="space-y-6">
            <div className="bg-white border-4 border-ink p-6 md:p-10 shadow-neo-gold relative overflow-hidden flex flex-col items-center justify-center text-center min-w-0">
              <div className="absolute top-0 right-0 bg-ink text-usc-gold px-2 py-0.5 font-loud text-[8px]">REQUIRED_CONFIG</div>
              
              {/* Total Valuation Field */}
              <div className="mb-8 md:mb-10 w-full">
                <label className="font-loud text-[9px] md:text-[10px] text-ink/40 mb-3 block tracking-widest uppercase">Total_Tuition_Valuation</label> 
                <div className="flex flex-col items-center gap-4">
                  <span className="font-loud text-3xl sm:text-4xl md:text-5xl text-ink leading-none break-all">
                    {formatCurrency(activeSemester.totalTuition, displayCurrency, conversionRate)}
                  </span>
                  <input 
                    type="number" 
                    placeholder="SET_VAL"
                    className="w-full max-w-[180px] bg-bone border-4 border-ink p-3 font-loud text-sm focus:ring-4 focus:ring-usc-gold focus:outline-none text-center"
                    onBlur={(e) => onUpdateTuition(activeSemester.id, parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              {/* Dynamic Installment Splitter */}
              <div className="pt-10 border-t-4 border-dashed border-ink/10 w-full flex flex-col items-center">
                <label className="font-loud text-[10px] text-ink/40 mb-3 block tracking-widest uppercase">Installment_Split_Quantity</label>
                <div className="flex flex-col items-center gap-4">
                  <span className="font-loud text-3xl text-ink">
                    {activeSemester.installments.length} <span className="text-xs opacity-40">UNITS</span>
                  </span>
                  <input 
                    type="number" 
                    // Calculate the minimum allowed count based on the last paid installment index
                    min={activeSemester.installments.reduce((max, inst, idx) => 
                      inst.status === 'paid' ? Math.max(max, idx + 1) : max, 1
                    )}
                    max="12"
                    defaultValue={activeSemester.installments.length} 
                    className="w-24 bg-bone border-4 border-ink p-2 font-loud text-xs focus:ring-4 focus:ring-usc-gold focus:outline-none text-center"
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      const minRequired = activeSemester.installments.reduce((max, inst, idx) => 
                        inst.status === 'paid' ? Math.max(max, idx + 1) : max, 1
                      );

                      if (val < minRequired) {
                        alert(`Cannot reduce count to ${val}. Installment #${minRequired} is already paid.`);
                        e.target.value = activeSemester.installments.length.toString();
                        return;
                      }
                      
                      if (val > 0 && val !== activeSemester.installments.length) {
                        onUpdateInstallmentCount(activeSemester.id, val);
                      }
                    }}
                  />
                </div>
                <p className="mt-6 text-[9px] font-mono opacity-40 italic max-w-[200px]">Note: Changing count will re-calculate all unpaid vouchers.</p>
              </div>
            </div>
          </div>

            {/* Installment Voucher List */}
            <div className="space-y-4">
              <p className="font-loud text-xs opacity-30 border-b-2 border-ink/10 pb-2">PAYMENT_SCHEDULE_VOUCHERS</p>
              {activeSemester.installments.map((inst, index) => (
                <div key={inst.id} className="relative flex items-stretch border-4 border-ink bg-white shadow-neo active:translate-y-1 transition-all min-h-[80px]">
                  
                  <div className={`w-8 md:w-12 flex items-center justify-center border-r-4 border-ink font-loud text-[8px] md:text-xs ${inst.status === 'paid' ? 'bg-green-600 text-bone' : 'bg-usc-gold text-ink'}`}>
                    <span className="-rotate-90 whitespace-nowrap">VCHR_{index + 1}</span>
                  </div>

                  <div className="p-3 md:p-4 flex-grow flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-loud text-lg md:text-xl text-ink leading-none truncate">
                        {formatCurrency(inst.amount, displayCurrency, conversionRate)}
                      </p>
                      {inst.status === 'paid' ? (
                        <div className="flex items-center mt-2 text-green-600 font-bold text-[10px]">
                          <TagIcon className="h-3 w-3 mr-1" /> PROCESSED: {inst.paidDate}
                        </div>
                      ) : (
                        <div className="flex items-center mt-2 text-ink/40 font-mono text-[9px]">
                          <CalendarDaysIcon className="h-3 w-3 mr-1" /> AWAITING_SETTLEMENT
                        </div>
                      )}
                    </div>

                    {inst.status !== 'paid' && inst.amount > 0 && (
                      <div className="flex flex-col md:flex-row items-center gap-3">
                        <div className="flex flex-col">
                          <label className="font-mono text-[8px] opacity-40 uppercase mb-1">Payment_Date</label>
                          <input 
                            type="date" 
                            // Default to today if no date is selected yet
                            value={selectedDates[inst.id] || new Date().toISOString().split('T')[0]}
                            onChange={(e) => setSelectedDates(prev => ({ ...prev, [inst.id]: e.target.value }))}
                            className="bg-bone border-2 border-ink p-1 font-loud text-[10px] focus:ring-2 focus:ring-usc-gold focus:outline-none"
                          />
                        </div>
                        
                        <button 
                          onClick={() => {
                            const dateToUse = selectedDates[inst.id] || new Date().toISOString().split('T')[0];
                            onMarkAsPaid(activeSemester.id, inst.id, dateToUse);
                          }}
                          className="bg-usc-cardinal text-bone font-loud text-[9px] md:text-[10px] px-3 md:px-4 py-2 border-2 md:border-4 border-ink shadow-[2px_2px_0px_0px_#111111] md:shadow-[4px_4px_0px_0px_#111111] active:shadow-none active:translate-y-0.5 transition-all flex-shrink-0 uppercase"
                        >
                          PAY_INST
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="hidden sm:block absolute top-1/2 -right-3 -translate-y-1/2 w-6 h-6 bg-bone border-l-4 border-ink rounded-full" />
                </div>
              ))}
            </div>
          </div>

          {/* Footer Ledger */}
          <div className="p-6 bg-ink text-bone border-t-4 border-ink flex justify-between items-center">
            <div>
              <p className="text-[10px] font-mono opacity-50 uppercase">Settled_Sum</p>
              <p className="font-loud text-2xl text-usc-gold">
                {formatCurrency(
                  activeSemester.installments.reduce((acc, i) => i.status === 'paid' ? acc + i.amount : acc, 0), 
                  displayCurrency, 
                  conversionRate
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-mono opacity-50 uppercase">Remaining_Balance</p>
              <p className="font-loud text-2xl text-usc-cardinal">
                {formatCurrency(
                  activeSemester.totalTuition - activeSemester.installments.reduce((acc, i) => i.status === 'paid' ? acc + i.amount : acc, 0),
                  displayCurrency,
                  conversionRate
                )}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-4 border-ink border-dashed p-20 text-center bg-bone/50">
          <p className="font-loud text-2xl text-ink/20">NO_SEMESTER_DATA_FOUND</p>
        </div>
      )}
    </div>
  );
};

export default USCPaymentTracker;