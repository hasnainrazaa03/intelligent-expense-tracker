

import React, { useState, useEffect, useMemo } from 'react';
import { Semester } from '../types';
import { AcademicCapIcon, CheckIcon } from './Icons';
import { formatCurrency } from '../utils/currencyUtils';

interface USCPaymentTrackerProps {
  semesters: Semester[];
  onUpdateTuition: (semesterId: string, totalTuition: number) => void;
  onMarkAsPaid: (semesterId: string, installmentId: number) => void;
  onUpdateDate: (semesterId: string, installmentId: number, newDate: string) => void;
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const USCPaymentTracker: React.FC<USCPaymentTrackerProps> = ({
  semesters,
  onUpdateTuition,
  onMarkAsPaid,
  onUpdateDate,
  displayCurrency,
  conversionRate
}) => {
  const [activeSemesterId, setActiveSemesterId] = useState<string>(semesters[0]?.id || '');

  useEffect(() => {
    if (!activeSemesterId && semesters.length > 0) {
      setActiveSemesterId(semesters[0].id);
    }
    if (activeSemesterId && !semesters.some(s => s.id === activeSemesterId) && semesters.length > 0) {
      setActiveSemesterId(semesters[0].id);
    }
  }, [semesters, activeSemesterId]);

  const activeSemester = semesters.find(s => s.id === activeSemesterId);

  const handleTuitionChange = (totalTuitionInDisplay: number) => {
    if (!activeSemester) return;
    let totalTuitionInUSD = totalTuitionInDisplay;
    if (displayCurrency === 'INR' && conversionRate) {
      totalTuitionInUSD = totalTuitionInDisplay / conversionRate;
    }
    onUpdateTuition(activeSemester.id, totalTuitionInUSD);
  }

  const displayedTuition = useMemo(() => {
    if (!activeSemester) return 0;
    if (displayCurrency === 'INR' && conversionRate) {
      return activeSemester.totalTuition * conversionRate;
    }
    return activeSemester.totalTuition;
  }, [activeSemester, displayCurrency, conversionRate]);

  return (
    <div className="bg-base-100 dark:bg-dark-200 p-6 rounded-2xl shadow-lg">
      <div className="flex items-center mb-6">
        <AcademicCapIcon className="h-6 w-6 text-brand-primary" />
        <h2 className="text-2xl font-bold ml-3 text-base-content dark:text-base-100">USC Tuition Payment Plan</h2>
      </div>
      <p className="mb-6 text-base-content-secondary dark:text-base-300">
        Track your interest-free tuition installments. Enter the total tuition for a semester to calculate installment amounts. Marking an installment as paid will automatically create a 'Tuition' expense for you.
      </p>

      <div className="border-b border-base-300 dark:border-dark-300">
        <nav className="-mb-px flex space-x-6 overflow-x-auto" aria-label="Semesters">
          {semesters.map((semester) => (
            <button
              key={semester.id}
              onClick={() => setActiveSemesterId(semester.id)}
              className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeSemesterId === semester.id
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-base-content-secondary dark:text-base-300 hover:text-base-content dark:hover:text-base-200 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {semester.name}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        {activeSemester ? (
          <div key={activeSemester.id} className="bg-base-200 dark:bg-dark-300 p-4 rounded-lg">
            <div className="mb-4">
              <label htmlFor={`tuition-${activeSemester.id}`} className="block text-sm font-medium text-base-content-secondary dark:text-base-300">Total Semester Tuition ({displayCurrency})</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <span className="text-gray-500 sm:text-sm">{displayCurrency === 'INR' ? '₹' : '$'}</span>
                  </div>
                  <input
                      id={`tuition-${activeSemester.id}`}
                      type="number"
                      value={displayedTuition || ''}
                      onChange={e => handleTuitionChange(parseFloat(e.target.value) || 0)}
                      className="block w-full bg-base-100 dark:bg-dark-200 border-base-300 dark:border-dark-100 rounded-md shadow-sm focus:ring-brand-primary focus:border-brand-primary sm:text-sm text-base-content dark:text-base-200 pl-7 pr-3 py-2"
                      placeholder="e.g., 28000"
                      min="0"
                  />
              </div>
            </div>

            <div className="space-y-3">
              {activeSemester.installments.map((installment) => (
                <div key={installment.id} className={`p-3 rounded-md flex items-center justify-between ${installment.status === 'paid' ? 'bg-green-100/50 dark:bg-green-900/20' : 'bg-base-100 dark:bg-dark-200'}`}>
                  <div>
                    <p className="font-semibold text-base-content dark:text-base-100">Installment #{installment.id}</p>
                    {installment.status === 'paid' && installment.paidDate ? (
                        <div className="flex items-center mt-1">
                            <span className="text-sm text-base-content-secondary dark:text-base-300 mr-2">Paid on:</span>
                            <input
                                type="date"
                                value={installment.paidDate}
                                onChange={(e) => onUpdateDate(activeSemester.id, installment.id, e.target.value)}
                                className="bg-transparent text-sm text-base-content dark:text-base-200 border-b border-dashed border-gray-400 focus:outline-none focus:border-brand-primary"
                            />
                        </div>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-base-content dark:text-base-100">{formatCurrency(installment.amount, displayCurrency, conversionRate)}</p>
                    {installment.status === 'paid' ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-200 text-green-800 dark:bg-green-700 dark:text-green-100">
                        <CheckIcon className="h-4 w-4 mr-1" />
                        Paid
                      </span>
                    ) : (
                      <button
                        onClick={() => onMarkAsPaid(activeSemester.id, installment.id)}
                        disabled={installment.amount <= 0}
                        className="mt-1 px-3 py-1 bg-brand-primary text-white text-sm font-semibold rounded-md shadow-sm hover:bg-brand-secondary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        Mark as Paid
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
            <div className="text-center py-10">
                <p className="text-base-content-secondary dark:text-base-300">No semester data to display.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default USCPaymentTracker;