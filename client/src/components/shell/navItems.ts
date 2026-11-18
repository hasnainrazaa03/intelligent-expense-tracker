import type React from 'react';
import { HomeIcon, ClipboardDocumentListIcon, BudgetIcon, ChartPieIcon, AcademicCapIcon, Cog6ToothIcon } from '../Icons';
import { PATHS, type Place } from '../../app/routes';

export interface NavItem {
  place: Place;
  label: string;
  to: string;
  Icon: React.FC<{ className?: string }>;
}

/** The six places of the app (U2a), in the order the sidebar shows them. */
export const NAV_ITEMS: NavItem[] = [
  { place: 'home', label: 'Home', to: PATHS.home, Icon: HomeIcon },
  { place: 'transactions', label: 'Transactions', to: PATHS.transactions, Icon: ClipboardDocumentListIcon },
  { place: 'budgets', label: 'Budgets', to: PATHS.budgets, Icon: BudgetIcon },
  { place: 'insights', label: 'Insights', to: PATHS.insights(), Icon: ChartPieIcon },
  { place: 'tuition', label: 'Tuition', to: PATHS.tuition, Icon: AcademicCapIcon },
  { place: 'settings', label: 'Settings', to: PATHS.settings, Icon: Cog6ToothIcon },
];

export const navItem = (place: Place): NavItem => NAV_ITEMS.find((i) => i.place === place)!;
