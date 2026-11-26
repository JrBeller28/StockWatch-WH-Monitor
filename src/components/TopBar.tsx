import { Building2, Menu, RefreshCw } from 'lucide-react';
import { ALL_BRANCHES } from '../lib/sheetConfig';
import type { BranchName } from '../lib/types';
import type { NavTab } from './Sidebar';

interface TopBarProps {
  activeTab: NavTab;
  selectedBranch: BranchName | 'ALL';
  onChangeBranch: (branch: BranchName | 'ALL') => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onOpenMobileMenu: () => void;
}

const TAB_TITLES: Record<NavTab, { section: string; title: string }> = {
  overview: { section: 'Monitoring Stok', title: 'Ringkasan Seluruh Cabang' },
  reconciliation: { section: 'Rekonsiliasi', title: 'Input Cabang vs Bot MTS2' },
  accessories: { section: 'Laporan Inputan', title: 'Accessories (INPUT)' },
  raw_material: { section: 'Laporan Inputan', title: 'Raw Material (INPUT RM)' },
  manufacturing: { section: 'Laporan Inputan', title: 'Manufacturing (INPUT MFG)' },
  pok: { section: 'Monitoring Transit', title: 'Data POK (Update MTS POK)' },
  bot: { section: 'Sumber Sistem', title: 'Monitoring Tarikan Bot' },
  ai: { section: 'Asisten Cerdas', title: 'Analis AI & Penarikan Data' },
};

export function TopBar({
  activeTab,
  selectedBranch,
  onChangeBranch,
  onRefresh,
  isRefreshing,
  onOpenMobileMenu,
}: TopBarProps) {
  const meta = TAB_TITLES[activeTab];

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 sm:gap-8 h-16 px-4 sm:px-6 bg-white border-b border-slate-200">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Buka menu navigasi"
          className="lg:hidden p-2 -ml-1 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 shrink-0"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="hidden sm:inline text-slate-500 whitespace-nowrap">
            {meta.section}
          </span>
          <span className="hidden sm:inline text-slate-300" aria-hidden="true">
            /
          </span>
          <h1 className="font-semibold text-slate-900 truncate whitespace-nowrap">
            {meta.title}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <label
            htmlFor="global-branch-filter"
            className="hidden md:flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap"
          >
            <Building2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <span>Cabang:</span>
          </label>
          <select
            id="global-branch-filter"
            aria-label="Filter Cabang"
            value={selectedBranch}
            onChange={(e) => onChangeBranch(e.target.value as BranchName | 'ALL')}
            className="h-9 max-w-[138px] sm:max-w-none rounded-lg border border-slate-300 bg-white px-2.5 sm:px-3 text-xs sm:text-sm font-medium text-slate-800 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          >
            <option value="ALL">Semua Cabang (11)</option>
            {ALL_BRANCHES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label={isRefreshing ? 'Menyinkronkan data' : 'Sinkronkan Data'}
          className="inline-flex items-center gap-2 h-9 px-2.5 sm:px-3.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span className="hidden sm:inline">
            {isRefreshing ? 'Menyinkronkan...' : 'Sinkronkan Data'}
          </span>
        </button>
      </div>
    </header>
  );
}
