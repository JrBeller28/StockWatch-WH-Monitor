import {
  Activity,
  ArrowLeftRight,
  Boxes,
  Factory,
  GitCompare,
  Layers,
  LayoutDashboard,
  Package,
  Sparkles,
  X,
} from 'lucide-react';
import type { BotInfo } from '../lib/types';

export type NavTab =
  | 'overview'
  | 'reconciliation'
  | 'accessories'
  | 'raw_material'
  | 'manufacturing'
  | 'pok'
  | 'bot'
  | 'ai';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  botInfo?: BotInfo;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: NavTab;
  label: string;
  sublabel: string;
  icon: typeof LayoutDashboard;
}> = [
  {
    id: 'overview',
    label: 'Ringkasan Cabang',
    sublabel: 'Ikhtisar 11 cabang & selisih',
    icon: LayoutDashboard,
  },
  {
    id: 'reconciliation',
    label: 'Rekonsiliasi Stok',
    sublabel: 'Input Cabang vs Bot MTS2',
    icon: GitCompare,
  },
  {
    id: 'accessories',
    label: 'Accessories',
    sublabel: 'Sheet INPUT',
    icon: Package,
  },
  {
    id: 'raw_material',
    label: 'Raw Material',
    sublabel: 'Sheet INPUT RM',
    icon: Layers,
  },
  {
    id: 'manufacturing',
    label: 'Manufacturing',
    sublabel: 'Sheet INPUT MFG',
    icon: Factory,
  },
  {
    id: 'pok',
    label: 'Data POK',
    sublabel: 'Update MTS POK & Analisis',
    icon: ArrowLeftRight,
  },
  {
    id: 'bot',
    label: 'Monitoring Bot',
    sublabel: 'Tarikan, OUT1 & MTS2',
    icon: Activity,
  },
  {
    id: 'ai',
    label: 'Analis AI',
    sublabel: 'Tanya analisis & tarik data',
    icon: Sparkles,
  },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  botInfo,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navContent = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200 w-64">
      <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white shrink-0">
            <Boxes className="h-4 w-4" aria-hidden="true" />
          </div>
          <span className="font-semibold text-base tracking-tight text-slate-900 whitespace-nowrap">
            StockWatch
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Tutup menu navigasi"
          className="lg:hidden p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav aria-label="Menu Laporan Utama" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectTab(item.id);
                onCloseMobile();
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${isActive ? 'text-blue-300' : 'text-slate-400'}`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="text-sm font-medium leading-tight whitespace-nowrap truncate">
                  {item.label}
                </div>
                <div
                  className={`text-xs leading-tight mt-0.5 truncate ${
                    isActive ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  {item.sublabel}
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      {botInfo && (
        <div className="border-t border-slate-200 px-4 py-3.5 text-xs text-slate-600 space-y-1.5 bg-slate-50/70">
          <div className="font-medium text-slate-800">Jadwal Tarikan Bot</div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">MTS2</span>
            <span className="font-mono tabular-nums text-slate-800 truncate">
              {botInfo.mts2PulledAt || '-'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">OUT1</span>
            <span className="font-mono tabular-nums text-slate-800 truncate">
              {botInfo.lastUpdatedOut1 || '-'}
            </span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <aside className="hidden lg:flex lg:shrink-0">{navContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 flex h-full">{navContent}</aside>
        </div>
      )}
    </>
  );
}
