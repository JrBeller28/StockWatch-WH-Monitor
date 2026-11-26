import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { AiAnalystView } from './components/AiAnalystView';
import { BotMonitorView } from './components/BotMonitorView';
import { OverviewView } from './components/OverviewView';
import { PokMonitorView } from './components/PokMonitorView';
import { ReconciliationView } from './components/ReconciliationView';
import { Sidebar, type NavTab } from './components/Sidebar';
import { SkuDetailDrawer } from './components/SkuDetailDrawer';
import { TopBar } from './components/TopBar';
import type { ReconciliationSourceFilter } from './lib/formatters';
import type {
  BranchName,
  DashboardSummaryResponse,
  ReconciliationItem,
} from './lib/types';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [reconciliationSourcePreset, setReconciliationSourcePreset] =
    useState<ReconciliationSourceFilter>('INPUT_ONLY');
  const [selectedBranch, setSelectedBranch] = useState<BranchName | 'ALL'>('ALL');
  const [data, setData] = useState<DashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [inspectedSku, setInspectedSku] = useState<ReconciliationItem | null>(null);

  const handleNavigateTab = useCallback(
    (tab: NavTab, sourcePreset?: ReconciliationSourceFilter) => {
      setReconciliationSourcePreset(sourcePreset ?? 'INPUT_ONLY');
      setActiveTab(tab);
    },
    []
  );

  const loadDashboard = useCallback(
    async (branch: BranchName | 'ALL', forceRefresh = false) => {
      if (forceRefresh) setRefreshing(true);
      else if (!data) setLoading(true);

      setError(null);
      try {
        const params = new URLSearchParams();
        if (branch !== 'ALL') params.set('branch', branch);
        if (forceRefresh) params.set('refresh', '1');
        const res = await fetch(`/api/dashboard?${params.toString()}`);
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || `HTTP ${res.status}`);
        }
        const json: DashboardSummaryResponse = await res.json();
        setData(json);
      } catch (err) {
        setError((err as Error).message || 'Gagal mengambil data dari Google Sheets');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [data]
  );

  useEffect(() => {
    loadDashboard(selectedBranch, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch]);

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab) => handleNavigateTab(tab, 'INPUT_ONLY')}
        botInfo={data?.botInfo}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          activeTab={activeTab}
          selectedBranch={selectedBranch}
          onChangeBranch={setSelectedBranch}
          onRefresh={() => loadDashboard(selectedBranch, true)}
          isRefreshing={refreshing}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {error && (
            <div
              role="alert"
              className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => loadDashboard(selectedBranch, true)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-red-700 text-white text-xs font-medium hover:bg-red-800"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Coba Lagi</span>
              </button>
            </div>
          )}

          {data && data.errors.length > 0 && (
            <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
              <span className="font-semibold">Catatan Sinkronisasi:</span>{' '}
              {data.errors.slice(0, 2).join(' · ')}
              {data.errors.length > 2 ? ` (+${data.errors.length - 2} lainnya)` : ''}
            </div>
          )}

          {loading && !data ? (
            <div className="space-y-6" aria-busy="true" aria-label="Memuat data Google Sheets">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-28 rounded-lg border border-slate-200 bg-white animate-pulse"
                  />
                ))}
              </div>
              <div className="h-80 rounded-lg border border-slate-200 bg-white animate-pulse" />
              <div className="h-64 rounded-lg border border-slate-200 bg-white animate-pulse" />
            </div>
          ) : data ? (
            <>
              {activeTab === 'overview' && (
                <OverviewView
                  data={data}
                  selectedBranch={selectedBranch}
                  onSelectBranch={setSelectedBranch}
                  onNavigateTab={handleNavigateTab}
                  onInspectSku={setInspectedSku}
                />
              )}

              {activeTab === 'reconciliation' && (
                <ReconciliationView
                  data={data}
                  selectedBranch={selectedBranch}
                  onChangeBranch={setSelectedBranch}
                  initialSourceFilter={reconciliationSourcePreset}
                  onInspectSku={setInspectedSku}
                />
              )}

              {activeTab === 'accessories' && (
                <ReconciliationView
                  data={data}
                  selectedBranch={selectedBranch}
                  onChangeBranch={setSelectedBranch}
                  lockedCategory="accessories"
                  initialSourceFilter={reconciliationSourcePreset}
                  onInspectSku={setInspectedSku}
                />
              )}

              {activeTab === 'raw_material' && (
                <ReconciliationView
                  data={data}
                  selectedBranch={selectedBranch}
                  onChangeBranch={setSelectedBranch}
                  lockedCategory="raw_material"
                  initialSourceFilter={reconciliationSourcePreset}
                  onInspectSku={setInspectedSku}
                />
              )}

              {activeTab === 'manufacturing' && (
                <ReconciliationView
                  data={data}
                  selectedBranch={selectedBranch}
                  onChangeBranch={setSelectedBranch}
                  lockedCategory="manufacturing"
                  initialSourceFilter={reconciliationSourcePreset}
                  onInspectSku={setInspectedSku}
                />
              )}

              {activeTab === 'bot' && (
                <BotMonitorView
                  data={data}
                  selectedBranch={selectedBranch}
                  onChangeBranch={setSelectedBranch}
                />
              )}

              {activeTab === 'pok' && (
                <PokMonitorView
                  selectedBranch={selectedBranch}
                  onChangeBranch={setSelectedBranch}
                  initialSummary={data.pokSummary}
                />
              )}

              {activeTab === 'ai' && (
                <AiAnalystView
                  selectedBranch={selectedBranch}
                  onChangeBranch={setSelectedBranch}
                  onInspectSku={setInspectedSku}
                />
              )}
            </>
          ) : null}
        </main>
      </div>

      <SkuDetailDrawer
        item={inspectedSku}
        onClose={() => setInspectedSku(null)}
      />
    </div>
  );
}
