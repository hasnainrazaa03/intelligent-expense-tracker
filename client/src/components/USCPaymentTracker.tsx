import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Semester } from '../types';
import { formatCurrency } from '../utils/currencyUtils';
import { todayCalendar } from '../utils/dateUtils';
import { AcademicCapIcon, TagIcon, CalendarDaysIcon } from './Icons';
import { useCurrency } from '../contexts/CurrencyContext';
import { Button, Input } from './ui';

interface USCPaymentTrackerProps {
  semesters: Semester[];
  onUpdateTuition: (semesterId: string, totalTuition: number) => void;
  onUpdateInstallmentCount: (semesterId: string, count: number) => void;
  onMarkAsPaid: (semesterId: string, installmentId: number, paymentDate: string) => void;
  onUpdateDate: (semesterId: string, installmentId: number, newDate: string) => void;
}

// --- INTELLIGENT SEMESTER DETECTOR ---
const detectCurrentSemesterId = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11

  let season = "";
  if (month <= 4) season = "spring";      // Jan - May
  else if (month <= 6) season = "summer"; // June - July
  else season = "fall";                   // Aug - Dec

  return `${season}-${year}`;
};

const USCPaymentTracker: React.FC<USCPaymentTrackerProps> = ({
  semesters, onUpdateTuition, onUpdateInstallmentCount, onMarkAsPaid, onUpdateDate
}) => {
  const { displayCurrency, conversionRate } = useCurrency();
  
  const [selectedDates, setSelectedDates] = useState<Record<number, string>>({});
  
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
    <div className="space-y-5 md:space-y-6 animate-in fade-in duration-700">

      {/* 1. HERO HEADER */}
      <div className="relative border-b border-app-border pb-6 md:pb-8 overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-[0.06] pointer-events-none hidden sm:block">
          <AcademicCapIcon className="h-64 w-64 text-app-text" />
        </div>
        <div className="relative z-10">
          <div className="bg-primary/15 text-primary px-3 py-1 text-[10px] w-fit rounded-full font-semibold uppercase tracking-[0.16em] mb-4">
            Official Bursar statement // 2024-2026
          </div>
          <h2 className="font-display font-bold text-2xl md:text-3xl text-app-text leading-tight tracking-tight">
            Tuition ledger
          </h2>
        </div>
      </div>

      {/* 2. SEMESTER SELECTION TABS */}
      <div className="flex glass rounded-2xl p-1 w-full overflow-x-auto no-scrollbar scroll-smooth">
        {semesters.map((s) => {
          const isActive = s.id === activeSemesterId;
          const isCurrentAuto = s.id === detectCurrentSemesterId();

          return (
            <button
              key={s.id}
              onClick={() => setActiveSemesterId(s.id)}
              className={`px-4 md:px-6 py-2 rounded-xl text-[10px] md:text-xs font-semibold transition-all relative flex-shrink-0 whitespace-nowrap ${
                isActive
                  ? 'bg-primary text-on-primary shadow-glow'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              {s.name}
              {isCurrentAuto && (
                <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-warn" title="Current term" />
              )}
            </button>
          );
        })}
      </div>

      {/* 3. ACTIVE SEMESTER VIEW */}
      {activeSemester ? (
        <div className="glass rounded-2xl flex flex-col overflow-hidden animate-in slide-in-from-right-4 duration-300">
          {/* Header */}
          <div className="p-6 border-b border-app-border flex justify-between items-center">
            <div>
              <h3 className="font-display font-bold text-2xl md:text-3xl text-app-text tracking-tight">
                {activeSemester.name}
              </h3>
              <p className="text-[10px] text-app-faint uppercase tracking-[0.16em] mt-1">Active session</p>
            </div>
            <div className="text-right">
              <span className="block text-[10px] text-app-faint uppercase tracking-[0.16em] leading-none">Semester ID</span>
              <span className="font-display font-semibold text-app-text text-xs">{activeSemester.id}</span>
            </div>
          </div>

          <div className="p-5 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6 items-start">
          {/* SEMESTER CONFIGURATION PANEL */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-app-border bg-surface-2 p-4 md:p-6 relative overflow-hidden flex flex-col items-center justify-center text-center min-w-0">
              <div className="absolute top-3 right-3 text-app-faint text-[9px] uppercase tracking-[0.16em]">Required</div>

              {/* Total Valuation Field */}
              <div className="mb-5 md:mb-6 w-full">
                <label className="text-[9px] md:text-[10px] text-app-faint mb-3 block tracking-[0.16em] uppercase">Total tuition</label>
                <div className="flex flex-col items-center gap-4">
                  <span className="font-display font-bold text-2xl md:text-3xl text-app-text leading-none break-all tabular-nums">
                    {formatCurrency(activeSemester.totalTuition, displayCurrency, conversionRate)}
                  </span>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Set amount"
                    className="max-w-[180px] text-center"
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    onBlur={(e) => {
                      const raw = e.target.value.trim();
                      // Ignore an empty/blank blur so clicking in and out never
                      // wipes the tuition total or zeroes the payment schedule.
                      if (raw === '') return;
                      const parsed = parseFloat(raw);
                      if (!Number.isFinite(parsed) || parsed < 0) {
                        e.target.value = '';
                        return;
                      }
                      onUpdateTuition(activeSemester.id, parsed);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>

              {/* Dynamic Installment Splitter */}
              <div className="pt-10 border-t border-app-border w-full flex flex-col items-center">
                <label className="text-[10px] text-app-faint mb-3 block tracking-[0.16em] uppercase">Installment count</label>
                <div className="flex flex-col items-center gap-4">
                  <span className="font-display font-bold text-3xl text-app-text tabular-nums">
                    {activeSemester.installments.length} <span className="text-xs text-app-faint">installments</span>
                  </span>
                  <input
                    type="number"
                    // Calculate the minimum allowed count based on the last paid installment index
                    min={activeSemester.installments.reduce((max, inst, idx) =>
                      inst.status === 'paid' ? Math.max(max, idx + 1) : max, 1
                    )}
                    max="12"
                    defaultValue={activeSemester.installments.length}
                    className="w-24 bg-surface-2 border border-app-border rounded-xl px-4 py-2 text-app-text text-center focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                    onBlur={(e) => {
                      const val = parseInt(e.target.value);
                      const minRequired = activeSemester.installments.reduce((max, inst, idx) =>
                        inst.status === 'paid' ? Math.max(max, idx + 1) : max, 1
                      );

                      if (val < minRequired) {
                        toast.error(`Cannot reduce count to ${val}. Installment #${minRequired} is already paid.`);
                        e.target.value = activeSemester.installments.length.toString();
                        return;
                      }

                      if (val > 0 && val !== activeSemester.installments.length) {
                        onUpdateInstallmentCount(activeSemester.id, val);
                      }
                    }}
                  />
                </div>
                <p className="mt-6 text-[10px] text-app-faint italic max-w-[200px]">Note: Changing count will re-calculate all unpaid installments.</p>
              </div>
            </div>
          </div>

            {/* Installment Schedule List */}
            <div className="space-y-4">
              <p className="text-[10px] text-app-faint uppercase tracking-[0.16em] border-b border-app-border pb-2">Payment schedule</p>
              {activeSemester.installments.map((inst, index) => (
                <div key={inst.id} className="relative flex items-stretch rounded-2xl border border-app-border bg-surface-2 overflow-hidden transition-all min-h-[80px]">

                  <div className={`w-8 md:w-12 flex items-center justify-center text-[8px] md:text-xs font-semibold ${inst.status === 'paid' ? 'bg-ok/15 text-ok' : 'bg-primary/15 text-primary'}`}>
                    <span className="-rotate-90 whitespace-nowrap">#{index + 1}</span>
                  </div>

                  <div className="p-3 md:p-4 flex-grow flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-display font-bold text-lg md:text-xl text-app-text leading-none truncate tabular-nums">
                        {formatCurrency(inst.amount, displayCurrency, conversionRate)}
                      </p>
                      {inst.status === 'paid' ? (
                        <div className="flex items-center mt-2 text-ok font-semibold text-[10px]">
                          <TagIcon className="h-3 w-3 mr-1" /> Paid: {inst.paidDate}
                        </div>
                      ) : (
                        <div className="flex items-center mt-2 text-app-faint text-[10px]">
                          <CalendarDaysIcon className="h-3 w-3 mr-1" /> Awaiting payment
                        </div>
                      )}
                    </div>

                    {inst.status !== 'paid' && inst.amount > 0 && (
                      <div className="flex flex-col md:flex-row items-center gap-3">
                        <div className="flex flex-col">
                          <label className="text-[9px] text-app-faint uppercase tracking-[0.16em] mb-1">Payment date</label>
                          <input
                            type="date"
                            // Default to today if no date is selected yet
                            value={selectedDates[inst.id] || todayCalendar()}
                            onChange={(e) => setSelectedDates(prev => ({ ...prev, [inst.id]: e.target.value }))}
                            className="bg-surface-2 border border-app-border rounded-xl px-3 py-1.5 text-[11px] text-app-text [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                          />
                        </div>

                        <Button
                          size="sm"
                          onClick={() => {
                            const dateToUse = selectedDates[inst.id] || todayCalendar();
                            onMarkAsPaid(activeSemester.id, inst.id, dateToUse);
                          }}
                          className="rounded-xl text-[10px] md:text-xs px-3 md:px-4 py-2 flex-shrink-0"
                        >
                          Mark paid
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Ledger */}
          <div className="p-6 border-t border-app-border flex justify-between items-center">
            <div>
              <p className="text-[10px] text-app-faint uppercase tracking-[0.16em]">Total paid</p>
              <p className="font-display font-bold text-2xl text-ok tabular-nums">
                {formatCurrency(
                  activeSemester.installments.reduce((acc, i) => i.status === 'paid' ? acc + i.amount : acc, 0),
                  displayCurrency,
                  conversionRate
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-app-faint uppercase tracking-[0.16em]">Remaining balance</p>
              <p className="font-display font-bold text-2xl text-app-text tabular-nums">
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
        <div className="glass rounded-2xl border border-dashed border-app-border p-20 text-center">
          <p className="font-display font-bold text-2xl text-app-faint">No semester data found</p>
        </div>
      )}
    </div>
  );
};

export default USCPaymentTracker;